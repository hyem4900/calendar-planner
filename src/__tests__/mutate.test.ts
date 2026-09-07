import { describe, expect, it } from 'vitest';
import {
	appendItem,
	removeItem,
	setSectionBody,
	toggleSectionTask,
	toggleTodo,
	updateItemText,
} from '../mutate';
import {
	defaultScaffold,
	parseNote,
	sectionBodyText,
	type ParsedSection,
	type ParseResult,
	type SectionSpec,
} from '../parser';

const PARSE_OPTS: SectionSpec[] = [
	{ id: 'event', heading: 'Events', type: 'list' },
	{ id: 'todo', heading: 'Todo', type: 'checklist' },
];
const MEMO_OPTS: SectionSpec[] = [
	...PARSE_OPTS,
	{ id: 'memo', heading: 'Memo', type: 'free' },
];
const HEADINGS = MEMO_OPTS;

/** The section with this id, as a nullable — Map.get yields undefined. */
const sec = (r: ParseResult, id: string): ParsedSection | null =>
	r.sections.get(id) ?? null;

/** Grab the item at 0-based `line` from `content` (line + raw for the mutate call). */
const at = (content: string, line: number): string => content.split('\n')[line]!;

describe('updateItemText', () => {
	const C = ['## Events', '---', '- old text', '- keep'].join('\n');

	it('replaces text, keeping indent and marker', () => {
		const out = updateItemText(C, 2, '- old text', 'new text');
		expect(out).toBe(['## Events', '---', '- new text', '- keep'].join('\n'));
	});

	it('preserves indent and marker of a nested item', () => {
		const c = ['## Events', '- p', '  * child old'].join('\n');
		const out = updateItemText(c, 2, '  * child old', 'child new');
		expect(out).toBe(['## Events', '- p', '  * child new'].join('\n'));
	});

	it('returns null when raw does not match (external edit)', () => {
		expect(updateItemText(C, 2, '- stale', 'x')).toBeNull();
	});

	it('returns null for an out-of-range line', () => {
		expect(updateItemText(C, 99, '- old text', 'x')).toBeNull();
	});

	it('returns null when the line is not a list item', () => {
		expect(updateItemText(C, 1, '---', 'x')).toBeNull();
	});

	it('only touches the target when identical items repeat', () => {
		const c = ['## Todo', '- [ ] 회의', '- [ ] 회의'].join('\n');
		const out = updateItemText(c, 2, '- [ ] 회의', '회의 B');
		expect(out).toBe(['## Todo', '- [ ] 회의', '- [ ] 회의 B'].join('\n'));
	});

	it('collapses pasted newlines to spaces', () => {
		const out = updateItemText(C, 2, '- old text', 'a\nb\r\nc');
		expect(out).toBe(['## Events', '---', '- a b c', '- keep'].join('\n'));
	});

	it('trims surrounding whitespace', () => {
		const out = updateItemText(C, 2, '- old text', '   spaced   ');
		expect(at(out!, 2)).toBe('- spaced');
	});

	it('empty text deletes the item (delegates to removeItem)', () => {
		expect(updateItemText(C, 2, '- old text', '')).toBe(
			['## Events', '---', '- keep'].join('\n'),
		);
		expect(updateItemText(C, 2, '- old text', '   ')).toBe(
			['## Events', '---', '- keep'].join('\n'),
		);
	});

	it('keeps the CRLF ending of the edited line and the rest of the file', () => {
		const c = '## Events\r\n- old\r\n- keep\r\n';
		const out = updateItemText(c, 1, '- old\r', 'new');
		expect(out).toBe('## Events\r\n- new\r\n- keep\r\n');
	});

	it('an unchanged edit yields identical content', () => {
		expect(updateItemText(C, 2, '- old text', 'old text')).toBe(C);
	});
});

describe('toggleTodo', () => {
	it('unchecked → checked and back', () => {
		const c = ['## Todo', '- [ ] a'].join('\n');
		const checked = toggleTodo(c, 1, '- [ ] a')!;
		expect(checked).toBe(['## Todo', '- [x] a'].join('\n'));
		expect(toggleTodo(checked, 1, '- [x] a')).toBe(c);
	});

	it('capital X counts as checked', () => {
		expect(toggleTodo('- [X] a', 0, '- [X] a')).toBe('- [ ] a');
	});

	it('custom states become checked', () => {
		expect(toggleTodo('- [-] a', 0, '- [-] a')).toBe('- [x] a');
		expect(toggleTodo('- [/] a', 0, '- [/] a')).toBe('- [x] a');
	});

	it('keeps indent and every bit of spacing, changing only the bracket char', () => {
		const line = '  *  [ ]   spaced  text ';
		expect(toggleTodo(line, 0, line)).toBe('  *  [x]   spaced  text ');
	});

	it('preserves indent of a nested todo', () => {
		const c = ['## Todo', '- p', '\t- [ ] child'].join('\n');
		expect(toggleTodo(c, 2, '\t- [ ] child')).toBe(
			['## Todo', '- p', '\t- [x] child'].join('\n'),
		);
	});

	it('returns null on raw mismatch and for non-todo lines', () => {
		expect(toggleTodo('- [ ] a', 0, '- [ ] b')).toBeNull();
		expect(toggleTodo('- plain event', 0, '- plain event')).toBeNull();
	});

	it('CRLF: only the target line changes', () => {
		const c = '## Todo\r\n- [ ] a\r\n- [ ] b\r\n';
		expect(toggleTodo(c, 1, '- [ ] a\r')).toBe(
			'## Todo\r\n- [x] a\r\n- [ ] b\r\n',
		);
	});
});

describe('removeItem', () => {
	it('removes a plain item, leaving the rest intact', () => {
		const c = ['## Events', '- a', '- b', '- c'].join('\n');
		expect(removeItem(c, 2, '- b')).toBe(['## Events', '- a', '- c'].join('\n'));
	});

	it('removes nested children and continuation lines with the parent', () => {
		const c = [
			'## Events',
			'- parent',
			'  - child',
			'    - grand',
			'  more text',
			'- sibling',
		].join('\n');
		expect(removeItem(c, 1, '- parent')).toBe(
			['## Events', '- sibling'].join('\n'),
		);
	});

	it('removing a child leaves the parent and later siblings', () => {
		const c = ['## Events', '- parent', '  - child', '- sibling'].join('\n');
		expect(removeItem(c, 2, '  - child')).toBe(
			['## Events', '- parent', '- sibling'].join('\n'),
		);
	});

	it('does not renumber an ordered list', () => {
		const c = ['## Events', '1. one', '2. two', '3. three'].join('\n');
		expect(removeItem(c, 2, '2. two')).toBe(
			['## Events', '1. one', '3. three'].join('\n'),
		);
	});

	it('keeps a trailing newline when removing the last content line', () => {
		const c = '## Events\n- a\n- b\n';
		expect(removeItem(c, 2, '- b')).toBe('## Events\n- a\n');
	});

	it('removes the only line down to an empty string', () => {
		expect(removeItem('- a', 0, '- a')).toBe('');
	});

	it('returns null on raw mismatch', () => {
		expect(removeItem('## Events\n- a', 1, '- stale')).toBeNull();
	});

	it('does not cross a heading when collecting children', () => {
		const c = ['## Events', '- a', '## Todo', '- [ ] b'].join('\n');
		expect(removeItem(c, 1, '- a')).toBe(
			['## Events', '## Todo', '- [ ] b'].join('\n'),
		);
	});
});

describe('appendItem', () => {
	const C = [
		'## Events',
		'---',
		'- one',
		'- two',
		'',
		'## Todo',
		'---',
		'- [ ] task',
		'',
	].join('\n');

	it('adds an event at the bottom of the Events body', () => {
		const out = appendItem(C, HEADINGS, 'event', 'three')!;
		expect(out.split('\n').slice(0, 5)).toEqual([
			'## Events',
			'---',
			'- one',
			'- two',
			'- three',
		]);
	});

	it('adds a todo with the checkbox marker', () => {
		const out = appendItem(C, HEADINGS, 'todo', 'next')!;
		const todo = sec(parseNote(out, PARSE_OPTS), 'todo')!;
		expect(todo.items.map((i) => [i.text, i.checked])).toEqual([
			['task', false],
			['next', false],
		]);
	});


	it('position "top" inserts right after the rule line', () => {
		const out = appendItem(C, HEADINGS, 'event', 'zero', 'top')!;
		expect(out.split('\n').slice(0, 4)).toEqual([
			'## Events',
			'---',
			'- zero',
			'- one',
		]);
	});

	it('bottom insert does not leak into the following section', () => {
		const out = appendItem(C, HEADINGS, 'event', 'three')!;
		expect(sec(parseNote(out, PARSE_OPTS), 'event')!.items.map((i) => i.text)).toEqual(
			['one', 'two', 'three'],
		);
		expect(sec(parseNote(out, PARSE_OPTS), 'todo')!.items.map((i) => i.text)).toEqual([
			'task',
		]);
	});

	it('empty or whitespace-only text is a no-op → null', () => {
		expect(appendItem(C, HEADINGS, 'event', '')).toBeNull();
		expect(appendItem(C, HEADINGS, 'event', '   ')).toBeNull();
		expect(appendItem(C, HEADINGS, 'todo', '\n\t ')).toBeNull();
	});

	it('collapses newlines in the new item text', () => {
		const out = appendItem(C, HEADINGS, 'event', 'multi\nline\npaste')!;
		expect(out.includes('- multi line paste')).toBe(true);
	});

	it('creates the heading + rule at EOF when the section is absent', () => {
		const c = '## Events\n---\n- only events\n';
		const out = appendItem(c, HEADINGS, 'todo', 'first todo')!;
		expect(out).toBe(
			'## Events\n---\n- only events\n\n## Todo\n---\n- [ ] first todo\n',
		);
		const parsed = parseNote(out, PARSE_OPTS);
		expect(sec(parsed, 'todo')!.items.map((i) => i.text)).toEqual(['first todo']);
	});

	it('creates a section in an otherwise empty note', () => {
		expect(appendItem('', HEADINGS, 'event', 'x')).toBe(
			'## Events\n---\n- x\n',
		);
	});

	it('fills an empty section body', () => {
		const c = '## Events\n---\n\n## Todo\n---\n';
		const out = appendItem(c, HEADINGS, 'event', 'first')!;
		expect(sec(parseNote(out, PARSE_OPTS), 'event')!.items.map((i) => i.text)).toEqual(
			['first'],
		);
		// the Todo heading must still be intact after it
		expect(sec(parseNote(out, PARSE_OPTS), 'todo')).not.toBeNull();
	});

	it('honours custom heading names for both lookup and creation', () => {
		const c = '## 일정\n- a\n';
		const h: SectionSpec[] = [
			{ id: 'event', heading: '일정', type: 'list' },
			{ id: 'todo', heading: '할일', type: 'checklist' },
		];
		const withEvent = appendItem(c, h, 'event', 'b')!;
		expect(
			sec(parseNote(withEvent, h), 'event')!.items.map((i) => i.text),
		).toEqual(['a', 'b']);
		const withTodo = appendItem(c, h, 'todo', 't')!;
		expect(withTodo.includes('## 할일')).toBe(true);
	});

	it('CRLF file → inserted line gets a trailing \\r', () => {
		const c = '## Events\r\n---\r\n- a\r\n';
		const out = appendItem(c, HEADINGS, 'event', 'b')!;
		expect(out).toBe('## Events\r\n---\r\n- a\r\n- b\r\n');
	});
});

describe('mutate — sequence on the default scaffold', () => {
	it('append, toggle, edit, remove all compose from empty sections', () => {
		let c = defaultScaffold(PARSE_OPTS);

		// the scaffold has three empty sections, no items
		expect(sec(parseNote(c, PARSE_OPTS), 'event')!.items).toHaveLength(0);
		expect(sec(parseNote(c, PARSE_OPTS), 'todo')!.items).toHaveLength(0);

		// add an event, then rename it
		c = appendItem(c, HEADINGS, 'event', '스탠드업 0930')!;
		const ev0 = sec(parseNote(c, PARSE_OPTS), 'event')!.items[0]!;
		c = updateItemText(c, ev0.line, ev0.raw, '스탠드업 09:30')!;
		expect(sec(parseNote(c, PARSE_OPTS), 'event')!.items.map((i) => i.text)).toEqual([
			'스탠드업 09:30',
		]);

		// add two todos, check the first
		c = appendItem(c, HEADINGS, 'todo', '보고서 초안 작성')!;
		c = appendItem(c, HEADINGS, 'todo', '배포 점검')!;
		const todo0 = sec(parseNote(c, PARSE_OPTS), 'todo')!.items[0]!;
		c = toggleTodo(c, todo0.line, todo0.raw)!;
		expect(
			sec(parseNote(c, PARSE_OPTS), 'todo')!.items.map((i) => [i.text, i.checked]),
		).toEqual([
			['보고서 초안 작성', true],
			['배포 점검', false],
		]);

		// remove the checked todo
		const done = sec(parseNote(c, PARSE_OPTS), 'todo')!.items[0]!;
		c = removeItem(c, done.line, done.raw)!;
		expect(sec(parseNote(c, PARSE_OPTS), 'todo')!.items.map((i) => i.text)).toEqual([
			'배포 점검',
		]);
	});
});

describe('setSectionBody', () => {
	const withMemo = [
		'## Events',
		'---',
		'',
		'## Memo',
		'---',
		'old line',
		'',
	].join('\n');

	it('replaces the whole Memo body verbatim, keeping a spacer before the next heading', () => {
		const c = [
			'## Memo',
			'---',
			'old',
			'',
			'## Events',
			'---',
			'- e',
		].join('\n');
		const out = setSectionBody(c, HEADINGS, 'memo', '- bullet\n\n```\ncode\n```', 'old')!;
		expect(sectionBodyText(out, sec(parseNote(out, MEMO_OPTS), 'memo')!)).toBe(
			'- bullet\n\n```\ncode\n```',
		);
		// the Events section is still intact after the memo block
		expect(sec(parseNote(out, MEMO_OPTS), 'event')!.items.map((i) => i.text)).toEqual(
			['e'],
		);
	});

	it('clearing the body leaves an empty Memo section', () => {
		const out = setSectionBody(withMemo, HEADINGS, 'memo', '   \n  ', 'old line')!;
		expect(sectionBodyText(out, sec(parseNote(out, MEMO_OPTS), 'memo')!)).toBe('');
	});

	it('creates the Memo section at EOF when absent', () => {
		const c = '## Events\n---\n- e\n';
		const out = setSectionBody(c, HEADINGS, 'memo', 'first memo', '')!;
		expect(out).toContain('## Memo');
		expect(sectionBodyText(out, sec(parseNote(out, MEMO_OPTS), 'memo')!)).toBe(
			'first memo',
		);
	});

	it('returns null when the current body no longer matches `expected`', () => {
		expect(setSectionBody(withMemo, HEADINGS, 'memo', 'new', 'stale')).toBeNull();
	});

	it('CRLF file: inserted lines get a trailing \\r', () => {
		const c = '## Memo\r\n---\r\nold\r\n';
		const out = setSectionBody(c, HEADINGS, 'memo', 'a\nb', 'old')!;
		expect(out).toBe('## Memo\r\n---\r\na\r\nb\r\n');
	});
});

describe('toggleSectionTask', () => {
	const body = (c: string): string =>
		sectionBodyText(c, sec(parseNote(c, MEMO_OPTS), 'memo')!);

	it('flips the indexed checkbox and leaves the rest byte identical', () => {
		const c = [
			'## Todo',
			'---',
			'- [ ] todo item',
			'',
			'## Memo',
			'---',
			'노트',
			'- [ ] first',
			'  - [x] nested second',
			'- [ ] third',
			'',
		].join('\n');

		const out = toggleSectionTask(c, HEADINGS, 'memo', 1, body(c))!;
		expect(out.split('\n')).toEqual([
			'## Todo',
			'---',
			'- [ ] todo item',
			'',
			'## Memo',
			'---',
			'노트',
			'- [ ] first',
			'  - [ ] nested second',
			'- [ ] third',
			'',
		]);

		expect(body(toggleSectionTask(out, HEADINGS, 'memo', 0, body(out))!)).toContain(
			'- [x] first',
		);
	});

	it('never reaches outside the Memo block', () => {
		const c = [
			'## Todo',
			'---',
			'- [ ] a todo',
			'',
			'## Memo',
			'---',
			'- [ ] a memo task',
			'',
		].join('\n');

		const out = toggleSectionTask(c, HEADINGS, 'memo', 0, body(c))!;
		expect(sec(parseNote(out, MEMO_OPTS), 'todo')!.items[0]!.checked).toBe(false);
		expect(out).toContain('- [x] a memo task');
	});

	it('skips task lines inside fenced code blocks', () => {
		const c = [
			'## Memo',
			'---',
			'```md',
			'- [ ] not a checkbox',
			'```',
			'- [ ] real one',
			'',
		].join('\n');

		const out = toggleSectionTask(c, HEADINGS, 'memo', 0, body(c))!;
		expect(out).toContain('- [ ] not a checkbox');
		expect(out).toContain('- [x] real one');
	});

	it('counts blockquoted tasks, which render as checkboxes too', () => {
		const c = ['## Memo', '---', '> - [ ] quoted', ''].join('\n');
		expect(toggleSectionTask(c, HEADINGS, 'memo', 0, body(c))).toContain(
			'> - [x] quoted',
		);
	});

	it('returns null on a stale body, a bad index or a missing section', () => {
		const c = ['## Memo', '---', '- [ ] one', ''].join('\n');
		expect(toggleSectionTask(c, HEADINGS, 'memo', 0, 'something else')).toBeNull();
		expect(toggleSectionTask(c, HEADINGS, 'memo', 3, body(c))).toBeNull();
		expect(toggleSectionTask('## Todo\n---\n', HEADINGS, 'memo', 0, '')).toBeNull();
	});

	it('keeps CRLF endings', () => {
		const c = '## Memo\r\n---\r\n- [ ] one\r\n';
		expect(toggleSectionTask(c, HEADINGS, 'memo', 0, '- [ ] one')).toBe(
			'## Memo\r\n---\r\n- [x] one\r\n',
		);
	});
});

describe('appendItem / setSectionBody — arbitrary sections', () => {
	const SPECS: SectionSpec[] = [
		{ id: 'a', heading: 'Groceries', type: 'checklist' },
		{ id: 'b', heading: 'Log', type: 'free' },
		{ id: 'c', heading: 'Links', type: 'list' },
	];

	it('writes the marker the section type asks for', () => {
		const c = defaultScaffold(SPECS);
		const withTask = appendItem(c, SPECS, 'a', 'milk')!;
		expect(withTask).toContain('- [ ] milk');
		const withLink = appendItem(withTask, SPECS, 'c', 'example.com')!;
		expect(withLink).toContain('- example.com');
		expect(withLink).not.toContain('- [ ] example.com');
	});

	it('refuses to append an item to a free-form section', () => {
		expect(appendItem(defaultScaffold(SPECS), SPECS, 'b', 'x')).toBeNull();
	});

	it('refuses a section id that is not configured', () => {
		expect(appendItem(defaultScaffold(SPECS), SPECS, 'nope', 'x')).toBeNull();
		expect(setSectionBody('', SPECS, 'nope', 'x', '')).toBeNull();
	});

	it('setSectionBody only works on a free section', () => {
		const c = defaultScaffold(SPECS);
		expect(setSectionBody(c, SPECS, 'a', 'text', '')).toBeNull();
		const out = setSectionBody(c, SPECS, 'b', 'a log line', '')!;
		expect(sectionBodyText(out, sec(parseNote(out, SPECS), 'b')!)).toBe(
			'a log line',
		);
		// the sections around it survive
		expect(sec(parseNote(out, SPECS), 'a')).not.toBeNull();
		expect(sec(parseNote(out, SPECS), 'c')).not.toBeNull();
	});

	it('toggleSectionTask flips a checkbox inside a free section', () => {
		const c = '## Log\n---\n- [ ] one\n';
		const out = toggleSectionTask(c, SPECS, 'b', 0, '- [ ] one')!;
		expect(out).toBe('## Log\n---\n- [x] one\n');
	});

	it('appends a missing section at EOF with its configured heading', () => {
		const out = appendItem('# Title\n', SPECS, 'c', 'first')!;
		expect(out).toContain('## Links');
		expect(sec(parseNote(out, SPECS), 'c')!.items.map((i) => i.text)).toEqual(
			['first'],
		);
	});
});
