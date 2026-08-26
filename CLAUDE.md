# CLAUDE.md

Guidance for Claude Code sessions working in this repository.

## Commit authorship

A SessionStart hook (`.claude/hooks/session-start.sh`) sets the git commit
identity to the repo owner (`Renan Ramon <7116075+renanramonh@users.noreply.github.com>`)
on every Claude Code on the web session, so commits are authored as the owner
rather than the sandbox's default `Claude <noreply@anthropic.com>` identity.

When creating a commit, always end the commit message with:

```
Co-Authored-By: Claude Code <noreply@anthropic.com>
```
