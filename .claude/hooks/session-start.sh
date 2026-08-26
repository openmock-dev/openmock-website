#!/bin/bash
# Sets the git commit identity for Claude Code on the web sessions, so
# commits made in this repo are authored as the repo owner rather than
# the default "Claude <noreply@anthropic.com>" sandbox identity.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

git config --global user.name "Renan Ramon"
git config --global user.email "7116075+renanramonh@users.noreply.github.com"
