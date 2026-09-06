# Fix: run the `@vscode/test-electron` suite end-to-end

## Status

Root cause diagnosed and the fix verified working (`npm test` exits 0, real Extension Development Host launches, both `msgParser` tests pass). Not yet applied to `src/test/runTest.ts` — this doc is the plan for that one-line change plus cleanup, per request.

## Context

The extension restructure (see `docs/plans/zippy-discovering-sloth.md` history / `CHANGELOG.md`) added a Mocha + `@vscode/test-electron` suite. `npm run typecheck`, `npm run compile`, `npm run lint`, and running the compiled test file directly via plain `mocha` all passed. But `npm test` — which launches the tests through a real VS Code Extension Development Host via `@vscode/test-electron`'s `runTests()` — failed every time with output like:

```
/path/to/Visual Studio Code.app/Contents/MacOS/Electron: bad option: --no-sandbox
/path/to/Visual Studio Code.app/Contents/MacOS/Electron: bad option: --extensionDevelopmentPath=...
Exit code:   9
```

This reproduced identically against three different targets: a freshly-downloaded VS Code 1.129.1, `@vscode/test-electron` bumped from 2.5.2 to the newer 3.0.0, and the user's real, already-working local VS Code install — ruling out a corrupted download or a version mismatch in the test tooling.

## Root cause

This Claude Code agent session's own shell environment has `ELECTRON_RUN_AS_NODE=1` set (visible via `env | grep -i electron`), inherited from how this session itself was launched (as a child process of VS Code's Electron/Node runtime — the environment also shows `CLAUDE_CODE_EXECPATH=.../anthropic.claude-code-*/resources/native-binary/claude`, consistent with that). Every child process spawned from this session's Bash tool inherits that variable.

`@vscode/test-electron`'s `runTests()` builds its child process environment as `Object.assign({}, process.env, testRunnerEnv)` — i.e. it starts from the **calling process's own environment** and layers test-specific overrides on top, without clearing anything. The inherited `ELECTRON_RUN_AS_NODE=1` rides along into the spawned VS Code binary.

When `ELECTRON_RUN_AS_NODE=1` is set, Electron boots as a **plain Node.js process** instead of initializing Chromium/the GUI. Node's own CLI argument parser then sees flags it doesn't recognize (`--no-sandbox`, `--extensionDevelopmentPath=...`, etc.) and rejects them with exactly the observed message format and exit code:

```
$ ELECTRON_RUN_AS_NODE=1 node --no-sandbox -e "1"
node: bad option: --no-sandbox
```
(exit code 9 — matches exactly)

This is not a bug in VS Code, `@vscode/test-electron`, or the extension's own code — it's an environment artifact specific to running `npm test` from inside this (or any similarly Electron-hosted) shell. A normal developer terminal, and GitHub Actions runners in the CI workflow, do not set this variable, so they were never affected.

## Verified fix

Clearing the variable before `runTests()` is called resolves it completely:

```
$ env -u ELECTRON_RUN_AS_NODE node out/test/runTest.js
...
Started local extension host with pid 28186.
  msgParser
    ✔ parses headers, attachments and an HTML body from sample.msg
    ✔ detects a nested .msg attachment and re-parses it into its own EmailData
  2 passing (40ms)
Extension host with pid 28186 exited with code: 0, signal: unknown.
Exit code:   0
```

## Steps

1. In `src/test/runTest.ts`, at the top of `main()`, before constructing the `runTests()` call, add:
   ```ts
   // Some shells this runs from (e.g. an Electron-hosted agent/dev-tool terminal)
   // inherit ELECTRON_RUN_AS_NODE=1, which forces the spawned VS Code binary into
   // plain Node mode instead of launching its Chromium/GUI runtime -- Node's own
   // CLI parser then rejects every VS Code flag with "bad option: <flag>".
   // Clear it so the test host launches correctly regardless of the calling shell.
   delete process.env.ELECTRON_RUN_AS_NODE;
   ```
   This is a no-op in environments where the variable was never set (plain terminals, CI), so it's safe everywhere.
2. Remove the `VSCODE_TEST_EXECUTABLE_PATH` escape hatch added earlier in the same file — it was a workaround for a misdiagnosis (assumed the downloaded VS Code build was broken; it wasn't). Optional to keep as a general-purpose override, but it's no longer load-bearing for this bug and shouldn't be left implying it fixes something it doesn't.
3. `npm run compile` (picks up the `runTest.ts` change), then `npm test` — expect exit code 0, "Started local extension host", both tests passing.
4. Run `npm test` a second time without deleting `.vscode-test/` first, to confirm the cached VS Code download is reused (`✔ Found existing install`) and results stay green — not a one-off.
5. No change needed to `.github/workflows/ci.yml` — GitHub Actions runners don't set `ELECTRON_RUN_AS_NODE`, so CI was never exposed to this failure mode; this fix only matters for local runs from an Electron-hosted shell.

## Verification checklist

- [ ] `npm test` exits 0 with both `msgParser` tests passing through the real Extension Development Host (not just via direct `mocha out/test/suite/*.test.js`, which already passed and only proves the test *content*, not the wiring).
- [ ] Re-run confirms it isn't flaky/one-off.
- [ ] `npm run compile`, `npm run lint`, `npm run package` still succeed unmodified — this change is isolated to `runTest.ts`.
