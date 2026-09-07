import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type { WeekStart } from './date';
import type { SectionSpec, SectionType } from './parser';
import { defaultFolders, rememberFormat, retargetFolder } from './paths';
import {
	copySections,
	defaultSectionSets,
	newSectionId,
	NOTE_KINDS,
} from './sections';
import type { NoteKind, SectionSets } from './sections';
import type { Lang, Strings } from './i18n';
import { t } from './i18n';
import type CalendarPlannerPlugin from './main';
import { ConfirmModal } from './modals';
import {
	findEmptyPlannerNotes,
	findMisplacedPlannerNotes,
	moveNotes,
	trashFiles,
} from './notes';
import { FileSuggest, FolderSuggest } from './suggest';

export type { WeekStart } from './date';
export type { SectionSpec, SectionType } from './parser';
export { defaultFolders } from './paths';
export {
	allSections,
	copySections,
	DEFAULT_SECTIONS,
	defaultSectionSets,
	newSectionId,
	NOTE_KINDS,
	normalizeSectionSets,
} from './sections';
export type { NoteKind, SectionSets } from './sections';
export type { Lang } from './i18n';

/** Where the "Go to…" menu item opens the target note. */
export type OpenLocation = 'tab' | 'new-tab' | 'split';

/** Where a newly added item lands inside its section. */
export type AddPosition = 'top' | 'bottom';

/** What a day band does with text too long for its column. */
export type BandOverflow = 'fade' | 'ellipsis' | 'none';

/**
 * Weekend colours for the weekday header. Empty means "no colour of its own" —
 * the label is drawn like every other weekday, in the theme's own colour, which
 * is what the calendar looks like before anyone touches these.
 */
export const DEFAULT_SATURDAY_COLOR = '';
export const DEFAULT_SUNDAY_COLOR = '';

/**
 * The theme's own weekday-label colour, as a 6-digit hex.
 *
 * A colour picker has no "unset" state to show, so an untouched weekend setting
 * seeds its swatch with the colour the label actually has right now. Themes
 * write `--text-faint` as hex or as rgb(); anything else falls back to a
 * neutral grey, which is only ever a swatch, never a colour that gets applied.
 */
function themeFaintHex(el: HTMLElement): string {
	const raw = getComputedStyle(el).getPropertyValue('--text-faint').trim();

	const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(raw);
	if (short) return `#${short[1]!}${short[1]!}${short[2]!}${short[2]!}${short[3]!}${short[3]!}`;
	if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();

	const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(raw);
	if (rgb) {
		const byte = (n: string): string =>
			Math.min(255, Number(n)).toString(16).padStart(2, '0');
		return `#${byte(rgb[1]!)}${byte(rgb[2]!)}${byte(rgb[3]!)}`;
	}
	return '#888888';
}

/** A copy of `list` with the items at `a` and `b` exchanged. */
function swap<T>(list: readonly T[], a: number, b: number): T[] {
	const out = list.slice();
	const at = out[a]!;
	out[a] = out[b]!;
	out[b] = at;
	return out;
}

/**
 * Flag a heading the parser cannot use: blank, or one an earlier section already
 * claims (that first section owns it, and this one would never match).
 */
function markHeadingValidity(
	input: HTMLInputElement,
	heading: string,
	index: number,
	sections: readonly SectionSpec[],
): void {
	const name = heading.trim().toLowerCase();
	const clash = sections.some(
		(other, j) => j < index && other.heading.trim().toLowerCase() === name,
	);
	input.toggleClass('cp-setting-invalid', name === '' || clash);
}

export interface CalendarPlannerSettings {
	/** Interface language. */
	language: Lang;
	weekStart: WeekStart;
	yearlyNoteFolder: string;
	yearlyNoteFormat: string;
	yearlyNoteFormatHistory: string[];
	yearlyNoteTemplate: string;
	monthlyNoteFolder: string;
	monthlyNoteFormat: string;
	monthlyNoteFormatHistory: string[];
	monthlyNoteTemplate: string;
	weeklyNoteFolder: string;
	weeklyNoteFormat: string;
	/** Filename formats used before the current one, newest first. */
	weeklyNoteFormatHistory: string[];
	weeklyNoteTemplate: string;
	dailyNoteFolder: string;
	dailyNoteFormat: string;
	dailyNoteFormatHistory: string[];
	dailyNoteTemplate: string;
	/**
	 * The sections a planner note is made of, in the order they are written and
	 * rendered — kept per note kind, so a yearly note need not be laid out like
	 * a daily one. Free to add to, remove from and rename.
	 */
	sections: SectionSets;
	showWeekNumbers: boolean;
	/**
	 * Mark a date or week number whose note exists with a short rule under it.
	 * Purely a calendar decoration — nothing else reads it.
	 */
	showNoteDot: boolean;
	/**
	 * Colour of the Saturday / Sunday labels in the weekday header, as hex.
	 * Empty leaves them the theme's own weekday colour.
	 */
	saturdayColor: string;
	sundayColor: string;
	/**
	 * Show each day's daily-note items as bands under its number. Off means the
	 * grid reads no files at all, which is what it did before this existed.
	 */
	showDayPreview: boolean;
	/** How many bands one day shows before the rest become a "+n" counter. */
	dayPreviewMax: number;
	/** How a band ends text that does not fit its column. */
	bandOverflow: BandOverflow;
	/** Leave checked items out of the bands entirely. */
	dayPreviewHideDone: boolean;
	openLocation: OpenLocation;
	allowPanelEditing: boolean;
	newItemPosition: AddPosition;
	/** Show the fold / unfold chevron on Event / Todo / Memo section headers. */
	sectionCollapsible: boolean;
	/** Strike through the text of a checked checklist item. */
	doneStrikethrough: boolean;
	/** Fade the text of a checked checklist item. */
	doneDim: boolean;
}

export const DEFAULT_SETTINGS: CalendarPlannerSettings = {
	language: 'en',
	weekStart: 0,
	yearlyNoteFolder: defaultFolders().yearly,
	yearlyNoteFormat: 'YYYY',
	yearlyNoteFormatHistory: [],
	yearlyNoteTemplate: '',
	monthlyNoteFolder: defaultFolders().monthly,
	monthlyNoteFormat: 'YYYY-MM',
	monthlyNoteFormatHistory: [],
	monthlyNoteTemplate: '',
	weeklyNoteFolder: defaultFolders().weekly,
	weeklyNoteFormat: "YYYY 'W'WW",
	weeklyNoteFormatHistory: [],
	weeklyNoteTemplate: '',
	dailyNoteFolder: defaultFolders().daily,
	dailyNoteFormat: 'YYYY-MM-DD',
	dailyNoteFormatHistory: [],
	dailyNoteTemplate: '',
	sections: defaultSectionSets(),
	showWeekNumbers: true,
	showNoteDot: true,
	saturdayColor: DEFAULT_SATURDAY_COLOR,
	sundayColor: DEFAULT_SUNDAY_COLOR,
	showDayPreview: true,
	dayPreviewMax: 3,
	bandOverflow: 'fade',
	dayPreviewHideDone: false,
	openLocation: 'tab',
	allowPanelEditing: true,
	newItemPosition: 'bottom',
	sectionCollapsible: false,
	doneStrikethrough: true,
	doneDim: true,
};

export class CalendarPlannerSettingTab extends PluginSettingTab {
	plugin: CalendarPlannerPlugin;

	/** Which note kind's section list the Sections group is showing. */
	private sectionKind: NoteKind = 'daily';

	constructor(app: App, plugin: CalendarPlannerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private async commit(): Promise<void> {
		await this.plugin.saveSettings();
		this.plugin.refreshViews();
	}

	/**
	 * Rebuild the tab without losing the reader's place. `display()` empties and
	 * refills the container, which resets its scroll — jarring when a change
	 * halfway down the page throws you back to the top.
	 */
	private redisplay(): void {
		const scroller =
			this.containerEl.closest<HTMLElement>('.vertical-tab-content') ??
			this.containerEl;
		const top = scroller.scrollTop;
		this.display();
		scroller.scrollTop = top;
	}

	/**
	 * Ask whether to move the notes that no longer match the folder settings.
	 * `announceNone` tells the user when there is nothing to move — right for a
	 * button they pressed, noise when this just follows a language change.
	 */
	private async offerMoveNotes(announceNone: boolean): Promise<void> {
		const { language } = this.plugin.settings;
		const s = t(language);
		const notes = await findMisplacedPlannerNotes(
			this.app,
			this.plugin.settings,
		);
		if (notes.length === 0) {
			if (announceNone) new Notice(s.noNotesToMove);
			return;
		}
		new ConfirmModal(
			this.app,
			language,
			s.moveNotesBtn,
			s.moveNotesConfirm(notes.length),
			s.moveNotesBtn,
			() => {
				void (async (): Promise<void> => {
					const moved = await moveNotes(this.app, notes);
					new Notice(s.movedNotes(moved));
					this.plugin.refreshViews();
				})();
			},
		).open();
	}

	/**
	 * A text field with folder or markdown-file autocomplete (plan.md pitfall D).
	 *
	 * `onSettled` runs once the user is done editing rather than on every
	 * keystroke: `onChange` fires per character, which is right for saving but
	 * not for anything that puts a question on screen.
	 */
	private addPathSetting(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		placeholder: string,
		kind: 'folder' | 'file',
		get: () => string,
		set: (value: string) => void,
		onSettled?: () => void,
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((text) => {
				text
					.setPlaceholder(placeholder)
					.setValue(get())
					.onChange(async (v) => {
						set(v.trim());
						await this.commit();
					});
				if (kind === 'folder') {
					new FolderSuggest(this.app, text.inputEl);
				} else {
					new FileSuggest(this.app, text.inputEl);
				}

				if (!onSettled) return;
				let settled = get();
				text.inputEl.addEventListener('focus', () => {
					settled = get();
				});
				text.inputEl.addEventListener('blur', () => {
					if (get() === settled) return;
					settled = get();
					onSettled();
				});
			});
	}

	/**
	 * A filename-format field. When the format changes, the format it replaced
	 * is recorded: notes on disk are still named the old way, and that record is
	 * the only way left to recognise them. Then offer to rename them across.
	 */
	private addFormatSetting(
		containerEl: HTMLElement,
		name: string,
		desc: string | null,
		placeholder: string,
		get: () => string,
		set: (value: string) => void,
		getHistory: () => string[],
		setHistory: (history: string[]) => void,
	): void {
		const setting = new Setting(containerEl).setName(name);
		if (desc !== null) setting.setDesc(desc);
		setting.addText((tx) => {
			tx
				.setPlaceholder(placeholder)
				.setValue(get())
				.onChange(async (v) => {
					set(v);
					await this.commit();
				});

			// On blur, not per keystroke: mid-typing values ("YYYY-MM-D") are
			// not formats this vault ever used.
			let settled = get();
			tx.inputEl.addEventListener('focus', () => {
				settled = get();
			});
			tx.inputEl.addEventListener('blur', () => {
				const current = get();
				if (current === settled) return;
				setHistory(rememberFormat(getHistory(), settled, current));
				settled = current;
				void (async (): Promise<void> => {
					await this.commit();
					await this.offerMoveNotes(false);
				})();
			});
		});
	}

	/**
	 * The section list of one note kind: a row per section with its heading, its
	 * body type and buttons to reorder or remove it, plus the kind selector and
	 * an "add" button on the group header.
	 *
	 * Each kind is edited on its own — showing all four at once would be four
	 * stacked lists — so the selector picks which one this group is showing. It
	 * lives on the tab, not in the settings file: it is where the reader is, not
	 * a preference.
	 *
	 * Structural edits re-render the tab; typing in a heading only saves, so the
	 * field keeps focus.
	 */
	private addSectionEditor(containerEl: HTMLElement, s: Strings): void {
		const kind = this.sectionKind;
		const sections = this.plugin.settings.sections[kind];

		const restructure = async (next: SectionSpec[]): Promise<void> => {
			this.plugin.settings.sections[kind] = next;
			await this.commit();
			this.redisplay();
		};

		new Setting(containerEl)
			.setName(s.headingSections)
			.setDesc(s.headingSectionsDesc)
			.setHeading()
			.addDropdown((d) => {
				for (const k of NOTE_KINDS) d.addOption(k, s.noteKind[k]);
				d.setValue(kind).onChange((v) => {
					this.sectionKind = v as NoteKind;
					this.redisplay();
				});
			})
			.addButton((b) =>
				b
					.setButtonText(s.addSection)
					.setCta()
					.onClick(() => {
						void restructure([
							...sections,
							{
								id: newSectionId(sections),
								heading: s.newSectionHeading,
								type: 'list',
							},
						]);
					}),
			);

		sections.forEach((spec, i) => {
			const row = new Setting(containerEl).setName(s.sectionIndex(i + 1));

			row.addText((tx) => {
				tx.setValue(spec.heading).onChange(async (v) => {
					spec.heading = v;
					markHeadingValidity(tx.inputEl, v, i, sections);
					await this.commit();
				});
				markHeadingValidity(tx.inputEl, spec.heading, i, sections);
			});

			row.addDropdown((d) =>
				d
					.addOption('list', s.typeList)
					.addOption('checklist', s.typeChecklist)
					.addOption('free', s.typeFree)
					.setValue(spec.type)
					.onChange(async (v) => {
						spec.type = v as SectionType;
						await this.commit();
					}),
			);

			// Only the daily note feeds the calendar grid, and only its item
			// sections have anything to put there — so the toggle appears
			// exactly where it means something.
			if (
				kind === 'daily' &&
				spec.type !== 'free' &&
				this.plugin.settings.showDayPreview
			) {
				const shown = spec.inCalendar !== false;
				row.addExtraButton((b) =>
					b
						.setIcon(shown ? 'eye' : 'eye-off')
						.setTooltip(
							shown ? s.sectionInCalendar : s.sectionNotInCalendar,
						)
						.onClick(() => {
							void (async (): Promise<void> => {
								spec.inCalendar = !shown;
								await this.commit();
								this.redisplay(); // swap the icon
							})();
						}),
				);
			}

			row.addExtraButton((b) =>
				b
					.setIcon('chevron-up')
					.setTooltip(s.moveSectionUp)
					.setDisabled(i === 0)
					.onClick(() => void restructure(swap(sections, i, i - 1))),
			);
			row.addExtraButton((b) =>
				b
					.setIcon('chevron-down')
					.setTooltip(s.moveSectionDown)
					.setDisabled(i === sections.length - 1)
					.onClick(() => void restructure(swap(sections, i, i + 1))),
			);
			row.addExtraButton((b) =>
				b
					.setIcon('trash-2')
					.setTooltip(s.removeSection)
					.onClick(() => {
						new ConfirmModal(
							this.app,
							this.plugin.settings.language,
							s.removeSection,
							s.removeSectionConfirm(spec.heading),
							s.removeSection,
							() => {
								void restructure(
									sections.filter((_, j) => j !== i),
								);
							},
						).open();
					}),
			);
		});

		if (sections.length === 0) {
			new Setting(containerEl).setDesc(s.noSections);
		}

		// Four independent lists are four times the typing when the answer is
		// the same for all of them, so offer one way across.
		new Setting(containerEl)
			.setName(s.copySections)
			.setDesc(s.copySectionsDesc(s.noteKind[kind]))
			.addButton((b) =>
				b.setButtonText(s.copySectionsBtn).onClick(() => {
					new ConfirmModal(
						this.app,
						this.plugin.settings.language,
						s.copySections,
						s.copySectionsConfirm(s.noteKind[kind]),
						s.copySectionsBtn,
						() => {
							void (async (): Promise<void> => {
								for (const other of NOTE_KINDS) {
									if (other === kind) continue;
									this.plugin.settings.sections[other] =
										copySections(sections);
								}
								await this.commit();
								new Notice(s.copiedSections);
								this.redisplay();
							})();
						},
					).open();
				}),
			);
	}

	/**
	 * One weekend colour. Unset by default — the label keeps the theme's own
	 * colour — and the picker has no way back to that once it has been moved
	 * off it, so a reset button sits beside it.
	 */
	private addWeekendColor(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		get: () => string,
		set: (value: string) => void,
	): void {
		const setting = new Setting(containerEl).setName(name).setDesc(desc);

		setting.addExtraButton((b) =>
			b
				.setIcon('rotate-ccw')
				.setTooltip(t(this.plugin.settings.language).resetColor)
				.setDisabled(get() === '')
				.onClick(() => {
					void (async (): Promise<void> => {
						set('');
						await this.commit();
						this.redisplay(); // repaint the swatch
					})();
				}),
		);

		setting.addColorPicker((c) =>
			c
				.setValue(get() || themeFaintHex(setting.controlEl))
				.onChange(async (v) => {
					set(v);
					await this.commit();
				}),
		);
	}

	/**
	 * How a checked item reads. Strikethrough and fading are independent, but
	 * what is really being chosen is the resulting look — so the four
	 * combinations are one dropdown, with a live sample of the current pick
	 * beside it rather than every option spelled out on the page.
	 */
	private addDoneStylePicker(containerEl: HTMLElement, s: Strings): void {
		const choices: {
			key: string;
			strike: boolean;
			dim: boolean;
			label: string;
		}[] = [
			{
				key: 'strike-dim',
				strike: true,
				dim: true,
				label: s.doneStyleStrikeDim,
			},
			{ key: 'dim', strike: false, dim: true, label: s.doneStyleDim },
			{
				key: 'strike',
				strike: true,
				dim: false,
				label: s.doneStyleStrike,
			},
			{ key: 'plain', strike: false, dim: false, label: s.doneStylePlain },
		];

		const current = (): string =>
			(
				choices.find(
					(c) =>
						c.strike === this.plugin.settings.doneStrikethrough &&
						c.dim === this.plugin.settings.doneDim,
				) ?? choices[0]!
			).key;

		const setting = new Setting(containerEl)
			.setName(s.setDoneStyle)
			.setDesc(s.setDoneStyleDesc);

		// A live sample rather than a picture: it uses the real checkbox and the
		// real colours, so it follows the user's theme and can never drift from
		// what the sidebar actually does. The control column narrows with the
		// settings pane, so the pair is allowed to wrap (see .cp-done-control).
		setting.controlEl.addClass('cp-done-control');
		const sample = setting.controlEl.createDiv({ cls: 'cp-done-sample' });
		sample.createEl('input', { type: 'checkbox' }).checked = true;
		sample.createSpan({
			cls: 'cp-done-sample-text',
			text: s.doneSampleText,
		});

		const paint = (): void => {
			sample.toggleClass(
				'is-strike',
				this.plugin.settings.doneStrikethrough,
			);
			sample.toggleClass('is-dim', this.plugin.settings.doneDim);
		};

		setting.addDropdown((d) => {
			for (const choice of choices) d.addOption(choice.key, choice.label);
			d.setValue(current()).onChange(async (v) => {
				const choice = choices.find((c) => c.key === v);
				if (!choice) return;
				this.plugin.settings.doneStrikethrough = choice.strike;
				this.plugin.settings.doneDim = choice.dim;
				paint();
				await this.commit();
			});
		});

		paint();
	}

	display(): void {
		const { containerEl } = this;
		const s = t(this.plugin.settings.language);
		containerEl.empty();

		new Setting(containerEl)
			.setName(s.setLanguage)
			.setDesc(s.setLanguageDesc)
			.addDropdown((d) =>
				d
					.addOption('ko', s.langKorean)
					.addOption('en', s.langEnglish)
					.setValue(this.plugin.settings.language)
					.onChange(async (v) => {
						const from = this.plugin.settings.language;
						const to: Lang = v === 'en' ? 'en' : 'ko';
						if (from === to) return;
						this.plugin.settings.language = to;
						// Carry the folder paths over to the new language,
						// keeping whatever the user made of them.
						const cfg = this.plugin.settings;
						cfg.weeklyNoteFolder = retargetFolder(
							cfg.weeklyNoteFolder,
							from,
							to,
						);
						cfg.dailyNoteFolder = retargetFolder(
							cfg.dailyNoteFolder,
							from,
							to,
						);
						cfg.monthlyNoteFolder = retargetFolder(
							cfg.monthlyNoteFolder,
							from,
							to,
						);
						cfg.yearlyNoteFolder = retargetFolder(
							cfg.yearlyNoteFolder,
							from,
							to,
						);
						await this.commit();
						this.redisplay(); // re-render this tab in the new language
						// {MMMM} now expands to the other language's month name,
						// so the notes already on disk sit in folders spelled the
						// old way. They stay linked either way; offer to bring
						// the files along too.
						void this.offerMoveNotes(false);
					}),
			);

		new Setting(containerEl)
			.setName(s.setWeekStart)
			.setDesc(s.setWeekStartDesc)
			.addDropdown((d) =>
				d
					.addOption('0', s.sunday)
					.addOption('1', s.monday)
					.setValue(String(this.plugin.settings.weekStart))
					.onChange(async (v) => {
						this.plugin.settings.weekStart = v === '1' ? 1 : 0;
						await this.commit();
					}),
			);

		new Setting(containerEl)
			.setName(s.setShowWeekNumbers)
			.setDesc(s.setShowWeekNumbersDesc)
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.showWeekNumbers)
					.onChange(async (v) => {
						this.plugin.settings.showWeekNumbers = v;
						await this.commit();
					}),
			);

		new Setting(containerEl)
			.setName(s.setShowNoteDot)
			.setDesc(s.setShowNoteDotDesc)
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.showNoteDot)
					.onChange(async (v) => {
						this.plugin.settings.showNoteDot = v;
						await this.commit();
					}),
			);

		this.addWeekendColor(
			containerEl,
			s.setSaturdayColor,
			s.setWeekendColorDesc,
			() => this.plugin.settings.saturdayColor,
			(v) => {
				this.plugin.settings.saturdayColor = v;
			},
		);

		this.addWeekendColor(
			containerEl,
			s.setSundayColor,
			s.setWeekendColorDesc,
			() => this.plugin.settings.sundayColor,
			(v) => {
				this.plugin.settings.sundayColor = v;
			},
		);

		new Setting(containerEl)
			.setName(s.setDayPreview)
			.setDesc(s.setDayPreviewDesc)
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.showDayPreview)
					.onChange(async (v) => {
						this.plugin.settings.showDayPreview = v;
						await this.commit();
						this.redisplay(); // the two rows below depend on it
					}),
			);

		if (this.plugin.settings.showDayPreview) {
			new Setting(containerEl)
				.setName(s.setDayPreviewMax)
				.setDesc(s.setDayPreviewMaxDesc)
				.addDropdown((d) => {
					for (let n = 1; n <= 5; n++) d.addOption(String(n), String(n));
					d.setValue(
						String(this.plugin.settings.dayPreviewMax),
					).onChange(async (v) => {
						this.plugin.settings.dayPreviewMax = Number(v);
						await this.commit();
					});
				});

			new Setting(containerEl)
				.setName(s.setBandOverflow)
				.setDesc(s.setBandOverflowDesc)
				.addDropdown((d) =>
					d
						.addOption('fade', s.bandOverflowFade)
						.addOption('ellipsis', s.bandOverflowEllipsis)
						.addOption('none', s.bandOverflowNone)
						.setValue(this.plugin.settings.bandOverflow)
						.onChange(async (v) => {
							this.plugin.settings.bandOverflow =
								v as BandOverflow;
							await this.commit();
						}),
				);

			new Setting(containerEl)
				.setName(s.setDayPreviewHideDone)
				.setDesc(s.setDayPreviewHideDoneDesc)
				.addToggle((tg) =>
					tg
						.setValue(this.plugin.settings.dayPreviewHideDone)
						.onChange(async (v) => {
							this.plugin.settings.dayPreviewHideDone = v;
							await this.commit();
						}),
				);
		}

		new Setting(containerEl).setName(s.headingYearlyNote).setHeading();

		this.addPathSetting(
			containerEl,
			s.setFolder,
			s.setFolderDesc,
			defaultFolders().yearly,
			'folder',
			() => this.plugin.settings.yearlyNoteFolder,
			(v) => {
				this.plugin.settings.yearlyNoteFolder = v;
			},
			() => void this.offerMoveNotes(false),
		);

		this.addFormatSetting(
			containerEl,
			s.setFilenameFormat,
			null,
			'YYYY',
			() => this.plugin.settings.yearlyNoteFormat,
			(v) => {
				this.plugin.settings.yearlyNoteFormat = v;
			},
			() => this.plugin.settings.yearlyNoteFormatHistory,
			(h) => {
				this.plugin.settings.yearlyNoteFormatHistory = h;
			},
		);

		this.addPathSetting(
			containerEl,
			s.setTemplateFile,
			s.setTemplateFileDesc,
			s.yearlyTemplatePlaceholder,
			'file',
			() => this.plugin.settings.yearlyNoteTemplate,
			(v) => {
				this.plugin.settings.yearlyNoteTemplate = v;
			},
		);

		new Setting(containerEl).setName(s.headingMonthlyNote).setHeading();

		this.addPathSetting(
			containerEl,
			s.setFolder,
			s.setFolderDesc,
			defaultFolders().monthly,
			'folder',
			() => this.plugin.settings.monthlyNoteFolder,
			(v) => {
				this.plugin.settings.monthlyNoteFolder = v;
			},
			() => void this.offerMoveNotes(false),
		);

		this.addFormatSetting(
			containerEl,
			s.setFilenameFormat,
			null,
			'YYYY-MM',
			() => this.plugin.settings.monthlyNoteFormat,
			(v) => {
				this.plugin.settings.monthlyNoteFormat = v;
			},
			() => this.plugin.settings.monthlyNoteFormatHistory,
			(h) => {
				this.plugin.settings.monthlyNoteFormatHistory = h;
			},
		);

		this.addPathSetting(
			containerEl,
			s.setTemplateFile,
			s.setTemplateFileDesc,
			s.monthlyTemplatePlaceholder,
			'file',
			() => this.plugin.settings.monthlyNoteTemplate,
			(v) => {
				this.plugin.settings.monthlyNoteTemplate = v;
			},
		);

		new Setting(containerEl).setName(s.headingWeeklyNote).setHeading();

		this.addPathSetting(
			containerEl,
			s.setFolder,
			s.setFolderDesc,
			defaultFolders().weekly,
			'folder',
			() => this.plugin.settings.weeklyNoteFolder,
			(v) => {
				this.plugin.settings.weeklyNoteFolder = v;
			},
			// Existing notes stay linked wherever they are, but offer to bring
			// the files along to the folder just configured.
			() => void this.offerMoveNotes(false),
		);

		this.addFormatSetting(
			containerEl,
			s.setFilenameFormat,
			s.setWeeklyFilenameFormatDesc,
			"YYYY 'W'WW",
			() => this.plugin.settings.weeklyNoteFormat,
			(v) => {
				this.plugin.settings.weeklyNoteFormat = v;
			},
			() => this.plugin.settings.weeklyNoteFormatHistory,
			(h) => {
				this.plugin.settings.weeklyNoteFormatHistory = h;
			},
		);

		this.addPathSetting(
			containerEl,
			s.setTemplateFile,
			s.setTemplateFileDesc,
			s.weeklyTemplatePlaceholder,
			'file',
			() => this.plugin.settings.weeklyNoteTemplate,
			(v) => {
				this.plugin.settings.weeklyNoteTemplate = v;
			},
		);

		new Setting(containerEl).setName(s.headingDailyNote).setHeading();

		this.addPathSetting(
			containerEl,
			s.setFolder,
			s.setFolderDesc,
			defaultFolders().daily,
			'folder',
			() => this.plugin.settings.dailyNoteFolder,
			(v) => {
				this.plugin.settings.dailyNoteFolder = v;
			},
			() => void this.offerMoveNotes(false),
		);

		this.addFormatSetting(
			containerEl,
			s.setFilenameFormat,
			null,
			'YYYY-MM-DD',
			() => this.plugin.settings.dailyNoteFormat,
			(v) => {
				this.plugin.settings.dailyNoteFormat = v;
			},
			() => this.plugin.settings.dailyNoteFormatHistory,
			(h) => {
				this.plugin.settings.dailyNoteFormatHistory = h;
			},
		);

		this.addPathSetting(
			containerEl,
			s.setTemplateFile,
			s.setTemplateFileDesc,
			s.dailyTemplatePlaceholder,
			'file',
			() => this.plugin.settings.dailyNoteTemplate,
			(v) => {
				this.plugin.settings.dailyNoteTemplate = v;
			},
		);

		this.addSectionEditor(containerEl, s);

		new Setting(containerEl).setName(s.headingBehaviour).setHeading();

		new Setting(containerEl)
			.setName(s.setOpenLocation)
			.setDesc(s.setOpenLocationDesc)
			.addDropdown((d) =>
				d
					.addOption('tab', s.openTab)
					.addOption('new-tab', s.openNewTab)
					.addOption('split', s.openSplit)
					.setValue(this.plugin.settings.openLocation)
					.onChange(async (v) => {
						this.plugin.settings.openLocation = v as OpenLocation;
						await this.commit();
					}),
			);

		new Setting(containerEl)
			.setName(s.setAllowPanelEditing)
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.allowPanelEditing)
					.onChange(async (v) => {
						this.plugin.settings.allowPanelEditing = v;
						await this.commit();
					}),
			);

		new Setting(containerEl)
			.setName(s.setSectionCollapsible)
			.setDesc(s.setSectionCollapsibleDesc)
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.sectionCollapsible)
					.onChange(async (v) => {
						this.plugin.settings.sectionCollapsible = v;
						await this.commit();
					}),
			);

		this.addDoneStylePicker(containerEl, s);

		new Setting(containerEl)
			.setName(s.setNewItemPosition)
			.addDropdown((d) =>
				d
					.addOption('top', s.posTop)
					.addOption('bottom', s.posBottom)
					.setValue(this.plugin.settings.newItemPosition)
					.onChange(async (v) => {
						this.plugin.settings.newItemPosition = v as AddPosition;
						await this.commit();
					}),
			);

		new Setting(containerEl).setName(s.headingMaintenance).setHeading();

		new Setting(containerEl)
			.setName(s.setMoveNotes)
			.setDesc(s.setMoveNotesDesc)
			.addButton((b) =>
				b
					.setButtonText(s.moveNotesBtn)
					.onClick(() => void this.offerMoveNotes(true)),
			);

		new Setting(containerEl)
			.setName(s.setDeleteEmpty)
			.setDesc(s.setDeleteEmptyDesc)
			.addButton((b) =>
				b
					.setButtonText(s.deleteEmptyBtn)
					.setWarning()
					.onClick(async () => {
						const files = await findEmptyPlannerNotes(
							this.app,
							this.plugin.settings,
						);
						if (files.length === 0) {
							new Notice(s.noEmptyNotes);
							return;
						}
						new ConfirmModal(
							this.app,
							this.plugin.settings.language,
							s.deleteEmptyBtn,
							s.deleteEmptyConfirm(files.length),
							s.deleteEmptyBtn,
							() => {
								void (async (): Promise<void> => {
									await trashFiles(this.app, files);
									new Notice(s.deletedEmptyNotes(files.length));
									this.plugin.refreshViews();
								})();
							},
						).open();
					}),
			);
	}
}
