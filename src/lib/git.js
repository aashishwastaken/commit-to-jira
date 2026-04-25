import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { formatCommitMsg } from '../utils/format.js';

const posix = p => p.replace(/\\/g, '/');

// Returns commits made since the previously checked-out branch, newest first.
// Uses ASCII control chars as delimiters to safely handle multi-line bodies.
export function getUnpushedCommits() {
    const raw = execSync('git log @{-1}..HEAD --pretty=format:"%x1e%s%x1f%b"')
        .toString()
        .trim();

    if (!raw) return [];

    return raw.split('\x1e').filter(Boolean).map(entry => {
        const [subject, ...bodyParts] = entry.split('\x1f');
        return {
            summary: subject.trim(),
            body: bodyParts.join('').trim(),
        };
    });
}

// Rewrites N commit messages in-place using a non-interactive rebase.
// Uses temp shell scripts as GIT_SEQUENCE_EDITOR and GIT_EDITOR so no
// terminal interaction is needed and it works on Windows (env vars via
// Node's execSync env option, not shell assignment syntax).
export function rewriteCommitMessages(commits, ticketKey) {
    const n = commits.length;
    const tmpDir = mkdtempSync(join(tmpdir(), 'cj-'));

    // Rebase replays oldest-first; git log returns newest-first
    const oldestFirst = [...commits].reverse();
    oldestFirst.forEach((c, i) => {
        const newSubject = formatCommitMsg(c.summary, ticketKey);
        const fullMsg = c.body ? `${newSubject}\n\n${c.body}\n` : `${newSubject}\n`;
        writeFileSync(join(tmpDir, String(i + 1)), fullMsg);
    });

    const counterFile = posix(join(tmpDir, 'counter'));
    const msgDir = posix(tmpDir);
    writeFileSync(join(tmpDir, 'counter'), '0');

    const editorScript = join(tmpDir, 'editor.sh');
    writeFileSync(
        editorScript,
        `#!/bin/sh\nCOUNT=$(cat "${counterFile}")\nCOUNT=$((COUNT + 1))\necho $COUNT > "${counterFile}"\ncp "${msgDir}/$COUNT" "$1"\n`,
        { encoding: 'utf8' }
    );
    execSync(`chmod +x "${posix(editorScript)}"`);

    const seqScript = join(tmpDir, 'seq.sh');
    writeFileSync(seqScript, `#!/bin/sh\nsed -i 's/^pick/reword/' "$1"\n`, { encoding: 'utf8' });
    execSync(`chmod +x "${posix(seqScript)}"`);

    execSync(`git rebase -i HEAD~${n}`, {
        stdio: 'pipe',
        env: {
            ...process.env,
            GIT_SEQUENCE_EDITOR: posix(seqScript),
            GIT_EDITOR: posix(editorScript),
        },
    });

    rmSync(tmpDir, { recursive: true, force: true });
}

// Creates a local branch named after the ticket and pushes it to origin.
export function createAndPushBranch(branchName) {
    execSync(`git checkout -b ${branchName}`);
    execSync(`git push -u origin ${branchName}`);
}

// Parses the origin remote URL to extract "owner/repo".
// Handles both HTTPS and SSH remote formats.
export function detectGithubRepo() {
    try {
        const remoteUrl = execSync('git remote get-url origin').toString().trim();
        const match = remoteUrl.match(/github\.com[:/](.+?\/.+?)(?:\.git)?$/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}
