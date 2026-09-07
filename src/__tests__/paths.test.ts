import { describe, expect, it } from 'vitest';
import { defaultFolders, rememberFormat, retargetFolder } from '../paths';

describe('defaultFolders', () => {
	it('groups by note kind and spells out no month name', () => {
		expect(defaultFolders()).toEqual({
			yearly: 'Calendar Planner/Yearly',
			monthly: 'Calendar Planner/Monthly/{YYYY}',
			weekly: 'Calendar Planner/Weekly/{YYYY}',
			daily: 'Calendar Planner/Daily/{YYYY}',
		});
	});

	it('leaves every default untouched by a language switch', () => {
		for (const folder of Object.values(defaultFolders())) {
			expect(retargetFolder(folder, 'en', 'ko')).toBe(folder);
			expect(retargetFolder(folder, 'ko', 'en')).toBe(folder);
		}
	});
});

describe('retargetFolder', () => {
	it('keeps a custom root while following the language', () => {
		expect(
			retargetFolder('Calendar Planner/{YYYY}/Daily/{MM}-{MMMM}', 'en', 'ko'),
		).toBe('Calendar Planner/{YYYY}/Daily/{MMMM}');
		expect(retargetFolder('일지/{YYYY}/{MMMM}', 'ko', 'en')).toBe(
			'일지/{YYYY}/{MM}-{MMMM}',
		);
	});

	it('round-trips', () => {
		const path = 'Calendar Planner/{YYYY}/Daily/{MM}-{MMMM}';
		expect(retargetFolder(retargetFolder(path, 'en', 'ko'), 'ko', 'en')).toBe(
			path,
		);
	});

	it('leaves a path with nothing language-specific alone', () => {
		for (const path of [
			'Notes/{YYYY}/{MM}',
			'Planner/{YYYY}/Weekly',
			'Journal',
			'',
		]) {
			expect(retargetFolder(path, 'en', 'ko')).toBe(path);
			expect(retargetFolder(path, 'ko', 'en')).toBe(path);
		}
	});

	it('only swaps whole segments, never a substring of one', () => {
		// "{MMMM}" inside a longer segment is the user's own spelling.
		expect(retargetFolder('Planner/Daily-{MMMM}', 'ko', 'en')).toBe(
			'Planner/Daily-{MMMM}',
		);
	});

	it('is a no-op when the language does not change', () => {
		const path = 'Planner/{YYYY}/Daily/{MMMM}';
		expect(retargetFolder(path, 'ko', 'ko')).toBe(path);
	});
});

describe('rememberFormat', () => {
	it('records the format being replaced, newest first', () => {
		expect(rememberFormat([], 'YYYY-MM-DD', 'YYYY.MM.DD')).toEqual([
			'YYYY-MM-DD',
		]);
		expect(
			rememberFormat(['YYYY-MM-DD'], 'YYYY.MM.DD', 'DD-MM-YYYY'),
		).toEqual(['YYYY.MM.DD', 'YYYY-MM-DD']);
	});

	it('never keeps a duplicate', () => {
		expect(
			rememberFormat(['A', 'B', 'A'], 'A', 'C'),
		).toEqual(['A', 'B']);
	});

	it('drops the format that is now current — it is found the normal way', () => {
		expect(rememberFormat(['YYYY.MM.DD', 'A'], 'B', 'YYYY.MM.DD')).toEqual([
			'B',
			'A',
		]);
	});

	it('ignores an empty or unchanged previous value', () => {
		expect(rememberFormat(['A'], '', 'B')).toEqual(['A']);
		expect(rememberFormat(['A'], '   ', 'B')).toEqual(['A']);
		expect(rememberFormat(['A'], 'B', 'B')).toEqual(['A']);
	});

	it('trims and caps the list at five', () => {
		expect(rememberFormat(['A'], '  X  ', 'Y')[0]).toBe('X');
		const full = ['1', '2', '3', '4', '5'];
		expect(rememberFormat(full, '0', 'new')).toEqual([
			'0',
			'1',
			'2',
			'3',
			'4',
		]);
	});
});
