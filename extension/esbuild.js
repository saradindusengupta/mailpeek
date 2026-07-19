// The extension host now compiles via plain tsc (see tsconfig.json / npm run
// compile:extension). esbuild only handles the webview bundle -- tsc alone can't
// bundle the webview's one npm runtime dependency (dompurify) into something a
// <script> tag can load in a browser context.
const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

async function build() {
  const ctxWebview = await esbuild.context({
    entryPoints: ['src/webview/main.ts'],
    bundle: true,
    outfile: 'out/webview/main.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    tsconfig: 'tsconfig.webview.json',
    sourcemap: true,
    logLevel: 'info',
  });

  const ctxCss = await esbuild.context({
    entryPoints: ['src/webview/main.css'],
    bundle: true,
    outfile: 'out/webview/main.css',
    sourcemap: true,
    logLevel: 'info',
  });

  if (watch) {
    await Promise.all([ctxWebview.watch(), ctxCss.watch()]);
  } else {
    await Promise.all([ctxWebview.rebuild(), ctxCss.rebuild()]);
    await Promise.all([ctxWebview.dispose(), ctxCss.dispose()]);
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
