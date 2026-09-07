/*
 * Pure date helpers. This module MUST NOT import from 'obsidian' (or from any
 * module that does) so it stays unit-testable without mocking. See plan.md § F.
 *
 * Week-number rule (ISO-8601-like, but not identical):
 *   - Weeks start on the configured day (Sunday or Monday).
 *   - A week that contains 1 January belongs to the year that January starts and
 *     is week 1 (so 2026-12-31 lands in "2027 W01").
 *   - Otherwise the week-year is the calendar year of that week's Thursday, and
 *     week 1 is the week that contains 1 January of the week-year.
 *
 * Step 2 adds the full test suite; the implementation here is already written to
 * the final rule so the static render is correct.
 */

/** 0 = Sunday, 1 = Monday. Drives the weekday header order and week-number math. */
export type WeekStart = 0 | 1;

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Local midnight of the given date, as a fresh Date. */
export function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/** Weekday header labels in display order for the configured week start. */
export function weekdayLabels(weekStart: WeekStart): string[] {
	const out: string[] = [];
	for (let i = 0; i < 7; i++) {
		out.push(WEEKDAY_LABELS[(weekStart + i) % 7]!);
	}
	return out;
}

/** Korean single-character weekday name for a 0–6 day-of-week (0 = Sunday). */
export function weekdayName(dayOfWeek: number): string {
	return WEEKDAY_LABELS[((dayOfWeek % 7) + 7) % 7]!;
}

/** The week-start-aligned day on or before `d`. */
export function startOfWeek(d: Date, weekStart: WeekStart): Date {
	const base = startOfDay(d);
	const offset = (base.getDay() - weekStart + 7) % 7;
	return addDays(base, -offset);
}

/** The 1st of `d`'s month, at local midnight. */
export function monthStart(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** January 1st of `d`'s year, at local midnight. */
export function yearStart(d: Date): Date {
	return new Date(d.getFullYear(), 0, 1);
}

/** The week-start-aligned day on or before the 1st of the given month. */
export function monthGridStart(
	year: number,
	month: number,
	weekStart: WeekStart,
): Date {
	return startOfWeek(new Date(year, month, 1), weekStart);
}

export interface DateRange {
	/** Week-start-aligned first day (local midnight). */
	start: Date;
	/** Sixth day after `start` (local midnight). */
	end: Date;
}

/** Inclusive [start, end] of the week containing `anyDayInWeek`. */
export function weekRange(anyDayInWeek: Date, weekStart: WeekStart): DateRange {
	const start = startOfWeek(anyDayInWeek, weekStart);
	return { start, end: addDays(start, 6) };
}

export interface WeekInfo {
	/** 1-based week number within the week-year. */
	week: number;
	/** Year the week number is counted against; may differ from the display month's year. */
	weekYear: number;
}

/** Week number + week-year for the week containing `anyDayInWeek`. */
export function weekInfo(anyDayInWeek: Date, weekStart: WeekStart): WeekInfo {
	const weekStartDate = startOfWeek(anyDayInWeek, weekStart);
	const weekEndDate = addDays(weekStartDate, 6);

	// A week that straddles 1 January is week 1 of the year that January starts.
	for (const y of [weekStartDate.getFullYear(), weekEndDate.getFullYear()]) {
		const jan1 = new Date(y, 0, 1);
		if (jan1 >= weekStartDate && jan1 <= weekEndDate) {
			return { week: 1, weekYear: y };
		}
	}

	// Otherwise the week-year is the calendar year of this week's Thursday.
	const thursday = addDays(weekStartDate, ((1 - weekStart + 7) % 7) + 3);
	const weekYear = thursday.getFullYear();

	const week1Start = startOfWeek(new Date(weekYear, 0, 1), weekStart);
	const week =
		Math.round(
			(weekStartDate.getTime() - week1Start.getTime()) / (7 * MS_PER_DAY),
		) + 1;
	return { week, weekYear };
}

export interface CalendarDay {
	/** Local midnight for this cell. */
	date: Date;
	/** Day of month, 1–31. */
	day: number;
	/** False for leading/trailing days borrowed from the adjacent month. */
	inCurrentMonth: boolean;
	isToday: boolean;
}

export interface CalendarWeek {
	week: number;
	weekYear: number;
	/** Always length 7, in display order. */
	days: CalendarDay[];
}

/**
 * Build the month grid: whole weeks covering `month`, with leading/trailing days
 * borrowed from the neighbouring months. Row count is variable (4–6).
 */
export function buildMonthGrid(
	year: number,
	month: number,
	weekStart: WeekStart,
	today: Date,
): CalendarWeek[] {
	const lastOfMonth = new Date(year, month + 1, 0);
	const weeks: CalendarWeek[] = [];
	let cursor = monthGridStart(year, month, weekStart);

	do {
		const days: CalendarDay[] = [];
		for (let i = 0; i < 7; i++) {
			const date = addDays(cursor, i);
			days.push({
				date,
				day: date.getDate(),
				inCurrentMonth:
					date.getMonth() === month && date.getFullYear() === year,
				isToday: isSameDay(date, today),
			});
		}
		const info = weekInfo(cursor, weekStart);
		weeks.push({ week: info.week, weekYear: info.weekYear, days });
		cursor = addDays(cursor, 7);
	} while (cursor <= lastOfMonth);

	return weeks;
}

/* -------------------------------------------------------------------------- *
 * Filename formatting — a small moment.js-like subset, hand-rolled so it
 * stays pure and testable (plan.md § F, "날짜 계산은 직접 구현").
 *
 * Supported tokens (longest match wins):
 *   YYYY YY   calendar year        (formatWeekName: week-year)
 *   GGGG gggg week-year            GG gg  2-digit week-year
 *   MMMM MMM  month name (English) MM M   month number
 *   DD D      day of month
 *   dddd ddd dd  weekday name (English)
 *   WW W ww w    week number (this module's rule)
 * Literals: [in brackets] or 'in quotes' (with '' → a literal apostrophe).
 * Anything else is copied through verbatim.
 * -------------------------------------------------------------------------- */

const MONTH_NAMES_LONG = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December',
] as const;
const MONTH_NAMES_SHORT = [
	'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
	'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;
const DAY_NAMES_LONG = [
	'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_NAMES_MIN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

// Longest tokens first so "YYYY" wins over "YY", "MMM" over "MM", etc.
const FORMAT_TOKENS = [
	'YYYY', 'GGGG', 'gggg', 'MMMM', 'dddd',
	'MMM', 'ddd',
	'YY', 'GG', 'gg', 'MM', 'DD', 'WW', 'ww', 'dd',
	'M', 'D', 'W', 'w',
] as const;

type FormatToken = (typeof FORMAT_TOKENS)[number];

function tokenMap(
	date: Date,
	weekStart: WeekStart,
	yearFromWeek: boolean,
): Record<FormatToken, string> {
	const wi = weekInfo(date, weekStart);
	const year = yearFromWeek ? wi.weekYear : date.getFullYear();
	const month = date.getMonth();
	const dom = date.getDate();
	const dow = date.getDay();
	const pad2 = (n: number): string => String(n).padStart(2, '0');
	return {
		YYYY: String(year).padStart(4, '0'),
		YY: pad2(((year % 100) + 100) % 100),
		GGGG: String(wi.weekYear).padStart(4, '0'),
		gggg: String(wi.weekYear).padStart(4, '0'),
		GG: pad2(((wi.weekYear % 100) + 100) % 100),
		gg: pad2(((wi.weekYear % 100) + 100) % 100),
		MMMM: MONTH_NAMES_LONG[month]!,
		MMM: MONTH_NAMES_SHORT[month]!,
		MM: pad2(month + 1),
		M: String(month + 1),
		DD: pad2(dom),
		D: String(dom),
		dddd: DAY_NAMES_LONG[dow]!,
		ddd: DAY_NAMES_SHORT[dow]!,
		dd: DAY_NAMES_MIN[dow]!,
		WW: pad2(wi.week),
		ww: pad2(wi.week),
		W: String(wi.week),
		w: String(wi.week),
	};
}

function applyPattern(
	pattern: string,
	tokens: Record<FormatToken, string>,
): string {
	let out = '';
	let i = 0;
	while (i < pattern.length) {
		const ch = pattern[i]!;

		if (ch === '[') {
			const end = pattern.indexOf(']', i + 1);
			if (end === -1) {
				out += pattern.slice(i + 1);
				break;
			}
			out += pattern.slice(i + 1, end);
			i = end + 1;
			continue;
		}

		if (ch === "'") {
			let j = i + 1;
			let literal = '';
			while (j < pattern.length) {
				if (pattern[j] === "'") {
					if (pattern[j + 1] === "'") {
						literal += "'";
						j += 2;
						continue;
					}
					break;
				}
				literal += pattern[j]!;
				j += 1;
			}
			out += literal;
			i = j + 1;
			continue;
		}

		let matched = false;
		for (const tok of FORMAT_TOKENS) {
			if (pattern.startsWith(tok, i)) {
				out += tokens[tok];
				i += tok.length;
				matched = true;
				break;
			}
		}
		if (!matched) {
			out += ch;
			i += 1;
		}
	}
	return out;
}

/** Format a day. `YYYY`/`YY` are the calendar year. */
export function formatDate(
	date: Date,
	pattern: string,
	weekStart: WeekStart = 0,
): string {
	return applyPattern(pattern, tokenMap(date, weekStart, false));
}

/**
 * Format the weekly-note name for the week containing `dateInWeek`. Here
 * `YYYY`/`YY` resolve to the week-year (so the week of 2026-12-31 → "2027 W01"),
 * and month/day tokens come from the week's start day.
 */
export function formatWeekName(
	dateInWeek: Date,
	pattern: string,
	weekStart: WeekStart = 0,
): string {
	const anchor = startOfWeek(dateInWeek, weekStart);
	return applyPattern(pattern, tokenMap(anchor, weekStart, true));
}

/**
 * Expand `{YYYY}` / `{YY}` / `{MMMM}` / `{MM}` / `{M}` in a note folder path.
 * Only these braced tokens are touched, so a literal folder name like
 * "Marketing" is safe. `month` is 1-based; `monthName` is the localized full
 * month name for `{MMMM}` (e.g. "September" / "9월").
 */
export function expandFolderTokens(
	folder: string,
	year: number,
	month: number,
	monthName: string,
): string {
	return folder
		.replace(/\{YYYY\}/g, String(year))
		.replace(/\{YY\}/g, String(((year % 100) + 100) % 100).padStart(2, '0'))
		.replace(/\{MMMM\}/g, monthName)
		.replace(/\{MM\}/g, String(month).padStart(2, '0'))
		.replace(/\{M\}/g, String(month));
}
