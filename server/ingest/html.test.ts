import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText, stripQuotedHistory } from './html';

describe('htmlToText', () => {
  it('turns block structure into line breaks', () => {
    expect(htmlToText('<p>Hi there</p><p>Second line</p>')).toBe('Hi there\nSecond line');
  });

  it('drops script and style content entirely', () => {
    const html = '<style>p{color:red}</style><p>Visible</p><script>alert(1)</script>';
    expect(htmlToText(html)).toBe('Visible');
  });

  it('collapses runs of blank lines from Outlook signature markup', () => {
    expect(htmlToText('<div>A</div><div></div><div></div><div></div><div>B</div>')).toBe('A\n\nB');
  });

  it('handles <br> and self-closing variants', () => {
    expect(htmlToText('one<br>two<br/>three')).toBe('one\ntwo\nthree');
  });

  it('returns empty string for markup with no text', () => {
    expect(htmlToText('<div><span></span></div>')).toBe('');
  });
});

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('a &amp; b &#39;c&#39; &#x2014; d &nbsp;e')).toBe("a & b 'c' — d  e");
  });

  it('leaves unknown entities alone rather than mangling them', () => {
    expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;');
  });

  it('survives an out-of-range code point', () => {
    expect(decodeEntities('&#99999999;')).toBe('');
  });
});

describe('stripQuotedHistory', () => {
  it('cuts at an Outlook "On ... wrote:" marker', () => {
    const body = 'My reply here.\n\nOn Mon, Aug 10, 2026 at 9:14 AM Care Team wrote:\nold text';
    expect(stripQuotedHistory(body)).toBe('My reply here.');
  });

  it('cuts at the Original Message divider', () => {
    const body = 'Thanks!\n\n-----Original Message-----\nFrom: someone';
    expect(stripQuotedHistory(body)).toBe('Thanks!');
  });

  it('cuts at a From:/Sent: header block', () => {
    const body = 'Please advise.\n\nFrom: Care Team\nSent: Monday, August 10\nTo: me';
    expect(stripQuotedHistory(body)).toBe('Please advise.');
  });

  it('cuts at an angle-bracket quote block', () => {
    expect(stripQuotedHistory('Agreed.\n\n> previous message\n> more')).toBe('Agreed.');
  });

  it('cuts at the earliest marker when several are present', () => {
    const body = 'Real reply.\n\n> quoted\n\n-----Original Message-----\nolder';
    expect(stripQuotedHistory(body)).toBe('Real reply.');
  });

  it('keeps the original when a message is nothing but quoted text', () => {
    // Losing the whole body would store an empty message and break the thread.
    const body = '> just a quote\n> and more';
    expect(stripQuotedHistory(body)).toBe(body);
  });

  it('leaves a message with no quoting untouched', () => {
    expect(stripQuotedHistory('Simple message.')).toBe('Simple message.');
  });
});
