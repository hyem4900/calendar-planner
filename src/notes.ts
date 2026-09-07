import { MarkdownView, normalizePath, TFile, TFolder } from 'obsidian';
import type { App, Editor } from 'obsidian';
import {
	expandFolderTokens,
	formatDate,
	formatWeekName,
	monthStart,
	startOfWeek,
	weekInfo,
	yearStart,
} from './date';
import { t } from './i18n';
import { defaultScaffold, parseNote } from './parser';
import { allSections, NOTE_KINDS } from './sections';
import type { NoteKind } from './sections';
import type { CalendarPlannerSettings } from './settings';

/*
 * Vault / workspace access layer. Everything that reads or writes files lives
 * here; the pure modules (date / parser / mutate) never import this. Creation
 * (step 7) and writeBack (step 9) land in this file later.
 */

// Defined with the settings, which are what a note kind actually selects.
export type { NoteKind };

export interface NoteRef {
	kind: NoteKind;
	/** Normalized vault path, e.g. "할 일/2026 W35.md". */
	path: string;
	/** The resolved file, or null if it does not exist yet. */
	file: TFile | null;
}

export interface NoteResolver {
	yearly(dateInYear: Date): NoteRef;
	monthly(dateInMonth: Date): NoteRef;
	weekly(dateInWeek: Date): NoteRef;
	daily(day: Date): NoteRef;
}

/* ---- path calculation ---------------------------------------------------- */

/** Join a folder and a basename into one normalized vault path. */
export function vaultPath(folder: string, basename: string): string {
	const clean = folder.trim().replace(/^\/+|\/+$/g, '');
	return normalizePath(clean ? `${clean}/${basename}` : basename);
}

/** Folder tokens for a weekly note: the week-year (matches the filename) + the week-start month. */
function weeklyFolder(settings: CalendarPlannerSettings, dateInWeek: Date): string {
	const { weekYear } = weekInfo(dateInWeek, settings.weekStart);
	const startMonth = startOfWeek(dateInWeek, settings.weekStart).getMonth() + 1;
	return expandFolderTokens(
		settings.weeklyNoteFolder,
		weekYear,
		startMonth,
		t(settings.language).monthLong(startMonth),
	);
}

/** Where the yearly note for `dateInYear` belongs under the current settings. */
export function yearlyNotePath(
	settings: CalendarPlannerSettings,
	dateInYear: Date,
): string {
	const format = settings.yearlyNoteFormat || 'YYYY';
	// January stands in for the month tokens: a yearly folder has no month, but
	// {MM} / {MMMM} should still expand to something rather than stay literal.
	return vaultPath(
		expandFolderTokens(
			settings.yearlyNoteFolder,
			dateInYear.getFullYear(),
			1,
			t(settings.language).monthLong(1),
		),
		`${formatDate(yearStart(dateInYear), format, settings.weekStart)}.md`,
	);
}

/** Where the monthly note for `dateInMonth` belongs under the current settings. */
export function monthlyNotePath(
	settings: CalendarPlannerSettings,
	dateInMonth: Date,
): string {
	const format = settings.monthlyNoteFormat || 'YYYY-MM';
	const month = dateInMonth.getMonth() + 1;
	return vaultPath(
		expandFolderTokens(
			settings.monthlyNoteFolder,
			dateInMonth.getFullYear(),
			month,
			t(settings.language).monthLong(month),
		),
		`${formatDate(monthStart(dateInMonth), format, settings.weekStart)}.md`,
	);
}

/** Where the weekly note for `dateInWeek` belongs under the current settings. */
export function weeklyNotePath(
	settings: CalendarPlannerSettings,
	dateInWeek: Date,
): string {
	const format = settings.weeklyNoteFormat || "YYYY 'W'WW";
	return vaultPath(
		weeklyFolder(settings, dateInWeek),
		`${formatWeekName(dateInWeek, format, settings.weekStart)}.md`,
	);
}

/** Where the daily note for `day` belongs under the current settings. */
export function dailyNotePath(
	settings: CalendarPlannerSettings,
	day: Date,
): string {
	const format = settings.dailyNoteFormat || 'YYYY-MM-DD';
	const month = day.getMonth() + 1;
	return vaultPath(
		expandFolderTokens(
			settings.dailyNoteFolder,
			day.getFullYear(),
			month,
			t(settings.language).monthLong(month),
		),
		`${formatDate(day, format, settings.weekStart)}.md`,
	);
}

/** "Planner/2026/2026-09-22.md" → "2026-09-22". */
function basenameOf(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
}

/* ---- resolution ------------------------------------------------------- */

/**
 * Build a resolver bound to the current settings. Folder / format come straight
 * from this plugin's own settings (it does not read the core Daily notes
 * plugin), and lookups do zero file reads, so rendering a whole month is cheap.
 */
export function createNoteResolver(
	app: App,
	settings: CalendarPlannerSettings,
): NoteResolver {
	/**
	 * `older` are the names this date's note would have had under filename
	 * formats the vault has since moved on from.
	 */
	const build = (kind: NoteKind, path: string, older: string[]): NoteRef => {
		const found = app.vault.getAbstractFileByPath(path);
		if (found instanceof TFile) return { kind, path, file: found };

		// Nothing at the configured path — the folder template, the language
		// behind its {MMMM} token, or the filename format may have changed since
		// the note was made, which would otherwise silently unlink every note
		// ever written. Look the note up by name instead, wherever it lives:
		// once a note belongs to a date, it stays with it. `path` (which need
		// not exist) only biases the search toward nearby folders. Creating
		// still uses `path`, so new notes land in the new spot with the new name.
		for (const name of [basenameOf(path), ...older]) {
			const moved = app.metadataCache.getFirstLinkpathDest(name, path);
			if (moved) return { kind, path, file: moved };
		}
		return { kind, path, file: null };
	};

	const { weekStart } = settings;
	const yearlyOlder = settings.yearlyNoteFormatHistory ?? [];
	const monthlyOlder = settings.monthlyNoteFormatHistory ?? [];
	const weeklyOlder = settings.weeklyNoteFormatHistory ?? [];
	const dailyOlder = settings.dailyNoteFormatHistory ?? [];

	return {
		yearly: (dateInYear: Date): NoteRef =>
			build(
				'yearly',
				yearlyNotePath(settings, dateInYear),
				yearlyOlder.map((f) =>
					formatDate(yearStart(dateInYear), f, weekStart),
				),
			),
		monthly: (dateInMonth: Date): NoteRef =>
			build(
				'monthly',
				monthlyNotePath(settings, dateInMonth),
				monthlyOlder.map((f) =>
					formatDate(monthStart(dateInMonth), f, weekStart),
				),
			),
		weekly: (dateInWeek: Date): NoteRef =>
			build(
				'weekly',
				weeklyNotePath(settings, dateInWeek),
				weeklyOlder.map((f) => formatWeekName(dateInWeek, f, weekStart)),
			),
		daily: (day: Date): NoteRef =>
			build(
				'daily',
				dailyNotePath(settings, day),
				dailyOlder.map((f) => formatDate(day, f, weekStart)),
			),
	};
}

/* ---- open / create ---------------------------------------------------- */

export type OpenWhere = 'tab' | 'new-tab' | 'split';

/** Open `file` in the workspace at the requested location. */
export async function openNote(
	app: App,
	file: TFile,
	where: OpenWhere,
): Promise<void> {
	const target =
		where === 'new-tab' ? 'tab' : where === 'split' ? 'split' : false;
	await app.workspace.getLeaf(target).openFile(file);
}

/** Create every missing folder along `filePath`'s parent chain. */
async function ensureParentFolder(app: App, filePath: string): Promise<void> {
	const slash = filePath.lastIndexOf('/');
	if (slash <= 0) return;
	const parts = filePath.slice(0, slash).split('/');
	let cur = '';
	for (const part of parts) {
		cur = cur ? `${cur}/${part}` : part;
		if (app.vault.getAbstractFileByPath(cur)) continue;
		try {
			await app.vault.createFolder(cur);
		} catch {
			// created concurrently, or already exists — either way it's there now
		}
	}
}

/**
 * Create the note at `path` with `content`, making parent folders as needed.
 * If a file already exists at `path` it is returned untouched (plan.md § 6).
 */
export async function createNote(
	app: App,
	path: string,
	content: string,
): Promise<TFile> {
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) return existing;
	await ensureParentFolder(app, path);
	return app.vault.create(path, content);
}

/** Read `templatePath` verbatim, or fall back to `scaffold()` if it is unset / not a file. */
async function templateBody(
	app: App,
	templatePath: string,
	scaffold: () => string,
): Promise<string> {
	const tpl = templatePath.trim();
	if (tpl) {
		const f = app.vault.getAbstractFileByPath(normalizePath(tpl));
		if (f instanceof TFile) {
			try {
				// Copied as-is — no {{date}} / {{title}} substitution (plan.md § 6).
				return await app.vault.cachedRead(f);
			} catch {
				// unreadable — fall through to the scaffold
			}
		}
	}
	return scaffold();
}

/**
 * Ensure the weekly/daily note for `date` exists, creating it from the configured
 * template (or the default scaffold) if not. Returns the file either way.
 */
export async function createPlannerNote(
	app: App,
	settings: CalendarPlannerSettings,
	kind: NoteKind,
	date: Date,
): Promise<TFile> {
	const resolver = createNoteResolver(app, settings);
	const ref = resolver[kind](date);
	if (ref.file) return ref.file;

	const template = {
		yearly: settings.yearlyNoteTemplate,
		monthly: settings.monthlyNoteTemplate,
		weekly: settings.weeklyNoteTemplate,
		daily: settings.dailyNoteTemplate,
	}[kind];
	const body = await templateBody(app, template, () =>
		defaultScaffold(settings.sections[kind]),
	);
	return createNote(app, ref.path, body);
}

/* ---- relocating notes after a folder change ------------------------------- */

/** How far around today the target-name index reaches. */
const SCAN_YEARS_BACK = 30;
const SCAN_YEARS_AHEAD = 5;

/**
 * Note basename → the path that note belongs at under the current settings.
 *
 * Built by walking dates forward rather than by parsing dates back out of
 * filenames: the filename formats are user-configurable and not invertible in
 * general, but generating every name they can produce over a wide range is
 * cheap and exact.
 */
function plannerTargets(settings: CalendarPlannerSettings): Map<string, string> {
	const { weekStart } = settings;
	const yearlyOlder = settings.yearlyNoteFormatHistory ?? [];
	const monthlyOlder = settings.monthlyNoteFormatHistory ?? [];
	const weeklyOlder = settings.weeklyNoteFormatHistory ?? [];
	const dailyOlder = settings.dailyNoteFormatHistory ?? [];

	// Two passes' worth of entries: a name a superseded format produced must
	// never win over the same name under the current one, whichever date it
	// happens to belong to.
	const superseded = new Map<string, string>();
	const current = new Map<string, string>();

	const thisYear = new Date().getFullYear();
	const end = new Date(thisYear + SCAN_YEARS_AHEAD, 11, 31);
	const day = new Date(thisYear - SCAN_YEARS_BACK, 0, 1);

	while (day <= end) {
		const daily = dailyNotePath(settings, day);
		for (const f of dailyOlder) {
			superseded.set(formatDate(day, f, weekStart), daily);
		}
		current.set(basenameOf(daily), daily);

		if (day.getDay() === weekStart) {
			const weekly = weeklyNotePath(settings, day);
			for (const f of weeklyOlder) {
				superseded.set(formatWeekName(day, f, weekStart), weekly);
			}
			current.set(basenameOf(weekly), weekly);
		}

		if (day.getDate() === 1) {
			const monthly = monthlyNotePath(settings, day);
			for (const f of monthlyOlder) {
				superseded.set(formatDate(day, f, weekStart), monthly);
			}
			current.set(basenameOf(monthly), monthly);

			if (day.getMonth() === 0) {
				const yearly = yearlyNotePath(settings, day);
				for (const f of yearlyOlder) {
					superseded.set(formatDate(day, f, weekStart), yearly);
				}
				current.set(basenameOf(yearly), yearly);
			}
		}
		day.setDate(day.getDate() + 1);
	}

	for (const [name, path] of current) superseded.set(name, path);
	return superseded;
}

export interface MisplacedNote {
	file: TFile;
	/** Where the current settings say it belongs. */
	target: string;
}

/**
 * Planner notes that no longer sit where the folder settings put them — what a
 * changed folder template or interface language leaves behind.
 *
 * A date-shaped filename alone is not enough to move somebody's file around, so
 * a candidate must also parse as a planner note (it has at least one of the
 * configured headings — of any note kind, since which kind a file on disk is
 * only follows from the name that matched).
 */
export async function findMisplacedPlannerNotes(
	app: App,
	settings: CalendarPlannerSettings,
): Promise<MisplacedNote[]> {
	const targets = plannerTargets(settings);
	const specs = allSections(settings.sections);
	const out: MisplacedNote[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		const target = targets.get(file.basename);
		if (target === undefined || target === file.path) continue;
		if (app.vault.getAbstractFileByPath(target)) continue; // spot taken

		let content: string;
		try {
			content = await app.vault.cachedRead(file);
		} catch {
			continue;
		}
		const parsed = parseNote(content, specs);
		if (parsed.sections.size === 0) continue;

		out.push({ file, target });
	}
	return out;
}

/**
 * Trash the folders a move left behind, and every parent that empties along
 * with them — "Planner/2026/Daily/09-September" going away should take an empty
 * "Planner/2026/Daily" with it. Only folders with nothing at all inside are
 * touched, so a folder holding anything the user put there survives, and the
 * walk never reaches the vault root.
 */
async function removeEmptyFolders(
	app: App,
	folders: Set<string>,
): Promise<void> {
	// Deepest first: a parent is only reached once its children are gone.
	const pending = [...folders].sort(
		(a, b) => b.split('/').length - a.split('/').length,
	);
	const seen = new Set<string>();

	while (pending.length > 0) {
		const path = pending.shift()!;
		if (path === '' || path === '/' || seen.has(path)) continue;
		seen.add(path);

		const folder = app.vault.getAbstractFileByPath(path);
		if (!(folder instanceof TFolder) || folder.children.length > 0) continue;

		const parent = folder.parent?.path;
		try {
			await app.fileManager.trashFile(folder);
		} catch {
			continue; // still there, so its parent is not empty either
		}
		if (parent !== undefined) pending.push(parent);
	}
}

/**
 * Move each note to its target path, creating folders on the way and trashing
 * the ones left empty behind it. Renaming through `fileManager` keeps links to
 * these notes pointing at them. Returns how many actually moved.
 */
export async function moveNotes(
	app: App,
	notes: MisplacedNote[],
): Promise<number> {
	const vacated = new Set<string>();
	let moved = 0;

	for (const { file, target } of notes) {
		if (app.vault.getAbstractFileByPath(target)) continue;
		// Read the old parent before the rename moves the file out of it.
		const from = file.parent?.path;
		try {
			await ensureParentFolder(app, target);
			await app.fileManager.renameFile(file, target);
			moved++;
			if (from !== undefined) vacated.add(from);
		} catch {
			// Two notes can want the same spot, or the vault can change under
			// us — skip this one and keep going.
		}
	}

	await removeEmptyFolders(app, vacated);
	return moved;
}

/* ---- empty-note cleanup --------------------------------------------------- */

/** Normalise for an exact "untouched scaffold" comparison (CRLF, trailing space / blank lines). */
function normScaffold(text: string): string {
	return text
		.replace(/\r\n/g, '\n')
		.replace(/[ \t]+$/gm, '')
		.replace(/\n+$/, '');
}

/** The non-token prefix of a folder template, e.g. "Planner/{YYYY}/Weekly" → "Planner". */
function folderRoot(folderTpl: string): string {
	return folderTpl.split('{')[0]!.replace(/\/+$/, '').trim();
}

/**
 * Every markdown file under a planner folder root whose content is
 * byte-identical (bar whitespace) to a default scaffold — i.e. a planner note
 * that was created but never written in.
 *
 * Each note kind has its own section list and therefore its own scaffold, and a
 * file's kind is not known from its path alone, so a match against any of the
 * four counts.
 */
export async function findEmptyPlannerNotes(
	app: App,
	settings: CalendarPlannerSettings,
): Promise<TFile[]> {
	const scaffolds = new Set(
		NOTE_KINDS.map((kind) =>
			normScaffold(defaultScaffold(settings.sections[kind])),
		),
	);
	const roots = [
		settings.yearlyNoteFolder,
		settings.monthlyNoteFolder,
		settings.weeklyNoteFolder,
		settings.dailyNoteFolder,
	]
		.map(folderRoot)
		.filter((r) => r.length > 0);
	if (roots.length === 0) return [];

	const inScope = (path: string): boolean =>
		roots.some((r) => path === r || path.startsWith(`${r}/`));

	const out: TFile[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (!inScope(file.path)) continue;
		let content: string;
		try {
			content = await app.vault.cachedRead(file);
		} catch {
			continue;
		}
		if (scaffolds.has(normScaffold(content))) out.push(file);
	}
	return out;
}

/** Move `files` to the trash (respecting the user's "deleted files" setting). */
export async function trashFiles(app: App, files: TFile[]): Promise<void> {
	for (const file of files) {
		await app.fileManager.trashFile(file);
	}
}

/* ---- write-back (plan.md § 4.5 + pitfall A) --------------------------- */

export interface WriteResult {
	/** false when `transform` returned null (the pre-write check failed). */
	ok: boolean;
	/** The full text that was written, for echo suppression; null when aborted. */
	content: string | null;
}

/** Apply `next` to an open editor, as one line edit when only one line changed. */
function applyToEditor(editor: Editor, previous: string, next: string): void {
	if (next === previous) return;

	const a = previous.split('\n');
	const b = next.split('\n');
	if (a.length === b.length) {
		let only = -1;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) {
				if (only !== -1) {
					only = -2;
					break;
				}
				only = i;
			}
		}
		if (only >= 0) {
			editor.setLine(only, b[only]!);
			return;
		}
	}

	editor.replaceRange(
		next,
		{ line: 0, ch: 0 },
		{ line: editor.lastLine(), ch: Infinity },
	);
}

/** The markdown editor showing `file`, when the user has it open. */
function openEditorFor(app: App, file: TFile): Editor | null {
	const view = app.workspace
		.getLeavesOfType('markdown')
		.map((leaf) => leaf.view)
		.find(
			(v): v is MarkdownView =>
				v instanceof MarkdownView && v.file?.path === file.path,
		);
	return view ? view.editor : null;
}

/**
 * The note's current text. An open editor holds the truth: its buffer only
 * reaches disk — and therefore `cachedRead` — after Obsidian's save debounce,
 * so reading the vault would show the panel a version of the note that is
 * seconds behind what the user is looking at.
 */
export async function readNote(app: App, file: TFile): Promise<string> {
	const editor = openEditorFor(app, file);
	if (editor) return editor.getValue();
	return app.vault.cachedRead(file);
}

/**
 * Write to `file` via its open editor when one exists, otherwise via
 * `vault.process`. The editor path is mandatory while the note is open: a
 * pending save debounce makes `vault.process` / `vault.modify` silently no-op
 * (pitfall A). `transform` gets the current full text and returns the new text,
 * or null to abort (e.g. the parsed `raw` no longer matches).
 */
export async function writeBack(
	app: App,
	file: TFile,
	transform: (data: string) => string | null,
): Promise<WriteResult> {
	const editor = openEditorFor(app, file);

	if (editor) {
		const previous = editor.getValue();
		const next = transform(previous);
		if (next === null) return { ok: false, content: null };
		applyToEditor(editor, previous, next);
		return { ok: true, content: next };
	}

	let written: string | null = null;
	await app.vault.process(file, (data) => {
		const next = transform(data);
		if (next === null) return data;
		written = next;
		return next;
	});
	return { ok: written !== null, content: written };
}
