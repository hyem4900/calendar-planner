/*
 * Text transforms for the four panel edits (plan.md § 4.6). Pure — string in,
 * string (or null) out. MUST NOT import 'obsidian'. All vault access lives in
 * notes.ts; this module only rewrites note text.
 *
 * Every function re-verifies that `lines[line] === raw` before touching the file
 * and returns `null` when it does not match (plan.md § 4.5) so the caller can
 * cancel the edit and re-render.
 */

import {
	blockEndOf,
	itemLineFor,
	parseNote,
	sectionBodyText,
	specById,
	splitListItem,
	stripCr,
	TASK_LINE_RE,
	taskLinesIn,
	type SectionSpec,
} from './parser';

const NEWLINES_RE = /[\r\n]+/g;

/** Collapse embedded newlines to spaces and trim the ends (plan.md § 4.1 / § 4.2). */
export function normalizeItemText(text: string): string {
	return text.replace(NEWLINES_RE, ' ').trim();
}

/**
 * The parsed `raw` comes from `vault.cachedRead`, which keeps the file's real
 * line endings; but an open note is written through its editor, whose buffer is
 * normalised to "\n". So match the line without its trailing CR and let each
 * caller take the EOL from the line it is actually rewriting.
 */
function lineMatches(lines: string[], line: number, raw: string): boolean {
	if (line < 0 || line >= lines.length) return false;
	const current = lines[line]!;
	return current === raw || stripCr(current) === stripCr(raw);
}

/** Trailing CR of the line at `line`, so a rewrite keeps the file's own EOL. */
function eolAt(lines: string[], line: number): string {
	return (lines[line] ?? '').endsWith('\r') ? '\r' : '';
}

/** "\r" when the file uses CRLF endings, else "". */
function crSuffix(content: string): string {
	return content.includes('\r\n') ? '\r' : '';
}

/**
 * Replace an item's text, preserving its indent and marker. An empty result
 * (blank or whitespace-only, newlines collapsed) deletes the item instead
 * (plan.md § 4.3).
 */
export function updateItemText(
	content: string,
	line: number,
	raw: string,
	newText: string,
): string | null {
	const lines = content.split('\n');
	if (!lineMatches(lines, line, raw)) return null;

	const parts = splitListItem(stripCr(raw));
	if (!parts) return null;

	const text = normalizeItemText(newText);
	if (text === '') return removeItem(content, line, raw);

	const eol = eolAt(lines, line);
	lines[line] = `${parts.indent}${parts.marker}${text}${eol}`;
	return lines.join('\n');
}

const TOGGLE_RE = /^(\s*[-*+]\s+\[)([^\]])(\].*)$/;

/**
 * Flip a todo's checkbox: `[x]`/`[X]` → `[ ]`, anything else → `[x]`. Only the
 * single bracket character changes; indent, marker spacing and text are byte
 * identical (plan.md § 4.4).
 */
export function toggleTodo(
	content: string,
	line: number,
	raw: string,
): string | null {
	const lines = content.split('\n');
	if (!lineMatches(lines, line, raw)) return null;

	const m = TOGGLE_RE.exec(stripCr(raw));
	if (!m) return null;

	const current = m[2]!;
	const next = current === 'x' || current === 'X' ? ' ' : 'x';
	const eol = eolAt(lines, line);
	lines[line] = `${m[1]!}${next}${m[3]!}${eol}`;
	return lines.join('\n');
}

/**
 * Delete the item at `line` together with its nested / continuation child lines
 * (plan.md § 4.3). Ordered-list siblings are left as-is — numbers are not
 * recomputed.
 */
export function removeItem(
	content: string,
	line: number,
	raw: string,
): string | null {
	const lines = content.split('\n');
	if (!lineMatches(lines, line, raw)) return null;

	const end = blockEndOf(content, line);
	lines.splice(line, end - line);
	return lines.join('\n');
}

/**
 * Insert a new item into the section with id `sectionId`. If that heading is
 * absent from the note, append `## <heading>` + `---` + the item at the end
 * (plan.md § 4.2). Empty text (blank or whitespace-only) is a no-op and returns
 * null, as is a section that is not configured or holds free-form text.
 */
export function appendItem(
	content: string,
	specs: readonly SectionSpec[],
	sectionId: string,
	text: string,
	position: 'top' | 'bottom' = 'bottom',
): string | null {
	const clean = normalizeItemText(text);
	if (clean === '') return null;

	const spec = specById(specs, sectionId);
	if (!spec || spec.type === 'free') return null;

	const cr = crSuffix(content);
	const itemLine = itemLineFor(spec.type, clean);

	const parsed = parseNote(content, specs);
	const section = parsed.sections.get(sectionId);
	const lines = content.split('\n');

	if (!section) {
		return appendSectionAtEof(lines, cr, spec.heading, itemLine);
	}

	const insertAt =
		position === 'top'
			? section.bodyStart
			: lastNonBlank(lines, section.bodyStart, section.bodyEnd) + 1;

	lines.splice(insertAt, 0, `${itemLine}${cr}`);
	return lines.join('\n');
}

/** Index of the last non-blank line in [start, end), or start - 1 if none. */
function lastNonBlank(lines: string[], start: number, end: number): number {
	for (let i = Math.min(end, lines.length) - 1; i >= start; i--) {
		if (stripCr(lines[i] ?? '').trim() !== '') return i;
	}
	return start - 1;
}

function appendSectionAtEof(
	lines: string[],
	cr: string,
	label: string,
	itemLine: string,
): string {
	const out = lines.slice();
	while (out.length > 0 && stripCr(out[out.length - 1]!).trim() === '') {
		out.pop();
	}
	if (out.length > 0) out.push('');
	out.push(`## ${label}${cr}`, `---${cr}`, `${itemLine}${cr}`, '');
	return out.join('\n');
}

/* ---- Memo: a single free-form text block ------------------------------- */

/** Split a user-entered block into file lines (normalise CR, re-add the file's EOL). */
function bodyToLines(text: string, cr: string): string[] {
	const trimmed = text.replace(/\s+$/, '');
	if (trimmed === '') return [''];
	return trimmed.replace(/\r\n?/g, '\n').split('\n').map((l) => `${l}${cr}`);
}

/**
 * Replace a free-form section's body with `newText` verbatim (bullets, code
 * fences, blank lines — all kept). Creates the section at EOF if absent.
 * Returns null when the note's current body no longer matches `expected`
 * (external edit), or when `sectionId` is not a configured free section.
 */
export function setSectionBody(
	content: string,
	specs: readonly SectionSpec[],
	sectionId: string,
	newText: string,
	expected: string,
): string | null {
	const spec = specById(specs, sectionId);
	if (!spec || spec.type !== 'free') return null;

	const parsed = parseNote(content, specs);
	const section = parsed.sections.get(sectionId);
	const cr = crSuffix(content);
	const lines = content.split('\n');
	const newLines = bodyToLines(newText, cr);
	const isEmpty = newLines.length === 1 && newLines[0] === '';
	// A trailing blank line: separates the body from the next heading, and keeps
	// the file's final newline when this is the last section.
	const body = isEmpty ? [''] : [...newLines, ''];

	if (!section) {
		if (expected !== '') return null;
		const out = lines.slice();
		while (out.length > 0 && stripCr(out[out.length - 1]!).trim() === '') {
			out.pop();
		}
		if (out.length > 0) out.push('');
		out.push(`## ${spec.heading}${cr}`, `---${cr}`, ...body);
		return out.join('\n');
	}

	if (sectionBodyText(content, section) !== expected) return null;

	const { bodyStart, bodyEnd } = section;
	lines.splice(bodyStart, bodyEnd - bodyStart, ...body);
	return lines.join('\n');
}

/**
 * Flip the `index`-th task checkbox inside a free-form section — the counterpart
 * of `toggleTodo` for a body whose items have no parsed line of their own and
 * are addressed by their position among the rendered checkboxes. `expected` is
 * the body text the panel was rendered from; a mismatch means the note moved
 * under us and the caller should re-render instead (plan.md § 4.5).
 */
export function toggleSectionTask(
	content: string,
	specs: readonly SectionSpec[],
	sectionId: string,
	index: number,
	expected: string,
): string | null {
	const parsed = parseNote(content, specs);
	const section = parsed.sections.get(sectionId);
	if (!section) return null;
	if (sectionBodyText(content, section) !== expected) return null;

	const line = taskLinesIn(content, section)[index];
	if (line === undefined) return null;

	const lines = content.split('\n');
	const m = TASK_LINE_RE.exec(stripCr(lines[line] ?? ''));
	if (!m) return null;

	const current = m[2]!;
	const next = current === 'x' || current === 'X' ? ' ' : 'x';
	lines[line] = `${m[1]!}${next}${m[3]!}${eolAt(lines, line)}`;
	return lines.join('\n');
}
