const BLOCK_TAGS = /<\/(p|div|tr|li|h[1-6]|blockquote|table)\s*>/gi;
const LINE_BREAKS = /<(br|hr)\s*\/?>/gi;
const DROPPED_BLOCKS = /<(script|style|head|title)[^>]*>[\s\S]*?<\/\1\s*>/gi;
const TAGS = /<[^>]+>/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function safeCodePoint(code: number): string {
  // Reject anything outside the Unicode range rather than throwing on a
  // malformed entity in a customer's HTML signature.
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** HTML email body to readable plain text. No DOM, no dependency. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(DROPPED_BLOCKS, ' ')
    .replace(LINE_BREAKS, '\n')
    .replace(BLOCK_TAGS, '\n')
    .replace(TAGS, '');

  return normalizeWhitespace(decodeEntities(withBreaks));
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Markers that begin quoted history in a reply. Ordered by how unambiguous they
 * are; we cut at whichever appears earliest.
 */
const QUOTE_MARKERS: RegExp[] = [
  /^-{2,}\s*original message\s*-{2,}/im,
  /^_{10,}$/m,
  /^-{10,}$/m,
  /^on .{5,120}\bwrote:\s*$/im,
  /^from:.*$\n^(sent|date):/im,
  /^\s*>{1,}\s?.+$/m,
];

/**
 * Trims quoted history so a 14-message thread doesn't store the same text 14
 * times. Graph's `uniqueBody` does this server-side and is preferred; this is
 * the fallback for delta results, where uniqueBody isn't reliably returned.
 *
 * Guarantees a non-empty result: if a message is nothing but quoted text,
 * the original is returned rather than an empty body.
 */
export function stripQuotedHistory(text: string): string {
  let cutAt = text.length;

  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(text);
    if (match?.index !== undefined && match.index < cutAt) cutAt = match.index;
  }

  const head = text.slice(0, cutAt).trim();
  return head.length > 0 ? head : text.trim();
}
