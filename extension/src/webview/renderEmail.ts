// Pure HTML-shell builder for the outer webview document -- no `vscode` import,
// so it's testable with plain string inputs. The caller (emailPreviewProvider.ts)
// resolves webview-specific values (cspSource, asWebviewUri output) and passes
// them in as plain strings. Sanitizing/rendering the actual email content happens
// separately, in webview/main.ts, which runs in the webview's real browser DOM.

export interface RenderEmailShellOptions {
  cspSource: string;
  scriptUri: string;
  styleUri: string;
  nonce: string;
}

export function generateNonce(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export function renderEmailShell(options: RenderEmailShellOptions): string {
  const { cspSource, scriptUri, styleUri, nonce } = options;

  const csp = [
    `default-src 'none'`,
    `form-action 'none'`,
    `base-uri 'none'`,
    `frame-src 'self'`,
    `img-src ${cspSource}`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Email Viewer</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
