export interface EmailAttachment {
  name: string;
  size: number;
  isNestedMessage: boolean;
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
}
