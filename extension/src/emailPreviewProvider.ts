import * as vscode from 'vscode';
import { EmailDocument } from './emailDocument';
import { NestedAttachmentFsProvider } from './fs/nestedAttachmentFsProvider';
import { parseEmailFile } from './parsers';
import { generateNonce, renderEmailShell } from './webview/renderEmail';
import { sanitizeAttachmentFilename } from './sanitize';
import { EmailData, EmailPreviewData } from './types/emailData';

interface WebviewToExtensionMessage {
  type: 'ready' | 'openAttachment' | 'saveAttachment';
  index?: number;
}

// The webview never reads attachment bytes (Save/View are resolved extension-side,
// keyed by index -- see onDidReceiveMessage below), so they're stripped here rather
// than sent across postMessage uncapped.
function toPreviewPayload(email: EmailData): EmailPreviewData {
  return {
    ...email,
    attachments: email.attachments.map(({ name, size, isNestedMessage, isSignature }) => ({
      name,
      size,
      isNestedMessage,
      isSignature,
    })),
  };
}

export class EmailPreviewProvider implements vscode.CustomReadonlyEditorProvider<EmailDocument> {
  static readonly viewType = 'mailpeek.emailViewer';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly nestedFs: NestedAttachmentFsProvider
  ) {}

  async openCustomDocument(uri: vscode.Uri): Promise<EmailDocument> {
    let bytes: Uint8Array;
    try {
      bytes = await vscode.workspace.fs.readFile(uri);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new EmailDocument(uri, undefined, message);
    }

    const result = await parseEmailFile(uri.path, bytes);
    if (result.status === 'ok') {
      return new EmailDocument(uri, result.email, undefined);
    }
    return new EmailDocument(uri, undefined, result.message);
  }

  async resolveCustomEditor(document: EmailDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
    const webviewDir = vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview');
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [webviewDir],
    };

    const scriptUri = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'main.js'));
    const styleUri = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'main.css'));

    webviewPanel.webview.html = renderEmailShell({
      cspSource: webviewPanel.webview.cspSource,
      scriptUri: scriptUri.toString(),
      styleUri: styleUri.toString(),
      nonce: generateNonce(),
    });

    webviewPanel.webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage) => {
      if (message.type === 'ready') {
        const collapseQuotedText = vscode.workspace.getConfiguration('mailpeek').get<boolean>('collapseQuotedText', true);
        webviewPanel.webview.postMessage({
          type: 'init',
          error: document.error,
          email: document.email ? toPreviewPayload(document.email) : undefined,
          collapseQuotedText,
        });
        return;
      }

      if (!document.email || message.index === undefined) {
        return;
      }
      const attachment = document.email.attachments[message.index];
      if (!attachment) {
        return;
      }

      if (message.type === 'openAttachment') {
        if (!attachment.isNestedMessage) {
          return;
        }
        const nestedUri = this.nestedFs.register(document.uri, message.index, attachment.name, attachment.bytes);
        await vscode.commands.executeCommand('vscode.openWith', nestedUri, EmailPreviewProvider.viewType);
      } else if (message.type === 'saveAttachment') {
        const target = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(sanitizeAttachmentFilename(attachment.name)),
        });
        if (target) {
          await vscode.workspace.fs.writeFile(target, attachment.bytes);
        }
      }
    });
  }
}
