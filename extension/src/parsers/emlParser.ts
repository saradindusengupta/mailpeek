import { EmailAttachment, EmailData } from '../types/emailData';

// postal-mime ships ESM-only (its CJS build exists but trips TS's Node16
// module resolution when statically imported from this CJS-compiled project) --
// a dynamic import from within this already-async function avoids the friction
// entirely. Its own exported types have the same problem, so the shapes we
// actually touch are declared locally instead of imported.
interface Mailbox {
  name: string;
  address: string;
  group?: undefined;
}

interface AddressGroup {
  name: string;
  address?: undefined;
  group: Mailbox[];
}

type Address = Mailbox | AddressGroup;

function formatMailbox(mailbox: Mailbox): string {
  if (mailbox.name && mailbox.address && mailbox.name !== mailbox.address) {
    return `${mailbox.name} <${mailbox.address}>`;
  }
  return mailbox.name || mailbox.address || '';
}

function formatAddresses(addresses: Address[] | undefined): string {
  return (addresses || [])
    .flatMap((address) => (address.group ? address.group : [address as Mailbox]))
    .map(formatMailbox)
    .filter((formatted) => formatted.length > 0)
    .join(', ');
}

function toBytes(content: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }
  if (typeof content === 'string') {
    return new TextEncoder().encode(content);
  }
  return new Uint8Array(content);
}

const SIGNATURE_MIME_TYPES = new Set(['application/pkcs7-signature', 'application/x-pkcs7-signature']);
const OPAQUE_SMIME_MIME_TYPE = 'application/pkcs7-mime';

export async function parseEml(bytes: Uint8Array): Promise<EmailData> {
  const { default: PostalMime } = await import('postal-mime');
  const email = await PostalMime.parse(bytes, { forceRfc822Attachments: true });

  const rawHeaders = email.headerLines.map((headerLine) => headerLine.line).join('\n');

  const attachments: EmailAttachment[] = email.attachments.map((attachment, index) => {
    const attachmentBytes = toBytes(attachment.content);
    return {
      name: attachment.filename || `attachment-${index}`,
      size: attachmentBytes.byteLength,
      isNestedMessage: attachment.mimeType === 'message/rfc822',
      isSignature: SIGNATURE_MIME_TYPES.has(attachment.mimeType),
      bytes: attachmentBytes,
    };
  });

  return {
    subject: email.subject || '(no subject)',
    from: email.from ? formatAddresses([email.from]) : '',
    to: formatAddresses(email.to),
    cc: formatAddresses(email.cc),
    date: email.date || '',
    rawHeaders,
    bodyHtml: email.html,
    bodyText: email.text,
    attachments,
    isOpaqueSmime: email.attachments.some((attachment) => attachment.mimeType === OPAQUE_SMIME_MIME_TYPE),
  };
}
