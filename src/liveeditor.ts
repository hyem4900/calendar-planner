/*
 * The free-form section editor: a CodeMirror 6 instance that renders Markdown
 * as it is typed, the way Obsidian's Live Preview does.
 *
 * A `<textarea>` cannot do this — it has one style for all of its text, so a
 * heading cannot be larger than the line under it and `**` cannot be hidden.
 * So the editor is CodeMirror, and the "rendered" look comes from decorations
 * computed off the syntax tree: markers are replaced with nothing, spans get a
 * class, images become widgets. Everything reappears as raw text when the
 * cursor reaches it, which is what makes the text still editable.
 *
 * CodeMirror itself is Obsidian's own copy (the @codemirror/* packages are
 * external at build time); only the Markdown grammar is bundled. No private
 * Obsidian API is used.
 */

import { syntaxTree } from '@codemirror/language';
import { Language, defineLanguageFacet, indentUnit } from '@codemirror/language';
import {
	history,
	historyKeymap,
	defaultKeymap,
	indentWithTab,
} from '@codemirror/commands';
import { EditorState, RangeSetBuilder, type Extension } from '@codemirror/state';
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
	keymap,
	type DecorationSet,
	type ViewUpdate,
} from '@codemirror/view';
import {
	GFM,
	parser as baseMarkdownParser,
	type InlineContext,
	type MarkdownConfig,
} from '@lezer/markdown';

/** How the host resolves an image reference to something the browser can load. */
export interface LiveEditorHost {
	/** A displayable URL for `target`, or null if it does not resolve to an image. */
	imageUrl(target: string): string | null;
	/** Save and close. */
	commit(): void;
	/** Discard and close. */
	cancel(): void;
}

/** One indent level. */
const INDENT = '  ';

/* ---- grammar ------------------------------------------------------------- */

const CH_BANG = 33; // !
const CH_BRACKET = 91; // [

/**
 * Obsidian's `[[link]]` / `![[embed]]`, which CommonMark knows nothing about.
 * Our own image paste writes `![[…]]`, so the editor has to understand it.
 */
const WikiLink: MarkdownConfig = {
	defineNodes: [
		{ name: 'CpWikiLink' },
		{ name: 'CpWikiEmbed' },
		{ name: 'CpWikiMark' },
	],
	parseInline: [
		{
			name: 'CpWikiLink',
			parse(cx: InlineContext, next: number, pos: number): number {
				const embed = next === CH_BANG;
				const open = embed ? pos + 1 : pos;
				if (cx.char(open) !== CH_BRACKET) return -1;
				if (cx.char(open + 1) !== CH_BRACKET) return -1;

				// Scan for the closing "]]" on this line.
				let i = open + 2;
				for (; i < cx.end; i++) {
					const c = cx.char(i);
					if (c === 10) return -1; // newline: not a wiki link
					if (c === 93 && cx.char(i + 1) === 93) break;
				}
				if (i >= cx.end) return -1;
				const end = i + 2;

				return cx.addElement(
					cx.elt(embed ? 'CpWikiEmbed' : 'CpWikiLink', pos, end, [
						cx.elt('CpWikiMark', pos, open + 2),
						cx.elt('CpWikiMark', i, end),
					]),
				);
			},
		},
	],
};

const markdownLanguage = new Language(
	defineLanguageFacet(),
	baseMarkdownParser.configure([...GFM, WikiLink]),
	[],
	'markdown',
);

/* ---- decorations --------------------------------------------------------- */

/** Line decorations, one per heading level. */
const HEADING_LINE = [1, 2, 3, 4, 5, 6].map((n) =>
	Decoration.line({ class: `cp-cm-h${n}` }),
);

const STRONG = Decoration.mark({ class: 'cp-cm-strong' });
const EMPHASIS = Decoration.mark({ class: 'cp-cm-em' });
const STRIKE = Decoration.mark({ class: 'cp-cm-strike' });
const INLINE_CODE = Decoration.mark({ class: 'cp-cm-code' });
const LINK_TEXT = Decoration.mark({ class: 'cp-cm-link' });
const QUOTE_LINE = Decoration.line({ class: 'cp-cm-quote' });
const HIDDEN = Decoration.replace({});

/** An image rendered in place of its Markdown source. */
class ImageWidget extends WidgetType {
	constructor(
		private readonly url: string,
		private readonly alt: string,
	) {
		super();
	}

	eq(other: ImageWidget): boolean {
		return other.url === this.url && other.alt === this.alt;
	}

	toDOM(): HTMLElement {
		const wrap = createSpan({ cls: 'cp-cm-image' });
		wrap.createEl('img', { attr: { src: this.url, alt: this.alt } });
		return wrap;
	}

	/** Clicks land in the document, not on the image. */
	ignoreEvent(): boolean {
		return false;
	}
}

/** The "•" that stands in for a `-` / `*` / `+` list marker. */
class BulletWidget extends WidgetType {
	eq(): boolean {
		return true;
	}

	toDOM(): HTMLElement {
		return createSpan({ cls: 'cp-cm-bullet', text: '•' });
	}
}

/**
 * A real checkbox in place of `- [ ]` / `- [x]`, clickable like the one in the
 * rendered block. List markers are structure rather than syntax to reveal, so —
 * as in Obsidian — these stay rendered even when the cursor is on the line.
 */
class CheckboxWidget extends WidgetType {
	constructor(private readonly checked: boolean) {
		super();
	}

	eq(other: CheckboxWidget): boolean {
		return other.checked === this.checked;
	}

	toDOM(view: EditorView): HTMLElement {
		const box = createEl('input', {
			cls: 'cp-cm-task',
			type: 'checkbox',
		});
		box.checked = this.checked;
		// Keep the caret where it was: the click must not move focus.
		box.addEventListener('mousedown', (evt) => evt.preventDefault());
		box.addEventListener('click', (evt) => {
			evt.preventDefault();
			toggleTaskAt(view, view.posAtDOM(box));
		});
		return box;
	}

	/** The widget handles its own clicks; the editor should not also react. */
	ignoreEvent(): boolean {
		return true;
	}
}

/** Flip the `[ ]` / `[x]` on the line holding `pos`. */
function toggleTaskAt(view: EditorView, pos: number): void {
	const line = view.state.doc.lineAt(pos);
	const m = /^(\s*[-*+][ \t]+\[)([^\]])(\])/.exec(line.text);
	if (!m) return;
	const at = line.from + m[1]!.length;
	const next = m[2] === 'x' || m[2] === 'X' ? ' ' : 'x';
	view.dispatch({ changes: { from: at, to: at + 1, insert: next } });
}

/** Marker node names that are hidden once the cursor leaves their construct. */
const INLINE_MARKS = new Set([
	'EmphasisMark',
	'CodeMark',
	'StrikethroughMark',
	'LinkMark',
	'CpWikiMark',
]);

/** Nodes whose whole span is styled. */
const STYLED: Record<string, Decoration> = {
	StrongEmphasis: STRONG,
	Emphasis: EMPHASIS,
	Strikethrough: STRIKE,
	InlineCode: INLINE_CODE,
	CpWikiLink: LINK_TEXT,
};

interface Range {
	from: number;
	to: number;
}

/** Does the selection touch [from, to]? Touching an edge counts as inside. */
function selectionTouches(state: EditorState, from: number, to: number): boolean {
	return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

/** Does the selection sit on any line that [from, to] covers? */
function selectionOnLine(state: EditorState, from: number, to: number): boolean {
	const first = state.doc.lineAt(from).from;
	const last = state.doc.lineAt(to).to;
	return selectionTouches(state, first, last);
}

function buildDecorations(
	view: EditorView,
	host: LiveEditorHost,
): DecorationSet {
	const { state } = view;
	const builder = new RangeSetBuilder<Decoration>();

	// Decorations must be added in document order, so collect then sort: the
	// syntax tree hands us parents before children, but a line decoration for a
	// heading has to precede the marker replacement inside it anyway.
	const found: { from: number; to: number; deco: Decoration }[] = [];
	const hiddenImages: Range[] = [];

	syntaxTree(state).iterate({
		enter: (node) => {
			const name = node.name;

			// --- headings: style the line, hide the leading "## " ------------
			const heading = /^ATXHeading([1-6])$/.exec(name);
			if (heading) {
				const line = state.doc.lineAt(node.from);
				found.push({
					from: line.from,
					to: line.from,
					deco: HEADING_LINE[Number(heading[1]) - 1]!,
				});
				return;
			}

			if (name === 'HeaderMark') {
				if (selectionOnLine(state, node.from, node.to)) return;
				// Swallow the space after the hashes too.
				let to = node.to;
				if (state.doc.sliceString(to, to + 1) === ' ') to += 1;
				found.push({ from: node.from, to, deco: HIDDEN });
				return;
			}

			// --- list markers ------------------------------------------------
			// A task item's "- " is swallowed by the checkbox below, an ordered
			// item keeps its number, and a plain bullet becomes a real bullet.
			if (name === 'ListMark') {
				if (node.node.nextSibling?.name === 'Task') return;
				if (node.node.parent?.parent?.name === 'OrderedList') return;
				found.push({
					from: node.from,
					to: node.to,
					deco: Decoration.replace({ widget: new BulletWidget() }),
				});
				return;
			}

			if (name === 'TaskMarker') {
				const checked = /^\[[xX]\]$/.test(
					state.doc.sliceString(node.from, node.to),
				);
				// Take the list marker and the gap before us with it, so the
				// checkbox sits where the bullet would have.
				const item = node.node.parent?.parent;
				const mark =
					item?.name === 'ListItem' &&
					item.firstChild?.name === 'ListMark'
						? item.firstChild
						: null;
				found.push({
					from: mark ? mark.from : node.from,
					to: node.to,
					deco: Decoration.replace({
						widget: new CheckboxWidget(checked),
					}),
				});
				return;
			}

			if (name === 'Blockquote') {
				for (
					let l = state.doc.lineAt(node.from).number;
					l <= state.doc.lineAt(node.to).number;
					l++
				) {
					const line = state.doc.line(l);
					found.push({ from: line.from, to: line.from, deco: QUOTE_LINE });
				}
				return;
			}

			// --- images: replace the whole construct with the picture --------
			if (name === 'Image' || name === 'CpWikiEmbed') {
				const raw = state.doc.sliceString(node.from, node.to);
				const target = imageTarget(raw);
				const url = target === null ? null : host.imageUrl(target);
				if (url === null) return; // not an image — leave the source visible
				if (selectionTouches(state, node.from, node.to)) return;
				found.push({
					from: node.from,
					to: node.to,
					deco: Decoration.replace({
						widget: new ImageWidget(url, target ?? ''),
					}),
				});
				hiddenImages.push({ from: node.from, to: node.to });
				return;
			}

			const styled = STYLED[name];
			if (styled) {
				found.push({ from: node.from, to: node.to, deco: styled });
				return;
			}

			if (INLINE_MARKS.has(name)) {
				const parent = node.node.parent;
				const from = parent ? parent.from : node.from;
				const to = parent ? parent.to : node.to;
				if (selectionTouches(state, from, to)) return;
				found.push({ from: node.from, to: node.to, deco: HIDDEN });
				return;
			}

			// A link's URL part is noise once the text is styled.
			if (name === 'URL' && node.node.parent?.name === 'Link') {
				const parent = node.node.parent;
				if (selectionTouches(state, parent.from, parent.to)) return;
				found.push({ from: node.from, to: node.to, deco: HIDDEN });
			}
		},
	});

	// Drop anything inside a replaced image — a decoration may not sit inside a
	// replacement range.
	const kept = found.filter(
		(d) =>
			!hiddenImages.some(
				(img) =>
					d.from >= img.from &&
					d.to <= img.to &&
					!(d.from === img.from && d.to === img.to),
			),
	);

	kept.sort((a, b) => a.from - b.from || a.to - b.to);
	for (const d of kept) builder.add(d.from, d.to, d.deco);
	return builder.finish();
}

/** The link target of an image construct, or null if it is not one. */
function imageTarget(raw: string): string | null {
	// ![[target]] — our own paste writes this
	const wiki = /^!\[\[([^\]]+)\]\]$/.exec(raw);
	if (wiki) return (wiki[1]!.split('|')[0] ?? '').trim();
	// ![alt](target)
	const md = /^!\[[^\]]*\]\(([^)]*)\)$/.exec(raw);
	if (md) return decodeURIComponent(md[1]!.trim());
	return null;
}

function livePreview(host: LiveEditorHost): Extension {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, host);
			}

			update(update: ViewUpdate): void {
				// Selection matters as much as the text: moving the cursor into a
				// construct is what reveals its raw Markdown again.
				if (
					update.docChanged ||
					update.selectionSet ||
					update.viewportChanged
				) {
					this.decorations = buildDecorations(update.view, host);
				}
			}
		},
		{ decorations: (v) => v.decorations },
	);
}

/* ---- the editor ---------------------------------------------------------- */

export interface LiveEditor {
	/** Current text. */
	value(): string;
	focus(): void;
	/** Put the caret at the very end. */
	selectEnd(): void;
	/** Replace the selection with `text`, leaving the caret after it. */
	insert(text: string): void;
	/** The editor's root element. */
	dom: HTMLElement;
	destroy(): void;
}

/**
 * Build the editor into `parent`. `initial` is the section body as written in
 * the note; the caller keeps ownership of saving it.
 */
export function createLiveEditor(
	parent: HTMLElement,
	initial: string,
	host: LiveEditorHost,
): LiveEditor {
	const view = new EditorView({
		parent,
		state: EditorState.create({
			doc: initial,
			extensions: [
				markdownLanguage,
				history(),
				EditorView.lineWrapping,
				// Two spaces per level: a sidebar is narrow, and nested list
				// items have to stay readable in it.
				indentUnit.of(INDENT),
				EditorState.tabSize.of(INDENT.length),
				livePreview(host),
				keymap.of([
					{
						key: 'Mod-Enter',
						run: () => {
							host.commit();
							return true;
						},
					},
					{
						key: 'Escape',
						run: () => {
							host.cancel();
							return true;
						},
					},
					...historyKeymap,
					// Tab indents instead of moving focus out of the editor —
					// unbound, the browser would tab away and the blur would
					// close the editor mid-thought. Escape is still the way out.
					indentWithTab,
					// Enter, arrows, selection, clipboard — CodeMirror's own.
					...defaultKeymap,
				]),
				EditorView.domEventHandlers({
					blur: () => {
						host.commit();
						return false;
					},
				}),
				EditorView.editorAttributes.of({ class: 'cp-cm' }),
			],
		}),
	});

	return {
		value: (): string => view.state.doc.toString(),
		focus: (): void => view.focus(),
		selectEnd: (): void => {
			const end = view.state.doc.length;
			view.dispatch({ selection: { anchor: end } });
		},
		insert: (text: string): void => {
			const { from, to } = view.state.selection.main;
			view.dispatch({
				changes: { from, to, insert: text },
				selection: { anchor: from + text.length },
			});
			view.focus();
		},
		dom: view.dom,
		destroy: (): void => view.destroy(),
	};
}
