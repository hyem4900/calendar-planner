import { describe, expect, it } from 'vitest';
import { splitItemTime } from '../itemtime';

describe('splitItemTime', () => {
	it('leaves a line with nothing at the end alone', () => {
		expect(splitItemTime('팀 주간 회의')).toEqual({
			body: '팀 주간 회의',
			time: '',
		});
		expect(splitItemTime('')).toEqual({ body: '', time: '' });
	});

	it('splits a trailing clock time', () => {
		expect(splitItemTime('팀 주간 회의 14:00')).toEqual({
			body: '팀 주간 회의',
			time: '14:00',
		});
		expect(splitItemTime('standup 9:05')).toEqual({
			body: 'standup',
			time: '9:05',
		});
	});

	it('takes the meridiem with the time, in either language or position', () => {
		expect(splitItemTime('lunch 12:30 PM').time).toBe('12:30 PM');
		expect(splitItemTime('lunch 12:30pm').time).toBe('12:30pm');
		expect(splitItemTime('점심 오후 12:30').time).toBe('오후 12:30');
	});

	it('splits a range', () => {
		expect(splitItemTime('워크숍 14:00~15:30')).toEqual({
			body: '워크숍',
			time: '14:00~15:30',
		});
		expect(splitItemTime('워크숍 14:00 - 15:30').time).toBe('14:00 - 15:30');
		expect(splitItemTime('워크숍 14:00–15:30').time).toBe('14:00–15:30');
	});

	it('splits a full date, and a date with a time', () => {
		expect(splitItemTime('팀 워크숍 2026-09-15').time).toBe('2026-09-15');
		expect(splitItemTime('팀 워크숍 2026.09.15').time).toBe('2026.09.15');
		expect(splitItemTime('팀 워크숍 2026-09-15 14:00')).toEqual({
			body: '팀 워크숍',
			time: '2026-09-15 14:00',
		});
	});

	it('sees through emphasis around the token', () => {
		expect(splitItemTime('마감 **14:00**')).toEqual({
			body: '마감',
			time: '14:00',
		});
		expect(splitItemTime('마감 `14:00`').time).toBe('14:00');
	});

	it('leaves a line that is only a time alone', () => {
		// Splitting would move the item's whole content to the right and leave an
		// empty row where the text should be.
		expect(splitItemTime('14:00')).toEqual({ body: '14:00', time: '' });
		expect(splitItemTime('  14:00  ')).toEqual({
			body: '  14:00  ',
			time: '',
		});
	});

	it('does not read an ordinary number as a time', () => {
		expect(splitItemTime('진행률 9/10').time).toBe('');
		expect(splitItemTime('3.5 버전 릴리스').time).toBe('');
		expect(splitItemTime('예산 14.00').time).toBe('');
		expect(splitItemTime('회의실 예약 3').time).toBe('');
		// Minutes past 59 are not minutes.
		expect(splitItemTime('점수 12:75').time).toBe('');
	});

	it('only looks at the end of the line', () => {
		expect(splitItemTime('14:00 팀 회의')).toEqual({
			body: '14:00 팀 회의',
			time: '',
		});
		expect(splitItemTime('14:00 회의 준비 15:00').time).toBe('15:00');
	});

	it('keeps body and time reconstructible from the source', () => {
		const text = '팀 주간 회의 14:00';
		const { body, time } = splitItemTime(text);
		expect(`${body} ${time}`).toBe(text);
	});

	it('drops trailing whitespace from the note text', () => {
		expect(splitItemTime('회의 14:00   ')).toEqual({
			body: '회의',
			time: '14:00',
		});
	});

	it('collapses whitespace inside the token', () => {
		expect(splitItemTime('워크숍 14:00  -  15:30').time).toBe(
			'14:00 - 15:30',
		);
	});
});
