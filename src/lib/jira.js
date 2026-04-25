import axios from 'axios';

// Returns an axios instance pre-configured with Jira Basic auth headers.
function createClient(email, token, baseUrl) {
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    return axios.create({
        baseURL: baseUrl,
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
        },
    });
}

export async function getMyself(client) {
    const res = await client.get('/rest/api/2/myself');
    return res.data;
}

export async function getProjectComponents(client, projectKey) {
    const res = await client.get(`/rest/api/2/project/${projectKey}/components`);
    return res.data;
}

export async function getProjectIssueTypes(client, projectKey) {
    const res = await client.get(
        `/rest/api/2/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes`
    );
    return res.data.projects?.[0]?.issuetypes ?? [];
}

export async function createIssue(client, fields) {
    const res = await client.post('/rest/api/2/issue', { fields });
    return res.data;
}

export async function getTransitions(client, issueKey) {
    const res = await client.get(`/rest/api/2/issue/${issueKey}/transitions`);
    return res.data.transitions;
}

export async function transitionIssue(client, issueKey, transitionId) {
    await client.post(`/rest/api/2/issue/${issueKey}/transitions`, {
        transition: { id: transitionId },
    });
}

export function createJiraClient(email, token, baseUrl) {
    return createClient(email, token, baseUrl);
}
