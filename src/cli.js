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
    .description('Create a Jira ticket, rewrite commits, push a branch, and open a PR')
    .action(buildCommand);

export { program };
