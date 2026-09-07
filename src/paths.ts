/*
 * The settings that decide where a note lives — folder templates and filename
 * formats — and the rules for changing them without losing the notes already on
 * disk. Pure: it MUST NOT import 'obsidian', so the rules here are tested
 * directly.
 *
 * The templates hold tokens ({YYYY}, {MMMM}, …) that `date.expandFolderTokens`
 * fills in; this module only decides what the templates themselves look like.
 */

import type { Lang } from './i18n';

/**
 * The one path segment that reads differently per language: "09-September" in
 * English, just "9월" in Korean.
 */
function monthSegment(lang: Lang): string {
	return lang === 'en' ? '{MM}-{MMMM}' : '{MMMM}';
}

/**
 * Default note folders, applied on a fresh install and shown as the placeholder
 * in the settings tab. Grouped by note kind rather than by year, and language
 * independent — nothing here spells out a month name.
 */
export function defaultFolders(): {
	yearly: string;
	monthly: string;
	weekly: string;
	daily: string;
} {
	return {
		yearly: 'Calendar Planner/Yearly',
		monthly: 'Calendar Planner/Monthly/{YYYY}',
		weekly: 'Calendar Planner/Weekly/{YYYY}',
		daily: 'Calendar Planner/Daily/{YYYY}',
	};
}

/**
 * Re-point a folder template at another language. The defaults spell out no
 * month name, so this only matters for a path the user gave one to: a segment
 * of "{MM}-{MMMM}" reads as "09-September" in English but wants to be plain
 * "{MMMM}" — "9월" — in Korean. Everything else is left exactly as written.
 */
export function retargetFolder(folder: string, from: Lang, to: Lang): string {
	if (from === to) return folder;

	const before = monthSegment(from);
	const after = monthSegment(to);
	return folder
		.split('/')
		.map((part) => (part === before ? after : part))
		.join('/');
}

/** How many superseded filename formats to keep. */
const FORMAT_HISTORY_MAX = 5;

/**
 * Record `previous` as a filename format that notes on disk may still be named
 * with, dropping `current` from the list because notes named that way are found
 * by the current format anyway. Newest first, deduplicated, bounded.
 *
 * Unlike a folder path, a filename format leaves no trace to work back from: a
 * note called "2026-09-22" cannot be recognised once the format says
 * "2026.09.22". Remembering the formats this vault has used is what keeps those
 * notes findable — and renameable to the new format.
 */
export function rememberFormat(
	history: readonly string[],
	previous: string,
	current: string,
): string[] {
	const older = previous.trim();
	const now = current.trim();
	const kept = history.filter((f) => f !== older && f !== now);
	if (older === '' || older === now) return kept.slice(0, FORMAT_HISTORY_MAX);
	return [older, ...kept].slice(0, FORMAT_HISTORY_MAX);
}
