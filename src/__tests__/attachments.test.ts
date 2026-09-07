import { describe, expect, it } from 'vitest';
import {
	attachmentName,
	extensionFor,
	IMAGE_EXTENSIONS,
	isImageExtension,
} from '../attachments';

/** Fixed clock, so the timestamped names are exact. */
const AT = new Date(2026, 8, 7, 4, 5, 6); // 2026-09-07 04:05:06

describe('extensionFor', () => {
	it('maps the image types the sidebar can show', () => {
		expect(extensionFor('image/gif')).toBe('gif');
		expect(extensionFor('image/png')).toBe('png');
		expect(extensionFor('image/webp')).toBe('webp');
		expect(extensionFor('image/avif')).toBe('avif');
	});

	it('normalises jpeg and the +xml suffix', () => {
		expect(extensionFor('image/jpeg')).toBe('jpg');
		expect(extensionFor('image/svg+xml')).toBe('svg');
	});

	it('is case-insensitive', () => {
		expect(extensionFor('IMAGE/GIF')).toBe('gif');
	});

	it('falls back to png when the source gave no type', () => {
		expect(extensionFor('')).toBe('png');
	});
});

describe('isImageExtension', () => {
	it('accepts gif in any case, with or without a dot', () => {
		expect(isImageExtension('gif')).toBe(true);
		expect(isImageExtension('GIF')).toBe(true);
		expect(isImageExtension('.gif')).toBe(true);
	});

	it('rejects things the sidebar would not draw', () => {
		expect(isImageExtension('md')).toBe(false);
		expect(isImageExtension('mp4')).toBe(false);
		expect(isImageExtension('')).toBe(false);
	});

	it('covers every extension the set advertises', () => {
		for (const ext of IMAGE_EXTENSIONS) {
			expect(isImageExtension(ext)).toBe(true);
		}
		expect(IMAGE_EXTENSIONS.has('gif')).toBe(true);
	});
});

describe('attachmentName', () => {
	it('keeps a real file’s own name and extension', () => {
		expect(attachmentName('cat.gif', 'image/gif', AT)).toBe('cat.gif');
		expect(attachmentName('shot.png', 'image/png', AT)).toBe('shot.png');
	});

	it('keeps the extension’s case as the file had it', () => {
		expect(attachmentName('cat.GIF', 'image/gif', AT)).toBe('cat.GIF');
	});

	it('timestamps the generic clipboard name but keeps the format', () => {
		expect(attachmentName('image.gif', 'image/gif', AT)).toBe(
			'Pasted image 20260907040506.gif',
		);
		expect(attachmentName('image.png', 'image/png', AT)).toBe(
			'Pasted image 20260907040506.png',
		);
	});

	it('falls back to the MIME type when there is no name at all', () => {
		expect(attachmentName('', 'image/gif', AT)).toBe(
			'Pasted image 20260907040506.gif',
		);
		expect(attachmentName('image', 'image/gif', AT)).toBe(
			'Pasted image 20260907040506.gif',
		);
	});

	it('never rewrites one image format as another', () => {
		// The extension always comes from the file's own name when it has one,
		// so a mislabelled MIME type cannot turn a GIF into a PNG.
		expect(attachmentName('loop.gif', 'image/png', AT)).toBe('loop.gif');
	});

	it('keeps a dotted basename intact', () => {
		expect(attachmentName('v1.2.gif', 'image/gif', AT)).toBe('v1.2.gif');
	});
});
