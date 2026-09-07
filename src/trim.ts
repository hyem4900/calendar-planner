/*
 * Fitting one line of text into a fixed width.
 *
 * Pure module — MUST NOT import 'obsidian' (plan.md § F). The measurer is
 * injected: the view hands in a canvas context set to the band's real font, and
 * a test hands in something predictable.
 */

/** What a trimmed line ends with — two dots, not the "…" glyph. */
export const TRIM_MARK = '..';

/** Width of a rendered string, in whatever unit the caller measures in. */
export type MeasureText = (text: string) => number;

/**
 * `text` cut down to what fits in `width`, ending in `TRIM_MARK`. Returned
 * unchanged when it already fits.
 *
 * The cut is found by binary search, which costs about a dozen measurements —
 * cheap on a canvas, ruinous if each one were a document layout. Code points,
 * not code units, so an emoji or other surrogate pair is never halved. Trailing
 * spaces are dropped so the mark sits against the last word.
 */
export function trimToWidth(
	measure: MeasureText,
	text: string,
	width: number,
): string {
	if (width <= 0) return text;
	if (measure(text) <= width) return text;

	const room = width - measure(TRIM_MARK);
	if (room <= 0) return TRIM_MARK;

	const chars = Array.from(text);
	// Invariant: everything up to `low` fits, and nothing past `high` does.
	let low = 0;
	let high = chars.length;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if (measure(chars.slice(0, mid).join('')) <= room) low = mid;
		else high = mid - 1;
	}
	return `${chars.slice(0, low).join('').trimEnd()}${TRIM_MARK}`;
}
