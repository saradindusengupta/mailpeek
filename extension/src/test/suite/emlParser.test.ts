import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseEml } from '../../parsers/emlParser';

const fixturesDir = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'fixtures');

function readFixture(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(fixturesDir, name)));
}

suite('emlParser', () => {
  test('parses headers, attachments and an HTML+plain-text body from sample.eml', async () => {
    const email = await parseEml(readFixture('sample.eml'));

    assert.strictEqual(email.subject, 'FW: Q3 Roadmap Sync');
    assert.strictEqual(email.from, 'Reed, Morgan <morgan.reed@example.com>');
    assert.strictEqual(email.to, 'Nolan, Casey <casey.nolan@example.com>, Ortiz, Dana <dana.ortiz@example.com>');
    assert.ok(email.bodyHtml && email.bodyHtml.length > 0, 'expected an HTML body');
    assert.ok(email.bodyText && email.bodyText.length > 0, 'expected a plain-text body alongside the HTML body');
    assert.strictEqual(email.attachments.length, 1, 'expected exactly one attachment');
    assert.strictEqual(email.attachments[0].name, 'notes.txt');
    assert.strictEqual(email.attachments[0].isNestedMessage, false);
  });

  test('leaves bodyHtml undefined for a plain-text-only message', async () => {
    const email = await parseEml(readFixture('nested.eml'));
    assert.strictEqual(email.bodyHtml, undefined);
    assert.ok(email.bodyText && email.bodyText.length > 0);
  });

  test('detects a nested .eml (message/rfc822) attachment and re-parses it into its own EmailData', async () => {
    const email = await parseEml(readFixture('nested.eml'));

    const nested = email.attachments.filter((a) => a.isNestedMessage);
    assert.strictEqual(nested.length, 1, 'expected exactly one nested-message attachment');

    const inner = await parseEml(nested[0].bytes);
    assert.strictEqual(inner.subject, 'Dock Schedule - Week 24');
    assert.strictEqual(inner.from, 'Patel, Riya <riya.patel@example.com>');
  });

  test('does not misclassify a regular attachment as a nested message', async () => {
    const email = await parseEml(readFixture('sample.eml'));
    assert.ok(email.attachments.every((a) => !a.isNestedMessage));
  });

  test('degrades gracefully on non-RFC-822 bytes instead of throwing', async () => {
    const garbage = new Uint8Array(200).map((_, i) => i % 256);
    const email = await parseEml(garbage);

    assert.strictEqual(email.subject, '(no subject)');
    assert.strictEqual(email.attachments.length, 0);
  });

  test('degrades gracefully on empty bytes instead of throwing', async () => {
    const email = await parseEml(new Uint8Array([]));
    assert.strictEqual(email.subject, '(no subject)');
    assert.strictEqual(email.attachments.length, 0);
  });

  test('surfaces a TNEF (winmail.dat) part as a plain attachment, body unaffected', async () => {
    const raw = [
      'From: Alice <alice@example.com>',
      'To: Bob <bob@example.com>',
      'Subject: TNEF-wrapped message',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="B"',
      '',
      '--B',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'See attached rich content.',
      '--B',
      'Content-Type: application/ms-tnef; name="winmail.dat"',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="winmail.dat"',
      '',
      'ZmFrZXRuZWZieXRlcw==',
      '--B--',
      '',
    ].join('\r\n');

    const email = await parseEml(new TextEncoder().encode(raw));
    assert.strictEqual(email.bodyText, 'See attached rich content.\n');
    assert.strictEqual(email.attachments.length, 1);
    assert.strictEqual(email.attachments[0].name, 'winmail.dat');
  });

  test('S/MIME signed message: real body renders, signature part is flagged', async () => {
    const raw = [
      'From: Alice <alice@example.com>',
      'To: Bob <bob@example.com>',
      'Subject: Signed message',
      'MIME-Version: 1.0',
      'Content-Type: multipart/signed; protocol="application/pkcs7-signature"; micalg=sha-256; boundary="SIG"',
      '',
      '--SIG',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'This is the real signed body content.',
      '--SIG',
      'Content-Type: application/pkcs7-signature; name="smime.p7s"',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="smime.p7s"',
      '',
      'ZmFrZXNpZ25hdHVyZWJ5dGVz',
      '--SIG--',
      '',
    ].join('\r\n');

    const email = await parseEml(new TextEncoder().encode(raw));
    assert.strictEqual(email.bodyText, 'This is the real signed body content.\n');
    assert.strictEqual(email.isOpaqueSmime, false);
    assert.strictEqual(email.attachments.length, 1);
    assert.strictEqual(email.attachments[0].isSignature, true);
  });

  test('opaque S/MIME message: isOpaqueSmime is set, no readable body', async () => {
    const raw = [
      'From: Alice <alice@example.com>',
      'To: Bob <bob@example.com>',
      'Subject: Encrypted message',
      'MIME-Version: 1.0',
      'Content-Type: application/pkcs7-mime; smime-type=enveloped-data; name="smime.p7m"',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="smime.p7m"',
      '',
      'ZmFrZWNpcGhlcnRleHRieXRlcw==',
      '',
    ].join('\r\n');

    const email = await parseEml(new TextEncoder().encode(raw));
    assert.strictEqual(email.isOpaqueSmime, true);
    assert.strictEqual(email.bodyHtml, undefined);
    assert.strictEqual(email.bodyText, undefined);
  });
});
