/*
 * Section parsing. Pure module — MUST NOT import 'obsidian' (plan.md § F).
 *
 * Given a note's full text and the sections the user configured, it finds the
 * level-2 headings that match them (case- and whitespace-insensitive) and
 * returns, per list item, the write-back metadata from plan.md § 4.5
 * (line / raw / indent / marker / text) plus a `checked` flag and nesting depth.
 *
 * Fenced code blocks (``` and ~~~) are skipped for heading/item detection, but
 * every physical line is still counted so `line` numbers stay true to the file.
 */

/**
 * How a section's body is written and edited:
 * - `list`      — plain bullets, `- item`
 * - `checklist` — task bullets, `- [ ] item`, toggled from the panel
 * - `free`      — one free-form Markdown block, edited as a whole
 */
export type SectionType = 'list' | 'checklist' | 'free';

/** How a single line is written: with a checkbox, or without. */
export type ItemStyle = 'list' | 'checklist';

/** One configured section — which heading to look for, and how to treat its body. */
export interface SectionSpec {
	/** Stable identity; survives renaming the heading. */
	id: string;
	heading: string;
	type: SectionType;
	/**
	 * Show this section's items under the day in the calendar grid. Absent means
	 * yes, so a section list written before the setting existed still shows.
	 * Meaningless for `free`, which has no items.
	 */
	inCalendar?: boolean;
}

export interface ParsedItem {
	/** 'checklist' for `- [ ]` / `- [x]` / `- [any]`; 'list' for `-` / `*` / `+` / `1.` */
	kind: ItemStyle;
	/** 0-based physical line number in the source. */
	line: number;
	/** The original line, exactly (may include a trailing "\r"). */
	raw: string;
	/** Leading whitespace of the line. */
	indent: string;
	/** Prefix marker incl. its trailing spaces, e.g. "- ", "* ", "1. ", "- [ ] ". */
	marker: string;
	/** Everything after the marker. Not trimmed, so `indent + marker + text` round-trips. */
	text: string;
	/** Checked state; `[x]`/`[X]` → true, every other bracket char → false. */
	checked: boolean;
	/** 0 = top level, 1 = nested (any deeper nesting is capped at 1 for rendering). */
	depth: 0 | 1;
	/** Exclusive end line of this item's block, incl. nested / continuation child lines. */
	blockEnd: number;
}

export interface ParsedSection {
	/** The configured section this heading was matched for. */
	spec: SectionSpec;
	/** Line of the "## …" heading. */
	headingLine: number;
	/** Line of the "---" rule directly under the heading, or null. */
	ruleLine: number | null;
	/** First body line (after the heading, and after the rule if present). */
	bodyStart: number;
	/** One past the last body line — the next heading's line, or EOF. */
	bodyEnd: number;
	/** Always empty for a `free` section, whose body is read as raw text. */
	items: ParsedItem[];
}

export interface ParseResult {
	/** Sections found, keyed by spec id. A spec with no heading in the note is absent. */
	sections: Map<string, ParsedSection>;
	/** Physical line count of the source. */
	lineCount: number;
}

const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const RULE_RE = /^[ \t]*([-*_])\1{2,}[ \t]*$/;
const HEADING_ANYWHERE_RE = /^ {0,3}#{1,6}[ \t]/;

const TODO_RE = /^([ \t]*)([-*+]\s+\[[^\]]\]\s*)(.*)$/;
const ORDERED_RE = /^([ \t]*)(\d{1,9}[.)]\s+)(.*)$/;
const BULLET_RE = /^([ \t]*)([-*+]\s+)(.*)$/;

/** Drop a single trailing CR so a raw line can be matched as a logical line. */
export function stripCr(line: string): string {
	return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function toLogical(content: string): string[] {
	return content.split('\n').map(stripCr);
}

function leadingWs(s: string): string {
	return /^[ \t]*/.exec(s)![0];
}

/** The spec with this id, or null. */
export function specById(
	specs: readonly SectionSpec[],
	id: string,
): SectionSpec | null {
	return specs.find((spec) => spec.id === id) ?? null;
}

/** The line an item of `type` is written as. */
export function itemLineFor(type: SectionType, text: string): string {
	return type === 'checklist' ? `- [ ] ${text}` : `- ${text}`;
}

export interface ListItemParts {
	indent: string;
	marker: string;
	text: string;
	kind: ItemStyle;
	checked: boolean;
}

/**
 * Split one already-CR-stripped line into its list-item parts, or null if it is
 * not a list item. `indent + marker + text` reconstructs the line exactly.
 */
export function splitListItem(logicalLine: string): ListItemParts | null {
	let m = TODO_RE.exec(logicalLine);
	if (m) {
		const marker = m[2]!;
		const state = /\[([^\]])\]/.exec(marker)![1]!;
		return {
			indent: m[1]!,
			marker,
			text: m[3]!,
			kind: 'checklist',
			checked: state === 'x' || state === 'X',
		};
	}

	m = ORDERED_RE.exec(logicalLine) ?? BULLET_RE.exec(logicalLine);
	if (m) {
		return {
			indent: m[1]!,
			marker: m[2]!,
			text: m[3]!,
			kind: 'list',
			checked: false,
		};
	}

	return null;
}

function parseItemLine(
	logical: string,
	line: number,
	raw: string,
): ParsedItem | null {
	const parts = splitListItem(logical);
	if (!parts) return null;
	return {
		kind: parts.kind,
		line,
		raw,
		indent: parts.indent,
		marker: parts.marker,
		text: parts.text,
		checked: parts.checked,
		depth: parts.indent.length > 0 ? 1 : 0,
		blockEnd: line + 1,
	};
}

/** Walk forward from `line`, collecting more-indented (child/continuation) lines. */
function blockEndFromLogical(logical: string[], line: number): number {
	const selfIndent = leadingWs(logical[line] ?? '').length;
	let last = line;
	for (let k = line + 1; k < logical.length; k++) {
		const lk = logical[k]!;
		if (HEADING_ANYWHERE_RE.test(lk)) break; // a block never crosses a heading
		if (lk.trim() === '') continue; // tolerate blank lines within the block
		if (leadingWs(lk).length > selfIndent) {
			last = k;
			continue;
		}
		break;
	}
	return last + 1;
}

/**
 * Exclusive end line of the item block starting at `line`, including any nested
 * or continuation lines. Shared with `mutate.removeItem` (step 8) so deletion of
 * an item with children stays consistent with what the parser reported.
 */
export function blockEndOf(content: string, line: number): number {
	return blockEndFromLogical(toLogical(content), line);
}

/**
 * Raw text of a section's body — the lines between `bodyStart` and `bodyEnd`,
 * with leading / trailing blank lines dropped but everything else (indentation,
 * fenced code blocks, blank lines between paragraphs) kept verbatim. Used for
 * free-form sections.
 */
export function sectionBodyText(
	content: string,
	section: ParsedSection,
): string {
	return content
		.split('\n')
		.map(stripCr)
		.slice(section.bodyStart, section.bodyEnd)
		.join('\n')
		.replace(/^\n+|\n+$/g, '');
}

/**
 * A GFM task line — `- [ ] …` / `- [x] …`, optionally blockquoted. The three
 * groups are `…[`, the single state character and `]…`, so a rewrite can flip
 * the state without touching a byte of indent, marker or text.
 */
export const TASK_LINE_RE = /^([ \t]*(?:> ?)*[ \t]*[-*+][ \t]+\[)([^\]])(\].*)$/;

/**
 * Line numbers of the task items inside `section`'s body, in document order —
 * the order Obsidian's Markdown renderer emits their checkboxes, so the Nth
 * checkbox rendered from this body maps to the Nth entry here. Lines inside
 * fenced code blocks are skipped: they render as text, not as checkboxes.
 */
export function taskLinesIn(content: string, section: ParsedSection): number[] {
	const logical = toLogical(content);
	const out: number[] = [];

	let inFence = false;
	let fenceChar = '';
	let fenceLen = 0;

	for (let i = section.bodyStart; i < section.bodyEnd; i++) {
		const L = logical[i] ?? '';

		if (inFence) {
			const cm = FENCE_CLOSE_RE.exec(L);
			if (cm && cm[1]![0] === fenceChar && cm[1]!.length >= fenceLen) {
				inFence = false;
			}
			continue;
		}

		const om = FENCE_OPEN_RE.exec(L);
		if (om) {
			const ch = om[1]![0]!;
			// A backtick fence's info string may not contain a backtick (CommonMark).
			if (!(ch === '`' && (om[2] ?? '').includes('`'))) {
				inFence = true;
				fenceChar = ch;
				fenceLen = om[1]!.length;
				continue;
			}
		}

		if (TASK_LINE_RE.test(L)) out.push(i);
	}

	return out;
}

function makeSection(
	spec: SectionSpec,
	headingLine: number,
	lineCount: number,
): ParsedSection {
	return {
		spec,
		headingLine,
		ruleLine: null,
		bodyStart: Math.min(headingLine + 1, lineCount),
		bodyEnd: lineCount, // provisional; set to the next heading's line when found
		items: [],
	};
}

/**
 * The fallback note body used when no template is configured: every configured
 * section, empty, in order. Uses the configured heading names so it round-trips
 * through `parseNote`. Items are added from the panel — the scaffold seeds none.
 */
export function defaultScaffold(specs: readonly SectionSpec[]): string {
	const lines: string[] = [];
	for (const spec of specs) lines.push(`## ${spec.heading}`, '---', '');
	return lines.join('\n');
}

export function parseNote(
	content: string,
	specs: readonly SectionSpec[],
): ParseResult {
	const logical = toLogical(content);
	const rawLines = content.split('\n');
	const n = logical.length;

	// Normalised heading → spec. A heading two sections share belongs to the
	// first of them; the other simply never matches.
	const byHeading = new Map<string, SectionSpec>();
	for (const spec of specs) {
		const name = spec.heading.trim().toLowerCase();
		if (name !== '' && !byHeading.has(name)) byHeading.set(name, spec);
	}

	const sections = new Map<string, ParsedSection>();
	let active: ParsedSection | null = null;

	let inFence = false;
	let fenceChar = '';
	let fenceLen = 0;

	for (let i = 0; i < n; i++) {
		const L = logical[i]!;

		if (inFence) {
			const cm = FENCE_CLOSE_RE.exec(L);
			if (cm && cm[1]![0] === fenceChar && cm[1]!.length >= fenceLen) {
				inFence = false;
			}
			continue;
		}

		const om = FENCE_OPEN_RE.exec(L);
		if (om) {
			const ch = om[1]![0]!;
			const info = om[2] ?? '';
			// A backtick fence's info string may not contain a backtick (CommonMark).
			if (!(ch === '`' && info.includes('`'))) {
				inFence = true;
				fenceChar = ch;
				fenceLen = om[1]!.length;
				continue;
			}
		}

		const hm = HEADING_RE.exec(L);
		if (hm) {
			const spec =
				hm[1]!.length === 2
					? byHeading.get(hm[2]!.trim().toLowerCase())
					: undefined;

			// A free section holds arbitrary Markdown, so its own "## Title" and
			// "### Subtitle" lines are content — closing the block on them would
			// drop everything the user wrote below. Only a heading that names
			// another configured section ends it. A list section still ends at
			// any heading, where a stray one is a structural break, not text.
			if (active && (spec !== undefined || active.spec.type !== 'free')) {
				active.bodyEnd = i;
				active = null;
			}

			// A repeated heading is ignored — the first one owns the section.
			if (spec && !sections.has(spec.id)) {
				active = makeSection(spec, i, n);
				sections.set(spec.id, active);
			}
			continue;
		}

		if (!active) continue;

		// The section's own "---" rule, only on the line right after the heading.
		if (i === active.headingLine + 1 && RULE_RE.test(L)) {
			active.ruleLine = i;
			active.bodyStart = i + 1;
			continue;
		}

		// A free section is one text block — no list-item parsing. The view reads
		// its raw body between bodyStart and bodyEnd.
		if (active.spec.type === 'free') continue;

		const item = parseItemLine(L, i, rawLines[i]!);
		if (item) active.items.push(item);
	}

	if (active) active.bodyEnd = n;

	for (const section of sections.values()) {
		for (const item of section.items) {
			item.blockEnd = blockEndFromLogical(logical, item.line);
		}
	}

	return { sections, lineCount: n };
}
