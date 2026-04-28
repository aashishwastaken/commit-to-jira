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
// Uses Node.js scripts as GIT_SEQUENCE_EDITOR and GIT_EDITOR — Node is
// guaranteed to be installed, unlike perl/sed which differ across platforms.
// Counter + message dir are passed via env vars to avoid shell-specific syntax.
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

    writeFileSync(join(tmpDir, 'counter'), '0');

    // GIT_SEQUENCE_EDITOR: replaces all "pick" with "reword" using Node fs
    const seqScript = join(tmpDir, 'seq.js');
    writeFileSync(seqScript, [
        '#!/usr/bin/env node',
        "const fs = require('fs');",
        'const file = process.argv[2];',
        "fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^pick /gm, 'reword '));",
    ].join('\n'), { encoding: 'utf8' });
    execSync(`chmod +x "${posix(seqScript)}"`);

    // GIT_EDITOR: increments a counter and writes the pre-built message for that commit
    const editorScript = join(tmpDir, 'editor.js');
    writeFileSync(editorScript, [
        '#!/usr/bin/env node',
        "const fs = require('fs'), path = require('path');",
        'const counterFile = process.env.CJ_COUNTER;',
        'const msgDir = process.env.CJ_MSG_DIR;',
        "const n = parseInt(fs.readFileSync(counterFile, 'utf8').trim() || '0') + 1;",
        'fs.writeFileSync(counterFile, String(n));',
        "fs.writeFileSync(process.argv[2], fs.readFileSync(path.join(msgDir, String(n)), 'utf8'));",
    ].join('\n'), { encoding: 'utf8' });
    execSync(`chmod +x "${posix(editorScript)}"`);

    execSync(`git rebase -i HEAD~${n}`, {
        stdio: 'pipe',
        env: {
            ...process.env,
            GIT_SEQUENCE_EDITOR: posix(seqScript),
            GIT_EDITOR: posix(editorScript),
            CJ_COUNTER: posix(join(tmpDir, 'counter')),
            CJ_MSG_DIR: posix(tmpDir),
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
