#!/usr/bin/env bash
# Restore the durable data store (data/raw, data/state, data/geocache.json) from
# the `data` branch into ./data before ingest. Read-only; no-op on first run.
set -euo pipefail

BRANCH="${DATA_BRANCH:-data}"
mkdir -p data

git fetch origin "$BRANCH" --depth=1 2>/dev/null || true
if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  # Extract just the data/ tree from the data branch into the working dir.
  git archive "origin/$BRANCH" data 2>/dev/null | tar -x 2>/dev/null || true
  echo "Restored data/ from branch '$BRANCH'."
else
  echo "No '$BRANCH' branch yet — starting with an empty store."
fi
