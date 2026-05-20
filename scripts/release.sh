#!/usr/bin/env bash
set -euo pipefail

BUMP="${BUMP:-patch}"
PUSH="${PUSH:-1}"
RELEASE_BRANCH="${RELEASE_BRANCH:-main}"
PUBLISH_FLAGS="${PUBLISH_FLAGS:---access public --no-git-checks}"

if [[ -n "${NODE_AUTH_TOKEN:-}" ]]; then
    printf '//registry.npmjs.org/:_authToken=%s\n' "$NODE_AUTH_TOKEN" > ~/.npmrc
fi

pnpm install --frozen-lockfile

if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Release requires a clean git working tree." >&2
    exit 1
fi

pnpm run lint
pnpm test
pnpm run build

VERSION="$(node scripts/bump-version.mjs "$BUMP")"
pnpm install --lockfile-only

git add package.json pnpm-lock.yaml
git commit -m "chore(release): ${VERSION} [skip ci]"
git tag "${VERSION}"

if [[ "$PUSH" == "1" ]]; then
    git push origin "HEAD:${RELEASE_BRANCH}" --follow-tags
fi

pnpm publish ${PUBLISH_FLAGS}
