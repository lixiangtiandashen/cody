# Contributing to Cody for VS Code

## Getting started

1. Run `pnpm install` (see [repository setup instructions](../doc/dev/index.md) if you don't have `pnpm`).
1. Open this repository in VS Code and run the `Launch VS Code Extension (Desktop)` build/debug task (or run `cd vscode && pnpm run build && pnpm run dev`).

Tip: Enable `cody.debug.verbose` in VS Code settings during extension development.

## File structure

- `src`: source code of the components for the extension host
- `webviews`: source code of the extension sidebar webviews, built with Vite
- `test`: [tests](test/README.md)
- `dist`: build outputs from both esbuild and vite
- `resources`: everything in this directory will be moved to the ./dist directory automatically during build time for easy packaging
- `index.html`: the entry file that Vite looks for to build the webviews. The extension host reads this file at run time and replace the variables inside the file with webview specific uri and info

## Architecture

Read [ARCHITECTURE.md](../ARCHITECTURE.md) and follow the principles described
there.

## Reporting autocomplete issues

The best way to help us improve code completions is by contributing your examples in the [Unhelpful Completions](https://github.com/sourcegraph/cody/discussions/358) discussion together with some context of how the autocomplete request was build.

### Accessing autocomplete logs

1. Enable `cody.debug.verbose` in VS Code settings
   - Make sure to restart or reload VS Code after changing these settings
1. Open the Cody debug panel via "View > Output" and selecting the "Cody by Sourcegraph" option in the dropdown.

### Realtime autocomplete tracing

We also have some build-in UI to help during the development of autocomplete requests. To access this, run the `Cody > Open Autocomplete Trace View` action. This will open a new panel that will show all requests in real time.

## Testing

- Unit tests: `pnpm run test:unit`
- Integration tests: `pnpm run test:integration`
- End-to-end tests: `pnpm run test:e2e`

## Releases

### Stable builds

To publish a new **major** release to the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai) and [Open VSX Registry](https://open-vsx.org/extension/sourcegraph/cody-ai).

1. Increment the `version` in [`package.json`](package.json) & [`CHANGELOG`](CHANGELOG.md).
2. `pnpm update-agent-recordings` to update the version in agent recordings.
3. Commit the version increment, e.g. `VS Code: Release 1.1.0`.
4. `git tag vscode-v$(jq -r .version package.json)`
5. `git push --tags`
6. Wait for the [vscode-stable-release workflow](https://github.com/sourcegraph/cody/actions/workflows/vscode-stable-release.yml) run to finish.
7. Update the [Release Notes](https://github.com/sourcegraph/cody/releases).

### Release Checklist

Version Bump:

- [x] [vscode/CHANGELOG.md](./CHANGELOG.md)
- [x] [vscode/package.json](./package.json)
- [x] Update agent recordings

  ```
  source agent/scripts/export-cody-http-recording-tokens.sh
  src login
  pnpm update-agent-recordings
  ```

### Patch Release

To publish a **patch** release to the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai) and [Open VSX Registry](https://open-vsx.org/extension/sourcegraph/cody-ai).

1. Make sure all the changes for the patch are already committed to the `main` branch.
2. Create a patch release branch if one does not already exist:
   1. For example, if you are releasing `v1.10.<patch>`, then you should look to see if there is already a `vscode/1.10` branch.
   2. If there is not, then create the branch using the [last stable release tag](https://github.com/sourcegraph/cody/tags) for the version you are trying to patch, e.g., `git checkout vscode-v1.10.0 -B vscode/1.10` and push this branch.
      1. Note: Do not push your changes to this branch directly; treat it like a `main` branch where all changes that are merged should be reviewed first.
3. Create a PR with your changes that will go into the release, and send that PR to the e.g., `vscode/1.10` branch:
   1. Create your PR branch: `git checkout vscode/1.10 -b me/1.10.1-patch-release`
   2. Make changes:
      1. Cherry-pick (`git cherry-pick $COMMIT_FROM_MAIN`) the relevant patches from `main` into your PR branch. If there are any conflicts, address them in your branch.
      2. Increment the `version` in [`package.json`](package.json)
      3. Update the [`CHANGELOG`](CHANGELOG.md)
      4. Update the version used in agent recordings by [following these steps](../agent/README.md#updating-the-polly-http-recordings)
   3. Send a PR to merge your branch, e.g., `me/1.10.1-patch-release` into `vscode/1.10`
   4. Ensure your PR branch passes CI tests, and get your PR reviewed/approved/merged.
4. Tag the patch release:
   1. `git tag vscode-v$(jq -r .version package.json)`
   2. `git push --tags`
5. Wait for the [vscode-stable-release workflow](https://github.com/sourcegraph/cody/actions/workflows/vscode-stable-release.yml) run to finish.
6. Once the patch has been published, update `main`:
   1. Create a new PR branch off `main`
   2. Update the `version` in [`package.json`](package.json) if appropriate.
   3. Update the [`CHANGELOG`](CHANGELOG.md)
   4. Update the version used in agent recordings by [following these steps](../agent/README.md#updating-the-polly-http-recordings)
   5. Commit the version increment, e.g., `VS Code: Release 1.10.1` and get your `main` PR merged.

### Insiders builds

Insiders builds are nightly (or more frequent) builds with the latest from `main`. They're less stable but have the latest changes. Only use the insiders build if you want to test the latest changes.

#### Using the insiders build

To use the Cody insiders build in VS Code:

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai).
1. Select **Switch to Pre-release Version** in the extension's page in VS Code.
1. Wait for it to download and install, and then reload (by pressing **Reload Required**).

#### Publishing a new insiders build

Insiders builds are published automatically daily at 1500 UTC using the [vscode-insiders-release workflow](https://github.com/sourcegraph/cody/actions/workflows/vscode-insiders-release.yml).

To manually trigger an insiders build:

1. Open the [vscode-insiders-release workflow](https://github.com/sourcegraph/cody/actions/workflows/vscode-insiders-release.yml).
1. Press the **Run workflow ▾** button.
1. Select the branch you want to build from (usually `main`).
1. Press the **Run workflow** button.
1. Wait for the workflow run to finish.

### Running a release build locally

It can be helpful to build and run the packaged extension locally to replicate a typical user flow.

To do this:

1. Run `pnpm install` (see [repository setup instructions](../doc/dev/index.md) if you don't have `pnpm`).
1. Run `CODY_RELEASE_TYPE=stable pnpm release:dry-run`
1. Uninstall any existing Cody extension from VS Code.
1. Run `code --install-extension dist/cody.vsix`

#### Simulating a fresh user install

VS Code will preserve some extension state (e.g., configuration settings) even when an extension is uninstalled. To replicate the flow of a completely new user, run a separate instance of VS Code:

```shell
code --user-data-dir=/tmp/separate-vscode-instance --profile-temp
```

## Development tips

To open the Cody sidebar, autocomplete trace view, etc., when debugging starts, you can set hidden
VS Code user settings. See [`src/dev/helpers.ts`](src/dev/helpers.ts) for a list of available
options.

### Wasm tree sitter modules

We use tree-sitter parser for a better code analysis in post completion process. In order to be able
to run these modules in VSCode runtime we have to use their wasm version. Wasm modules are not common
modules, you can't just inline them into the bundle by default, you have to load them separately and
connect them with special `load` wasm API.

We don't keep these modules in .git tree, but instead we load them manually from our google cloud bucket.
In order to do it you can run `./scripts/download-wasm-modules.ts` or just `pnpm download-wasm` before
running you vscode locally.

### Debugging with dedicated Node DevTools

1. **Initialize the Build Watcher**: Run the following command from the monorepo root to start the build watcher:

```sh
pnpm --filter cody-ai run watch:build:dev:desktop
```

2. **Launch the VSCode Extension Host**: Next, start the VSCode extension host by executing the command below from the monorepo root:

```sh
pnpm --filter cody-ai run start:dev:desktop
```

3. **Access the Chrome Inspector**: Open up your Google Chrome browser and navigate to `chrome://inspect/#devices`.
4. **Open Node DevTools**: Look for and click on the option that says "Open dedicated DevTools for Node".
5. **Specify the Debugging Endpoint**: At this point, DevTools aren't initialized yet. Therefore, you need to specify [the debugging endpoint](https://nodejs.org/en/docs/inspector/) `localhost:9333` (the port depends on the `--inspect-extensions` CLI flag used in the `start:debug` npm script)
6. **Start Debugging Like a PRO**: yay!
