import axios from 'axios';

const GITHUB_API = 'https://api.github.com';

function githubHeaders(token) {
    return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
    };
}

async function branchExists(token, repo, branch) {
    try {
        await axios.get(`${GITHUB_API}/repos/${repo}/branches/${branch}`, {
            headers: githubHeaders(token),
        });
        return true;
    } catch (err) {
        if (err.response?.status === 404) return false;
        throw err;
    }
}

export async function createPullRequest({ token, repo, title, body, head, base }) {
    const exists = await branchExists(token, repo, base);
    if (!exists) {
        throw new Error(
            `Base branch "${base}" does not exist in ${repo}.\n` +
            `Run "commit-to-jira setup" to update your default dev branch.`
        );
    }

    const res = await axios.post(
        `${GITHUB_API}/repos/${repo}/pulls`,
        { title, body, head, base },
        { headers: githubHeaders(token) }
    );
    return res.data;
}
