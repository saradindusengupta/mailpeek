import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    // Some shells this runs from (e.g. an Electron-hosted agent/dev-tool terminal)
    // inherit ELECTRON_RUN_AS_NODE=1, which forces the spawned VS Code binary into
    // plain Node mode instead of launching its Chromium/GUI runtime -- Node's own
    // CLI parser then rejects every VS Code flag with "bad option: <flag>".
    // Clear it so the test host launches correctly regardless of the calling shell.
    delete process.env.ELECTRON_RUN_AS_NODE;

    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Optional escape hatch for local dev: point at an already-installed VS Code
    // instead of letting @vscode/test-electron download one. Not needed in CI.
    const vscodeExecutablePath = process.env.VSCODE_TEST_EXECUTABLE_PATH;

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      ...(vscodeExecutablePath ? { vscodeExecutablePath } : {}),
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
