export interface EmailAttachment {
  name: string;
  size: number;
  isNestedMessage: boolean;
  // S/MIME detached signature (application/pkcs7-signature) -- see parsers/emlParser.ts
  // and parsers/msgParser.ts. Not verified, just detected: no signature/trust-chain
  // validation is performed anywhere in this codebase.
  isSignature: boolean;
  bytes: Uint8Array;
}

export interface EmailData {
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  rawHeaders: string;
  bodyHtml: string | undefined;
  bodyText: string | undefined;
  attachments: EmailAttachment[];
  // Opaque S/MIME (application/pkcs7-mime, or a .msg with messageClass starting
  // "IPM.Note.SMIME") -- encrypted or opaque-signed content with no readable body
  // available. See parsers/emlParser.ts and parsers/msgParser.ts.
  isOpaqueSmime: boolean;
}

// What the webview actually renders (extension/src/webview/main.ts's renderEmail()):
// name, size, and isNestedMessage per attachment -- never the bytes. Save and
// nested-message-open are resolved on the extension side, keyed by attachment index,
// so raw attachment content never needs to cross the postMessage boundary.
export type EmailPreviewAttachment = Omit<EmailAttachment, 'bytes'>;

export interface EmailPreviewData extends Omit<EmailData, 'attachments'> {
  attachments: EmailPreviewAttachment[];
}
