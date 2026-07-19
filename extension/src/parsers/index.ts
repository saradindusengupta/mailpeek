import { parseMsg } from './msgParser';
import { EmailData } from '../types/emailData';

export type ParseResult =
  | { status: 'ok'; email: EmailData }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

export function parseEmailFile(fileName: string, bytes: Uint8Array): ParseResult {
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.msg')) {
    try {
      return { status: 'ok', email: parseMsg(bytes) };
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }

  if (lower.endsWith('.eml')) {
    // No .eml parser wired up yet -- see docs/plans/initial_plan.md, Milestone 2.
    return { status: 'unsupported' };
  }

  return { status: 'error', message: `Unrecognized file type: ${fileName}` };
}
