import { Plugin, TAbstractFile, TFile } from 'obsidian';
import {
	CalendarPlannerSettings,
	CalendarPlannerSettingTab,
	copySections,
	DEFAULT_SECTIONS,
	DEFAULT_SETTINGS,
	normalizeSectionSets,
	NOTE_KINDS,
} from './settings';

/** The pre-configurable-sections shape of the heading settings. */
interface LegacyHeadingSettings {
	eventHeading: string;
	todoHeading: string;
	memoHeading: string;
}
import { CalendarView, VIEW_TYPE_CALENDAR } from './view';
import { t } from './i18n';

/** Vault / metadata events — a change that already reached disk. */
const REFRESH_DEBOUNCE_MS = 250;
/**
 * Keystrokes in an open editor. Short enough to read as instant, long enough
 * that a burst of typing repaints the panel once instead of per character.
 */
const LIVE_REFRESH_MS = 60;

export default class CalendarPlannerPlugin extends Plugin {
	settings!: CalendarPlannerSettings;

	/**
	 * The last text this plugin wrote, kept so the vault/metadata event it
	 * triggers can be told apart from external edits (pitfall B). Cleared when a
	 * later change to the same path no longer matches, or on the next own write.
	 */
	private lastWrite: { path: string; content: string } | null = null;
	private refreshTimer: number | null = null;
	private liveTimer: number | null = null;
	/** Newest editor text seen since the last live repaint. */
	private livePending: { path: string; content: string } | null = null;
	private lastToday = new Date().toDateString();

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_CALENDAR,
			(leaf) => new CalendarView(leaf, this),
		);

		const strings = t(this.settings.language);

		this.addRibbonIcon('calendar-days', strings.openCalendar, () => {
			void this.activateView();
		});

		this.addCommand({
			id: 'open-calendar',
			name: strings.openCalendar,
			callback: () => {
				void this.activateView();
			},
		});

		this.addSettingTab(new CalendarPlannerSettingTab(this.app, this));

		this.registerVaultevent();

		// Refresh the "today" marker after midnight.
		this.registerInterval(
			window.setInterval(() => {
				const today = new Date().toDateString();
				if (today !== this.lastToday) {
					this.lastToday = today;
					this.refreshViews(true);
				}
			}, 60_000),
		);

		this.app.workspace.onLayoutReady(() => {
			void this.activateView();
		});
	}

	onunload(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
		if (this.liveTimer !== null) {
			window.clearTimeout(this.liveTimer);
			this.liveTimer = null;
		}
	}

	/** Record the text just written to `path` so its echo event can be ignored. */
	markOwnWrite(path: string, content: string): void {
		this.lastWrite = { path, content };
	}

	private registerVaultevent(): void {
		const onChange = (file: TAbstractFile, oldPath?: string): void => {
			void this.onFileEvent(file, oldPath);
		};
		this.registerEvent(this.app.vault.on('modify', (f) => onChange(f)));
		this.registerEvent(this.app.vault.on('create', (f) => onChange(f)));
		this.registerEvent(this.app.vault.on('delete', (f) => onChange(f)));
		this.registerEvent(
			this.app.vault.on('rename', (f, oldPath) => onChange(f, oldPath)),
		);
		this.registerEvent(
			this.app.metadataCache.on('changed', (f) => onChange(f)),
		);

		// Vault events only fire once the editor's buffer reaches disk, which
		// Obsidian delays by its own save debounce — seconds of lag between
		// typing in a note and seeing it in the panel. 'editor-change' fires on
		// the keystroke itself, so take the text from there.
		this.registerEvent(
			this.app.workspace.on('editor-change', (editor, info) => {
				const file = info.file;
				if (!file || file.extension !== 'md') return;
				this.scheduleLiveRefresh(file.path, editor.getValue());
			}),
		);
	}

	private async onFileEvent(
		file: TAbstractFile,
		oldPath?: string,
	): Promise<void> {
		if (!(file instanceof TFile)) {
			this.scheduleRefresh();
			return;
		}
		if (file.extension !== 'md') return;

		if (this.lastWrite && this.lastWrite.path === file.path) {
			let current = '';
			try {
				current = await this.app.vault.cachedRead(file);
			} catch {
				current = '';
			}
			if (current === this.lastWrite.content) return; // our own echo
			this.lastWrite = null; // a real change landed on top of ours
		}
		void oldPath;
		this.scheduleRefresh();
	}

	private scheduleLiveRefresh(path: string, content: string): void {
		this.livePending = { path, content };
		if (this.liveTimer !== null) return; // already coalescing this burst
		this.liveTimer = window.setTimeout(() => {
			this.liveTimer = null;
			const pending = this.livePending;
			this.livePending = null;
			if (!pending) return;
			// Our own panel edits go through the editor too; that echo is already
			// on screen, so don't repaint over it.
			if (
				this.lastWrite &&
				this.lastWrite.path === pending.path &&
				this.lastWrite.content === pending.content
			) {
				return;
			}
			for (const leaf of this.app.workspace.getLeavesOfType(
				VIEW_TYPE_CALENDAR,
			)) {
				const view = leaf.view;
				if (view instanceof CalendarView) {
					view.onEditorChange(pending.path, pending.content);
				}
			}
		}, LIVE_REFRESH_MS);
	}

	private scheduleRefresh(): void {
		if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			this.refreshViews(true);
		}, REFRESH_DEBOUNCE_MS);
	}

	/** Reveal the calendar view, creating it in the right sidebar if absent. Never duplicates. */
	async activateView(): Promise<void> {
		const { workspace } = this.app;

		const existing = workspace.getLeavesOfType(VIEW_TYPE_CALENDAR);
		if (existing.length > 0) {
			await workspace.revealLeaf(existing[0]!);
			return;
		}

		const leaf = workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: VIEW_TYPE_CALENDAR, active: true });
		await workspace.revealLeaf(leaf);
	}

	/**
	 * Re-render every open calendar view. `external` marks a refresh caused by a
	 * file/settings change from outside the view, which a view mid-edit ignores.
	 */
	refreshViews(external = false): void {
		for (const leaf of this.app.workspace.getLeavesOfType(
			VIEW_TYPE_CALENDAR,
		)) {
			const view = leaf.view;
			if (view instanceof CalendarView) {
				view.refresh(external);
			}
		}
	}

	async loadSettings(): Promise<void> {
		const saved = (await this.loadData()) as
			| Partial<CalendarPlannerSettings>
			| null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);

		// `sections` has had three shapes: absent (headings were named one by
		// one), a single list shared by every note kind, and now one list per
		// kind. normalizeSectionSets folds the last two together; the first is
		// carried across here rather than silently resetting to the defaults.
		const savedSections = (saved as { sections?: unknown } | null)?.sections;
		this.settings.sections = normalizeSectionSets(savedSections);

		const legacy = saved as Partial<LegacyHeadingSettings> | null;
		if (savedSections === undefined && legacy) {
			const named = DEFAULT_SECTIONS.map((spec) => ({
				...spec,
				heading:
					{
						event: legacy.eventHeading,
						todo: legacy.todoHeading,
						memo: legacy.memoHeading,
					}[spec.id] ?? spec.heading,
			}));
			for (const kind of NOTE_KINDS) {
				this.settings.sections[kind] = copySections(named);
			}
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
