import inquirer from 'inquirer';
import chalk from 'chalk';
import config from '../config.js';

export async function setupCommand() {
    const answers = await inquirer.prompt([
        { name: 'url',              message: 'Jira Base URL:',                                          default: config.get('url') },
        { name: 'email',            message: 'Jira Email:',                                             default: config.get('email') },
        { name: 'token',            message: 'Jira API Token (leave blank to keep existing):',          type: 'password', default: '' },
        { name: 'project',          message: 'Default Jira Project Key:',                               default: config.get('project') },
        { name: 'devBranch',        message: 'Default development branch for PRs:',                     default: config.get('devBranch') },
        { name: 'codeReviewStatus', message: 'Jira status name to move ticket to after PR:',            default: config.get('codeReviewStatus') },
        { name: 'githubToken',      message: 'GitHub Personal Access Token (leave blank to keep existing):', type: 'password', default: '' },
    ]);

    // Preserve existing secrets if the user left the field blank
    if (!answers.token) answers.token = config.get('token');
    if (!answers.githubToken) answers.githubToken = config.get('githubToken');

    config.set(answers);
    console.log(chalk.green('\n✅ Setup complete! Run "commit-to-jira build" to start.'));
}
