import { execSync } from 'child_process';
import inquirer from 'inquirer';
import chalk from 'chalk';
import config from '../config.js';
import { formatCommitMsg } from '../utils/format.js';
import { handleError } from '../utils/errors.js';
import { getUnpushedCommits, getRecentCommits, rewriteCommitMessages, createAndPushBranch, detectGithubRepo, checkoutNewBranch, commitWithMessage, pushBranch, localBranchExists, getCurrentBranch } from '../lib/git.js';
import { createJiraClient, getMyself, getProjectComponents, getProjectIssueTypes, createIssue, getTransitions, transitionIssue } from '../lib/jira.js';
import { createPullRequest } from '../lib/github.js';

export async function buildCommand(options = {}) {
    if (!config.get('token')) {
        console.log(chalk.red('❌ Run "commit-to-jira setup" first.'));
        return;
    }

    if (options.message?.trim()) {
        return messageBranchFlow(options.message.trim());
    }

    try {
        const unpushedCommits = getUnpushedCommits(config.get('devBranch'));
        if (!unpushedCommits.length) {
            console.log(chalk.yellow('⚠️  No new commits found.'));
            return;
        }

        const summary = unpushedCommits[0].summary;
        printPreview(unpushedCommits, [], summary);

        // Optionally add already-pushed commits for ticket context
        const additionalCommits = await promptAdditionalCommits(unpushedCommits);
        const allCommits = [...unpushedCommits, ...additionalCommits];

        if (additionalCommits.length) {
            printPreview(unpushedCommits, additionalCommits, summary);
        }

        const description = buildDescription(allCommits);

        const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: 'Create Jira ticket, rewrite commits, open a PR, and move ticket to code review?',
            default: true,
        }]);
        if (!confirm) {
            console.log(chalk.yellow('Aborted.'));
            return;
        }

        const jira = createJiraClient(config.get('email'), config.get('token'), config.get('url'));

        console.log(chalk.blue('\nFetching your Jira account...'));
        const { accountId } = await getMyself(jira);

        console.log(chalk.blue('Fetching project metadata...'));
        const [components, issueTypes] = await Promise.all([
            getProjectComponents(jira, config.get('project')),
            getProjectIssueTypes(jira, config.get('project')),
        ]);

        const { issueType, componentId, acceptanceCriteria } = await promptTicketFields(components, issueTypes);

        console.log(chalk.blue('\n🚀 Creating Jira ticket...'));
        const issue = await createIssue(jira, {
            project:            { key: config.get('project') },
            summary,
            description:        description || 'Created via commit-to-jira',
            issuetype:          { name: issueType },
            components:         [{ id: componentId }],
            customfield_10029:  acceptanceCriteria,
            assignee:           { accountId },
        });
        const ticketKey = issue.key;
        console.log(chalk.green(`✅ Jira ticket created: ${ticketKey}`));

        // Only rewrite unpushed commits — already-pushed ones cannot be rebased
        const unpushedCount = unpushedCommits.length;
        console.log(chalk.blue(`\n✏️  Rewriting ${unpushedCount} commit(s)...`));
        rewriteCommitMessages(allCommits, ticketKey);
        unpushedCommits.forEach(c => console.log(chalk.dim(`  → ${formatCommitMsg(c.summary, ticketKey)}`)));
        if (additionalCommits.length) {
            console.log(chalk.dim(`  (${additionalCommits.length} additional commit(s) added to ticket description only)`));
        }
        console.log(chalk.green('✅ Commits rewritten.'));

        console.log(chalk.blue(`\n🌿 Creating branch: ${ticketKey}`));
        createAndPushBranch(ticketKey);
        console.log(chalk.green(`✅ Branch pushed: ${ticketKey}`));

        await openPullRequest({ ticketKey, summary, description, jiraBase: config.get('url') });

        await moveTicketToCodeReview(jira, ticketKey);

        console.log(chalk.green(`\n🎉 All done! Ticket: ${config.get('url')}/browse/${ticketKey}`));

    } catch (err) {
        handleError(err);
    }
}

// Asks whether the user wants to include additional historical commits,
// then shows a paginated checkbox of recent commits to choose from.
async function promptAdditionalCommits(unpushedCommits) {
    const { wantMore } = await inquirer.prompt([{
        type: 'confirm',
        name: 'wantMore',
        message: 'Add more commits from history to this ticket?',
        default: false,
    }]);

    if (!wantMore) return [];

    const excludeHashes = unpushedCommits.map(c => c.hash);
    const recent = getRecentCommits(excludeHashes, 50);

    if (!recent.length) {
        console.log(chalk.yellow('⚠️  No additional commits found in history.'));
        return [];
    }

    const { selected } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'selected',
        message: 'Select commits to include in the ticket description (space to select):',
        pageSize: 10,
        choices: recent.map(c => ({
            name: `${c.summary}`,
            value: c,
        })),
    }]);

    return selected;
}

// Builds the Jira ticket description, splitting into two sections
// when there are both unpushed and additional (already-pushed) commits.
function buildDescription(commits) {
    const unpushed = commits.filter(c => !c.alreadyPushed);
    const additional = commits.filter(c => c.alreadyPushed);

    const formatCommit = (c, i) =>
        `${i + 1}. ${c.summary}${c.body ? '\n\n' + c.body : ''}`;

    let desc = unpushed.map(formatCommit).join('\n\n---\n\n');

    if (additional.length) {
        desc += '\n\n---\n\n**Additional context commits:**\n\n';
        desc += additional.map(formatCommit).join('\n\n---\n\n');
    }

    return desc;
}

function printPreview(unpushedCommits, additionalCommits, summary) {
    console.log(chalk.cyan('\n--- TICKET PREVIEW ---'));
    console.log(`${chalk.bold('Project:')}    ${config.get('project')}`);
    console.log(`${chalk.bold('Summary:')}    ${summary}`);
    console.log(`${chalk.bold('Commits:')}    ${unpushedCommits.length} unpushed`);
    unpushedCommits.forEach((c, i) => console.log(`  ${i + 1}. ${c.summary}`));
    if (additionalCommits.length) {
        console.log(`${chalk.bold('Additional:')} ${additionalCommits.length} from history`);
        additionalCommits.forEach((c, i) => console.log(chalk.dim(`  ${i + 1}. ${c.summary}`)));
    }
    console.log(`${chalk.bold('Dev branch:')} ${config.get('devBranch')}`);
    console.log(chalk.cyan('----------------------\n'));
}

async function promptTicketFields(components, issueTypes) {
    const componentChoices = components.map(c => ({ name: c.name, value: c.id }));
    const issueTypeChoices = issueTypes.map(t => ({ name: t.name, value: t.name }));
    const defaultIssueType = issueTypeChoices.find(t => t.name === 'Story')?.value ?? issueTypeChoices[0]?.value;

    return inquirer.prompt([
        {
            type: 'list',
            name: 'issueType',
            message: 'Work type:',
            choices: issueTypeChoices,
            default: defaultIssueType,
        },
        {
            type: 'list',
            name: 'componentId',
            message: 'Component:',
            choices: componentChoices,
        },
        {
            type: 'input',
            name: 'acceptanceCriteria',
            message: 'Acceptance Criteria:',
            default: 'Satisfy all the requirements in the description',
            validate: v => v.trim() ? true : 'Required.',
        },
    ]);
}

async function openPullRequest({ ticketKey, summary, description, jiraBase }) {
    const { devBranchInput } = await inquirer.prompt([{
        name: 'devBranchInput',
        message: `PR base branch (enter to use "${config.get('devBranch')}"):`,
        default: config.get('devBranch'),
    }]);
    const base = devBranchInput.trim() || config.get('devBranch');

    const repo = detectGithubRepo();
    const token = config.get('githubToken');

    if (!repo || !token) {
        console.log(chalk.yellow('⚠️  GitHub repo not detected or token not set — skipping PR creation.'));
        return;
    }

    console.log(chalk.blue('\n📬 Opening GitHub PR...'));
    const pr = await createPullRequest({
        token,
        repo,
        title: formatCommitMsg(summary, ticketKey),
        body: `${description || ''}\n\n---\n🎫 Jira: [${ticketKey}](${jiraBase}/browse/${ticketKey})\n\n> PR and Jira ticket created by [commit-to-jira](https://www.npmjs.com/package/commit-to-jira)`,
        head: ticketKey,
        base,
    });
    console.log(chalk.green(`✅ PR opened: ${pr.html_url}`));
}

async function moveTicketToCodeReview(jira, ticketKey) {
    const targetStatus = config.get('codeReviewStatus');
    if (!targetStatus) return;

    console.log(chalk.blue(`\n🔄 Moving ticket to "${targetStatus}"...`));
    try {
        const transitions = await getTransitions(jira, ticketKey);
        const transition = transitions.find(
            t => t.name.toLowerCase() === targetStatus.toLowerCase()
        );

        if (!transition) {
            const available = transitions.map(t => t.name).join(', ');
            console.log(chalk.yellow(`⚠️  Transition "${targetStatus}" not found. Available: ${available}`));
            return;
        }

        await transitionIssue(jira, ticketKey, transition.id);
        console.log(chalk.green(`✅ Ticket moved to "${targetStatus}".`));
    } catch (err) {
        console.log(chalk.yellow(`⚠️  Could not update ticket status: ${err.response?.data?.errorMessages?.join(', ') || err.message}`));
    }
}

// -m flow: create ticket from message, checkout branch, commit staged changes, push, PR, transition.
async function messageBranchFlow(rawMessage) {
    try {
        const jira = createJiraClient(config.get('email'), config.get('token'), config.get('url'));
        let ticketKey;
        let skipToCreate = false;

        // Idempotency: if a previous run failed after ticket creation, offer to reuse it
        const cached = config.get('lastBuildM');
        if (cached?.message === rawMessage && cached?.ticketKey) {
            const { reuse } = await inquirer.prompt([{
                type: 'confirm',
                name: 'reuse',
                message: `Ticket ${cached.ticketKey} was already created for this message. Reuse it?`,
                default: true,
            }]);
            if (reuse) {
                ticketKey = cached.ticketKey;
                skipToCreate = true;
                console.log(chalk.blue(`\nResuming with ${ticketKey}...`));
            }
        }

        if (!skipToCreate) {
            console.log(chalk.cyan('\n--- TICKET PREVIEW ---'));
            console.log(`${chalk.bold('Project:')}    ${config.get('project')}`);
            console.log(`${chalk.bold('Summary:')}    ${rawMessage}`);
            console.log(`${chalk.bold('Dev branch:')} ${config.get('devBranch')}`);
            console.log(chalk.cyan('----------------------\n'));

            const { confirm } = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirm',
                message: 'Create Jira ticket, commit staged changes, push branch, open a PR, and move to code review?',
                default: true,
            }]);
            if (!confirm) {
                console.log(chalk.yellow('Aborted.'));
                return;
            }

            console.log(chalk.blue('\nFetching your Jira account...'));
            const { accountId } = await getMyself(jira);

            console.log(chalk.blue('Fetching project metadata...'));
            const [components, issueTypes] = await Promise.all([
                getProjectComponents(jira, config.get('project')),
                getProjectIssueTypes(jira, config.get('project')),
            ]);

            const { issueType, componentId, acceptanceCriteria } = await promptTicketFields(components, issueTypes);

            console.log(chalk.blue('\n🚀 Creating Jira ticket...'));
            const issue = await createIssue(jira, {
                project:           { key: config.get('project') },
                summary:           rawMessage,
                description:       rawMessage,
                issuetype:         { name: issueType },
                components:        [{ id: componentId }],
                customfield_10029: acceptanceCriteria,
                assignee:          { accountId },
            });
            ticketKey = issue.key;
            console.log(chalk.green(`✅ Jira ticket created: ${ticketKey}`));

            config.set('lastBuildM', { ticketKey, message: rawMessage });
        }

        const formattedMessage = formatCommitMsg(rawMessage, ticketKey);

        const currentBranch = getCurrentBranch();
        if (currentBranch === ticketKey) {
            console.log(chalk.dim(`Already on branch ${ticketKey}.`));
        } else if (localBranchExists(ticketKey)) {
            console.log(chalk.dim(`Branch ${ticketKey} exists — checking out.`));
            execSync(`git checkout ${ticketKey}`);
        } else {
            console.log(chalk.blue(`\n🌿 Creating branch: ${ticketKey}`));
            checkoutNewBranch(ticketKey);
            console.log(chalk.green(`✅ Checked out: ${ticketKey}`));
        }

        console.log(chalk.blue(`\n📝 Committing: ${formattedMessage}`));
        try {
            commitWithMessage(formattedMessage);
            console.log(chalk.green('✅ Commit created.'));
        } catch (err) {
            if (err.message?.includes('nothing to commit')) {
                console.log(chalk.dim('Nothing new to commit — continuing with push.'));
            } else {
                throw err;
            }
        }

        console.log(chalk.blue('\n⬆️  Pushing branch...'));
        pushBranch(ticketKey);
        console.log(chalk.green(`✅ Branch pushed: ${ticketKey}`));

        await openPullRequest({ ticketKey, summary: rawMessage, description: rawMessage, jiraBase: config.get('url') });

        await moveTicketToCodeReview(jira, ticketKey);

        config.delete('lastBuildM');

        console.log(chalk.green(`\n🎉 All done! Ticket: ${config.get('url')}/browse/${ticketKey}`));

    } catch (err) {
        handleError(err);
    }
}
