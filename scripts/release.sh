#!/usr/bin/env bash
set -euo pipefail

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

if [[ "$PUSH" == "1" ]]; then
    git fetch --tags origin
fi

VERSION="$(get-next-version --prefix v 2>/dev/null | tr -d '\n')"
if [[ -z "$VERSION" ]]; then
    echo "Unable to determine next version." >&2
    exit 1
fi

if git rev-parse --verify --quiet "$VERSION" >/dev/null; then
    echo "Version ${VERSION} already exists." >&2
    exit 1
fi

PACKAGE_VERSION="${VERSION#v}"
node - "$PACKAGE_VERSION" <<'NODE'
const fs = require("node:fs");

const packageJsonPath = "package.json";
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

packageJson.version = process.argv[2];
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
NODE
pnpm install --lockfile-only

git add package.json pnpm-lock.yaml
git commit -m "chore(release): ${VERSION} [skip ci]"
git tag -a "${VERSION}" -m "${VERSION}"

if [[ "$PUSH" == "1" ]]; then
    TAG_REF="refs/tags/${VERSION}"
    git push origin "HEAD:${RELEASE_BRANCH}" "${TAG_REF}:${TAG_REF}"
    git ls-remote --exit-code --tags origin "${TAG_REF}" >/dev/null
fi

pnpm publish ${PUBLISH_FLAGS}
