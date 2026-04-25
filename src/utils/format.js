// Inserts ticket key into a conventional commit subject.
// Handles existing scopes by replacing them with the ticket key.
// Falls back to "fix" type if no conventional prefix is found.
//
// Examples:
//   "fix: foo"        → "fix(SSI-1): foo"
//   "feat(scope): foo" → "feat(SSI-1): foo"
//   "Remove old code"  → "fix(SSI-1): Remove old code"
export function formatCommitMsg(subject, ticketKey) {
    const match = subject.match(/^(\w+)(?:\([^)]*\))?(!)?: (.+)$/);
    if (match) {
        const [, type, breaking, desc] = match;
        return `${type}(${ticketKey})${breaking || ''}: ${desc}`;
    }
    return `fix(${ticketKey}): ${subject}`;
}
