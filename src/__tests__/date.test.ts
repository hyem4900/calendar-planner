import { describe, expect, it } from 'vitest';
import {
	addDays,
	buildMonthGrid,
	expandFolderTokens,
	formatDate,
	formatWeekName,
	isSameDay,
	monthGridStart,
	monthStart,
	startOfDay,
	startOfWeek,
	weekInfo,
	yearStart,
	weekRange,
	weekdayLabels,
} from '../date';

/** 1-based month for readability: `d(2026, 8, 24)` === 24 Aug 2026. */
const d = (y: number, m: number, day: number): Date => new Date(y, m - 1, day);

const iso = (x: Date): string =>
	`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(
		x.getDate(),
	).padStart(2, '0')}`;

/** "2026 W35" style, so both the number and the week-year are asserted at once. */
const wk = (x: Date, ws: 0 | 1): string => {
	const r = weekInfo(x, ws);
	return `${r.weekYear} W${String(r.week).padStart(2, '0')}`;
};

describe('weekdayLabels', () => {
	it('Sunday start', () => {
		expect(weekdayLabels(0)).toEqual([
			'일',
			'월',
			'화',
			'수',
			'목',
			'금',
			'토',
		]);
	});

	it('Monday start rotates the row', () => {
		expect(weekdayLabels(1)).toEqual([
			'월',
			'화',
			'수',
			'목',
			'금',
			'토',
			'일',
		]);
	});
});

describe('startOfDay / addDays / isSameDay', () => {
	it('startOfDay strips the time and returns a fresh date', () => {
		const src = new Date(2026, 7, 24, 15, 30, 45, 123);
		const r = startOfDay(src);
		expect(iso(r)).toBe('2026-08-24');
		expect(r.getHours()).toBe(0);
		expect(r).not.toBe(src);
		expect(src.getHours()).toBe(15); // input untouched
	});

	it('addDays rolls over month and year boundaries', () => {
		expect(iso(addDays(d(2026, 8, 31), 1))).toBe('2026-09-01');
		expect(iso(addDays(d(2026, 1, 1), -1))).toBe('2025-12-31');
		expect(iso(addDays(d(2026, 3, 1), -1))).toBe('2026-02-28'); // 2026 not a leap year
		expect(iso(addDays(d(2024, 3, 1), -1))).toBe('2024-02-29'); // 2024 is
	});

	it('isSameDay ignores the time component', () => {
		expect(
			isSameDay(new Date(2026, 7, 24, 1), new Date(2026, 7, 24, 23)),
		).toBe(true);
		expect(isSameDay(d(2026, 7, 24), d(2026, 7, 25))).toBe(false);
		expect(isSameDay(d(2026, 7, 24), d(2025, 7, 24))).toBe(false);
	});
});

describe('startOfWeek', () => {
	it('Sunday start snaps back to Sunday', () => {
		expect(iso(startOfWeek(d(2026, 8, 24), 0))).toBe('2026-08-23'); // Mon → Sun
		expect(iso(startOfWeek(d(2026, 8, 23), 0))).toBe('2026-08-23'); // idempotent
	});

	it('Monday start snaps back to Monday', () => {
		expect(iso(startOfWeek(d(2026, 8, 24), 1))).toBe('2026-08-24'); // Mon → Mon
		expect(iso(startOfWeek(d(2026, 8, 23), 1))).toBe('2026-08-17'); // Sun → prev Mon
	});

	it('does not mutate the input', () => {
		const src = d(2026, 8, 24);
		startOfWeek(src, 0);
		expect(iso(src)).toBe('2026-08-24');
	});
});

describe('weekInfo — mockup reference (August 2026, Sunday start)', () => {
	// calendar_planner_mockup.html shows the W column as 31..36 for this month.
	it('matches the mockup W column', () => {
		expect(wk(d(2026, 7, 26), 0)).toBe('2026 W31'); // first grid cell
		expect(wk(d(2026, 8, 2), 0)).toBe('2026 W32');
		expect(wk(d(2026, 8, 9), 0)).toBe('2026 W33');
		expect(wk(d(2026, 8, 16), 0)).toBe('2026 W34');
		expect(wk(d(2026, 8, 24), 0)).toBe('2026 W35'); // the mockup's selected day
		expect(wk(d(2026, 9, 5), 0)).toBe('2026 W36'); // last grid cell
	});
});

describe('weekInfo — week start changes the number for the same date', () => {
	it('2026-08-23 is W35 (Sun start) but W34 (Mon start)', () => {
		expect(wk(d(2026, 8, 23), 0)).toBe('2026 W35');
		expect(wk(d(2026, 8, 23), 1)).toBe('2026 W34');
	});

	it('a mid-week day can land in the same number under both starts', () => {
		expect(wk(d(2026, 8, 26), 0)).toBe('2026 W35');
		expect(wk(d(2026, 8, 26), 1)).toBe('2026 W35');
	});
});

describe('weekInfo — year boundary (week-year ≠ calendar year)', () => {
	it('2026-12-31 belongs to 2027 W01 for both week starts', () => {
		expect(wk(d(2026, 12, 31), 0)).toBe('2027 W01');
		expect(wk(d(2026, 12, 31), 1)).toBe('2027 W01');
	});

	it('the whole 2026-12-28 .. 2027-01-03 span is 2027 W01 (Mon start)', () => {
		for (let day = 28; day <= 31; day++) {
			expect(wk(d(2026, 12, day), 1)).toBe('2027 W01');
		}
		for (let day = 1; day <= 3; day++) {
			expect(wk(d(2027, 1, day), 1)).toBe('2027 W01');
		}
	});

	it('2026-01-01 is 2026 W01', () => {
		expect(wk(d(2026, 1, 1), 0)).toBe('2026 W01');
		expect(wk(d(2026, 1, 1), 1)).toBe('2026 W01');
	});

	it('the week before the new-year week keeps the old year (Sun start)', () => {
		expect(wk(d(2026, 12, 20), 0)).toBe('2026 W52'); // Dec 20–26
		expect(wk(d(2026, 12, 26), 0)).toBe('2026 W52');
	});
});

describe('weekInfo — years that carry a W53', () => {
	it('Sunday start: 2022 has a W53 (2023-01-01 is a Sunday)', () => {
		expect(wk(d(2022, 12, 24), 0)).toBe('2022 W52');
		expect(wk(d(2022, 12, 25), 0)).toBe('2022 W53');
		expect(wk(d(2022, 12, 31), 0)).toBe('2022 W53');
		expect(wk(d(2023, 1, 1), 0)).toBe('2023 W01');
	});

	it('Monday start: 2023 has a W53 (2024-01-01 is a Monday)', () => {
		expect(wk(d(2023, 12, 24), 1)).toBe('2023 W52');
		expect(wk(d(2023, 12, 25), 1)).toBe('2023 W53');
		expect(wk(d(2023, 12, 31), 1)).toBe('2023 W53');
		expect(wk(d(2024, 1, 1), 1)).toBe('2024 W01');
	});
});

describe('weekInfo — deliberate divergence from strict ISO 8601', () => {
	// plan.md rule: "the week that contains 1 January is week 1 of that year".
	// Strict ISO 8601 would instead keep these dates in the previous year (W53).
	it('2020-12-31 (Thu) → 2021 W01 here, not ISO 2020-W53 (Mon start)', () => {
		expect(wk(d(2020, 12, 31), 1)).toBe('2021 W01');
	});

	it('2021-01-01 (Fri) → 2021 W01 here, not ISO 2020-W53 (Mon start)', () => {
		expect(wk(d(2021, 1, 1), 1)).toBe('2021 W01');
	});
});

describe('weekRange', () => {
	it('Sunday start', () => {
		const r = weekRange(d(2026, 8, 24), 0);
		expect(iso(r.start)).toBe('2026-08-23');
		expect(iso(r.end)).toBe('2026-08-29');
	});

	it('Monday start', () => {
		const r = weekRange(d(2026, 8, 24), 1);
		expect(iso(r.start)).toBe('2026-08-24');
		expect(iso(r.end)).toBe('2026-08-30');
	});

	it('spans a month boundary intact', () => {
		const r = weekRange(d(2026, 8, 31), 0); // Mon 31 Aug
		expect(iso(r.start)).toBe('2026-08-30');
		expect(iso(r.end)).toBe('2026-09-05');
	});
});

describe('monthGridStart', () => {
	it('August 2026', () => {
		expect(iso(monthGridStart(2026, 7, 0))).toBe('2026-07-26'); // Sun before 1 Aug
		expect(iso(monthGridStart(2026, 7, 1))).toBe('2026-07-27'); // Mon before 1 Aug
	});

	it('when the 1st already lands on the week start (1 Feb 2026 is a Sunday)', () => {
		expect(iso(monthGridStart(2026, 1, 0))).toBe('2026-02-01');
		expect(iso(monthGridStart(2026, 1, 1))).toBe('2026-01-26');
	});
});

describe('buildMonthGrid', () => {
	const farAway = d(2000, 1, 1);

	it('August 2026 (Sun start): 6 rows, week numbers 31..36', () => {
		const g = buildMonthGrid(2026, 7, 0, farAway);
		expect(g).toHaveLength(6);
		expect(g.map((w) => w.week)).toEqual([31, 32, 33, 34, 35, 36]);
		expect(g.every((w) => w.days.length === 7)).toBe(true);
	});

	it('February 2026 (Sun start): fits in 4 rows', () => {
		// 1 Feb 2026 is a Sunday and the month has 28 days → exactly 4 weeks.
		const g = buildMonthGrid(2026, 1, 0, farAway);
		expect(g).toHaveLength(4);
		expect(iso(g[0]!.days[0]!.date)).toBe('2026-02-01');
		expect(iso(g[3]!.days[6]!.date)).toBe('2026-02-28');
	});

	it('September 2026 (Sun start): fits in 5 rows', () => {
		expect(buildMonthGrid(2026, 8, 0, farAway)).toHaveLength(5);
	});

	it('May 2026 (Sun start): needs a 6th row', () => {
		// 1 May Fri, 31 May Sun → the last day starts its own row.
		expect(buildMonthGrid(2026, 4, 0, farAway)).toHaveLength(6);
	});

	it('marks leading/trailing days as outside the month', () => {
		const g = buildMonthGrid(2026, 7, 0, farAway);

		const first = g[0]!.days[0]!;
		expect(iso(first.date)).toBe('2026-07-26');
		expect(first.inCurrentMonth).toBe(false);

		const last = g[5]!.days[6]!;
		expect(iso(last.date)).toBe('2026-09-05');
		expect(last.inCurrentMonth).toBe(false);

		const inMonth = g
			.flatMap((w) => w.days)
			.filter((x) => x.inCurrentMonth);
		expect(inMonth).toHaveLength(31); // August
		expect(inMonth.every((x) => x.date.getMonth() === 7)).toBe(true);
	});

	it('flags exactly one cell as today when today is in view', () => {
		const g = buildMonthGrid(2026, 7, 0, d(2026, 8, 24));
		const flagged = g.flatMap((w) => w.days).filter((x) => x.isToday);
		expect(flagged).toHaveLength(1);
		expect(iso(flagged[0]!.date)).toBe('2026-08-24');
	});

	it('flags no cell when today is in another month', () => {
		const g = buildMonthGrid(2026, 7, 0, d(2026, 1, 1));
		expect(g.flatMap((w) => w.days).some((x) => x.isToday)).toBe(false);
	});

	it('the week start shifts the grid start and the first weekday together', () => {
		const sun = buildMonthGrid(2026, 7, 0, farAway);
		const mon = buildMonthGrid(2026, 7, 1, farAway);
		expect(iso(sun[0]!.days[0]!.date)).toBe('2026-07-26');
		expect(iso(mon[0]!.days[0]!.date)).toBe('2026-07-27');
		expect(sun[0]!.days[0]!.date.getDay()).toBe(0);
		expect(mon[0]!.days[0]!.date.getDay()).toBe(1);
	});

	it('carries the year boundary: December 2026 (Sun start) ends in 2027 W01', () => {
		const g = buildMonthGrid(2026, 11, 0, farAway);
		const lastWeek = g[g.length - 1]!;
		expect(lastWeek.week).toBe(1);
		expect(lastWeek.weekYear).toBe(2027);
	});
});

describe('formatWeekName', () => {
	it('default weekly pattern — YYYY is the week-year', () => {
		expect(formatWeekName(d(2026, 8, 24), "YYYY 'W'WW", 0)).toBe('2026 W35');
		expect(formatWeekName(d(2026, 12, 31), "YYYY 'W'WW", 0)).toBe('2027 W01');
		expect(formatWeekName(d(2026, 12, 31), "YYYY 'W'WW", 1)).toBe('2027 W01');
	});

	it('any day in the week produces the same name', () => {
		const names = [23, 24, 25, 26, 27, 28, 29].map((day) =>
			formatWeekName(d(2026, 8, day), "YYYY 'W'WW", 0),
		);
		expect(new Set(names)).toEqual(new Set(['2026 W35']));
	});

	it('bracket literals, GGGG and the gggg alias', () => {
		expect(formatWeekName(d(2022, 12, 28), 'GGGG-[W]WW', 0)).toBe('2022-W53');
		expect(formatWeekName(d(2022, 12, 28), 'gggg-[W]ww', 0)).toBe('2022-W53');
	});

	it('month/day tokens come from the week start', () => {
		// 27 Aug 2026 is a Thursday; the Sunday-start week begins 23 Aug.
		expect(formatWeekName(d(2026, 8, 27), "YYYY-MM-DD '/W'WW", 0)).toBe(
			'2026-08-23 /W35',
		);
	});
});

describe('formatDate', () => {
	it('the default daily pattern', () => {
		expect(formatDate(d(2026, 8, 24), 'YYYY-MM-DD')).toBe('2026-08-24');
		expect(formatDate(d(2026, 1, 5), 'YYYY-MM-DD')).toBe('2026-01-05');
	});

	it('YYYY stays the calendar year across the week boundary; GGGG does not', () => {
		expect(formatDate(d(2026, 12, 31), 'YYYY-MM-DD')).toBe('2026-12-31');
		expect(formatDate(d(2026, 12, 31), 'GGGG-[W]WW', 0)).toBe('2027-W01');
	});

	it('weekday and month-name tokens (English)', () => {
		// 24 Aug 2026 is a Monday.
		expect(formatDate(d(2026, 8, 24), 'ddd')).toBe('Mon');
		expect(formatDate(d(2026, 8, 24), 'dddd, MMMM D, YYYY')).toBe(
			'Monday, August 24, 2026',
		);
	});

	it('bracket / quote literals, doubled quote → apostrophe', () => {
		expect(formatDate(d(2026, 8, 24), 'YYYY-MM-DD[.md]')).toBe('2026-08-24.md');
		expect(formatDate(d(2026, 8, 24), "'it''s' YYYY")).toBe("it's 2026");
	});

	it('unknown characters pass through verbatim', () => {
		expect(formatDate(d(2026, 8, 24), 'YYYY_MM_DD')).toBe('2026_08_24');
	});
});

describe('expandFolderTokens', () => {
	it('expands {YYYY} / {YY} / {MMMM} / {MM} / {M}', () => {
		expect(expandFolderTokens('Planner/{YYYY}', 2026, 3, 'March')).toBe(
			'Planner/2026',
		);
		expect(
			expandFolderTokens('Planner/{YYYY}/{MM}-{MMMM}', 2026, 3, 'March'),
		).toBe('Planner/2026/03-March');
		expect(expandFolderTokens('{YY}/{M}', 2026, 11, 'November')).toBe('26/11');
		expect(expandFolderTokens('Daily/{MMMM}', 2026, 9, '9월')).toBe(
			'Daily/9월',
		);
	});

	it('{MMMM} and {MM} do not interfere', () => {
		expect(expandFolderTokens('{MMMM}/{MM}/{M}', 2026, 2, 'February')).toBe(
			'February/02/2',
		);
	});

	it('leaves literal folder names untouched', () => {
		expect(expandFolderTokens('Marketing/Meetings', 2026, 5, 'May')).toBe(
			'Marketing/Meetings',
		);
	});

	it('replaces every occurrence', () => {
		expect(expandFolderTokens('{YYYY}/notes/{YYYY}', 2026, 1, 'January')).toBe(
			'2026/notes/2026',
		);
	});
});

describe('monthStart / yearStart', () => {
	it('snap to the 1st of the month and of January, at local midnight', () => {
		const d = new Date(2026, 8, 22, 17, 43, 9, 500); // 2026-09-22 17:43
		expect(monthStart(d)).toEqual(new Date(2026, 8, 1));
		expect(yearStart(d)).toEqual(new Date(2026, 0, 1));
	});

	it('are already-normalised for the first instant of a period', () => {
		expect(monthStart(new Date(2026, 0, 1))).toEqual(new Date(2026, 0, 1));
		expect(yearStart(new Date(2026, 0, 1))).toEqual(new Date(2026, 0, 1));
	});

	it('feed formatDate the values a monthly / yearly filename needs', () => {
		const d = new Date(2026, 8, 22);
		expect(formatDate(monthStart(d), 'YYYY-MM', 0)).toBe('2026-09');
		expect(formatDate(yearStart(d), 'YYYY', 0)).toBe('2026');
	});
});
