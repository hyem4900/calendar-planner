import { describe, expect, it } from 'vitest';
import { TRIM_MARK, trimToWidth } from '../trim';

/** One unit per code point — predictable, so widths read as character counts. */
const byChar = (text: string): number => Array.from(text).length;

/**
 * Wide characters cost two, as CJK does against a Latin font. Compared by code
 * point rather than matched by a character-class range, which would have to
 * start at the ideographic space and read as stray whitespace in the source.
 */
const CJK_START = 0x2e80;
const byWidth = (text: string): number =>
	Array.from(text).reduce(
		(sum, ch) => sum + ((ch.codePointAt(0) ?? 0) >= CJK_START ? 2 : 1),
		0,
	);

const trim = (text: string, width: number): string =>
	trimToWidth(byChar, text, width);

describe('trimToWidth', () => {
	it('leaves text that already fits', () => {
		expect(trim('abc', 3)).toBe('abc');
		expect(trim('abc', 10)).toBe('abc');
		expect(trim('', 5)).toBe('');
	});

	it('cuts to the widest prefix that still leaves room for the mark', () => {
		// width 6, mark costs 2 → 4 characters of text
		expect(trim('abcdefgh', 6)).toBe(`abcd${TRIM_MARK}`);
		expect(trim('abcdefgh', 6)).toHaveLength(6);
	});

	it('never returns something wider than it was given', () => {
		for (let width = 1; width <= 12; width++) {
			expect(byChar(trim('abcdefghij', width))).toBeLessThanOrEqual(
				Math.max(width, byChar(TRIM_MARK)),
			);
		}
	});

	it('uses exactly two dots, not an ellipsis glyph', () => {
		const out = trim('abcdefgh', 6);
		expect(out.endsWith('..')).toBe(true);
		expect(out).not.toContain('…');
		expect(out.endsWith('...')).toBe(false);
	});

	it('drops the space the cut landed on', () => {
		// width 5, mark costs 2 → 3 characters, which is "ab " — the trailing
		// space goes, so the mark sits against the word.
		expect(trim('ab cdefgh', 5)).toBe(`ab${TRIM_MARK}`);
		// One more character of room and there is a real character to keep.
		expect(trim('ab cdefgh', 6)).toBe(`ab c${TRIM_MARK}`);
	});

	it('gives just the mark when there is no room for any text', () => {
		expect(trim('abcdefgh', 2)).toBe(TRIM_MARK);
		expect(trim('abcdefgh', 3)).toBe(`a${TRIM_MARK}`);
	});

	it('returns the text untouched for a nonsense width', () => {
		// A band that has not been laid out yet measures 0 — trimming to that
		// would throw the text away, so it is left for the next measure.
		expect(trim('abcdefgh', 0)).toBe('abcdefgh');
		expect(trim('abcdefgh', -5)).toBe('abcdefgh');
	});

	it('never splits a surrogate pair', () => {
		const text = '👍👍👍👍';
		// Four code points into a width of 3: the mark costs 2, so one emoji.
		const out = trimToWidth(byChar, text, 3);
		expect(out).toBe(`👍${TRIM_MARK}`);
		// No lone surrogates left behind.
		expect(Array.from(out).join('')).toBe(out);
	});

	it('handles a measure where characters differ in width', () => {
		// "회의준비" is 8 wide, mark is 2 → 6 of room → three CJK characters.
		expect(trimToWidth(byWidth, '회의준비록', 8)).toBe(`회의준${TRIM_MARK}`);
	});
});
