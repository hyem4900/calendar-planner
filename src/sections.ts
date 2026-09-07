/*
 * Which sections each kind of planner note is made of.
 *
 * Pure module — MUST NOT import 'obsidian' (plan.md § F). It sits below both
 * `settings` and `notes` so either can read it without an import cycle.
 */

import type { SectionSpec } from './parser';

/** The four kinds of planner note, each with its own folder, name and sections. */
export type NoteKind = 'yearly' | 'monthly' | 'weekly' | 'daily';

/** Every note kind, in the order the settings tab presents them. */
export const NOTE_KINDS: readonly NoteKind[] = [
	'yearly',
	'monthly',
	'weekly',
	'daily',
];

/** One section list per note kind — a yearly note is not laid out like a day. */
export type SectionSets = Record<NoteKind, SectionSpec[]>;

const EVENT: SectionSpec = { id: 'event', heading: 'EVENT', type: 'list' };
const TODO: SectionSpec = { id: 'todo', heading: 'TODO', type: 'checklist' };
const MEMO: SectionSpec = { id: 'memo', heading: 'MEMO', type: 'free' };
const GOAL: SectionSpec = { id: 'goal', heading: 'GOAL', type: 'checklist' };
const REFLECTION: SectionSpec = {
	id: 'reflection',
	heading: 'REFLECTION',
	type: 'free',
};

/**
 * The section list of a day or a week — the three the plugin shipped with
 * before sections became configurable, and the base a pre-`sections` settings
 * file is migrated onto.
 */
export const DEFAULT_SECTIONS: readonly SectionSpec[] = [EVENT, TODO, MEMO];

/** A deep copy of `specs`, safe to hand to a settings object. */
export function copySections(specs: readonly SectionSpec[]): SectionSpec[] {
	return specs.map((spec) => ({ ...spec }));
}

/**
 * What each kind of note starts as. The longer the period, the less it is a
 * list of things happening and the more it is something to look back on: a year
 * gets goals and a reflection, a month keeps the diary but still plans, and a
 * week and a day are planning first.
 */
export function defaultSectionSets(): SectionSets {
	return {
		yearly: copySections([GOAL, REFLECTION]),
		monthly: copySections([EVENT, TODO, REFLECTION]),
		weekly: copySections(DEFAULT_SECTIONS),
		daily: copySections(DEFAULT_SECTIONS),
	};
}

/** An id no existing section uses. Readable, so data.json stays legible. */
export function newSectionId(existing: readonly SectionSpec[]): string {
	const taken = new Set(existing.map((spec) => spec.id));
	for (let n = 1; ; n++) {
		const id = `section-${n}`;
		if (!taken.has(id)) return id;
	}
}

/**
 * Every configured section across all four note kinds, deduplicated by heading.
 *
 * Only for questions asked of a file whose kind is not known yet — "does this
 * markdown file parse as a planner note at all?". Ids are re-scoped by kind
 * because two kinds may well use the same id for different headings.
 */
export function allSections(sets: SectionSets): SectionSpec[] {
	const out: SectionSpec[] = [];
	const seen = new Set<string>();
	for (const kind of NOTE_KINDS) {
		for (const spec of sets[kind]) {
			const name = spec.heading.trim().toLowerCase();
			if (name === '' || seen.has(name)) continue;
			seen.add(name);
			out.push({
				id: `${kind}:${spec.id}`,
				heading: spec.heading,
				type: spec.type,
			});
		}
	}
	return out;
}

/**
 * Read a `sections` value out of a saved settings file, filling in whatever it
 * does not have.
 *
 * Two older shapes have to survive: settings written before sections were
 * configurable at all (no `sections` key — the caller carries the three
 * individually named headings across), and settings written when one list was
 * shared by every note kind (`sections` is an array, which every kind starts
 * from).
 */
export function normalizeSectionSets(saved: unknown): SectionSets {
	const sets = defaultSectionSets();
	if (Array.isArray(saved)) {
		const shared = saved.filter(isSectionSpec);
		for (const kind of NOTE_KINDS) sets[kind] = copySections(shared);
		return sets;
	}
	if (saved && typeof saved === 'object') {
		const byKind = saved as Partial<Record<NoteKind, unknown>>;
		for (const kind of NOTE_KINDS) {
			const list = byKind[kind];
			if (Array.isArray(list)) {
				sets[kind] = copySections(list.filter(isSectionSpec));
			}
		}
	}
	return sets;
}

function isSectionSpec(value: unknown): value is SectionSpec {
	if (!value || typeof value !== 'object') return false;
	const spec = value as Partial<SectionSpec>;
	return (
		typeof spec.id === 'string' &&
		typeof spec.heading === 'string' &&
		(spec.type === 'list' ||
			spec.type === 'checklist' ||
			spec.type === 'free')
	);
}
