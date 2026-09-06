import MsgReader from '@kenjiuno/msgreader';
import { decompressRTF } from '@kenjiuno/decompressrtf';
import { deEncapsulateSync } from 'rtf-stream-parser';
import type { FieldsData } from '@kenjiuno/msgreader';
import * as iconv from 'iconv-lite';
import { EmailAttachment, EmailData } from '../types/emailData';

// rtf-stream-parser's default decoder calls Buffer.toString(enc) directly, which throws
// for anything but Node's built-in encodings (utf8, latin1, ...) -- RTF codepages like
// "cp1252" (the common case for Word-generated HTML-in-RTF bodies) are not among them.
function decodeRtfString(buf: Buffer, enc: string): string {
  return iconv.encodingExists(enc) ? iconv.decode(buf, enc) : buf.toString('utf8');
}

// decompressRTF has no streaming/options API to interrupt a decompression bomb mid-call,
// so the achievable mitigation is bounding what happens with its output: real forwarded-mail
// RTF bodies are KB-scale (confirmed against all 24 real fixtures), so 10MB is generous
// headroom for legitimate mail while capping what a crafted input can push into
// de-encapsulation and rendering.
export const MAX_DECOMPRESSED_RTF_BYTES = 10 * 1024 * 1024;

export function resolveBody(fields: FieldsData): { bodyHtml: string | undefined; bodyText: string | undefined } {
  if (fields.bodyHtml) {
    return { bodyHtml: fields.bodyHtml, bodyText: fields.body };
  }

  if (fields.compressedRtf && fields.compressedRtf.length > 0) {
    try {
      const decompressed = Buffer.from(decompressRTF(Array.from(fields.compressedRtf)));
      if (decompressed.byteLength > MAX_DECOMPRESSED_RTF_BYTES) {
        throw new Error(`Decompressed RTF body exceeds ${MAX_DECOMPRESSED_RTF_BYTES} bytes`);
      }
      const result = deEncapsulateSync(decompressed, { decode: decodeRtfString });
      const text = typeof result.text === 'string' ? result.text : result.text.toString('utf8');
      if (result.mode === 'html') {
        return { bodyHtml: text, bodyText: fields.body };
      }
      return { bodyHtml: undefined, bodyText: text || fields.body };
    } catch {
      // Malformed/unsupported RTF stream: fall back to whatever plain text is available
      // rather than failing the whole message.
    }
  }

  return { bodyHtml: undefined, bodyText: fields.body };
}

function formatAddress(name: string | undefined, email: string | undefined): string {
  if (name && email && name !== email) {
    return `${name} <${email}>`;
  }
  return name || email || '';
}

const SIGNATURE_MIME_TYPES = new Set(['application/pkcs7-signature', 'application/x-pkcs7-signature']);
// Not validated against a real S/MIME .msg fixture (none available) -- see design.md's
// documented risk. Per MS-OXCMAIL, "IPM.Note.SMIME" (exact) is the opaque case (encrypted
// or opaque-signed, no readable body); "IPM.Note.SMIME.MultipartSigned" is the clear-signed
// case, which has a normal readable body and must NOT match here.
const OPAQUE_SMIME_MESSAGE_CLASS = 'ipm.note.smime';

export function parseMsg(bytes: Uint8Array): EmailData {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const reader = new MsgReader(view);
  const fields = reader.getFileData();

  const to = (fields.recipients || [])
    .filter((r) => r.recipType === 'to')
    .map((r) => formatAddress(r.name, r.smtpAddress || r.email))
    .join(', ');
  const cc = (fields.recipients || [])
    .filter((r) => r.recipType === 'cc')
    .map((r) => formatAddress(r.name, r.smtpAddress || r.email))
    .join(', ');

  const { bodyHtml, bodyText } = resolveBody(fields);

  const attachments: EmailAttachment[] = (fields.attachments || []).map((attachmentFields, index) => {
    const extracted = reader.getAttachment(index);
    return {
      name: attachmentFields.fileName || attachmentFields.fileNameShort || extracted.fileName || `attachment-${index}`,
      size: extracted.content.byteLength,
      isNestedMessage: attachmentFields.innerMsgContent === true,
      isSignature: SIGNATURE_MIME_TYPES.has((attachmentFields.attachMimeTag || '').toLowerCase()),
      bytes: extracted.content,
    };
  });

  return {
    subject: fields.subject || '(no subject)',
    from: formatAddress(fields.senderName, fields.senderSmtpAddress || fields.senderEmail),
    to,
    cc,
    date: fields.clientSubmitTime || fields.messageDeliveryTime || fields.creationTime || '',
    rawHeaders: fields.headers || '',
    bodyHtml,
    bodyText,
    attachments,
    isOpaqueSmime: (fields.messageClass || '').toLowerCase() === OPAQUE_SMIME_MESSAGE_CLASS,
  };
}
