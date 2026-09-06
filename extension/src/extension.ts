import * as vscode from 'vscode';
import { EmailPreviewProvider } from './emailPreviewProvider';
import { NESTED_SCHEME, NestedAttachmentFsProvider } from './fs/nestedAttachmentFsProvider';

export function activate(context: vscode.ExtensionContext): void {
  const nestedFs = new NestedAttachmentFsProvider();
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(NESTED_SCHEME, nestedFs, { isReadonly: true })
  );

  const editorProvider = new EmailPreviewProvider(context, nestedFs);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(EmailPreviewProvider.viewType, editorProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    })
  );
}

export function deactivate(): void {}
