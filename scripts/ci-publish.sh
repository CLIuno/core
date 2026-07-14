#!/usr/bin/env bash
# Publish to npm only when package.json's version is not already on the registry.
# changesets/action runs its `publish` command on every master push (assuming a
# version PR was just merged); without this guard it re-attempts the current,
# already-published version and fails. A direct registry read is used because it
# needs no auth and is unaffected by the OIDC .npmrc the publish step relies on.
set -euo pipefail

name=$(node -p "require('./package.json').name")
version=$(node -p "require('./package.json').version")

status=$(curl -s -o /dev/null -w "%{http_code}" "https://registry.npmjs.org/${name}/${version}")
if [ "$status" = "200" ]; then
  echo "${name}@${version} is already published — nothing to release."
  exit 0
fi

echo "Publishing ${name}@${version} via npm trusted publishing (OIDC)…"
pnpm exec changeset publish
