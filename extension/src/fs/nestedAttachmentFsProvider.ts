import * as vscode from 'vscode';
import { sanitizeAttachmentFilename } from '../sanitize';

export const NESTED_SCHEME = 'mailpeek-nested';

interface Entry {
  data: Uint8Array;
  ctime: number;
  mtime: number;
}

/**
 * Serves nested email attachment bytes (extracted from a parent .msg/.eml at
 * parse time) as virtual, in-memory files so `vscode.openWith` can open them
 * in a new custom editor tab. No temp files, no disk writes: the extracted
 * attachment bytes for an unopened forwarded message never touch disk.
 */
export class NestedAttachmentFsProvider implements vscode.FileSystemProvider {
  private readonly store = new Map<string, Entry>();

  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.emitter.event;

  /**
   * Registers attachment bytes and returns a stable Uri for them. The id is
   * derived from the parent Uri + attachment index, so re-viewing the same
   * attachment resolves to the same Uri and VS Code reuses the existing tab
   * instead of opening a duplicate.
   */
  register(parentUri: vscode.Uri, attachmentIndex: number, suggestedName: string, data: Uint8Array): vscode.Uri {
    const id = Buffer.from(parentUri.toString()).toString('base64url');
    const safeName = encodeURIComponent(sanitizeAttachmentFilename(suggestedName));
    const uri = vscode.Uri.parse(`${NESTED_SCHEME}:/${id}/${attachmentIndex}-${safeName}`);
    const now = Date.now();
    const existing = this.store.get(uri.toString());
    this.store.set(uri.toString(), { data, ctime: existing?.ctime ?? now, mtime: now });
    return uri;
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const entry = this.store.get(uri.toString());
    if (!entry) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return {
      type: vscode.FileType.File,
      ctime: entry.ctime,
      mtime: entry.mtime,
      size: entry.data.byteLength,
      permissions: vscode.FilePermission.Readonly,
    };
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const entry = this.store.get(uri.toString());
    if (!entry) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return entry.data;
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  readDirectory(): [string, vscode.FileType][] {
    return [];
  }

  createDirectory(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  writeFile(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  delete(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  rename(oldUri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(oldUri);
  }
}
