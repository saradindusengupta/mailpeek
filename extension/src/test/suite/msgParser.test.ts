import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseMsg } from '../../parsers/msgParser';

const fixturesDir = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'fixtures');

function readFixture(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(fixturesDir, name)));
}

suite('msgParser', () => {
  test('parses headers, attachments and an HTML body from sample.msg', () => {
    const email = parseMsg(readFixture('sample.msg'));

    assert.strictEqual(email.subject, 'FW: Climax');
    assert.strictEqual(email.from, 'Driver, Blake <blake.driver@intellitrans.com>');
    assert.strictEqual(email.to, 'Watts, Allen <allen.watts@intellitrans.com>');
    assert.ok(email.attachments.length > 0, 'expected at least one attachment');
    assert.ok(email.bodyHtml && email.bodyHtml.length > 0, 'expected a decoded HTML body, not a plain-text-only fallback');
  });

  test('detects a nested .msg attachment and re-parses it into its own EmailData', () => {
    const email = parseMsg(readFixture('nested.msg'));

    const nested = email.attachments.filter((a) => a.isNestedMessage);
    assert.strictEqual(nested.length, 1, 'expected exactly one nested attachment');

    const inner = parseMsg(nested[0].bytes);
    assert.strictEqual(inner.subject, 'FW: Morenci');
  });
});
