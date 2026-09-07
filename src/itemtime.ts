/*
 * Reading the date / time a list item ends with.
 *
 * Pure module — MUST NOT import 'obsidian' (plan.md § F).
 *
 * There is no plugin-specific syntax here on purpose. An item that says
 *
 *     - [ ] 팀 주간 회의 14:00
 *
 * is what someone would have written anyway, reads the same in Obsidian's own
 * preview, and still reads the same if this plugin is uninstalled. The split is
 * a *display* affordance: the panel shows the trailing token quietly on the
 * right and the calendar bands leave it out, but the note keeps one line of
 * text and editing an item still edits that line exactly as it is written.
 *
 * Only the *end* of the line is considered. That is where the eye expects it
 * given the right-aligned rendering, it makes hiding the token a suffix chop
 * with nothing ambiguous about what is left, and it keeps "- 3.5 버전 릴리스"
 * from being read as a time.
 */

/** `PM`, `am`, `오전`, `오후` — before the clock or after it. */
const MERIDIEM = '(?:[AaPp][Mm]|오전|오후)';

/**
 * A clock time. The colon is required: `14.00` and `14 30` are far more often
 * a decimal or two separate numbers than they are a time.
 */
const TIME = `(?:${MERIDIEM}\\s*)?\\d{1,2}:[0-5]\\d(?:\\s*${MERIDIEM})?`;

/**
 * A full calendar date, `2026-09-15` and its `.` / `/` spellings. Deliberately
 * no bare `9/15`: "- 진행률 9/10" is a real thing people write, and a plugin
 * that silently ate the `9/10` would be worse than one that misses a date.
 */
const DATE = '\\d{4}[-./]\\d{1,2}[-./]\\d{1,2}';

/** One moment: a date, a time, or a date followed by a time. */
const POINT = `(?:${DATE}(?:\\s+${TIME})?|${TIME})`;

/** Two of those with a dash or tilde between them — `14:00~15:30`. */
const RANGE = `${POINT}(?:\\s*[~\\-–—]\\s*${POINT})?`;

/**
 * Emphasis around the token, as in `**14:00**`. Matched so that bolding a time
 * does not stop it being one; the marks are dropped, since the meta text is
 * styled by the panel and not by the note.
 */
const WRAP = '[*_`]{0,2}';

/**
 * The token, at the very end, either preceded by whitespace or the whole text.
 * Anchored with `$` so there is exactly one candidate per line — no scanning,
 * no choosing between matches.
 */
const TRAILING = new RegExp(`(?:^|\\s)${WRAP}(${RANGE})${WRAP}\\s*$`);

/** An item's text split into what it says and when it happens. */
export interface ItemTime {
	/** The text without the trailing token. Trimmed of the space that joined them. */
	body: string;
	/** The date / time as written, or `''` when the line ends in neither. */
	time: string;
}

/**
 * Split a trailing date / time off one item's text.
 *
 * A line that is *only* a time is left alone: the token is the item's whole
 * content, and moving it to the right would leave an empty row behind.
 */
export function splitItemTime(text: string): ItemTime {
	const match = TRAILING.exec(text);
	if (!match) return { body: text, time: '' };

	const body = text.slice(0, match.index).trimEnd();
	if (body === '') return { body: text, time: '' };

	return { body, time: match[1]!.replace(/\s+/g, ' ') };
}
