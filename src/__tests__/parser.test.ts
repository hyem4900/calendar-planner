import { describe, expect, it } from 'vitest';
import {
	blockEndOf,
	defaultScaffold,
	parseNote,
	sectionBodyText,
	taskLinesIn,
	type ParsedSection,
	type ParseResult,
	type SectionSpec,
} from '../parser';

const OPTS: SectionSpec[] = [
	{ id: 'event', heading: 'Events', type: 'list' },
	{ id: 'todo', heading: 'Todo', type: 'checklist' },
];
const MEMO_SPEC: SectionSpec = { id: 'memo', heading: 'Memo', type: 'free' };
const MEMO_OPTS: SectionSpec[] = [...OPTS, MEMO_SPEC];
const parse = (content: string): ParseResult => parseNote(content, OPTS);

/** The section with this id, as a nullable — Map.get yields undefined. */
const sec = (r: ParseResult, id: string): ParsedSection | null =>
	r.sections.get(id) ?? null;

/** The default scaffold from plan.md § 6. */
const SCAFFOLD = [
	'## Events', // 0
	'---', // 1
	'- 팀 주간 미팅 10:00', // 2
	'- 저녁 약속 19:00', // 3
	'', // 4
	'## Todo', // 5
	'---', // 6
	'- [ ] 보고서 초안 작성', // 7
	'- [x] 회의 자료 준비', // 8
	'', // 9
	'## Memo', // 10
	'---', // 11
	'', // 12
].join('\n');

describe('parseNote — default scaffold', () => {
	const r = parse(SCAFFOLD);

	it('finds both sections', () => {
		expect(sec(r, 'event')).not.toBeNull();
		expect(sec(r, 'todo')).not.toBeNull();
		expect(r.lineCount).toBe(13);
	});

	it('Events section ranges and items', () => {
		const s = sec(r, 'event')!;
		expect(s.headingLine).toBe(0);
		expect(s.ruleLine).toBe(1);
		expect(s.bodyStart).toBe(2);
		expect(s.bodyEnd).toBe(5); // the "## Todo" line
		expect(s.items).toHaveLength(2);
		expect(s.items[0]).toMatchObject({
			kind: 'list',
			line: 2,
			raw: '- 팀 주간 미팅 10:00',
			indent: '',
			marker: '- ',
			text: '팀 주간 미팅 10:00',
			checked: false,
			depth: 0,
		});
		expect(s.items[1]!.line).toBe(3);
		expect(s.items[1]!.text).toBe('저녁 약속 19:00');
	});

	it('Todo section: checkbox state and markers', () => {
		const s = sec(r, 'todo')!;
		expect(s.headingLine).toBe(5);
		expect(s.ruleLine).toBe(6);
		expect(s.bodyStart).toBe(7);
		expect(s.bodyEnd).toBe(10); // the "## Memo" line
		expect(s.items).toHaveLength(2);
		expect(s.items[0]).toMatchObject({
			kind: 'checklist',
			line: 7,
			marker: '- [ ] ',
			text: '보고서 초안 작성',
			checked: false,
		});
		expect(s.items[1]).toMatchObject({
			kind: 'checklist',
			line: 8,
			marker: '- [x] ',
			text: '회의 자료 준비',
			checked: true,
		});
	});

	it('every item round-trips: indent + marker + text === the line', () => {
		const lines = SCAFFOLD.split('\n');
		for (const s of [sec(r, 'event')!, sec(r, 'todo')!]) {
			for (const it of s.items) {
				expect(it.indent + it.marker + it.text).toBe(lines[it.line]);
			}
		}
	});
});

describe('parseNote — missing / partial headings', () => {
	it('only Events', () => {
		const r = parse('## Events\n---\n- a\n');
		expect(sec(r, 'event')!.items).toHaveLength(1);
		expect(sec(r, 'todo')).toBeNull();
	});

	it('only Todo', () => {
		const r = parse('## Todo\n---\n- [ ] a\n');
		expect(sec(r, 'event')).toBeNull();
		expect(sec(r, 'todo')!.items).toHaveLength(1);
	});

	it('neither heading — no throw, both null', () => {
		const r = parse('# Title\n\nsome text\n- a stray bullet\n');
		expect(sec(r, 'event')).toBeNull();
		expect(sec(r, 'todo')).toBeNull();
		expect(r.lineCount).toBe(5);
	});

	it('empty string', () => {
		const r = parse('');
		expect(r.sections.size).toBe(0);
		expect(r.lineCount).toBe(1);
	});
});

describe('parseNote — heading order and matching', () => {
	it('Todo before Events: both parsed, each under its own id', () => {
		const content = [
			'## Todo',
			'---',
			'- [ ] first',
			'',
			'## Events',
			'---',
			'- second',
		].join('\n');
		const r = parse(content);
		expect(sec(r, 'todo')!.headingLine).toBe(0);
		expect(sec(r, 'todo')!.items[0]!.text).toBe('first');
		expect(sec(r, 'event')!.headingLine).toBe(4);
		expect(sec(r, 'event')!.items[0]!.text).toBe('second');
		expect(sec(r, 'todo')!.bodyEnd).toBe(4); // ends at the Events heading
	});

	it('case- and whitespace-insensitive heading match', () => {
		const r = parse('##   eVeNtS  \n- a\n##\tTODO\n- [ ] b\n');
		expect(sec(r, 'event')!.items[0]!.text).toBe('a');
		expect(sec(r, 'todo')!.items[0]!.text).toBe('b');
	});

	it('custom configured heading names', () => {
		const r = parseNote('## 일정\n- a\n## 할일\n- [ ] b\n', [
			{ id: 'event', heading: ' 일정 ', type: 'list' },
			{ id: 'todo', heading: '할일', type: 'checklist' },
		]);
		expect(sec(r, 'event')!.items[0]!.text).toBe('a');
		expect(sec(r, 'todo')!.items[0]!.text).toBe('b');
	});

	it('a duplicate heading is ignored; the first one wins', () => {
		const r = parse('## Events\n- a\n## Events\n- b\n');
		expect(sec(r, 'event')!.headingLine).toBe(0);
		expect(sec(r, 'event')!.items.map((i) => i.text)).toEqual(['a']);
		expect(sec(r, 'event')!.bodyEnd).toBe(2);
	});

	it('a deeper heading ends the section body', () => {
		const r = parse('## Events\n---\n- a\n### sub\n- b\n');
		expect(sec(r, 'event')!.items.map((i) => i.text)).toEqual(['a']);
		expect(sec(r, 'event')!.bodyEnd).toBe(3); // the "### sub" line
	});
});

describe('parseNote — no rule line', () => {
	it('section works without the "---" under the heading', () => {
		const r = parse('## Events\n- a\n- b\n');
		const s = sec(r, 'event')!;
		expect(s.ruleLine).toBeNull();
		expect(s.bodyStart).toBe(1);
		expect(s.items.map((i) => i.line)).toEqual([1, 2]);
	});

	it('a "---" that is not right under the heading is not the rule line', () => {
		const r = parse('## Events\n- a\n---\n- b\n');
		expect(sec(r, 'event')!.ruleLine).toBeNull();
		expect(sec(r, 'event')!.bodyStart).toBe(1);
		// the stray "---" is just a non-item body line, items keep real line numbers
		expect(sec(r, 'event')!.items.map((i) => i.line)).toEqual([1, 3]);
	});
});

describe('parseNote — empty sections still report a range', () => {
	it('gives bodyStart/bodyEnd so an append position can be computed', () => {
		const r = parse('## Events\n---\n\n## Todo\n---\n');
		expect(sec(r, 'event')!.items).toHaveLength(0);
		expect(sec(r, 'event')!.bodyStart).toBe(2);
		expect(sec(r, 'event')!.bodyEnd).toBe(3); // the "## Todo" line
		expect(sec(r, 'todo')!.items).toHaveLength(0);
		expect(sec(r, 'todo')!.bodyStart).toBe(5);
		expect(sec(r, 'todo')!.bodyEnd).toBe(6);
	});

	it('heading as the very last line', () => {
		const r = parse('foo\n## Events');
		expect(sec(r, 'event')!.headingLine).toBe(1);
		expect(sec(r, 'event')!.bodyStart).toBe(2);
		expect(sec(r, 'event')!.bodyEnd).toBe(2);
		expect(sec(r, 'event')!.items).toHaveLength(0);
	});
});

describe('parseNote — fenced code blocks', () => {
	it('ignores headings and items inside ``` fences without shifting line numbers', () => {
		const content = [
			'## Events', // 0
			'---', // 1
			'- real one', // 2
			'```md', // 3
			'## Events', // 4  (not a heading)
			'- [ ] fake todo', // 5  (not an item)
			'```', // 6
			'- real two', // 7
			'',
			'## Todo', // 9
			'- [ ] actual', // 10
		].join('\n');
		const r = parse(content);
		expect(sec(r, 'event')!.items.map((i) => i.line)).toEqual([2, 7]);
		expect(sec(r, 'event')!.items.map((i) => i.text)).toEqual([
			'real one',
			'real two',
		]);
		expect(sec(r, 'event')!.bodyEnd).toBe(9);
		expect(sec(r, 'todo')!.items[0]!.line).toBe(10);
	});

	it('handles ~~~ fences too', () => {
		const r = parse(
			['## Events', '~~~', '- nope', '~~~', '- yep'].join('\n'),
		);
		expect(sec(r, 'event')!.items.map((i) => i.text)).toEqual(['yep']);
		expect(sec(r, 'event')!.items[0]!.line).toBe(4);
	});

	it('an unclosed fence runs to EOF', () => {
		const r = parse('## Events\n```\n- swallowed\n- also swallowed\n');
		expect(sec(r, 'event')!.items).toHaveLength(0);
	});

	it('a longer closing fence closes a shorter opener; a shorter one does not', () => {
		const r = parse(
			['## Events', '``', 'not a fence', '```', '- x inside', '````', '- y outside'].join(
				'\n',
			),
		);
		// "``" is only 2 backticks — not a fence; "```" opens, "````" closes.
		expect(sec(r, 'event')!.items.map((i) => i.text)).toEqual(['y outside']);
	});
});

describe('parseNote — item shapes', () => {
	it('bullet variants and ordered lists are plain list items', () => {
		const r = parse(
			['## Events', '- dash', '* star', '+ plus', '1. one', '2) two'].join('\n'),
		);
		expect(sec(r, 'event')!.items.map((i) => [i.kind, i.marker])).toEqual([
			['list', '- '],
			['list', '* '],
			['list', '+ '],
			['list', '1. '],
			['list', '2) '],
		]);
	});

	it('custom checkbox states are checklist items and count as unchecked', () => {
		const r = parse(
			[
				'## Todo',
				'- [ ] plain',
				'- [x] done',
				'- [X] DONE',
				'- [-] cancelled',
				'- [/] partial',
				'- [>] deferred',
			].join('\n'),
		);
		expect(sec(r, 'todo')!.items.map((i) => [i.kind, i.checked])).toEqual([
			['checklist', false],
			['checklist', true],
			['checklist', true],
			['checklist', false],
			['checklist', false],
			['checklist', false],
		]);
	});

	it('preserves odd spacing so the line round-trips', () => {
		const lines = ['## Events', '-   wide gap', '- trailing   ', '- [x]nospace'];
		const r = parse(lines.join('\n'));
		for (const it of sec(r, 'event')!.items) {
			expect(it.indent + it.marker + it.text).toBe(lines[it.line]);
		}
		expect(sec(r, 'event')!.items[0]!.marker).toBe('-   ');
		expect(sec(r, 'event')!.items[1]!.text).toBe('trailing   ');
		expect(sec(r, 'event')!.items[2]!.marker).toBe('- [x]');
		expect(sec(r, 'event')!.items[2]!.text).toBe('nospace');
	});

	it('a lone "-" or "---" is not an item', () => {
		const r = parse('## Events\n-\n---\ntext\n');
		expect(sec(r, 'event')!.items).toHaveLength(0);
	});

	it('identical text on different lines stays distinct by line number', () => {
		const r = parse('## Todo\n- [ ] 회의\n- [ ] 회의\n');
		expect(sec(r, 'todo')!.items.map((i) => i.line)).toEqual([1, 2]);
		expect(sec(r, 'todo')!.items[0]!.text).toBe(sec(r, 'todo')!.items[1]!.text);
	});
});

describe('parseNote — nesting', () => {
	const content = [
		'## Events', // 0
		'- parent', // 1
		'  - child', // 2
		'    - grandchild', // 3
		'  continuation text', // 4
		'- sibling', // 5
	].join('\n');
	const r = parse(content);

	it('nested items are kept, depth is capped at 1, indent is preserved', () => {
		const items = sec(r, 'event')!.items;
		expect(items.map((i) => [i.text, i.depth, i.indent])).toEqual([
			['parent', 0, ''],
			['child', 1, '  '],
			['grandchild', 1, '    '],
			['sibling', 0, ''],
		]);
	});

	it('parent.blockEnd spans children and continuation lines', () => {
		expect(sec(r, 'event')!.items[0]!.blockEnd).toBe(5); // parent + lines 2,3,4
		expect(sec(r, 'event')!.items[3]!.blockEnd).toBe(6); // sibling, no children
	});
});

describe('blockEndOf (standalone)', () => {
	it('matches what parseNote reports and stops at a heading', () => {
		const content = [
			'## Events',
			'- a',
			'  - a-child',
			'## Todo',
			'- [ ] b',
		].join('\n');
		expect(blockEndOf(content, 1)).toBe(3); // "- a" + its child, stops before "## Todo"
		expect(blockEndOf(content, 4)).toBe(5);
	});
});

describe('defaultScaffold', () => {
	it('round-trips through the parser: three empty sections, no items', () => {
		const specs: SectionSpec[] = [
			{ id: 'event', heading: '일정', type: 'list' },
			{ id: 'todo', heading: '할일', type: 'checklist' },
			{ id: 'memo', heading: '메모', type: 'free' },
		];
		const r = parseNote(defaultScaffold(specs), specs);
		expect(sec(r, 'event')!.items).toHaveLength(0);
		expect(sec(r, 'todo')!.items).toHaveLength(0);
		expect(sec(r, 'memo')!.items).toHaveLength(0);
		expect(sec(r, 'event')!.bodyStart).toBe(2); // heading 0, rule 1, body from 2
	});
});

describe('parseNote / sectionBodyText — memo block', () => {
	it('memo is found only when its section is configured; body is free-form text', () => {
		const c =
			'## Events\n- e\n\n## Memo\n---\n- a bullet\n\n```js\ncode()\n```\nplain line\n';
		expect(sec(parseNote(c, OPTS), 'memo')).toBeNull();
		const r = parseNote(c, [...OPTS, MEMO_SPEC]);
		expect(sec(r, 'memo')!.items).toHaveLength(0); // no list-item parsing for memo
		expect(sectionBodyText(c, sec(r, 'memo')!)).toBe(
			'- a bullet\n\n```js\ncode()\n```\nplain line',
		);
	});

	it('a fenced "## Events" is text, while the real one still ends the block', () => {
		const c = '## Memo\n---\n```\n## Events\n```\ntail\n## Events\n- x\n';
		const r = parseNote(c, [...OPTS, MEMO_SPEC]);
		expect(sectionBodyText(c, sec(r, 'memo')!)).toBe(
			'```\n## Events\n```\ntail',
		);
		// only the unfenced one opened the Events section
		expect(sec(r, 'event')!.headingLine).toBe(6);
		expect(sec(r, 'event')!.items.map((i) => i.text)).toEqual(['x']);
	});

	it('defaultScaffold Memo section is present and empty', () => {
		const c = defaultScaffold(MEMO_OPTS);
		const r = parseNote(c, MEMO_OPTS);
		expect(sec(r, 'memo')).not.toBeNull();
		expect(sectionBodyText(c, sec(r, 'memo')!)).toBe('');
	});
});

describe('parseNote — CRLF', () => {
	it('raw keeps the trailing \\r, text does not', () => {
		const r = parse('## Events\r\n- item\r\n- [x] done\r\n');
		const ev = sec(r, 'event')!.items[0]!;
		expect(ev.raw).toBe('- item\r');
		expect(ev.text).toBe('item');
		expect(ev.marker).toBe('- ');
		const td = sec(parse('## Todo\r\n- [x] done\r\n'), 'todo')!.items[0]!;
		expect(td.checked).toBe(true);
		expect(td.text).toBe('done');
	});
});

describe('taskLinesIn', () => {
	const MEMO_OPTS: SectionSpec[] = [...OPTS, MEMO_SPEC];
	const lines = (c: string): number[] =>
		taskLinesIn(c, sec(parseNote(c, MEMO_OPTS), 'memo')!);

	it('lists tasks in document order, only inside the section body', () => {
		const c = [
			'## Todo', // 0
			'---', // 1
			'- [ ] outside', // 2
			'', // 3
			'## Memo', // 4
			'---', // 5
			'prose', // 6
			'- [ ] one', // 7
			'  - [x] two', // 8
			'- plain bullet', // 9
			'> - [ ] three', // 10
			'', // 11
		].join('\n');
		expect(lines(c)).toEqual([7, 8, 10]);
	});

	it('ignores task lines inside fenced code blocks', () => {
		const c = [
			'## Memo', // 0
			'---', // 1
			'```md', // 2
			'- [ ] fenced', // 3
			'```', // 4
			'- [ ] live', // 5
			'',
		].join('\n');
		expect(lines(c)).toEqual([5]);
	});

	it('is empty for a body with no tasks', () => {
		expect(lines('## Memo\n---\njust prose\n')).toEqual([]);
	});
});

describe('parseNote — arbitrary configured sections', () => {
	const SPECS: SectionSpec[] = [
		{ id: 'section-1', heading: 'Groceries', type: 'checklist' },
		{ id: 'section-2', heading: '회고', type: 'free' },
		{ id: 'section-3', heading: 'Links', type: 'list' },
	];

	const NOTE = [
		'## Groceries', // 0
		'---', // 1
		'- [ ] milk', // 2
		'- [x] eggs', // 3
		'', // 4
		'## 회고', // 5
		'---', // 6
		'- a bullet the panel must not parse', // 7
		'', // 8
		'## Links', // 9
		'---', // 10
		'- https://example.com', // 11
	].join('\n');

	it('keys sections by id, not by any built-in name', () => {
		const r = parseNote(NOTE, SPECS);
		expect([...r.sections.keys()].sort()).toEqual([
			'section-1',
			'section-2',
			'section-3',
		]);
		expect(sec(r, 'event')).toBeNull();
	});

	it('parses items for list / checklist sections only', () => {
		const r = parseNote(NOTE, SPECS);
		expect(
			sec(r, 'section-1')!.items.map((i) => [i.text, i.checked]),
		).toEqual([
			['milk', false],
			['eggs', true],
		]);
		expect(sec(r, 'section-2')!.items).toHaveLength(0); // free-form
		expect(sectionBodyText(NOTE, sec(r, 'section-2')!)).toBe(
			'- a bullet the panel must not parse',
		);
		expect(sec(r, 'section-3')!.items.map((i) => i.text)).toEqual([
			'https://example.com',
		]);
	});

	it('a section type does not have to match how the note is written', () => {
		// The heading decides the section; the type decides how it is treated.
		const asFree: SectionSpec[] = [
			{ ...SPECS[0]!, type: 'free' },
			...SPECS.slice(1),
		];
		const r = parseNote(NOTE, asFree);
		expect(sec(r, 'section-1')!.items).toHaveLength(0);
		expect(sectionBodyText(NOTE, sec(r, 'section-1')!)).toBe(
			'- [ ] milk\n- [x] eggs',
		);
	});

	it('two sections sharing a heading: the first one owns it', () => {
		const dupes: SectionSpec[] = [
			{ id: 'first', heading: 'Notes', type: 'list' },
			{ id: 'second', heading: 'notes', type: 'free' },
		];
		const r = parseNote('## Notes\n---\n- x\n', dupes);
		expect(sec(r, 'first')!.items.map((i) => i.text)).toEqual(['x']);
		expect(sec(r, 'second')).toBeNull();
	});

	it('a blank heading never matches anything', () => {
		const r = parseNote('## \n---\n- x\n', [
			{ id: 'blank', heading: '   ', type: 'list' },
		]);
		expect(r.sections.size).toBe(0);
	});

	it('defaultScaffold round-trips any section list, in order', () => {
		const c = defaultScaffold(SPECS);
		expect(c).toBe(
			'## Groceries\n---\n\n## 회고\n---\n\n## Links\n---\n',
		);
		const r = parseNote(c, SPECS);
		expect(r.sections.size).toBe(3);
		for (const spec of SPECS) {
			expect(sectionBodyText(c, sec(r, spec.id)!)).toBe('');
		}
	});

	it('defaultScaffold of no sections is empty', () => {
		expect(defaultScaffold([])).toBe('');
		expect(parseNote('## Anything\n- x\n', []).sections.size).toBe(0);
	});
});

describe('parseNote — headings written inside a free section', () => {
	const SPECS: SectionSpec[] = [
		{ id: 'memo', heading: 'MEMO', type: 'free' },
		{ id: 'todo', heading: 'TODO', type: 'checklist' },
	];

	it('keeps "## Title" / "### Subtitle" as body, not as the end of the block', () => {
		const c = [
			'## MEMO', // 0
			'---', // 1
			'## 제목', // 2
			'본문', // 3
			'### 소제목', // 4
			'- 항목', // 5
			'', // 6
		].join('\n');
		const r = parseNote(c, SPECS);
		expect(sectionBodyText(c, sec(r, 'memo')!)).toBe(
			'## 제목\n본문\n### 소제목\n- 항목',
		);
	});

	it('still ends at the next configured section heading', () => {
		const c = [
			'## MEMO', // 0
			'---', // 1
			'## 제목', // 2
			'본문', // 3
			'', // 4
			'## TODO', // 5
			'---', // 6
			'- [ ] task', // 7
		].join('\n');
		const r = parseNote(c, SPECS);
		expect(sectionBodyText(c, sec(r, 'memo')!)).toBe('## 제목\n본문');
		expect(sec(r, 'memo')!.bodyEnd).toBe(5);
		expect(sec(r, 'todo')!.items.map((i) => i.text)).toEqual(['task']);
	});

	it('an h1 does not end a free section either', () => {
		const c = '## MEMO\n---\n# Big\ntext\n';
		expect(sectionBodyText(c, sec(parseNote(c, SPECS), 'memo')!)).toBe(
			'# Big\ntext',
		);
	});

	it('a list section is still ended by any heading', () => {
		const c = '## TODO\n---\n- [ ] a\n### sub\n- [ ] b\n';
		const r = parseNote(c, SPECS);
		expect(sec(r, 'todo')!.items.map((i) => i.text)).toEqual(['a']);
		expect(sec(r, 'todo')!.bodyEnd).toBe(3);
	});

	it('survives a write-back round trip', () => {
		const c = '## MEMO\n---\n## 제목\n본문\n';
		const body = sectionBodyText(c, sec(parseNote(c, SPECS), 'memo')!);
		const again = parseNote(c, SPECS);
		expect(sectionBodyText(c, sec(again, 'memo')!)).toBe(body);
	});
});
