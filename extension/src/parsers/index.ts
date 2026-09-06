import { parseMsg } from './msgParser';
import { parseEml } from './emlParser';
import { EmailData } from '../types/emailData';

export type ParseResult =
  | { status: 'ok'; email: EmailData }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

export async function parseEmailFile(fileName: string, bytes: Uint8Array): Promise<ParseResult> {
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.msg')) {
    try {
      return { status: 'ok', email: parseMsg(bytes) };
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }

  if (lower.endsWith('.eml')) {
    try {
      return { status: 'ok', email: await parseEml(bytes) };
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }

  return { status: 'error', message: `Unrecognized file type: ${fileName}` };
}
