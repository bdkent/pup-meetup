#!/usr/bin/env bash
# Persist the durable data store (data/raw, data/state, data/geocache.json) to the
# `data` branch, authored by github-actions[bot]. Creates the branch on first run.
# Run from the main checkout in CI (needs `contents: write` + fetch-depth: 0).
# Note: data/events is intentionally NOT persisted — it's a rebuildable projection.
set -euo pipefail

BRANCH="${DATA_BRANCH:-data}"
WT=".data-wt"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git fetch origin "$BRANCH" --depth=1 2>/dev/null || true

rm -rf "$WT"
if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  git worktree add "$WT" -B "$BRANCH" "origin/$BRANCH"
else
  # First run: create an orphan branch with no prior history.
  git worktree add --detach "$WT"
  git -C "$WT" checkout --orphan "$BRANCH"
  git -C "$WT" reset --hard
fi

# Sync the durable subdirs into the data-branch worktree.
rm -rf "$WT/data/raw" "$WT/data/state" "$WT/data/geocache.json"
mkdir -p "$WT/data"
[ -d data/raw ] && cp -r data/raw "$WT/data/"
[ -d data/state ] && cp -r data/state "$WT/data/"
[ -f data/geocache.json ] && cp data/geocache.json "$WT/data/"

git -C "$WT" add -A data
if git -C "$WT" diff --cached --quiet; then
  echo "No data changes to persist."
else
  git -C "$WT" commit -m "chore(data): refresh $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git -C "$WT" push origin "HEAD:$BRANCH"
  echo "Persisted data store to branch '$BRANCH'."
fi

git worktree remove "$WT" --force
