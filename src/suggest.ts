import { AbstractInputSuggest, TFile, TFolder } from 'obsidian';
import type { App } from 'obsidian';

/*
 * `Setting` has no folder/file autocomplete helper (plan.md pitfall D), so these
 * subclass `AbstractInputSuggest` (Obsidian 1.4.10+) and attach to a plain text
 * input. Picking a suggestion writes it into the input and fires an `input`
 * event so the enclosing `Setting.onChange` runs.
 */

const MAX_SUGGESTIONS = 100;

function commit(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input'));
}

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(
		app: App,
		private readonly input: HTMLInputElement,
	) {
		super(app, input);
	}

	protected getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		return this.app.vault
			.getAllLoadedFiles()
			.filter(
				(f): f is TFolder =>
					f instanceof TFolder &&
					f.path !== '/' &&
					f.path !== '' &&
					f.path.toLowerCase().includes(q),
			)
			.sort((a, b) => a.path.localeCompare(b.path))
			.slice(0, MAX_SUGGESTIONS);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		commit(this.input, folder.path);
		this.close();
	}
}

export class FileSuggest extends AbstractInputSuggest<TFile> {
	constructor(
		app: App,
		private readonly input: HTMLInputElement,
	) {
		super(app, input);
	}

	protected getSuggestions(query: string): TFile[] {
		const q = query.toLowerCase();
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.toLowerCase().includes(q))
			.sort((a, b) => a.path.localeCompare(b.path))
			.slice(0, MAX_SUGGESTIONS);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TFile): void {
		commit(this.input, file.path);
		this.close();
	}
}
