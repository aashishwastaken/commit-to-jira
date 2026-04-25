import axios from 'axios';

const GITHUB_API = 'https://api.github.com';

export async function createPullRequest({ token, repo, title, body, head, base }) {
    const res = await axios.post(
        `${GITHUB_API}/repos/${repo}/pulls`,
        { title, body, head, base },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
            },
        }
    );
    return res.data;
}
