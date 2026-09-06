import * as assert from 'assert';
import { findQuoteMarkerIndex } from '../../quoteHeuristics';

suite('findQuoteMarkerIndex', () => {
  test('finds a -----Original Message----- marker', () => {
    const text = 'Hi team,\n\nSee below.\n\n-----Original Message-----\nFrom: Someone\nSubject: Original';
    const index = findQuoteMarkerIndex(text);
    assert.strictEqual(index, text.indexOf('-----Original Message-----'));
  });

  test('finds an On ... wrote: marker', () => {
    const text = 'Sounds good.\n\nOn Mon, Jun 15, 2026 at 2:30 PM Morgan Reed <morgan.reed@example.com> wrote:\n> quoted text';
    const index = findQuoteMarkerIndex(text);
    assert.strictEqual(index, text.indexOf('On Mon,'));
  });

  test('returns undefined when neither marker is present', () => {
    const text = 'Just a plain message with no quoting at all.';
    assert.strictEqual(findQuoteMarkerIndex(text), undefined);
  });

  test('does not match a marker phrase appearing mid-line, not at line start', () => {
    const text = 'Someone said On Monday it wrote: something unrelated.\nMore text follows.';
    assert.strictEqual(findQuoteMarkerIndex(text), undefined);
  });

  test('returns the earliest marker when both are present', () => {
    const text = 'Body.\n\nOn Tue wrote:\nquoted 1\n\n-----Original Message-----\nquoted 2';
    const index = findQuoteMarkerIndex(text);
    assert.strictEqual(index, text.indexOf('On Tue wrote:'));
  });
});
