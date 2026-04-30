import inquirer from 'inquirer';
import chalk from 'chalk';
import config from '../config.js';
import { formatCommitMsg } from '../utils/format.js';
import { handleError } from '../utils/errors.js';
import { getUnpushedCommits, rewriteCommitMessages, createAndPushBranch, detectGithubRepo } from '../lib/git.js';
import { createJiraClient, getMyself, getProjectComponents, getProjectIssueTypes, createIssue, getTransitions, transitionIssue } from '../lib/jira.js';
import { createPullRequest } from '../lib/github.js';

export async function buildCommand() {
    if (!config.get('token')) {
        console.log(chalk.red('❌ Run "commit-to-jira setup" first.'));
        return;
    }

    try {
        const commits = getUnpushedCommits(config.get('devBranch'));
        if (!commits.length) {
            console.log(chalk.yellow('⚠️  No new commits found.'));
            return;
        }

        const summary = commits[0].summary;
        const description = commits
            .map((c, i) => `${i + 1}. ${c.summary}${c.body ? '\n\n' + c.body : ''}`)
            .join('\n\n---\n\n');

        printPreview(commits, summary);

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

        console.log(chalk.blue(`\n✏️  Rewriting ${commits.length} commit(s)...`));
        rewriteCommitMessages(commits, ticketKey);
        commits.forEach(c => console.log(chalk.dim(`  → ${formatCommitMsg(c.summary, ticketKey)}`)));
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

function printPreview(commits, summary) {
    console.log(chalk.cyan('\n--- TICKET PREVIEW ---'));
    console.log(`${chalk.bold('Project:')}    ${config.get('project')}`);
    console.log(`${chalk.bold('Summary:')}    ${summary}`);
    console.log(`${chalk.bold('Commits:')}    ${commits.length}`);
    commits.forEach((c, i) => console.log(`  ${i + 1}. ${c.summary}`));
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
    const { formatCommitMsg } = await import('../utils/format.js');
    const pr = await createPullRequest({
        token,
        repo,
        title: formatCommitMsg(summary, ticketKey),
        body: description || `Jira ticket: ${jiraBase}/browse/${ticketKey}`,
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
