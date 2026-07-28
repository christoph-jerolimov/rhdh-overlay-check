# rhdh-overlay-check

Checks that the plugin versions referenced in
[rhdh-plugin-export-overlays](https://github.com/redhat-developer/rhdh-plugin-export-overlays)
match the latest versions in their source repositories
([backstage/community-plugins](https://github.com/backstage/community-plugins)
and [redhat-developer/rhdh-plugins](https://github.com/redhat-developer/rhdh-plugins)).

## GitHub workflow

The [Check overlay versions](.github/workflows/check-overlay-versions.yaml)
workflow runs once a day on workdays (Mon-Fri, 06:00 UTC), on pull requests,
and can also be triggered manually. It clones the three repositories into
`.clones/` and passes the clone locations to the check script via the
environment variables `BCP_DIR`, `OVERLAY_DIR`, and `RHDH_PLUGINS_DIR`.
The result table is printed to the log and to the GitHub workflow summary.
The workflow never fails on version mismatches.

## Checks

For each workspace, the script:

1. Loads `workspaces/$workspace/source.json` from the overlay repository and
   resolves the source repository to one of the local clones (any other
   repository URL is reported as an error).
2. Reads the Backstage version from `workspaces/$workspace/backstage.json`
   in the source repository.
3. Loads the package folders (keys) from `workspaces/$workspace/plugins-list.yaml`
   in the overlay repository, and for each package folder:
   1. Reads `workspaces/$workspace/$packageFolder/package.json` from the
      source repository.
   2. Expects exactly one yaml in `workspaces/$workspace/metadata/*.yaml`
      whose `spec.packageName` matches the source package name.
   3. Checks that `spec.dynamicArtifact` in that yaml ends with
      `'__' + the package version`.
   4. Checks that `spec.version` in that yaml matches that version.

## Running locally

When the environment variables are not defined, the script expects the
repositories in the following folders relative to this repository:

| Environment variable | Default                                 | Repository                                                    |
| -------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `BCP_DIR`            | `../../backstage/community-plugins`     | https://github.com/backstage/community-plugins                |
| `OVERLAY_DIR`        | `../../rhd/rhdh-plugin-export-overlays` | https://github.com/redhat-developer/rhdh-plugin-export-overlays |
| `RHDH_PLUGINS_DIR`   | `../../rhd/rhdh-plugins`                | https://github.com/redhat-developer/rhdh-plugins              |

This project uses Yarn 4 via a committed release
(`.yarn/releases/yarn-4.17.1.cjs`) — any installed yarn version
delegates to it automatically.

```sh
yarn install
yarn run check
```

Or with explicit clone locations:

```sh
git clone --depth 1 https://github.com/backstage/community-plugins .clones/bcp
git clone --depth 1 https://github.com/redhat-developer/rhdh-plugin-export-overlays .clones/overlay
git clone --depth 1 https://github.com/redhat-developer/rhdh-plugins .clones/rhdh-plugins

yarn install
BCP_DIR=.clones/bcp OVERLAY_DIR=.clones/overlay RHDH_PLUGINS_DIR=.clones/rhdh-plugins yarn run check
```
