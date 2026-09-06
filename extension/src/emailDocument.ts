import * as vscode from 'vscode';
import { EmailData } from './types/emailData';

export class EmailDocument implements vscode.CustomDocument {
  constructor(
    readonly uri: vscode.Uri,
    readonly email: EmailData | undefined,
    readonly error: string | undefined
  ) {}

  dispose(): void {}
}
