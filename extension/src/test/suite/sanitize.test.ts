import * as assert from 'assert';
import { sanitizeAttachmentFilename } from '../../sanitize';

suite('sanitizeAttachmentFilename', () => {
  test('replaces forward-slash traversal with underscores', () => {
    assert.strictEqual(sanitizeAttachmentFilename('../../etc/evil'), '.._.._etc_evil');
  });

  test('replaces backslash traversal with underscores', () => {
    assert.strictEqual(sanitizeAttachmentFilename('..\\..\\evil.exe'), '.._.._evil.exe');
  });

  test('leaves a plain filename untouched', () => {
    assert.strictEqual(sanitizeAttachmentFilename('notes.txt'), 'notes.txt');
  });

  test('falls back to a default name for an empty filename', () => {
    assert.strictEqual(sanitizeAttachmentFilename(''), 'attachment');
  });
});
