import { describe, expect, it } from 'vitest';
import {
	allSections,
	copySections,
	DEFAULT_SECTIONS,
	defaultSectionSets,
	newSectionId,
	NOTE_KINDS,
	normalizeSectionSets,
} from '../sections';
import type { SectionSpec } from '../parser';

const spec = (
	id: string,
	heading: string,
	type: SectionSpec['type'] = 'list',
): SectionSpec => ({ id, heading, type });

describe('defaultSectionSets', () => {
	it('lays each note kind out for its own period', () => {
		const sets = defaultSectionSets();
		const headings = (kind: keyof typeof sets): string[] =>
			sets[kind].map((s) => s.heading);

		expect(headings('yearly')).toEqual(['GOAL', 'REFLECTION']);
		expect(headings('monthly')).toEqual(['EVENT', 'TODO', 'REFLECTION']);
		expect(headings('weekly')).toEqual(['EVENT', 'TODO', 'MEMO']);
		expect(headings('daily')).toEqual(['EVENT', 'TODO', 'MEMO']);
		expect(sets.weekly).toEqual(DEFAULT_SECTIONS);
	});

	it('gives every kind its own specs, not shared references', () => {
		const sets = defaultSectionSets();
		sets.daily[0]!.heading = 'CHANGED';
		expect(sets.weekly[0]!.heading).toBe('EVENT');
		expect(sets.monthly[0]!.heading).toBe('EVENT');
		expect(defaultSectionSets().daily[0]!.heading).toBe('EVENT');
	});

	it('types each default section', () => {
		const sets = defaultSectionSets();
		expect(sets.yearly.map((s) => s.type)).toEqual(['checklist', 'free']);
		expect(sets.monthly.map((s) => s.type)).toEqual([
			'list',
			'checklist',
			'free',
		]);
	});
});

describe('copySections', () => {
	it('copies the specs, not the references', () => {
		const source = [spec('a', 'A')];
		const copy = copySections(source);
		copy[0]!.heading = 'B';
		expect(source[0]!.heading).toBe('A');
	});
});

describe('newSectionId', () => {
	it('skips ids already taken', () => {
		expect(newSectionId([])).toBe('section-1');
		expect(newSectionId([spec('section-1', 'A')])).toBe('section-2');
		expect(
			newSectionId([spec('section-2', 'A'), spec('section-1', 'B')]),
		).toBe('section-3');
	});
});

describe('allSections', () => {
	it('merges every kind, keeping the first spec of each heading', () => {
		const sets = defaultSectionSets();
		sets.yearly = [spec('goals', 'GOALS', 'checklist')];
		sets.monthly = [spec('goals', 'GOALS', 'list'), spec('memo', 'MEMO')];

		const merged = allSections(sets);
		const headings = merged.map((s) => s.heading);
		expect(headings).toContain('GOALS');
		expect(headings.filter((h) => h === 'GOALS')).toHaveLength(1);
		// The yearly one came first, so it is the one kept.
		expect(merged.find((s) => s.heading === 'GOALS')!.type).toBe(
			'checklist',
		);
	});

	it('re-scopes ids so two kinds cannot collide', () => {
		const sets = defaultSectionSets();
		sets.yearly = [spec('section-1', 'A')];
		sets.daily = [spec('section-1', 'B')];
		const ids = allSections(sets).map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('drops blank headings, which never match anything', () => {
		const sets = defaultSectionSets();
		for (const kind of NOTE_KINDS) sets[kind] = [spec('blank', '  ')];
		expect(allSections(sets)).toEqual([]);
	});
});

describe('normalizeSectionSets', () => {
	it('defaults every kind when there is nothing saved', () => {
		expect(normalizeSectionSets(undefined)).toEqual(defaultSectionSets());
		expect(normalizeSectionSets(null)).toEqual(defaultSectionSets());
	});

	it('spreads a legacy single list across every kind', () => {
		const legacy = [spec('a', 'A'), spec('b', 'B', 'free')];
		const sets = normalizeSectionSets(legacy);
		for (const kind of NOTE_KINDS) expect(sets[kind]).toEqual(legacy);
		// …as copies, so editing one kind does not edit the others.
		sets.daily[0]!.heading = 'CHANGED';
		expect(sets.yearly[0]!.heading).toBe('A');
	});

	it('keeps a per-kind object and fills in the kinds it lacks', () => {
		const sets = normalizeSectionSets({ weekly: [spec('w', 'W')] });
		expect(sets.weekly).toEqual([spec('w', 'W')]);
		expect(sets.daily).toEqual(DEFAULT_SECTIONS);
	});

	it('drops entries that are not section specs', () => {
		const sets = normalizeSectionSets({
			daily: [spec('ok', 'OK'), { id: 'x' }, null, 'nope', { id: 'y', heading: 'Y', type: 'bogus' }],
		});
		expect(sets.daily).toEqual([spec('ok', 'OK')]);
	});
});
