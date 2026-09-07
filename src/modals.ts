import { App, Modal, Setting } from 'obsidian';
import type { Lang } from './i18n';
import { t } from './i18n';
import type { NoteKind } from './notes';

/**
 * "There is no <yearly|monthly|weekly|daily> note. Create one?" with
 * [Create and open] / [Create] / [Cancel].
 *
 * `onCreate` runs only when the user confirms, and is told whether they asked
 * for the note to be opened as well; Cancel or dismissing the modal does
 * nothing. It fires from `onClose` so the modal DOM is already gone.
 */
export class CreateNoteModal extends Modal {
	private readonly kind: NoteKind;
	private readonly lang: Lang;
	private readonly onCreate: (open: boolean) => void;
	private confirmed: { open: boolean } | null = null;

	constructor(
		app: App,
		kind: NoteKind,
		lang: Lang,
		onCreate: (open: boolean) => void,
	) {
		super(app);
		this.kind = kind;
		this.lang = lang;
		this.onCreate = onCreate;
	}

	onOpen(): void {
		const s = t(this.lang);
		const noun = {
			yearly: s.yearlyNoun,
			monthly: s.monthlyNoun,
			weekly: s.weeklyNoun,
			daily: s.dailyNoun,
		}[this.kind];
		this.titleEl.setText(s.modalTitle(noun));
		this.contentEl.createEl('p', { text: s.modalBody(noun) });

		new Setting(this.contentEl)
			.addButton((b) =>
				b
					.setButtonText(s.createAndOpen)
					.setCta()
					.onClick(() => {
						this.confirmed = { open: true };
						this.close();
					}),
			)
			.addButton((b) =>
				b.setButtonText(s.create).onClick(() => {
					this.confirmed = { open: false };
					this.close();
				}),
			)
			.addButton((b) =>
				b.setButtonText(s.cancel).onClick(() => this.close()),
			);
	}

	onClose(): void {
		this.contentEl.empty();
		if (this.confirmed) this.onCreate(this.confirmed.open);
	}
}

/**
 * A generic "<title> — <message>" confirm dialog with a destructive [confirm]
 * button and [Cancel]. `onConfirm` fires from `onClose` only when confirmed.
 */
export class ConfirmModal extends Modal {
	private confirmed = false;

	constructor(
		app: App,
		private readonly lang: Lang,
		private readonly title: string,
		private readonly message: string,
		private readonly confirmLabel: string,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		const s = t(this.lang);
		this.titleEl.setText(this.title);
		this.contentEl.createEl('p', { text: this.message });

		new Setting(this.contentEl)
			.addButton((b) =>
				b
					.setButtonText(this.confirmLabel)
					.setWarning()
					.onClick(() => {
						this.confirmed = true;
						this.close();
					}),
			)
			.addButton((b) =>
				b.setButtonText(s.cancel).onClick(() => this.close()),
			);
	}

	onClose(): void {
		this.contentEl.empty();
		if (this.confirmed) this.onConfirm();
	}
}
