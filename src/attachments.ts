/*
 * Naming and recognition for images pasted or dropped into a planner note.
 *
 * Pure module — MUST NOT import 'obsidian' (plan.md § F). This is the logic
 * that decides an attachment's extension, and therefore the one place a GIF
 * could quietly stop being a GIF: nothing here (or anywhere else in the
 * plugin) re-encodes an image, so whatever bytes arrived are the bytes that
 * get written, under the extension chosen below.
 */

/** Extensions the sidebar will draw as a picture rather than link to. */
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'bmp',
	'svg',
	'webp',
	'avif',
]);

/** Whether `ext` (with or without a dot, any case) names an image format. */
export function isImageExtension(ext: string): boolean {
	return IMAGE_EXTENSIONS.has(ext.replace(/^\./, '').toLowerCase());
}

/**
 * The extension a MIME type implies: "image/svg+xml" → "svg", "image/jpeg" →
 * "jpg", "image/gif" → "gif". Only consulted when the file arrived without a
 * usable name of its own.
 */
export function extensionFor(mime: string): string {
	const sub = (mime.split('/')[1] ?? '').split('+')[0]!.toLowerCase();
	if (sub === '') return 'png';
	return sub === 'jpeg' ? 'jpg' : sub;
}

/** Two digits, for the timestamp below. */
function pad(n: number): string {
	return String(n).padStart(2, '0');
}

/**
 * A filename for an image being attached.
 *
 * A real file copied or dragged from the file manager keeps its own name and
 * extension. A screenshot arrives from the clipboard as the generic
 * "image.png" with no name worth keeping, so those are named by timestamp the
 * way Obsidian's own paste does — but still under the extension the source
 * gave, so an animated GIF pasted this way stays a `.gif`.
 */
export function attachmentName(
	name: string,
	mime: string,
	now: Date = new Date(),
): string {
	const dot = name.lastIndexOf('.');
	const base = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot + 1) : extensionFor(mime);
	if (base !== '' && base !== 'image') return `${base}.${ext}`;

	const stamp =
		`${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
		`${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
	return `Pasted image ${stamp}.${ext}`;
}
