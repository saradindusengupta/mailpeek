import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import type { FieldsData } from '@kenjiuno/msgreader';
import { parseMsg, resolveBody, MAX_DECOMPRESSED_RTF_BYTES } from '../../parsers/msgParser';

const fixturesDir = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'fixtures');

function readFixture(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(fixturesDir, name)));
}

const UNCOMPRESSED = 0x414c454d;

// Builds a PidTagRtfCompressed-shaped buffer in decompressRTF's "uncompressed" mode
// (16-byte header + raw payload, sliced verbatim) -- avoids needing a real LZFu
// compressor just to control the decompressed output size in a test.
function buildUncompressedRtf(payload: Buffer): Uint8Array {
  const header = Buffer.alloc(16);
  header.writeInt32LE(payload.length + 4, 0);
  header.writeInt32LE(payload.length, 4);
  header.writeInt32LE(UNCOMPRESSED, 8);
  header.writeInt32LE(0, 12);
  return new Uint8Array(Buffer.concat([header, payload]));
}

suite('msgParser', () => {
  test('parses headers, attachments and an HTML body from sample.msg', () => {
    const email = parseMsg(readFixture('sample.msg'));

    assert.strictEqual(email.subject, 'FW: Project Falcon');
    assert.strictEqual(email.from, 'Reed, Morgan <morgan.reed@example.com>');
    assert.strictEqual(email.to, 'Nolan, Casey <casey.nolan@example.com>');
    assert.ok(email.attachments.length > 0, 'expected at least one attachment');
    assert.ok(email.bodyHtml && email.bodyHtml.length > 0, 'expected a decoded HTML body, not a plain-text-only fallback');
  });

  test('detects a nested .msg attachment and re-parses it into its own EmailData', () => {
    const email = parseMsg(readFixture('nested.msg'));

    const nested = email.attachments.filter((a) => a.isNestedMessage);
    assert.strictEqual(nested.length, 1, 'expected exactly one nested attachment');

    const inner = parseMsg(nested[0].bytes);
    assert.strictEqual(inner.subject, 'FW: Project Cedar');
  });

  test('decodes a compressed-RTF body within the size cap', () => {
    const rtf = Buffer.from('{\\rtf1\\ansi\\ansicpg1252\\fromtext Hello from a small RTF body}', 'utf8');
    const fields = {
      compressedRtf: buildUncompressedRtf(rtf),
      body: 'FALLBACK_BODY_TEXT',
    } as unknown as FieldsData;

    const { bodyHtml, bodyText } = resolveBody(fields);
    assert.notStrictEqual(bodyText, 'FALLBACK_BODY_TEXT', 'expected the RTF body to be decoded, not the fallback');
    assert.ok((bodyHtml || bodyText || '').includes('Hello from a small RTF body'));
  });

  test('falls back to plain text when decompressed RTF exceeds the size cap', () => {
    const oversized = Buffer.alloc(MAX_DECOMPRESSED_RTF_BYTES + 1024, 0x41);
    const fields = {
      compressedRtf: buildUncompressedRtf(oversized),
      body: 'FALLBACK_BODY_TEXT',
    } as unknown as FieldsData;

    const { bodyHtml, bodyText } = resolveBody(fields);
    assert.strictEqual(bodyHtml, undefined);
    assert.strictEqual(bodyText, 'FALLBACK_BODY_TEXT');
  });
});
