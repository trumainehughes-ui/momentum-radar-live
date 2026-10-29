#!/usr/bin/env bash
set -euo pipefail
if command -v copilot >/dev/null 2>&1; then
  echo "GitHub Copilot CLI already available: $(command -v copilot)"
  exit 0
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required." >&2
  exit 1
fi
npm install -g @github/copilot
echo "Copilot CLI installed. Run 'copilot' and follow authentication prompts."
