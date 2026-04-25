import chalk from 'chalk';

export function handleError(err) {
    if (err.response) {
        console.error(chalk.red(`\n❌ HTTP ${err.response.status} from ${err.response.config?.url}`));
        const data = err.response.data;
        if (data?.errorMessages?.length) {
            console.error(chalk.red(data.errorMessages.join('\n')));
        }
        if (data?.errors && Object.keys(data.errors).length) {
            console.error(chalk.red(JSON.stringify(data.errors, null, 2)));
        }
        if (!data?.errorMessages?.length && !data?.errors) {
            console.error(chalk.red(JSON.stringify(data, null, 2)));
        }
    } else {
        console.error(chalk.red('\n❌ Error:'), err.message);
    }
}
