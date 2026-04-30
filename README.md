# commit-to-jira

[![npm version](https://badge.fury.io/js/commit-to-jira.svg?icon=si%3Anpm)](https://www.npmjs.com/package/commit-to-jira)
[![Socket Badge](https://badge.socket.dev/npm/package/commit-to-jira/1.0.0)](https://socket.dev/npm/package/commit-to-jira)

A CLI tool that bridges your Git workflow with Jira and GitHub. With a single command it reads your unpushed commits, creates a Jira ticket, rewrites every commit message to follow the conventional commit format with the ticket key, creates a branch, pushes it, opens a pull request, and moves the ticket to code review — all without leaving the terminal.

---

## How It Works

1. **Reads commits** — finds all unpushed commits on your current branch (`origin/<branch>..HEAD`)
2. **Shows a preview** — lists the commits and the Jira project before doing anything
3. **Fetches project metadata** — pulls available components and issue types live from Jira
4. **Prompts for ticket details** — work type (Story/Task/Bug etc.), component, and acceptance criteria
5. **Creates the Jira ticket** — assigned to you automatically
6. **Rewrites commit messages** — every commit is reformatted to `type(TICKET-KEY): message` via a non-interactive rebase
7. **Creates and pushes a branch** — named after the ticket key (e.g. `PROJ-1042`)
8. **Opens a GitHub PR** — title follows the same conventional commit format, description includes all commit details
9. **Moves the ticket** — transitions it to your configured "code review" status

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or higher
- A [Jira API Token](https://id.atlassian.com/manage-profile/security/api-tokens) (classic token — no OAuth needed)
- Git installed and available in your PATH
- *(Optional)* A [GitHub Personal Access Token](https://github.com/settings/tokens) with `repo` scope — only needed for PR creation

---

## Installation

### From npm (recommended)

```bash
npm install -g commit-to-jira
```

### From source

```bash
git clone https://github.com/aashishwastaken/commit-to-jira.git
cd commit-to-jira
npm install
npm link
```

---

## Setup

Run once before using the tool:

```bash
commit-to-jira setup
# or
c2j setup
```

You will be prompted for:

| Field | Description | Required |
|---|---|---|
| Jira Base URL | e.g. `https://yourcompany.atlassian.net` | Yes |
| Jira Email | The email linked to your Jira account | Yes |
| Jira API Token | Classic API token from Atlassian | Yes |
| Jira Project Key | e.g. `SSI`, `PROJ` — visible as the prefix on ticket numbers | Yes |
| Default dev branch | The branch PRs will target, e.g. `development` | Yes |
| Jira code review status | The transition name to apply after PR, e.g. `In Code Review` | Yes |
| GitHub Personal Access Token | Needed only for PR creation | No |

> **Re-running setup** pre-fills all previous values. Leave password fields blank to keep the existing token.

---

## Usage

```bash
commit-to-jira build
# or using the short alias
c2j build
```

Run this from inside any Git repository after you have made one or more commits. The tool will walk you through the rest interactively.

---

## Optional Configuration

### Without a GitHub Token

If you skip the GitHub token during setup, the tool will still:
- Create the Jira ticket
- Rewrite your commit messages
- Create and push the branch

It will skip PR creation and print a warning:
```
⚠️  GitHub repo not detected or token not set — skipping PR creation.
```

### Jira Code Review Status

The status name must exactly match a valid transition in your Jira workflow (case-insensitive). If it doesn't match, the tool prints the available transition names so you can correct it in setup.

---

## Example Run

```
$ c2j build

--- TICKET PREVIEW ---
Project:    PROJ
Summary:    build: Remove legacy payment adapter and feature flags
Commits:    2
  1. build: Remove legacy payment adapter and feature flags
  2. Remove org-level feature flags
Dev branch: development
----------------------

? Create Jira ticket, rewrite commits, open a PR, and move ticket to code review? Yes

Fetching your Jira account...
Fetching project metadata...
? Work type: Story
? Component: Frontend
? Acceptance Criteria: Satisfy all the requirements in the description

🚀 Creating Jira ticket...
✅ Jira ticket created: PROJ-1042

✏️  Rewriting 2 commit(s)...
  → build(PROJ-1042): Remove legacy payment adapter and feature flags
  → fix(PROJ-1042): Remove org-level feature flags
✅ Commits rewritten.

🌿 Creating branch: PROJ-1042
Switched to a new branch 'PROJ-1042'
remote:
remote: Create a pull request for 'PROJ-1042' on GitHub by visiting:
remote:      https://github.com/acme/my-app/pull/new/PROJ-1042
remote:
To https://github.com/acme/my-app.git
 * [new branch]      PROJ-1042 -> PROJ-1042
✅ Branch pushed: PROJ-1042

? PR base branch (enter to use "development"): development

📬 Opening GitHub PR...
✅ PR opened: https://github.com/acme/my-app/pull/87

🔄 Moving ticket to "CODE REVIEW"...
✅ Ticket moved to "CODE REVIEW".

🎉 All done! Ticket: https://yourcompany.atlassian.net/browse/PROJ-1042
```

---

## Commit Message Format

The tool follows the [Conventional Commits](https://www.conventionalcommits.org/) spec and inserts the ticket key as the scope:

| Before | After |
|---|---|
| `fix: remove old route` | `fix(PROJ-1042): remove old route` |
| `feat(auth): add SSO` | `feat(PROJ-1042): add SSO` |
| `Update config file` | `fix(PROJ-1042): Update config file` |

If a commit has no conventional prefix, `fix` is used as the default type.

---

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a branch: `git checkout -b feat/your-feature`
3. Make your changes and commit using conventional commits
4. Push and open a PR against `main`

### Project Structure

```
commit-to-jira/
├── index.js                  # Entry point (3 lines)
├── src/
│   ├── cli.js                # Commander setup and command registration
│   ├── config.js             # Shared persistent config (Conf)
│   ├── commands/
│   │   ├── setup.js          # Setup command
│   │   └── build.js          # Build command and step orchestration
│   ├── lib/
│   │   ├── git.js            # Git operations
│   │   ├── jira.js           # Jira REST API client
│   │   └── github.js         # GitHub API — PR creation
│   └── utils/
│       ├── format.js         # Commit message formatter
│       └── errors.js         # Error display helper
```

### Running Locally

```bash
npm install
npm link
commit-to-jira setup
commit-to-jira build
```

### Reporting Issues

Open an issue on [GitHub](https://github.com/aashishwastaken/commit-to-jira/issues) with:
- Your Node.js version (`node -v`)
- The command you ran
- The full error output

---

## Changelog

### v1.0.2

- **Added `c2j` alias** — `c2j build` and `c2j setup` now work as shorthand for `commit-to-jira build` / `commit-to-jira setup`
- **Fixed commit detection** — switched from `@{-1}..HEAD` to `origin/<branch>..HEAD` so commits are correctly scoped to what's unpushed on the current branch, including on long-lived branches like `development`
- **Fixed macOS compatibility** — replaced `sed -i` (Linux-only syntax) with cross-platform Node.js file operations; no dependency on `perl`, `sed`, or any external tool beyond Node itself
- **Fixed GitHub PR base branch validation** — tool now checks the base branch exists on the remote before calling the GitHub API, with a clear error message instead of a cryptic 422
- **Fixed commit body preservation** — commit descriptions are no longer dropped during the rebase rewrite

### v1.0.1

- Fixed support for Windows, macOS, and Linux

### v1.0.0

- Initial release

---

## License

MIT
