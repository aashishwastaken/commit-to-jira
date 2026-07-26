import { Command } from 'commander';
import { setupCommand } from './commands/setup.js';
import { buildCommand } from './commands/build.js';

const program = new Command();

program
    .name('commit-to-jira')
    .version('1.0.0')
    .description('Automate Jira ticket creation and PR workflow from Git commits');

program
    .command('setup')
    .description('Configure Jira and GitHub credentials')
    .action(setupCommand);

program
    .command('build')
    .description('Create a Jira ticket and open a PR. Without -m: reads unpushed commits and rewrites them. With -m: commits staged changes under a new ticket and branch.')
    .option('-m, --message <message>', 'Commit message — creates a ticket from this, checks out a new branch, commits staged changes, and opens a PR')
    .action(buildCommand);

export { program };
