import {
	Component,
	ItemView,
	MarkdownRenderer,
	Menu,
	Notice,
	TFile,
	WorkspaceLeaf,
	setIcon,
} from 'obsidian';
import type CalendarPlannerPlugin from './main';
import {
	buildMonthGrid,
	isSameDay,
	weekInfo,
	weekRange,
	type WeekStart,
} from './date';
import { translations, type Strings } from './i18n';
import {
	createNoteResolver,
	createPlannerNote,
	openNote,
	readNote,
	writeBack,
	type NoteKind,
	type NoteRef,
} from './notes';
import {
	parseNote,
	sectionBodyText,
	specById,
	type ItemStyle,
	type ParsedItem,
	type ParsedSection,
	type SectionSpec,
} from './parser';
import {
	appendItem,
	normalizeItemText,
	removeItem,
	setSectionBody,
	toggleSectionTask,
	toggleTodo,
	updateItemText,
} from './mutate';
import { CreateNoteModal } from './modals';
import { createLiveEditor, type LiveEditor } from './liveeditor';
import { splitItemTime } from './itemtime';
import {
	attachmentName,
	isImageExtension,
	IMAGE_EXTENSIONS,
} from './attachments';
import { trimToWidth } from './trim';

export const VIEW_TYPE_CALENDAR = 'calendar-planner-view';

type PanelMode = 'year' | 'month' | 'week' | 'day';

/** The note kind each panel mode reads and writes. */
const KIND_OF: Record<PanelMode, NoteKind> = {
	year: 'yearly',
	month: 'monthly',
	week: 'weekly',
	day: 'daily',
};

interface PanelTarget {
	mode: PanelMode;
	/** Any day inside the year / month / week the panel shows; for 'day', that day. Local midnight. */
	date: Date;
}

/** One item of a day's note, reduced to what a band in the grid shows. */
interface PreviewItem {
	text: string;
	checked: boolean;
	style: ItemStyle;
	/** Source line and its exact text, so a band's checkbox can write back. */
	line: number;
	raw: string;
}

/** A day's bands, and the file state they were read from. */
interface PreviewEntry {
	mtime: number;
	items: PreviewItem[];
}

/**
 * How many days' previews are kept before the cache is dropped wholesale. A
 * month is 42 cells, so this holds a year of browsing and still stays small.
 */
const PREVIEW_CACHE_MAX = 500;

/** State of the one open inline editor, or null. */
interface EditState {
	file: TFile;
	/** For `isNew`, a placeholder with line/raw = -1/''. */
	item: ParsedItem;
	/** Id of the configured section being edited. */
	sectionId: string;
	isNew: boolean;
	input: HTMLInputElement;
	/** The hidden text span the input stands in for. */
	span: HTMLElement;
	row: HTMLElement;
	/** Index among `.cp-item` rows at edit start, for Tab focus movement. */
	rowIndex: number;
	cancelled: boolean;
	composing: boolean;
	moveTo: 'next' | 'prev' | null;
}

/** State of the open free-form section editor, or null. */
interface FreeEditState {
	file: TFile;
	sectionId: string;
	wrap: HTMLElement;
	editor: LiveEditor;
	/** The section body text as it was when editing started. */
	original: string;
	cancelled: boolean;
}

/**
 * Whether a transferred file is an image. Most sources set a MIME type, but a
 * file dragged in from some file managers arrives with an empty one — so fall
 * back to its extension rather than dropping the file on the floor.
 */
function isImageFile(file: File): boolean {
	if (file.type.startsWith('image/')) return true;
	if (file.type !== '') return false;
	const dot = file.name.lastIndexOf('.');
	return dot > 0 && isImageExtension(file.name.slice(dot + 1));
}

/**
 * The image files on a clipboard or a drag payload. Empty for a normal text
 * paste, which is the signal to leave the event alone and let the browser
 * insert the text.
 *
 * `files` is the whole payload whenever the source fills it, which every
 * mainstream paste and OS file drop does — so it is read alone, and `items` is
 * only a fallback for sources that leave it empty. The two must NOT be merged
 * and de-duplicated: `getAsFile()` returns a *fresh* File on every call, and
 * for an image the browser synthesised (a drag out of a web page, a clipboard
 * screenshot) its `lastModified` is the instant that call was made. Two reads
 * of one picture therefore look identical only while they land inside the same
 * millisecond — which is why merging dropped the same GIF in twice now and
 * then rather than every time.
 */
function transferImages(data: DataTransfer | null): File[] {
	if (!data) return [];

	const files = Array.from(data.files);
	if (files.length > 0) return files.filter(isImageFile);

	const out: File[] = [];
	const seen = new Set<string>();
	for (const item of Array.from(data.items)) {
		if (item.kind !== 'file') continue;
		const file = item.getAsFile();
		if (!file || !isImageFile(file)) continue;
		// Within this one list, identity is all we have to go on; the timestamp
		// stays out of the key for the reason above.
		const key = `${file.name}:${file.size}:${file.type}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(file);
	}
	return out;
}

/**
 * Whether a drag carries files at all.
 *
 * `dragover` cannot look at the files themselves — the browser withholds them
 * until the drop — so the only thing available to decide whether to accept the
 * drag is the `types` list. Getting this wrong means never calling
 * preventDefault, and then no drop event ever arrives.
 */
function draggingFiles(data: DataTransfer | null): boolean {
	return data !== null && Array.from(data.types).includes('Files');
}

/** Anything with a URI scheme is already a resolved address, not a vault path. */
const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * An image embed inside one line of item text, in either syntax: `![[file|300]]`
 * (groups 1 / 2) or `![alt](file "title")` (groups 3 / 4).
 */
const EMBED_RE =
	/!\[\[([^\][|\n]+)(?:\|([^\]\n]*))?\]\]|!\[([^\]\n]*)\]\(<?([^)\s>]+)>?(?:\s+"[^"\n]*")?\)/g;

/**
 * One line of item source reduced to the words a band can show. A band has a
 * few characters to work with, so the markup that would eat them — an image
 * embed, a link's target, emphasis marks — is taken out and only the words the
 * user typed are left.
 */
function bandText(text: string): string {
	EMBED_RE.lastIndex = 0;
	return text
		.replace(EMBED_RE, ' ')
		.replace(
			/\[\[([^\][|]+)(?:\|([^\]]*))?\]\]/g,
			(_m, target: string, alias?: string) => alias ?? target,
		)
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[*_`~]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** `decodeURIComponent` that gives the text back rather than throwing on bad input. */
function decodePath(target: string): string {
	try {
		return decodeURIComponent(target);
	} catch {
		return target;
	}
}

/**
 * Apply the `|300` / `|300x200` size suffix of a wiki embed. Anything else in
 * that position is alt text.
 */
function applyEmbedSize(img: HTMLImageElement, alias: string | undefined): void {
	const size = alias === undefined ? null : /^(\d+)(?:x(\d+))?$/.exec(alias);
	if (!size) {
		if (alias) img.setAttr('alt', alias);
		return;
	}
	img.setAttr('width', size[1]!);
	if (size[2]) img.setAttr('height', size[2]);
}

/**
 * Right-sidebar month calendar.
 *
 * Left-click on a day or week number fills the bottom panel with that note's
 * event / Todo — it never opens the note (navigation is the right-click menu).
 * Panel items are edited in place: click text to rename, checkbox to toggle,
 * `+` to add, `×` to delete — every change writes straight back to the note
 * through `notes.writeBack`.
 */
export class CalendarView extends ItemView {
	private readonly plugin: CalendarPlannerPlugin;

	/** First day of the displayed month. */
	private viewDate: Date;
	/** What the bottom panel shows, or null for the empty state. */
	private panelTarget: PanelTarget | null = null;
	/** Guards against a slow async panel fill overwriting a newer one. */
	private panelToken = 0;
	/** Set when a long-press opened the menu, so the trailing click is ignored. */
	private suppressClick = false;
	/** The one open inline editor, or null. */
	private editing: EditState | null = null;
	/** The note currently shown in the panel (for the deferred `+`-after-create flow). */
	private currentPanelFile: TFile | null = null;
	/** Section id to open a fresh "add" editor in once the next panel fill completes. */
	private pendingAdd: string | null = null;
	/** The open free-form section editor, or null. */
	private memoEditing: FreeEditState | null = null;
	/** Lifecycle owners for the free sections' markdown renders. */
	private readonly freeRenders: Component[] = [];
	/** The open month / year grid picker popover, or null. */
	private picker: HTMLElement | null = null;
	/** Tears down the open picker's document listeners. */
	private pickerCleanup: (() => void) | null = null;
	/** Section ids the user has collapsed; kept for the life of the view. */
	private readonly collapsed = new Set<string>();
	/** The `ParsedItem` behind each rendered `.cp-item` row. */
	private readonly rowItem = new WeakMap<HTMLElement, ParsedItem>();
	/** Day bands by note path, so a re-render can skip re-reading the file. */
	private readonly previewCache = new Map<string, PreviewEntry>();
	/** The settings the cached bands were built under — see `previewShape`. */
	private previewShapeKey = '';
	/** Band containers by note path, for refilling one day after a live edit. */
	private readonly previewCells = new Map<string, HTMLElement>();
	/** Guards a slow preview load against a grid that has since been rebuilt. */
	private gridToken = 0;
	/** Pending band-overflow measurement, so a burst of fills measures once. */
	private bandMeasure: number | null = null;
	/** Each band's untrimmed text, so re-measuring never trims a trim. */
	private readonly bandFullText = new WeakMap<HTMLElement, string>();
	/** Canvas context for measuring band text; made on first use. */
	private measureCtx: CanvasRenderingContext2D | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: CalendarPlannerPlugin) {
		super(leaf);
		this.plugin = plugin;
		const now = new Date();
		this.viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
	}

	/** UI strings for the configured interface language. */
	private get s(): Strings {
		return translations[this.plugin.settings.language];
	}

	getViewType(): string {
		return VIEW_TYPE_CALENDAR;
	}

	getDisplayText(): string {
		return 'Calendar';
	}

	getIcon(): string {
		return 'calendar-days';
	}

	async onOpen(): Promise<void> {
		// Whether a band's text overflows depends on how wide a day column is,
		// so dragging the sidebar has to re-measure them.
		const observer = new ResizeObserver(() => this.scheduleBandMeasure());
		observer.observe(this.contentEl);
		this.register(() => observer.disconnect());

		this.render();
	}

	async onClose(): Promise<void> {
		if (this.bandMeasure !== null) {
			window.cancelAnimationFrame(this.bandMeasure);
			this.bandMeasure = null;
		}
		this.closePicker();
		this.discardMemoEdit();
		this.clearMemoRender();
		this.contentEl.empty();
	}

	/** Unload the components owning the free sections' markdown renders. */
	private clearMemoRender(): void {
		for (const comp of this.freeRenders.splice(0)) this.removeChild(comp);
	}

	/**
	 * Drop the free-form editor without saving. Emptying the panel takes its
	 * element away but not its document-level listeners, so CodeMirror has to be
	 * told to tear itself down.
	 */
	private discardMemoEdit(): void {
		this.memoEditing?.editor.destroy();
		this.memoEditing = null;
	}

	/** The sections configured for one kind of note, in order. */
	private specsFor(mode: PanelMode): readonly SectionSpec[] {
		return this.plugin.settings.sections[KIND_OF[mode]];
	}

	/**
	 * The sections of the note the panel is showing. Every edit the panel makes
	 * is to that note, so this is the list all of them parse and write against.
	 */
	private get specs(): readonly SectionSpec[] {
		return this.specsFor(this.panelTarget?.mode ?? 'day');
	}

	/** The note the panel target names, existing or not. */
	private noteFor(target: PanelTarget): NoteRef {
		const notes = createNoteResolver(this.app, this.plugin.settings);
		return notes[KIND_OF[target.mode]](target.date);
	}

	/** What to call the panel target's note in a menu item or a prompt. */
	private nounFor(mode: PanelMode): string {
		return {
			year: this.s.yearlyNoun,
			month: this.s.monthlyNoun,
			week: this.s.weeklyNoun,
			day: this.s.dailyNoun,
		}[mode];
	}

	/**
	 * Re-render from current state. `external` refreshes (file/settings changes
	 * from outside the view) are skipped while an inline edit is in progress so
	 * the input is not torn out (plan.md § 8); step 10 makes `isEditing` real.
	 */
	refresh(external: boolean): void {
		const active = this.editing ?? this.memoEditing;
		if (external && active) {
			const stillThere =
				this.app.vault.getAbstractFileByPath(active.file.path) instanceof
				TFile;
			if (!stillThere) {
				new Notice(this.s.editCancelledGone);
				this.editing = null;
				this.render();
			}
			// else: hold the render while the edit is in progress (plan.md § 8)
			return;
		}
		this.render();
	}

	/**
	 * Live text straight from an open editor, ahead of any save. Only the panel
	 * can be affected — the grid shows note *existence*, which typing cannot
	 * change — so repaint just that, and leave an in-panel edit alone.
	 */
	onEditorChange(path: string, content: string): void {
		// The grid's bands do change as the note is typed, and refilling one
		// cell disturbs nothing — so that half runs even mid-edit.
		this.refreshPreview(path, content);

		if (this.editing || this.memoEditing) return;
		const file = this.currentPanelFile;
		if (!file || file.path !== path) return;
		this.repaintPanel(file, content);
	}

	private shiftMonth(delta: number): void {
		this.setViewMonth(
			this.viewDate.getFullYear(),
			this.viewDate.getMonth() + delta,
		);
	}

	/** Show the grid for `year`/`month` (month is 0-based; out-of-range rolls over). */
	private setViewMonth(year: number, month: number): void {
		this.viewDate = new Date(year, month, 1);
		this.render();
	}

	private goToday(): void {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		this.viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
		// Same as clicking today's cell: move the month AND select the day.
		this.selectCell('day', today);
	}

	private render(): void {
		this.editing = null;
		this.discardMemoEdit();
		this.clearMemoRender();
		this.closePicker();
		const root = this.contentEl;
		root.empty();
		root.addClass('calendar-planner');
		// How a checked item looks is the user's choice; drive it from the root
		// so every row picks it up without a per-row class.
		root.toggleClass(
			'cp-done-strike',
			this.plugin.settings.doneStrikethrough,
		);
		root.toggleClass('cp-done-dim', this.plugin.settings.doneDim);
		const overflow = this.plugin.settings.bandOverflow;
		root.toggleClass('cp-band-fade', overflow === 'fade');
		root.toggleClass('cp-band-clip', overflow === 'ellipsis');
		// The weekend colours are user-chosen, so they cannot live in the
		// stylesheet; hand them to it as custom properties instead. Unset means
		// the theme's own weekday colour, which is how the calendar starts.
		const faint = 'var(--text-faint)';
		root.setCssProps({
			'--cp-sat-color': this.plugin.settings.saturdayColor || faint,
			'--cp-sun-color': this.plugin.settings.sundayColor || faint,
		});

		this.renderHeader(root);
		this.renderGrid(root);
		root.createDiv({ cls: 'cp-divider' });
		const panel = root.createDiv({ cls: 'cp-panel' });
		void this.fillPanel(panel);
	}

	private renderHeader(parent: HTMLElement): void {
		const header = parent.createDiv({ cls: 'cp-header' });

		const title = header.createDiv({ cls: 'cp-title' });

		// Each label fills the panel with its own note, exactly as a day or week
		// cell does; the one caret opens the date picker.
		const month = title.createSpan({
			cls: 'cp-month is-link',
			text: this.s.monthLabel(this.viewDate.getMonth() + 1),
		});
		this.wireNoteLink(month, 'month');

		const yearPart = title.createDiv({ cls: 'cp-title-part' });
		const year = yearPart.createSpan({
			cls: 'cp-year is-link',
			text: String(this.viewDate.getFullYear()),
		});
		this.wireNoteLink(year, 'year');
		this.wirePicker(yearPart.createSpan({ cls: 'cp-pick' }));

		const nav = header.createDiv({ cls: 'cp-nav' });

		const prev = nav.createSpan({ cls: 'cp-nav-btn' });
		setIcon(prev, 'chevron-left');
		prev.setAttr('aria-label', this.s.prevMonth);
		prev.addEventListener('click', () => this.shiftMonth(-1));

		const today = nav.createSpan({
			cls: 'cp-nav-btn cp-nav-today',
			text: this.s.today,
		});
		today.addEventListener('click', () => this.goToday());

		const next = nav.createSpan({ cls: 'cp-nav-btn' });
		setIcon(next, 'chevron-right');
		next.setAttr('aria-label', this.s.nextMonth);
		next.addEventListener('click', () => this.shiftMonth(1));
	}

	/**
	 * Make a header label show its yearly / monthly note in the panel — the same
	 * gesture as clicking a day or a week number, so every kind of planner note
	 * is read and edited in the one place. The panel title above the sections
	 * opens the note itself, and right-click / long-press gives the same menu the
	 * grid cells have.
	 */
	private wireNoteLink(el: HTMLElement, mode: 'year' | 'month'): void {
		const date = this.viewDate;
		const target = this.panelTarget;
		el.setAttr('role', 'button');
		el.setAttr('aria-label', this.s.showInPanel(this.nounFor(mode)));
		el.tabIndex = 0;
		// No note-exists marker here: the header labels are always on screen, so
		// a mark under them would read as chrome rather than as news about one
		// date. The grid is where note existence is worth showing.
		el.toggleClass(
			'is-active',
			target?.mode === mode &&
				target.date.getFullYear() === date.getFullYear() &&
				(mode === 'year' || target.date.getMonth() === date.getMonth()),
		);

		const select = (): void => {
			if (this.consumeSuppressedClick()) return;
			this.selectCell(mode, date);
		};
		el.addEventListener('click', select);
		el.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter' || evt.key === ' ') {
				evt.preventDefault();
				select();
			}
		});
		this.attachContextMenu(el, () => this.buildCellMenu(mode, date));
	}

	/** Make the header caret open the date picker on click / Enter / Space. */
	private wirePicker(el: HTMLElement): void {
		setIcon(el, 'chevron-down');
		el.setAttr('role', 'button');
		el.setAttr('aria-haspopup', 'dialog');
		el.setAttr('aria-label', this.s.pickDate);
		el.tabIndex = 0;
		el.addEventListener('click', () => this.openPicker(el));
		el.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter' || evt.key === ' ') {
				evt.preventDefault();
				this.openPicker(el);
			}
		});
	}

	private closePicker(): void {
		this.pickerCleanup?.();
		this.pickerCleanup = null;
		this.picker?.remove();
		this.picker = null;
	}

	/** Open (or, if already open on this trigger, toggle closed) a grid picker. */
	private openPicker(anchor: HTMLElement): void {
		const wasOpen = this.picker !== null;
		this.closePicker();
		if (wasOpen) return; // the caret toggles

		const pop = this.contentEl.createDiv({ cls: 'cp-picker' });
		this.picker = pop;
		this.buildPicker(pop, this.viewDate.getFullYear());

		// Below the trigger, clamped to the sidebar's inner width.
		const top = anchor.offsetTop + anchor.offsetHeight + 6;
		let left = anchor.offsetLeft;
		const maxLeft = this.contentEl.clientWidth - pop.offsetWidth - 10;
		if (left > maxLeft) left = Math.max(10, maxLeft);
		pop.setCssStyles({ top: `${top}px`, left: `${left}px` });

		const ac = new AbortController();
		const opts = { signal: ac.signal };
		document.addEventListener(
			'pointerdown',
			(e) => {
				const t = e.target as Node;
				if (!pop.contains(t) && !anchor.contains(t)) this.closePicker();
			},
			{ ...opts, capture: true },
		);
		document.addEventListener(
			'keydown',
			(e) => {
				if (e.key === 'Escape') {
					e.preventDefault();
					this.closePicker();
					anchor.focus();
				}
			},
			opts,
		);
		this.contentEl.addEventListener(
			'scroll',
			() => this.closePicker(),
			opts,
		);
		this.pickerCleanup = (): void => ac.abort();
	}

	/**
	 * One popover for both halves of the date: the year on a nav row, the twelve
	 * months in a grid under it. Stepping the year only redraws the popover —
	 * the calendar moves when a month is chosen, so a single click always lands
	 * on a definite month.
	 */
	private buildPicker(pop: HTMLElement, year: number): void {
		pop.empty();

		const head = pop.createDiv({ cls: 'cp-picker-head' });
		const step = (delta: number): void => this.buildPicker(pop, year + delta);

		const prev = head.createEl('button', { cls: 'cp-picker-nav' });
		setIcon(prev, 'chevron-left');
		prev.setAttr('aria-label', this.s.prevYear);
		prev.addEventListener('click', () => step(-1));

		head.createSpan({ cls: 'cp-picker-range', text: String(year) });

		const next = head.createEl('button', { cls: 'cp-picker-nav' });
		setIcon(next, 'chevron-right');
		next.setAttr('aria-label', this.s.nextYear);
		next.addEventListener('click', () => step(1));

		const grid = pop.createDiv({ cls: 'cp-picker-grid' });
		const shownYear = this.viewDate.getFullYear();
		const shownMonth = this.viewDate.getMonth();
		const now = new Date();

		for (let m = 0; m < 12; m++) {
			const cell = grid.createEl('button', {
				cls: 'cp-picker-cell',
				text: this.s.monthLabel(m + 1),
			});
			cell.toggleClass(
				'is-current',
				year === shownYear && m === shownMonth,
			);
			cell.toggleClass(
				'is-today',
				year === now.getFullYear() && m === now.getMonth(),
			);
			cell.addEventListener('click', () => {
				this.closePicker();
				this.setViewMonth(year, m);
			});
		}
	}

	private renderGrid(parent: HTMLElement): void {
		const { weekStart, showWeekNumbers, showNoteDot } = this.plugin.settings;

		const preview = this.plugin.settings.showDayPreview;
		const token = ++this.gridToken;
		this.previewCells.clear();

		// A cached day was read under the settings in force at the time. When
		// those change — a section switched off the calendar, renamed, retyped,
		// or "hide checked items" flipped — every entry is answering the old
		// question, so the lot goes and each day on screen is read again. That
		// is what makes the eye toggle reach notes written long ago and not
		// just the next one edited.
		const shape = this.previewShape();
		if (shape !== this.previewShapeKey) {
			this.previewCache.clear();
			this.previewShapeKey = shape;
		}
		// Days whose bands are not in the cache; read after the grid is up, so
		// the calendar is never waiting on file I/O to appear.
		const pending: { file: TFile; box: HTMLElement }[] = [];

		const grid = parent.createDiv({ cls: 'cp-grid' });
		grid.toggleClass('has-weeknum', showWeekNumbers);
		grid.toggleClass('has-preview', preview);
		if (preview) {
			// How many chip lines every day cell reserves — the stylesheet
			// builds the fixed cell height out of this, so a busy day and an
			// empty one come out exactly the same size.
			grid.setCssProps({
				'--cp-day-slots': String(
					Math.max(1, this.plugin.settings.dayPreviewMax),
				),
			});
		}

		if (showWeekNumbers) {
			grid.createDiv({
				cls: 'cp-weekhead cp-weekhead-w',
				text: this.s.weekColHeader,
			});
		}
		for (let i = 0; i < 7; i++) {
			const day = (weekStart + i) % 7;
			const head = grid.createDiv({
				cls: 'cp-weekhead',
				text: this.s.weekdayShort[day]!,
			});
			// Tagged by the real weekday, not the column, so the colours follow
			// the labels when the week starts on Monday.
			head.toggleClass('is-sun', day === 0);
			head.toggleClass('is-sat', day === 6);
		}

		const weeks = buildMonthGrid(
			this.viewDate.getFullYear(),
			this.viewDate.getMonth(),
			weekStart,
			new Date(),
		);

		const target = this.panelTarget;
		const highlightDay = target?.mode === 'day' ? target.date : null;
		// Only a week selection lights up the W column — a day selection does not.
		const highlightWeek =
			target?.mode === 'week' ? weekInfo(target.date, weekStart) : null;
		const todayWeek = weekInfo(new Date(), weekStart);

		// One resolver per render: probes note existence + content via the
		// metadata cache only (no file reads), so ~48 lookups stay cheap.
		const notes = createNoteResolver(this.app, this.plugin.settings);

		for (const week of weeks) {
			if (showWeekNumbers) {
				const anchor = week.days[0]!.date;
				const wc = grid.createDiv({
					cls: 'cp-weeknum is-clickable',
				});

				wc.createSpan({
					cls: 'cp-weeknum-num',
					text: String(week.week),
				});
				if (
					highlightWeek &&
					highlightWeek.week === week.week &&
					highlightWeek.weekYear === week.weekYear
				) {
					wc.addClass('is-current');
				}
				if (
					todayWeek.week === week.week &&
					todayWeek.weekYear === week.weekYear
				) {
					wc.addClass('is-today-week');
				}
				// A sibling of the number, not a child of it: the marker sits
				// in normal flow just below the number (see .cp-marker).
				if (showNoteDot && notes.weekly(anchor).file) {
					wc.createSpan({ cls: 'cp-marker' });
				}
				wc.addEventListener('click', () => {
					if (this.consumeSuppressedClick()) return;
					this.selectCell('week', anchor);
				});
				this.attachContextMenu(wc, () =>
					this.buildCellMenu('week', anchor),
				);
			}

			for (const d of week.days) {
				const cell = grid.createDiv({ cls: 'cp-day' });
				cell.toggleClass('is-outside', !d.inCurrentMonth);
				cell.toggleClass('is-today', d.isToday);
				if (highlightDay && isSameDay(d.date, highlightDay)) {
					cell.addClass('is-selected');
				}
				cell.createSpan({
					cls: 'cp-day-num',
					text: String(d.day),
				});
				const note = notes.daily(d.date).file;
				// A sibling of the number, flowing just below it — not an
				// overlay on it (see .cp-marker). Added before the preview box
				// so it lands between the number and the day's bands.
				if (showNoteDot && note) cell.createSpan({ cls: 'cp-marker' });
				if (preview && note) {
					const box = cell.createDiv({ cls: 'cp-day-preview' });
					this.previewCells.set(note.path, box);
					const hit = this.previewCache.get(note.path);
					if (hit && hit.mtime === note.stat.mtime) {
						this.fillPreview(box, note, hit.items);
					} else {
						pending.push({ file: note, box });
					}
				}
				cell.addEventListener('click', () => {
					if (this.consumeSuppressedClick()) return;
					this.selectCell('day', d.date);
				});
				this.attachContextMenu(cell, () =>
					this.buildCellMenu('day', d.date),
				);
			}
		}

		if (pending.length > 0) void this.loadPreviews(pending, token);
	}

	/* ---- day preview bands ------------------------------------------------ */

	/**
	 * Read the days the cache had nothing for and fill their bands in. Done
	 * after the grid is on screen and one file at a time: `cachedRead` is
	 * cheap, but a month is up to 42 of them, and the calendar must not block
	 * on any of it. A newer render abandons the run.
	 */
	private async loadPreviews(
		pending: { file: TFile; box: HTMLElement }[],
		token: number,
	): Promise<void> {
		for (const { file, box } of pending) {
			if (token !== this.gridToken) return;
			let content: string;
			try {
				content = await this.app.vault.cachedRead(file);
			} catch {
				continue; // unreadable — that day just shows no bands
			}
			if (token !== this.gridToken) return;

			const items = this.previewItemsFrom(content);
			this.rememberPreview(file.path, file.stat.mtime, items);
			if (box.isConnected) this.fillPreview(box, file, items);
		}
	}

	/**
	 * Ask for the bands to be re-trimmed, once, after the current burst of
	 * work. Bands arrive a cell at a time as their files are read, and
	 * measuring on each one would mean a forced layout per cell.
	 */
	private scheduleBandMeasure(): void {
		if (this.plugin.settings.bandOverflow !== 'ellipsis') return;
		if (this.bandMeasure !== null) return;
		this.bandMeasure = window.requestAnimationFrame(() => {
			this.bandMeasure = null;
			this.trimBands();
		});
	}

	/** A canvas context set to the font the bands are drawn in. */
	private bandMeasurer(sample: HTMLElement): CanvasRenderingContext2D | null {
		this.measureCtx ??= createEl('canvas').getContext('2d');
		if (!this.measureCtx) return null;
		const style = getComputedStyle(sample);
		this.measureCtx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
		return this.measureCtx;
	}

	/**
	 * Cut each band's text to its column and mark the cut with "..".
	 *
	 * The text is really shortened rather than clipped or covered over, so it
	 * ends on a whole character. The untouched original stays in the band's
	 * tooltip, and in `bandFullText` so that a later re-measure — after the
	 * sidebar is resized — starts from the full string rather than from an
	 * already-trimmed one.
	 *
	 * Every width is read before anything is written: interleaving the two
	 * would cost the grid one layout per band instead of one in total.
	 */
	private trimBands(): void {
		const texts = Array.from(
			this.contentEl.querySelectorAll<HTMLElement>('.cp-band-text'),
		);
		if (texts.length === 0) return;

		const widths = texts.map((el) => el.clientWidth);
		const ctx = this.bandMeasurer(texts[0]!);
		if (!ctx) return; // no canvas — leave the text alone, CSS still clips
		const measure = (text: string): number => ctx.measureText(text).width;

		texts.forEach((el, i) => {
			let full = this.bandFullText.get(el);
			if (full === undefined) {
				full = el.textContent ?? '';
				this.bandFullText.set(el, full);
			}
			el.setText(trimToWidth(measure, full, widths[i]!));
		});
	}

	/**
	 * Everything about the settings that decides *which* items a day's bands
	 * hold, as one comparable string. `dayPreviewMax` is deliberately absent:
	 * it only trims the list at paint time, so changing it needs no re-read.
	 */
	private previewShape(): string {
		const { sections, dayPreviewHideDone } = this.plugin.settings;
		const daily = sections.daily.map(
			(spec) =>
				`${spec.id}|${spec.heading}|${spec.type}|${
					spec.inCalendar !== false
				}`,
		);
		return `${dayPreviewHideDone}#${daily.join('#')}`;
	}

	private rememberPreview(
		path: string,
		mtime: number,
		items: PreviewItem[],
	): void {
		if (this.previewCache.size > PREVIEW_CACHE_MAX) this.previewCache.clear();
		this.previewCache.set(path, { mtime, items });
	}

	/**
	 * The bands a daily note's text produces: top-level items of the sections
	 * the user left switched on. Nested items are detail that a band has no
	 * room for, and a free section has no items at all.
	 */
	private previewItemsFrom(content: string): PreviewItem[] {
		const specs = this.plugin.settings.sections.daily;
		const hideDone = this.plugin.settings.dayPreviewHideDone;
		const parsed = parseNote(content, specs);
		const out: PreviewItem[] = [];

		for (const spec of specs) {
			if (spec.type === 'free' || spec.inCalendar === false) continue;
			const section = parsed.sections.get(spec.id);
			if (!section) continue;
			for (const item of section.items) {
				if (item.depth > 0) continue;
				if (hideDone && item.checked) continue;
				// The trailing date / time is the panel's to show, not the
				// calendar's: the band already sits under the date it belongs to.
				const text = bandText(splitItemTime(item.text).body);
				if (text === '') continue; // an image-only item has nothing to show
				out.push({
					text,
					checked: item.checked,
					style: item.kind,
					line: item.line,
					raw: item.raw,
				});
			}
		}
		return out;
	}

	/**
	 * Draw one day's bands. The full text goes on as an aria-label too, since a
	 * day column rarely has room for all of it and the tooltip is what the
	 * ellipsis leaves out. A checklist band gets a real checkbox, wired to the
	 * source line the same way the panel's rows are.
	 */
	private fillPreview(
		box: HTMLElement,
		file: TFile,
		items: PreviewItem[],
	): void {
		box.empty();
		const editable = this.plugin.settings.allowPanelEditing;
		const slots = Math.max(1, this.plugin.settings.dayPreviewMax);
		// The cell reserves exactly `slots` lines. When there is more than that
		// to say, the last line becomes the counter instead of a chip — adding
		// it as an extra line would make the busiest day taller than the rest,
		// which is the one thing the grid must not do.
		const shown = items.length > slots ? slots - 1 : items.length;

		for (const item of items.slice(0, shown)) {
			const band = box.createDiv({ cls: 'cp-band' });
			band.addClass(
				item.style === 'checklist' ? 'is-checklist' : 'is-list',
			);
			band.toggleClass('is-done', item.checked);
			band.setAttr('aria-label', item.text);

			if (item.style === 'checklist') {
				const check = band.createEl('input', {
					cls: 'cp-band-check',
					type: 'checkbox',
				});
				check.checked = item.checked;
				check.disabled = !editable;
				if (editable) {
					check.addEventListener('click', (evt) => {
						// Don't flip it here and don't let the click reach the
						// day cell: the bands are redrawn from the file once
						// the write lands.
						evt.preventDefault();
						evt.stopPropagation();
						void this.toggleBand(file, item);
					});
				}
			}

			band.createSpan({ cls: 'cp-band-text', text: item.text });
		}

		const hidden = items.slice(shown);
		if (hidden.length > 0) {
			const more = box.createDiv({
				cls: 'cp-band-more',
				text: `+${hidden.length}`,
			});
			// What the counter stands for, on hover. Bulleted as well as
			// newline-separated so it still reads as a list wherever the
			// tooltip collapses the line breaks.
			more.setAttr(
				'aria-label',
				hidden.map((item) => `• ${item.text}`).join('\n'),
			);
		}

		this.scheduleBandMeasure();
	}

	/**
	 * Flip the task a band stands for. `toggleTodo` matches the line's exact
	 * text first, so a band drawn from a preview that has since gone stale
	 * aborts rather than rewriting the wrong line.
	 */
	private async toggleBand(file: TFile, item: PreviewItem): Promise<void> {
		const res = await writeBack(this.app, file, (data) =>
			toggleTodo(data, item.line, item.raw),
		);
		if (!res.ok || res.content === null) {
			new Notice(this.s.editCancelledChanged);
			this.render();
			return;
		}
		this.afterPanelWrite(file, res.content);
		// The same note may also be the one open in the panel below.
		if (this.currentPanelFile?.path === file.path) {
			this.repaintPanel(file, res.content);
		}
	}

	/**
	 * Redraw one day's bands from text that has not reached disk yet — an open
	 * editor's buffer, or a write this view just made. Only a day already on
	 * screen is worth doing, and its `stat.mtime` is still the saved one, which
	 * is what makes this entry win until the file lands and the mtime moves on.
	 */
	private refreshPreview(path: string, content: string): void {
		if (!this.plugin.settings.showDayPreview) return;
		const box = this.previewCells.get(path);
		if (!box?.isConnected) return;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;

		const items = this.previewItemsFrom(content);
		this.rememberPreview(path, file.stat.mtime, items);
		this.fillPreview(box, file, items);
	}

	/**
	 * What every panel edit does with the text it just wrote.
	 *
	 * Claiming the write stops the vault's echo from repainting a panel that is
	 * already showing the change — but the grid draws from that same note, and
	 * nothing else is going to tell it. So the bands are refilled from the text
	 * in hand, here, rather than waiting for a refresh that will never come.
	 */
	private afterPanelWrite(file: TFile, content: string): void {
		this.plugin.markOwnWrite(file.path, content);
		this.refreshPreview(file.path, content);
	}

	private consumeSuppressedClick(): boolean {
		if (!this.suppressClick) return false;
		this.suppressClick = false;
		return true;
	}

	/**
	 * Wire a right-click / long-press context menu onto `el`. Desktop uses the
	 * `contextmenu` event; mobile can't rely on it (plan.md pitfall E) so a
	 * 400 ms long-press with a 10 px move tolerance is implemented by hand, and
	 * the click that trails the long-press is suppressed.
	 */
	private attachContextMenu(el: HTMLElement, build: () => Menu): void {
		el.addEventListener('contextmenu', (evt) => {
			evt.preventDefault();
			build().showAtMouseEvent(evt);
		});

		let timer: number | null = null;
		let sx = 0;
		let sy = 0;
		const clearTimer = (): void => {
			if (timer !== null) {
				window.clearTimeout(timer);
				timer = null;
			}
		};

		el.addEventListener(
			'touchstart',
			(evt) => {
				this.suppressClick = false;
				clearTimer();
				if (evt.touches.length !== 1) return;
				const t = evt.touches[0]!;
				sx = t.clientX;
				sy = t.clientY;
				timer = window.setTimeout(() => {
					timer = null;
					this.suppressClick = true;
					build().showAtPosition({ x: sx, y: sy });
				}, 400);
			},
			{ passive: true },
		);
		el.addEventListener(
			'touchmove',
			(evt) => {
				if (timer === null) return;
				const t = evt.touches[0];
				if (
					t &&
					(Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10)
				) {
					clearTimer();
				}
			},
			{ passive: true },
		);
		el.addEventListener('touchend', clearTimer);
		el.addEventListener('touchcancel', clearTimer);
	}

	private buildCellMenu(mode: PanelMode, date: Date): Menu {
		const menu = new Menu();
		const settings = this.plugin.settings;
		const ref = this.noteFor({ mode, date });
		const noun = this.nounFor(mode);

		if (ref.file) {
			const file = ref.file;
			menu.addItem((item) =>
				item
					.setTitle(this.s.goToNote(noun))
					.setIcon('go-to-file')
					.onClick(() => {
						void openNote(this.app, file, settings.openLocation);
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle(this.s.openInNewTab)
					.setIcon('lucide-external-link')
					.onClick(() => {
						void openNote(this.app, file, 'new-tab');
					}),
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle(this.s.deleteNote)
					.setIcon('lucide-trash-2')
					.setWarning(true)
					.onClick(() => {
						void this.deleteNote(file);
					}),
			);
		} else {
			menu.addItem((item) =>
				item
					.setTitle(this.s.createNoteItem(noun))
					.setIcon('lucide-file-plus')
					.onClick(() => {
						void this.createAndShow(mode, date);
					}),
			);
		}

		return menu;
	}

	/** Delete the note behind a cell, via Obsidian's own confirmation + trash. */
	private async deleteNote(file: TFile): Promise<void> {
		const deleted = await this.app.fileManager.promptForDeletion(file);
		if (deleted) this.render();
	}

	/**
	 * Select a cell and fill the panel. A missing note is NOT prompted for here —
	 * the panel just shows the "no note" state; the user creates it explicitly via
	 * the panel title or a section's `+` (or the right-click menu).
	 */
	private selectCell(mode: PanelMode, date: Date): void {
		this.panelTarget = { mode, date };
		this.render();
	}

	/** Create the target's note (template-aware) and show it in the panel. */
	private async createAndShow(mode: PanelMode, date: Date): Promise<void> {
		try {
			const file = await createPlannerNote(
				this.app,
				this.plugin.settings,
				KIND_OF[mode],
				date,
			);
			new Notice(this.s.noteCreated(file.path));
		} catch (err) {
			new Notice(this.s.noteCreateFailed(String(err)));
			return;
		}
		this.panelTarget = { mode, date };
		this.render();
	}

	private async fillPanel(panel: HTMLElement): Promise<void> {
		const token = ++this.panelToken;
		const target = this.panelTarget;

		if (!target) {
			panel.createDiv({
				cls: 'cp-panel-empty',
				text: this.s.panelPrompt,
			});
			return;
		}

		const { weekStart } = this.plugin.settings;
		const ref = this.noteFor(target);

		this.renderPanelHeader(panel, target, weekStart);

		if (!ref.file) {
			this.currentPanelFile = null;
			if (this.plugin.settings.allowPanelEditing) {
				for (const spec of this.specs) {
					if (spec.type === 'free') {
						this.renderFreeSection(
							panel,
							spec,
							null,
							null,
							null,
							target,
						);
					} else {
						this.renderSectionShell(panel, spec, target);
					}
				}
			}
			this.flushPendingAdd();
			return;
		}

		let content: string;
		try {
			content = await readNote(this.app, ref.file);
		} catch {
			if (token === this.panelToken && panel.isConnected) {
				panel.createDiv({
					cls: 'cp-panel-empty',
					text: this.s.noteUnreadable,
				});
			}
			return;
		}
		if (token !== this.panelToken || !panel.isConnected) return;

		this.currentPanelFile = ref.file;
		this.renderSections(panel, ref.file, content);
		this.flushPendingAdd();
	}

	private flushPendingAdd(): void {
		const sectionId = this.pendingAdd;
		this.pendingAdd = null;
		if (sectionId === null || !this.currentPanelFile) return;
		const spec = specById(this.specs, sectionId);
		if (!spec) return;
		const wrap = this.contentEl.querySelector<HTMLElement>(
			`.cp-section[data-kind="${sectionId}"]`,
		);
		if (!wrap) return;
		if (spec.type === 'free') {
			this.beginMemoEdit(this.currentPanelFile, sectionId, wrap, '');
		} else {
			this.beginAdd(this.currentPanelFile, spec, wrap);
		}
	}

	/** Re-render just the panel body from freshly written text, bypassing cachedRead
	 *  (which can lag an open editor by the save debounce). */
	private repaintPanel(file: TFile, content: string): void {
		const panel = this.contentEl.querySelector<HTMLElement>('.cp-panel');
		if (!panel || !this.panelTarget) return;
		this.editing = null;
		this.discardMemoEdit();
		this.clearMemoRender();
		this.currentPanelFile = file;
		panel.empty();
		this.renderPanelHeader(
			panel,
			this.panelTarget,
			this.plugin.settings.weekStart,
		);
		this.renderSections(panel, file, content);
	}

	private renderSections(
		panel: HTMLElement,
		file: TFile,
		content: string,
	): void {
		const parsed = parseNote(content, this.specs);
		for (const spec of this.specs) {
			const section = parsed.sections.get(spec.id) ?? null;
			if (spec.type === 'free') {
				this.renderFreeSection(
					panel,
					spec,
					file,
					content,
					section,
					this.panelTarget!,
				);
			} else {
				this.renderSection(panel, spec, section, file);
			}
		}
	}

	private async toggleCheckbox(file: TFile, item: ParsedItem): Promise<void> {
		const res = await writeBack(this.app, file, (data) =>
			toggleTodo(data, item.line, item.raw),
		);
		if (!res.ok || res.content === null) {
			new Notice(this.s.editCancelledChanged);
			this.render();
			return;
		}
		this.afterPanelWrite(file, res.content);
		this.repaintPanel(file, res.content);
	}

	private renderPanelHeader(
		panel: HTMLElement,
		target: PanelTarget,
		weekStart: WeekStart,
	): void {
		const head = panel.createDiv({ cls: 'cp-panel-head' });

		if (target.mode === 'year') {
			this.addTitleLink(head, String(target.date.getFullYear()), target);
			return;
		}

		if (target.mode === 'month') {
			const d = target.date;
			this.addTitleLink(
				head,
				`${this.s.monthLabel(d.getMonth() + 1)} ${d.getFullYear()}`,
				target,
			);
			const link = head.createDiv({
				cls: 'cp-panel-sub is-link',
				text: String(d.getFullYear()),
			});
			link.setAttr('aria-label', this.s.showInPanel(this.s.yearlyNoun));
			link.addEventListener('click', () => {
				this.selectCell('year', d);
			});
			return;
		}

		if (target.mode === 'week') {
			const wi = weekInfo(target.date, weekStart);
			const { start, end } = weekRange(target.date, weekStart);
			this.addTitleLink(
				head,
				`${wi.weekYear} W${String(wi.week).padStart(2, '0')}`,
				target,
			);
			head.createDiv({
				cls: 'cp-panel-sub',
				text: `${start.getMonth() + 1}/${start.getDate()} – ${
					end.getMonth() + 1
				}/${end.getDate()}`,
			});
			return;
		}

		const d = target.date;
		this.addTitleLink(head, this.s.dayPanelTitle(d), target);
		const wi = weekInfo(d, weekStart);
		const link = head.createDiv({
			cls: 'cp-panel-sub is-link',
			text: `${wi.weekYear} W${String(wi.week).padStart(2, '0')}`,
		});
		link.setAttr('aria-label', this.s.viewThisWeek);
		link.addEventListener('click', () => {
			this.selectCell('week', d);
		});
	}

	/** The panel title — click it to open (or create then open) that note. */
	private addTitleLink(
		head: HTMLElement,
		text: string,
		target: PanelTarget,
	): void {
		const noun = this.nounFor(target.mode);
		const title = head.createDiv({ cls: 'cp-panel-title is-link', text });
		title.setAttr('aria-label', this.s.goToNote(noun));
		title.addEventListener('click', () => {
			void this.openTargetNote(target);
		});
	}

	/** Open the panel's note; if it does not exist yet, offer to create it first. */
	private async openTargetNote(target: PanelTarget): Promise<void> {
		const ref = this.noteFor(target);

		if (ref.file) {
			await openNote(
				this.app,
				ref.file,
				this.plugin.settings.openLocation,
			);
			return;
		}

		new CreateNoteModal(
			this.app,
			KIND_OF[target.mode],
			this.plugin.settings.language,
			(open) => {
				void this.createAndOpen(target, open);
			},
		).open();
	}

	/** Create the panel's note, refresh the panel, and open it if asked. */
	private async createAndOpen(
		target: PanelTarget,
		open: boolean,
	): Promise<void> {
		let file: TFile;
		try {
			file = await createPlannerNote(
				this.app,
				this.plugin.settings,
				KIND_OF[target.mode],
				target.date,
			);
			new Notice(this.s.noteCreated(file.path));
		} catch (err) {
			new Notice(this.s.noteCreateFailed(String(err)));
			return;
		}
		this.panelTarget = target;
		this.render();
		if (open) {
			await openNote(this.app, file, this.plugin.settings.openLocation);
		}
	}

	private buildSectionHead(
		wrap: HTMLElement,
		spec: SectionSpec,
		onAdd: (() => void) | null,
	): void {
		const label = spec.heading;
		const head = wrap.createDiv({ cls: 'cp-section-head' });
		head.toggleClass(
			'is-foldable',
			this.plugin.settings.sectionCollapsible,
		);

		if (this.plugin.settings.sectionCollapsible) {
			// Scoped per note kind: the same id in two kinds' section lists is
			// two different sections, and folding one should not fold the other.
			const key = `${this.panelTarget?.mode ?? 'day'}:${spec.id}`;
			wrap.toggleClass('is-collapsed', this.collapsed.has(key));
			const flip = (): void => {
				const now = !this.collapsed.has(key);
				this.collapsed[now ? 'add' : 'delete'](key);
				wrap.toggleClass('is-collapsed', now);
			};

			head
				.createSpan({ cls: 'cp-section-label', text: label })
				.addEventListener('click', flip);

			const toggle = head.createSpan({ cls: 'cp-section-toggle' });
			setIcon(toggle, 'chevron-down');
			toggle.addEventListener('click', flip);
		} else {
			head.createSpan({ cls: 'cp-section-label', text: label });
		}

		if (onAdd) {
			const add = head.createSpan({ cls: 'cp-section-add' });
			setIcon(add, 'plus');
			add.setAttr('aria-label', this.s.addTo(label));
			add.addEventListener('click', onAdd);
		}
	}

	private renderSection(
		panel: HTMLElement,
		spec: SectionSpec,
		section: ParsedSection | null,
		file: TFile,
	): void {
		const editable = this.plugin.settings.allowPanelEditing;

		const wrap = panel.createDiv({ cls: 'cp-section' });
		wrap.setAttribute('data-kind', spec.id);
		this.buildSectionHead(
			wrap,
			spec,
			editable ? () => this.beginAdd(file, spec, wrap) : null,
		);

		const items = section?.items ?? [];
		if (items.length === 0) return; // just the header + `+`, no "empty" label

		const list = wrap.createDiv({ cls: 'cp-items' });
		for (const item of items) {
			this.renderItem(list, item, file, spec.id);
		}
	}

	/** Section shell (label + add button) shown when the note does not exist yet. */
	private renderSectionShell(
		panel: HTMLElement,
		spec: SectionSpec,
		target: PanelTarget,
	): void {
		const wrap = panel.createDiv({ cls: 'cp-section' });
		wrap.setAttribute('data-kind', spec.id);
		this.buildSectionHead(wrap, spec, () =>
			this.createThenAdd(target, spec.id),
		);
	}

	/* ---- free sections: one Markdown text block each ----------------------- */

	private renderFreeSection(
		panel: HTMLElement,
		spec: SectionSpec,
		file: TFile | null,
		content: string | null,
		section: ParsedSection | null,
		target: PanelTarget,
	): void {
		const editable = this.plugin.settings.allowPanelEditing;
		const body =
			file && content && section ? sectionBodyText(content, section) : '';

		const wrap = panel.createDiv({ cls: 'cp-section cp-section-memo' });
		wrap.setAttribute('data-kind', spec.id);
		this.buildSectionHead(wrap, spec, null);

		const bodyEl = wrap.createDiv({ cls: 'cp-memo-body' });
		bodyEl.toggleClass('is-empty', body === '');
		if (body !== '') {
			const md = bodyEl.createDiv({
				cls: 'cp-memo-md markdown-rendered',
			});
			const comp = new Component();
			this.addChild(comp); // loads it; unloaded on the next render
			this.freeRenders.push(comp);
			void MarkdownRenderer.render(
				this.app,
				body,
				md,
				file ? file.path : '',
				comp,
			).then(() => {
				if (file) this.wireMemoEmbeds(md, file.path);
				if (file && editable) {
					this.wireMemoTasks(md, file, spec.id, body);
				}
			});
		}

		if (!editable) return;
		bodyEl.addClass('is-editable');
		bodyEl.setAttr('aria-label', this.s.editSection(spec.heading));

		// Dropping on a section that is merely displayed appends to it straight
		// away, so a drag never has to be preceded by a click. It writes to the
		// note rather than opening the editor: `setSectionBody` checks the body
		// it was given against the file first, so a section that changed
		// underneath aborts instead of overwriting. (An open editor has its own
		// handler on the CodeMirror DOM, which stops the event here.)
		if (file) {
			this.acceptImageDrop(bodyEl, file, (links) => {
				const added = links.join('\n');
				// A drop can land on this element's padding, outside the
				// editor's own box, while that editor is open and holding
				// unsaved text. Writing the file from here would be writing
				// behind its back, so hand the links to it instead.
				const open = this.memoEditing;
				if (
					open &&
					open.sectionId === spec.id &&
					open.file.path === file.path
				) {
					open.editor.insert(added);
					return;
				}
				void this.applyMemo(
					file,
					spec.id,
					body === '' ? added : `${body}\n${added}`,
					body,
				);
			});
		}
		bodyEl.addEventListener('click', (evt) => {
			if (this.editing || this.memoEditing) return;
			// Let interactive bits of the rendered Markdown do their own thing —
			// the code-block "Copy" button, links, task checkboxes.
			if (
				(evt.target as HTMLElement).closest(
					'a, button, input, .copy-code-button',
				)
			) {
				return;
			}
			if (file) this.beginMemoEdit(file, spec.id, wrap, body);
			else this.createThenAdd(target, spec.id);
		});
	}

	/**
	 * Show the images a Memo embeds. `MarkdownRenderer.render` leaves `![[…]]`
	 * as an empty `<span class="internal-embed">` placeholder — the embed is
	 * only filled in by the machinery behind a real markdown view, which a
	 * plugin-owned container does not have — so resolve the link against the
	 * note and build the `<img>` here. Markdown-style `![](…)` images arrive as
	 * an `<img>` whose src is still a vault path, so those need the same fix.
	 */
	private wireMemoEmbeds(md: HTMLElement, sourcePath: string): void {
		const resolve = (linkpath: string): TFile | null => {
			const target = this.app.metadataCache.getFirstLinkpathDest(
				linkpath,
				sourcePath,
			);
			if (!target) return null;
			return IMAGE_EXTENSIONS.has(target.extension.toLowerCase())
				? target
				: null;
		};

		md.querySelectorAll<HTMLElement>('.internal-embed[src]').forEach(
			(span) => {
				const [link = '', alias] = (
					span.getAttribute('src') ?? ''
				).split('|');
				// Only a fallback: if this Obsidian build already filled the
				// embed in, leave its own image alone.
				if (span.querySelector('img')) return;
				const target = resolve(link);
				if (!target) return;

				span.empty();
				span.addClasses(['image-embed', 'is-loaded']);
				const img = span.createEl('img', {
					attr: {
						src: this.app.vault.getResourcePath(target),
						alt: target.name,
					},
				});
				applyEmbedSize(img, alias);
			},
		);

		md.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
			const src = img.getAttribute('src') ?? '';
			if (src === '' || HAS_SCHEME_RE.test(src) || src.startsWith('/')) {
				return;
			}
			const target = resolve(decodeURIComponent(src));
			if (target) img.setAttr('src', this.app.vault.getResourcePath(target));
		});
	}

	/**
	 * Make the checkboxes of a rendered Memo body write back. `MarkdownRenderer`
	 * emits them as plain (disabled) inputs — nothing binds them to the file the
	 * way reading view does — so clicking one only moved the DOM's own state and
	 * the next repaint threw it away. Each box is addressed by its index among
	 * the rendered checkboxes, which `toggleSectionTask` maps back to a source line.
	 */
	private wireMemoTasks(
		md: HTMLElement,
		file: TFile,
		sectionId: string,
		body: string,
	): void {
		const boxes = md.querySelectorAll<HTMLInputElement>(
			'input[type="checkbox"]',
		);
		boxes.forEach((box, index) => {
			box.removeAttribute('disabled');
			box.addClass('cp-memo-task');
			box.addEventListener('click', (evt) => {
				// Don't let the browser flip it: the panel repaints from the file
				// once the write lands, so the box never shows an unsaved state.
				evt.preventDefault();
				evt.stopPropagation();
				if (this.editing || this.memoEditing) return;
				void this.toggleMemoCheckbox(file, sectionId, body, index);
			});
		});
	}

	private async toggleMemoCheckbox(
		file: TFile,
		sectionId: string,
		body: string,
		index: number,
	): Promise<void> {
		const res = await writeBack(this.app, file, (data) =>
			toggleSectionTask(data, this.specs, sectionId, index, body),
		);
		if (!res.ok || res.content === null) {
			new Notice(this.s.editCancelledChanged);
			this.render();
			return;
		}
		this.afterPanelWrite(file, res.content);
		this.repaintPanel(file, res.content);
	}

	private beginMemoEdit(
		file: TFile,
		sectionId: string,
		wrap: HTMLElement,
		original: string,
	): void {
		if (this.editing) this.closeEdit(true);
		const bodyEl = wrap.querySelector<HTMLElement>('.cp-memo-body');
		if (!bodyEl) return;
		bodyEl.empty();
		bodyEl.removeClass('is-editable');
		bodyEl.addClass('is-editing');

		const editor = createLiveEditor(bodyEl, original, {
			imageUrl: (target) => this.resolveImageUrl(target, file.path),
			commit: () => this.closeMemoEdit(),
			cancel: () => {
				if (this.memoEditing) this.memoEditing.cancelled = true;
				this.closeMemoEdit();
			},
		});

		this.memoEditing = {
			file,
			sectionId,
			wrap,
			editor,
			original,
			cancelled: false,
		};

		editor.focus();
		editor.selectEnd();
		bodyEl.scrollIntoView({ block: 'nearest' });

		editor.dom.addEventListener('paste', (evt) => {
			const images = transferImages(evt.clipboardData);
			if (images.length === 0) return; // ordinary paste — let it happen
			evt.preventDefault();
			void this.pasteImages(file, editor, images);
		});

		// Dropping onto the open editor puts the images at the caret, the same
		// place a paste would.
		this.acceptImageDrop(editor.dom, file, (links) => {
			if (this.memoEditing?.editor !== editor) return;
			editor.insert(links.join('\n'));
		});
	}

	/** A loadable URL for an image the editor is previewing, or null. */
	private resolveImageUrl(target: string, sourcePath: string): string | null {
		if (target === '') return null;
		if (HAS_SCHEME_RE.test(target)) return target; // already an address
		const file = this.app.metadataCache.getFirstLinkpathDest(
			target,
			sourcePath,
		);
		if (!file) return null;
		return IMAGE_EXTENSIONS.has(file.extension.toLowerCase())
			? this.app.vault.getResourcePath(file)
			: null;
	}

	/**
	 * Store pasted images as vault attachments and return their embed links.
	 * `getAvailablePathForAttachment` honours the user's own attachment-folder
	 * setting and resolves name collisions, so pasting here lands files exactly
	 * where pasting into the editor would.
	 */
	private async saveImages(note: TFile, images: File[]): Promise<string[]> {
		const links: string[] = [];
		for (const image of images) {
			try {
				const path = await this.app.fileManager.getAvailablePathForAttachment(
					attachmentName(image.name, image.type),
					note.path,
				);
				const saved = await this.app.vault.createBinary(
					path,
					await image.arrayBuffer(),
				);
				// generateMarkdownLink builds a *link* ("[[x.png]]"); the "!"
				// that turns it into an embed is the caller's to add.
				links.push(
					`!${this.app.fileManager.generateMarkdownLink(
						saved,
						note.path,
					)}`,
				);
			} catch {
				new Notice(this.s.imagePasteFailed);
				break;
			}
		}
		return links;
	}

	/**
	 * Accept image files dropped on `el`, storing them as attachments and
	 * handing the embed links to `insert`.
	 *
	 * Both `dragover` and `drop` must be cancelled. Without preventDefault on
	 * `dragover` the element is not a drop target at all and no drop event
	 * follows; without it on `drop` the payload falls through to Electron,
	 * which navigates the window to the dropped file.
	 */
	private acceptImageDrop(
		el: HTMLElement,
		note: TFile,
		insert: (links: string[]) => void,
	): void {
		el.addEventListener('dragover', (evt) => {
			if (!draggingFiles(evt.dataTransfer)) return;
			evt.preventDefault();
			evt.stopPropagation();
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'copy';
			el.addClass('is-drop-target');
		});

		el.addEventListener('dragleave', (evt) => {
			// Moving onto a child fires dragleave on the parent; only a pointer
			// that has actually left the element should clear the highlight.
			const to = evt.relatedTarget;
			if (to instanceof Node && el.contains(to)) return;
			el.removeClass('is-drop-target');
		});

		el.addEventListener('drop', (evt) => {
			el.removeClass('is-drop-target');
			const images = transferImages(evt.dataTransfer);
			if (images.length === 0) return; // not ours — let it through
			evt.preventDefault();
			evt.stopPropagation();
			void (async (): Promise<void> => {
				const links = await this.saveImages(note, images);
				if (links.length > 0) insert(links);
			})();
		});
	}

	/** Drop embed links for pasted images where the free editor's caret is. */
	private async pasteImages(
		note: TFile,
		editor: LiveEditor,
		images: File[],
	): Promise<void> {
		const links = await this.saveImages(note, images);
		if (links.length === 0) return;
		// The editor may have closed while the writes were in flight; the files
		// are saved either way, but there is nowhere to put the links.
		if (this.memoEditing?.editor !== editor) return;

		editor.insert(links.join('\n'));
	}

	/**
	 * The same for an inline item editor. An item is one line, so the links are
	 * separated by spaces rather than newlines — a newline in the value would be
	 * collapsed back to a space on write anyway.
	 */
	private async pasteIntoItem(ed: EditState, images: File[]): Promise<void> {
		const links = await this.saveImages(ed.file, images);
		if (links.length === 0) return;
		if (this.editing !== ed) return; // the edit closed mid-write
		this.insertIntoItem(ed, links);
	}

	/** Put embed links at the item input's caret. */
	private insertIntoItem(ed: EditState, links: string[]): void {
		const { input } = ed;
		const start = input.selectionStart ?? input.value.length;
		const end = input.selectionEnd ?? start;
		const text = links.join(' ');
		input.value =
			input.value.slice(0, start) + text + input.value.slice(end);
		const caret = start + text.length;
		input.setSelectionRange(caret, caret);
		input.focus();
	}

	private closeMemoEdit(): void {
		const ed = this.memoEditing;
		if (!ed) return;
		this.memoEditing = null;

		const value = ed.editor.value();
		ed.editor.destroy();
		if (ed.cancelled || value === ed.original) {
			this.render();
			return;
		}
		void this.applyMemo(ed.file, ed.sectionId, value, ed.original);
	}

	private async applyMemo(
		file: TFile,
		sectionId: string,
		value: string,
		original: string,
	): Promise<void> {
		const res = await writeBack(this.app, file, (data) =>
			setSectionBody(data, this.specs, sectionId, value, original),
		);
		if (!res.ok || res.content === null) {
			new Notice(this.s.editCancelledChanged);
			this.render();
			return;
		}
		this.afterPanelWrite(file, res.content);
		this.repaintPanel(file, res.content);
	}

	private renderItem(
		list: HTMLElement,
		item: ParsedItem,
		file: TFile,
		sectionId: string,
	): void {
		const editable = this.plugin.settings.allowPanelEditing;
		const row = list.createDiv({ cls: 'cp-item' });
		this.rowItem.set(row, item);
		row.toggleClass('is-nested', item.depth > 0);
		row.toggleClass('is-done', item.kind === 'checklist' && item.checked);

		if (item.kind === 'checklist') {
			// A real checkbox, so Obsidian's own stylesheet draws it exactly as
			// it does everywhere else and follows the user's theme.
			const box = row.createEl('input', {
				cls: 'cp-check',
				type: 'checkbox',
			});
			box.checked = item.checked;
			box.disabled = !editable;
			if (editable) {
				box.setAttr(
					'aria-label',
					item.checked ? this.s.unmarkDone : this.s.markDone,
				);
				box.addEventListener('click', (evt) => {
					// Don't let the browser flip it: the panel repaints from the
					// file once the write lands, so it never shows an unsaved state.
					evt.preventDefault();
					evt.stopPropagation();
					void this.toggleCheckbox(file, item);
				});
			}
		} else {
			row.createDiv({ cls: 'cp-bullet' });
		}

		// A trailing date / time is shown quietly on the right rather than in
		// line with the words. `.cp-item-text` is the row's only flex child that
		// grows, so appending after it is all the right-alignment this needs.
		const { body, time } = splitItemTime(item.text);
		const span = row.createSpan({ cls: 'cp-item-text' });
		this.renderItemText(span, body, file.path);
		if (time !== '') row.createSpan({ cls: 'cp-item-meta', text: time });

		if (!editable) return;

		row.addClass('is-editable');
		row.tabIndex = 0;
		// Click anywhere on the row (except the checkbox / delete / the input
		// itself) starts editing — the text span alone is too small to hit when
		// an item is short or empty.
		row.addEventListener('click', (evt) => {
			if (this.editing || this.memoEditing) return;
			const target = evt.target as HTMLElement | null;
			if (target?.closest('.cp-check, .cp-item-del, .cp-item-input')) {
				return;
			}
			this.beginEdit(row, span, file, item, sectionId);
		});
		row.addEventListener('keydown', (evt) => {
			if (evt.target !== row || this.editing) return;
			if (evt.key === 'Enter') {
				evt.preventDefault();
				this.beginEdit(row, span, file, item, sectionId);
			}
		});

		const del = row.createSpan({ cls: 'cp-item-del' });
		setIcon(del, 'x');
		del.setAttr('aria-label', this.s.deleteItem);
		del.addEventListener('click', (evt) => {
			evt.stopPropagation();
			void this.deleteItem(file, item);
		});
	}

	/**
	 * Fill `span` with an item's text, drawing any image embed it holds as the
	 * image itself.
	 *
	 * Only embeds are rendered — everything else stays literal. An item is a
	 * single line of source that clicking the row edits directly, so the text
	 * shown has to be the text you get back; an embed is the one construct that
	 * is useless read as source. An embed pointing at something that is not an
	 * image in this vault is left as its own text, which is the honest answer.
	 */
	private renderItemText(
		span: HTMLElement,
		text: string,
		sourcePath: string,
	): void {
		EMBED_RE.lastIndex = 0;
		let last = 0;
		let match: RegExpExecArray | null;

		while ((match = EMBED_RE.exec(text)) !== null) {
			const wiki = match[1];
			const target = wiki ?? decodePath(match[4] ?? '');
			const url = this.resolveImageUrl(target, sourcePath);
			if (url === null) continue; // not a viewable image — keep the source

			if (match.index > last) {
				span.appendText(text.slice(last, match.index));
			}
			const img = span.createEl('img', {
				cls: 'cp-item-img',
				attr: { src: url, alt: wiki ?? match[3] ?? '' },
			});
			applyEmbedSize(img, match[2]);
			last = match.index + match[0].length;
		}

		if (last === 0) {
			span.setText(text); // no embeds at all — the common case
			return;
		}
		if (last < text.length) span.appendText(text.slice(last));
	}

	/* ---- inline editing ------------------------------------------------- */

	private beginEdit(
		row: HTMLElement,
		span: HTMLElement,
		file: TFile,
		item: ParsedItem,
		sectionId: string,
	): void {
		if (this.editing) this.closeEdit(true);
		this.openInput(row, span, file, item, false, sectionId);
	}

	private beginAdd(
		file: TFile,
		spec: SectionSpec,
		sectionWrap: HTMLElement,
	): void {
		if (this.editing) this.closeEdit(true);

		// An add on a collapsed section expands it first.
		this.collapsed.delete(`${this.panelTarget?.mode ?? 'day'}:${spec.id}`);
		sectionWrap.removeClass('is-collapsed');

		// If the section holds a single empty placeholder (from the scaffold),
		// edit that in place instead of stacking a second empty row under it.
		const rows = sectionWrap.querySelectorAll<HTMLElement>('.cp-item');
		if (rows.length === 1) {
			const only = rows[0]!;
			const existing = this.rowItem.get(only);
			const onlySpan = only.querySelector<HTMLElement>('.cp-item-text');
			if (existing && onlySpan && existing.text.trim() === '') {
				this.openInput(only, onlySpan, file, existing, false, spec.id);
				return;
			}
		}

		let list = sectionWrap.querySelector<HTMLElement>('.cp-items');
		if (!list) list = sectionWrap.createDiv({ cls: 'cp-items' });

		const checklist = spec.type === 'checklist';
		const row = list.createDiv({ cls: 'cp-item is-editable' });
		row.toggleClass('is-todo', checklist);
		if (checklist) {
			// Inert until the item exists — there is nothing to toggle yet.
			row.createEl('input', {
				cls: 'cp-check',
				type: 'checkbox',
			}).disabled = true;
		} else {
			row.createDiv({ cls: 'cp-bullet' });
		}
		const span = row.createSpan({ cls: 'cp-item-text' });

		const placeholder: ParsedItem = {
			kind: checklist ? 'checklist' : 'list',
			line: -1,
			raw: '',
			indent: '',
			marker: '',
			text: '',
			checked: false,
			depth: 0,
			blockEnd: -1,
		};
		this.openInput(row, span, file, placeholder, true, spec.id);
	}

	private openInput(
		row: HTMLElement,
		span: HTMLElement,
		file: TFile,
		item: ParsedItem,
		isNew: boolean,
		sectionId: string,
	): void {
		const input = row.createEl('input', {
			cls: 'cp-item-input',
			attr: { type: 'text' },
		});
		// The whole line, date / time and all: an item is one line of source and
		// editing it is a source edit, so what you get back is what you saw.
		input.value = item.text;
		row.insertBefore(input, span);
		span.hide();
		// The time is part of the input now — leaving its quiet copy beside the
		// field would read as a second, uneditable one.
		row.querySelector<HTMLElement>('.cp-item-meta')?.hide();

		const rows = Array.from(
			this.contentEl.querySelectorAll<HTMLElement>('.cp-item'),
		);
		const ed: EditState = {
			file,
			item,
			sectionId,
			isNew,
			input,
			span,
			row,
			rowIndex: rows.indexOf(row),
			cancelled: false,
			composing: false,
			moveTo: null,
		};
		this.editing = ed;

		input.focus();
		input.setSelectionRange(item.text.length, item.text.length);
		input.scrollIntoView({ block: 'nearest' });

		input.addEventListener('paste', (evt) => {
			const images = transferImages(evt.clipboardData);
			if (images.length === 0) return; // ordinary paste — let it happen
			evt.preventDefault();
			void this.pasteIntoItem(ed, images);
		});
		this.acceptImageDrop(input, file, (links) => {
			if (this.editing !== ed) return;
			this.insertIntoItem(ed, links);
		});
		input.addEventListener('compositionstart', () => {
			ed.composing = true;
		});
		input.addEventListener('compositionend', () => {
			ed.composing = false;
		});
		input.addEventListener('keydown', (evt) => {
			if (evt.key === 'Escape') {
				evt.preventDefault();
				ed.cancelled = true;
				input.blur();
			} else if (evt.key === 'Enter') {
				if (this.isComposing(evt, ed)) return;
				evt.preventDefault();
				input.blur();
			} else if (evt.key === 'Tab') {
				if (this.isComposing(evt, ed)) return;
				evt.preventDefault();
				ed.moveTo = evt.shiftKey ? 'prev' : 'next';
				input.blur();
			}
		});
		input.addEventListener('blur', () => this.closeEdit(true));
	}

	private isComposing(evt: KeyboardEvent, ed: EditState): boolean {
		// keyCode 229 is the reliable "IME is composing" signal for the Enter that
		// confirms a Korean/CJK composition; isComposing alone misses some IMEs.
		// (read off an untyped view to avoid the deprecated `KeyboardEvent.keyCode`)
		const legacyKeyCode = (evt as unknown as { keyCode?: number }).keyCode;
		return evt.isComposing || legacyKeyCode === 229 || ed.composing;
	}

	private closeEdit(commit: boolean): void {
		const ed = this.editing;
		if (!ed) return;
		this.editing = null;

		const value = ed.input.value;
		ed.input.remove();
		ed.span.show();
		// Only matters when the edit is cancelled; a commit repaints the panel.
		ed.row.querySelector<HTMLElement>('.cp-item-meta')?.show();

		if (ed.cancelled || !commit) {
			if (ed.isNew) ed.row.remove();
			this.maybeMoveFocus(ed);
			return;
		}

		if (ed.isNew) {
			const text = normalizeItemText(value);
			if (text === '') {
				ed.row.remove();
				this.maybeMoveFocus(ed);
				return;
			}
			void this.applyEdit(ed, (data) =>
				appendItem(
					data,
					this.specs,
					ed.sectionId,
					text,
					this.plugin.settings.newItemPosition,
				),
			);
			return;
		}

		if (value === ed.item.text) {
			this.maybeMoveFocus(ed); // untouched → no write
			return;
		}

		void this.applyEdit(ed, (data) =>
			updateItemText(data, ed.item.line, ed.item.raw, value),
		);
	}

	private async applyEdit(
		ed: EditState,
		transform: (data: string) => string | null,
	): Promise<void> {
		const res = await writeBack(this.app, ed.file, transform);
		if (!res.ok || res.content === null) {
			new Notice(this.s.editCancelledChanged);
			if (!this.editing) this.render();
			return;
		}
		this.afterPanelWrite(ed.file, res.content);
		if (!this.editing) {
			this.repaintPanel(ed.file, res.content);
			this.maybeMoveFocus(ed);
		}
	}

	private maybeMoveFocus(ed: EditState): void {
		if (!ed.moveTo || this.editing) return;
		const rows = Array.from(
			this.contentEl.querySelectorAll<HTMLElement>('.cp-item'),
		);
		const next =
			ed.moveTo === 'next' ? rows[ed.rowIndex + 1] : rows[ed.rowIndex - 1];
		next?.focus();
	}

	private async deleteItem(file: TFile, item: ParsedItem): Promise<void> {
		const res = await writeBack(this.app, file, (data) =>
			removeItem(data, item.line, item.raw),
		);
		if (!res.ok || res.content === null) {
			new Notice(this.s.deleteCancelledChanged);
			this.render();
			return;
		}
		this.afterPanelWrite(file, res.content);
		new Notice(this.s.itemDeleted);
		this.repaintPanel(file, res.content);
	}

	/** Show the create modal, then open a fresh "add" editor in the new note. */
	private createThenAdd(target: PanelTarget, sectionId: string): void {
		new CreateNoteModal(
			this.app,
			KIND_OF[target.mode],
			this.plugin.settings.language,
			(open) => {
				void this.doCreateThenAdd(target, sectionId, open);
			},
		).open();
	}

	/**
	 * Create the note the user was about to add an item to. "Create" leaves them
	 * in the panel with the new item's input open; "Create and open" takes them
	 * to the note instead — starting the inline edit too would only fight the
	 * editor for focus.
	 */
	private async doCreateThenAdd(
		target: PanelTarget,
		sectionId: string,
		open: boolean,
	): Promise<void> {
		let file: TFile;
		try {
			file = await createPlannerNote(
				this.app,
				this.plugin.settings,
				KIND_OF[target.mode],
				target.date,
			);
			new Notice(this.s.noteCreated(file.path));
		} catch (err) {
			new Notice(this.s.noteCreateFailed(String(err)));
			return;
		}
		this.panelTarget = target;
		if (!open) this.pendingAdd = sectionId;
		this.render();
		if (open) {
			await openNote(this.app, file, this.plugin.settings.openLocation);
		}
	}
}
