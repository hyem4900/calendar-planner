/*
 * UI strings for the two supported interface languages. Pure module — it MUST
 * NOT import 'obsidian' — so any layer (including the pure ones) can read it.
 *
 * Parameterised strings are functions; everything else is a plain string.
 * `weekdayShort` / `weekdayName` are indexed by JS `Date.getDay()` (0 = Sunday).
 */

export type Lang = 'ko' | 'en';

export interface Strings {
	/** Ribbon tooltip and command-palette entry. */
	openCalendar: string;

	/* ---- calendar header ---- */
	prevMonth: string;
	nextMonth: string;
	today: string;
	pickDate: string;
	prevYear: string;
	nextYear: string;
	/** Month chip, e.g. "9월" / "September". */
	monthLabel: (month: number) => string;
	/** Full month name for folder `{MMMM}`, e.g. "9월" / "September". */
	monthLong: (month: number) => string;

	/* ---- grid ---- */
	weekColHeader: string;
	weekdayShort: readonly string[];
	weekdayName: readonly string[];

	/* ---- bottom panel ---- */
	/** Day-panel heading, e.g. "16 Sep · Wed" / "9월 16일 · 수". */
	dayPanelTitle: (date: Date) => string;
	panelPrompt: string;
	noteMissing: string;
	noteUnreadable: string;
	addTo: (label: string) => string;
	deleteItem: string;
	markDone: string;
	unmarkDone: string;
	viewThisWeek: string;
	editSection: (heading: string) => string;
	imagePasteFailed: string;

	/* ---- note nouns ---- */
	yearlyNoun: string;
	monthlyNoun: string;
	weeklyNoun: string;
	dailyNoun: string;

	/** Header label / panel sub-link: fill the bottom panel with that note. */
	showInPanel: (noun: string) => string;

	/* ---- right-click / long-press menu ---- */
	goToNote: (noun: string) => string;
	openInNewTab: string;
	createNoteItem: (noun: string) => string;
	deleteNote: string;

	/* ---- notices ---- */
	noteCreated: (path: string) => string;
	noteCreateFailed: (err: string) => string;
	editCancelledChanged: string;
	editCancelledGone: string;
	deleteCancelledChanged: string;
	itemDeleted: string;

	/* ---- create-note modal ---- */
	modalTitle: (noun: string) => string;
	modalBody: (noun: string) => string;
	createAndOpen: string;
	create: string;
	cancel: string;

	/* ---- settings tab ---- */
	setLanguage: string;
	setLanguageDesc: string;
	langKorean: string;
	langEnglish: string;

	setWeekStart: string;
	setWeekStartDesc: string;
	sunday: string;
	monday: string;

	setShowWeekNumbers: string;
	setShowWeekNumbersDesc: string;

	setShowNoteDot: string;
	setShowNoteDotDesc: string;

	setSaturdayColor: string;
	setSundayColor: string;
	setWeekendColorDesc: string;
	resetColor: string;

	setDayPreview: string;
	setDayPreviewDesc: string;
	setDayPreviewMax: string;
	setDayPreviewMaxDesc: string;
	setBandOverflow: string;
	setBandOverflowDesc: string;
	bandOverflowFade: string;
	bandOverflowEllipsis: string;
	bandOverflowNone: string;
	setDayPreviewHideDone: string;
	setDayPreviewHideDoneDesc: string;
	sectionInCalendar: string;
	sectionNotInCalendar: string;

	headingYearlyNote: string;
	headingMonthlyNote: string;
	headingWeeklyNote: string;
	headingDailyNote: string;
	headingBehaviour: string;
	headingMaintenance: string;

	setFolder: string;
	setFolderDesc: string;
	setFilenameFormat: string;
	setWeeklyFilenameFormatDesc: string;
	setTemplateFile: string;
	setTemplateFileDesc: string;
	yearlyTemplatePlaceholder: string;
	monthlyTemplatePlaceholder: string;
	weeklyTemplatePlaceholder: string;
	dailyTemplatePlaceholder: string;

	headingSections: string;
	headingSectionsDesc: string;
	/** Note-kind names, for the section-list selector. */
	noteKind: {
		yearly: string;
		monthly: string;
		weekly: string;
		daily: string;
	};
	copySections: string;
	copySectionsDesc: (kind: string) => string;
	copySectionsBtn: string;
	copySectionsConfirm: (kind: string) => string;
	copiedSections: string;
	addSection: string;
	newSectionHeading: string;
	sectionIndex: (n: number) => string;
	typeList: string;
	typeChecklist: string;
	typeFree: string;
	moveSectionUp: string;
	moveSectionDown: string;
	removeSection: string;
	removeSectionConfirm: (heading: string) => string;
	noSections: string;

	setMoveNotes: string;
	setMoveNotesDesc: string;
	moveNotesBtn: string;
	noNotesToMove: string;
	moveNotesConfirm: (count: number) => string;
	movedNotes: (count: number) => string;
	setDeleteEmpty: string;
	setDeleteEmptyDesc: string;
	deleteEmptyBtn: string;
	noEmptyNotes: string;
	deleteEmptyConfirm: (count: number) => string;
	deletedEmptyNotes: (count: number) => string;

	setOpenLocation: string;
	setOpenLocationDesc: string;
	openTab: string;
	openNewTab: string;
	openSplit: string;

	setAllowPanelEditing: string;
	setDoneStyle: string;
	setDoneStyleDesc: string;
	doneStyleStrikeDim: string;
	doneStyleDim: string;
	doneStyleStrike: string;
	doneStylePlain: string;
	doneSampleText: string;
	setSectionCollapsible: string;
	setSectionCollapsibleDesc: string;

	setNewItemPosition: string;
	posTop: string;
	posBottom: string;
}

const KO_MONTHS = (m: number): string => `${m}월`;

const EN_MONTH_NAMES = [
	'JAN',
	'FEB',
	'MAR',
	'APR',
	'MAY',
	'JUN',
	'JUL',
	'AUG',
	'SEP',
	'OCT',
	'NOV',
	'DEC',
] as const;

/** Title-case month abbreviations for the day-panel heading ("16 Sep · Wed"). */
const EN_MONTHS_TC = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
] as const;

const EN_WEEKDAYS_TC = [
	'Sun',
	'Mon',
	'Tue',
	'Wed',
	'Thu',
	'Fri',
	'Sat',
] as const;

/** Full English month names for folder `{MMMM}`. */
const EN_MONTHS_LONG = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
] as const;

const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const ko: Strings = {
	openCalendar: '캘린더 열기',

	prevMonth: '이전 달',
	nextMonth: '다음 달',
	today: '오늘',
	pickDate: '연/월 선택',
	prevYear: '이전 해',
	nextYear: '다음 해',
	monthLabel: KO_MONTHS,
	monthLong: KO_MONTHS,

	weekColHeader: 'W',
	weekdayShort: KO_WEEKDAYS,
	weekdayName: KO_WEEKDAYS,

	dayPanelTitle: (d) =>
		`${d.getMonth() + 1}월 ${d.getDate()}일 · ${KO_WEEKDAYS[d.getDay()]!}`,
	panelPrompt: '날짜 또는 주 번호를 선택하세요',
	noteMissing: '노트 없음',
	noteUnreadable: '노트를 읽을 수 없습니다',
	addTo: (label) => `${label} 추가`,
	deleteItem: '삭제',
	markDone: '완료',
	unmarkDone: '완료 해제',
	viewThisWeek: '이 주 보기',
	editSection: (heading) => `${heading} 편집`,
	imagePasteFailed: '이미지를 저장하지 못했습니다.',

	yearlyNoun: 'Yearly note',
	monthlyNoun: 'Monthly note',
	weeklyNoun: 'Weekly note',
	dailyNoun: 'Daily note',

	showInPanel: (noun) => `${noun} 패널에 표시`,

	goToNote: (noun) => `${noun}로 이동`,
	openInNewTab: '새 탭에서 열기',
	createNoteItem: (noun) => `${noun} 만들기`,
	deleteNote: '노트 삭제',

	noteCreated: (path) => `${path} 생성됨`,
	noteCreateFailed: (err) => `노트를 만들지 못했습니다: ${err}`,
	editCancelledChanged: '노트가 변경되어 편집을 취소했습니다',
	editCancelledGone: '편집하던 노트가 사라져 편집을 취소했습니다',
	deleteCancelledChanged: '노트가 변경되어 삭제를 취소했습니다',
	itemDeleted: '항목을 삭제했습니다',

	modalTitle: (noun) => `${noun} 만들기`,
	modalBody: (noun) => `${noun}가 없습니다. 새로 만드시겠습니까?`,
	createAndOpen: '생성 & 열기',
	create: '생성',
	cancel: '취소',

	setLanguage: '언어',
	setLanguageDesc: '플러그인 UI 언어입니다. 리본/명령어 이름은 Obsidian 재시작 후 반영됩니다.',
	langKorean: '한국어',
	langEnglish: 'English',

	setWeekStart: '주 시작일',
	setWeekStartDesc: '요일 헤더 순서와 주 번호 계산의 기준입니다.',
	sunday: '일요일',
	monday: '월요일',

	setShowWeekNumbers: '주 번호 표시',
	setShowWeekNumbersDesc: '캘린더 왼쪽 W 열을 표시합니다.',

	setShowNoteDot: '노트 표시선',
	setShowNoteDotDesc:
		'노트가 있는 날짜·주 번호 아래에 짧은 가로선을 표시합니다. 노트 자체에는 영향이 없습니다.',

	setSaturdayColor: '토요일 색',
	setSundayColor: '일요일 색',
	setWeekendColorDesc:
		'캘린더 요일 헤더에 쓰이는 색입니다. 기본은 다른 요일과 같은 색이며, 되돌리기 버튼으로 돌아갑니다.',
	resetColor: '기본값으로',

	setDayPreview: '날짜에 항목 표시',
	setDayPreviewDesc:
		'Daily note의 리스트 / 체크리스트 항목을 날짜 아래 띠지로 보여줍니다. 칸이 좁으면 말줄임되고, 마우스를 올리면 전문이 보입니다. 끄면 달력이 노트를 전혀 읽지 않습니다.',
	setDayPreviewMax: '하루 최대 표시 개수',
	setDayPreviewMaxDesc:
		'날짜 칸이 항상 이만큼의 줄을 차지합니다. 항목이 더 많으면 마지막 줄이 "+n"이 되고, 마우스를 올리면 가려진 항목이 보입니다.',
	setBandOverflow: '넘치는 글자 처리',
	setBandOverflowDesc: '띠지 너비를 넘어가는 글자를 어떻게 끝낼지 고릅니다.',
	bandOverflowFade: '오른쪽 끝에서 흐려지기',
	bandOverflowEllipsis: "끝에 '..' 붙이기",
	bandOverflowNone: '그대로 자르기',
	setDayPreviewHideDone: '완료 항목 숨기기',
	setDayPreviewHideDoneDesc: '체크한 항목을 달력에서 빼고 셉니다.',
	sectionInCalendar:
		'이 섹션의 항목이 달력 날짜 칸의 띠지에 표시됩니다 — 숨기려면 클릭 (노트 내용은 그대로)',
	sectionNotInCalendar:
		'이 섹션의 항목이 달력 날짜 칸의 띠지에서 숨겨집니다 — 표시하려면 클릭 (노트 내용은 그대로)',

	headingYearlyNote: 'Yearly note',
	headingMonthlyNote: 'Monthly note',
	headingWeeklyNote: 'Weekly note',
	headingDailyNote: 'Daily note',
	headingBehaviour: '동작',
	headingMaintenance: '정리',

	setFolder: '폴더',
	setFolderDesc: '{YYYY} / {YY} / {MMMM} / {MM} / {M} 토큰을 사용할 수 있습니다.',
	setFilenameFormat: '파일명 포맷',
	setWeeklyFilenameFormatDesc:
		"YYYY / MM / DD / WW / ww 토큰과 '따옴표' 리터럴을 지원합니다.",
	setTemplateFile: '템플릿 파일',
	setTemplateFileDesc: '비워 두면 기본 스캐폴드로 생성합니다.',
	yearlyTemplatePlaceholder: '예: 템플릿/Yearly.md',
	monthlyTemplatePlaceholder: '예: 템플릿/Monthly.md',
	weeklyTemplatePlaceholder: '예: 템플릿/Weekly.md',
	dailyTemplatePlaceholder: '예: 템플릿/Daily.md',

	headingSections: '섹션',
	headingSectionsDesc:
		'여기서 이름을 바꿔도 이미 작성한 노트의 헤딩은 그대로입니다.',
	noteKind: {
		yearly: 'Yearly note',
		monthly: 'Monthly note',
		weekly: 'Weekly note',
		daily: 'Daily note',
	},
	copySections: '다른 종류에도 적용',
	copySectionsDesc: (kind) =>
		`지금 보고 있는 ${kind} 섹션 구성을 나머지 노트 종류에도 그대로 복사합니다.`,
	copySectionsBtn: '전체에 적용',
	copySectionsConfirm: (kind) =>
		`${kind}의 섹션 구성을 나머지 세 종류에 덮어쓸까요? 각 종류에 지금 설정된 섹션 목록은 사라집니다.`,
	copiedSections: '섹션 구성을 모든 노트 종류에 적용했습니다.',
	addSection: '섹션 추가',
	newSectionHeading: '새 섹션',
	sectionIndex: (n) => `섹션 ${n}`,
	typeList: '리스트',
	typeChecklist: '체크리스트',
	typeFree: '자유 형식',
	moveSectionUp: '위로',
	moveSectionDown: '아래로',
	removeSection: '섹션 삭제',
	removeSectionConfirm: (heading) =>
		`설정에서 '${heading}' 섹션을 삭제할까요? 노트에 이미 쓴 내용은 지워지지 않지만 사이드바에 더 이상 보이지 않습니다.`,
	noSections: '섹션이 없습니다. 하나 추가하세요.',

	setMoveNotes: '노트를 현재 폴더 설정으로 이동',
	setMoveNotesDesc:
		'폴더 경로나 언어를 바꾸기 전에 만든 노트를 지금 설정된 위치로 옮깁니다. 링크는 그대로 유지됩니다.',
	moveNotesBtn: '노트 이동',
	noNotesToMove: '옮길 노트가 없습니다.',
	moveNotesConfirm: (n: number): string => `노트 ${n}개를 현재 폴더 설정에 맞게 옮길까요?`,
	movedNotes: (n: number): string => `노트 ${n}개를 옮겼습니다.`,
	setDeleteEmpty: '빈 노트 일괄 삭제',
	setDeleteEmptyDesc:
		'Yearly / Monthly / Weekly / Daily 폴더에서 기본 템플릿과 내용이 동일한 빈 노트를 찾아 휴지통으로 보냅니다.',
	deleteEmptyBtn: '빈 노트 삭제',
	noEmptyNotes: '삭제할 빈 노트가 없습니다.',
	deleteEmptyConfirm: (n) => `빈 노트 ${n}개를 휴지통으로 보낼까요?`,
	deletedEmptyNotes: (n) => `빈 노트 ${n}개를 삭제했습니다.`,

	setOpenLocation: '노트 열기 위치',
	setOpenLocationDesc: '우클릭 메뉴의 "…로 이동"이 노트를 여는 위치입니다.',
	openTab: '현재 탭',
	openNewTab: '새 탭',
	openSplit: '분할',

	setAllowPanelEditing: '패널에서 편집 허용',
	setDoneStyle: '완료 항목 표시',
	setDoneStyleDesc: '체크한 항목의 텍스트를 어떻게 보여줄지 고릅니다.',
	doneStyleStrikeDim: '취소선 + 흐리게',
	doneStyleDim: '흐리게만',
	doneStyleStrike: '취소선만',
	doneStylePlain: '그대로',
	doneSampleText: '완료한 항목',
	setSectionCollapsible: '섹션 접기 허용',
	setSectionCollapsibleDesc:
		'Event / Todo / Memo 섹션 헤더에 접기 화살표를 표시합니다. 끄면 항상 펼쳐집니다.',

	setNewItemPosition: '새 항목 추가 위치',
	posTop: '섹션 맨 위',
	posBottom: '섹션 맨 아래',
};

const en: Strings = {
	openCalendar: 'Open calendar',

	prevMonth: 'Previous month',
	nextMonth: 'Next month',
	today: 'Today',
	pickDate: 'Pick year and month',
	prevYear: 'Previous year',
	nextYear: 'Next year',
	monthLabel: (m) => EN_MONTH_NAMES[((m - 1) % 12 + 12) % 12]!,
	monthLong: (m) => EN_MONTHS_LONG[((m - 1) % 12 + 12) % 12]!,

	weekColHeader: 'W',
	weekdayShort: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
	weekdayName: EN_WEEKDAYS_TC,

	dayPanelTitle: (d) =>
		`${d.getDate()} ${EN_MONTHS_TC[d.getMonth()]!} · ${
			EN_WEEKDAYS_TC[d.getDay()]!
		}`,
	panelPrompt: 'Select a day or a week number',
	noteMissing: 'No note',
	noteUnreadable: 'Could not read the note',
	addTo: (label) => `Add to ${label}`,
	deleteItem: 'Delete',
	markDone: 'Mark done',
	unmarkDone: 'Mark not done',
	viewThisWeek: 'View this week',
	editSection: (heading) => `Edit ${heading}`,
	imagePasteFailed: 'Could not save the pasted image.',

	yearlyNoun: 'yearly note',
	monthlyNoun: 'monthly note',
	weeklyNoun: 'weekly note',
	dailyNoun: 'daily note',

	showInPanel: (noun) => `Show the ${noun} in the panel`,

	goToNote: (noun) => `Go to ${noun}`,
	openInNewTab: 'Open in new tab',
	createNoteItem: (noun) => `Create ${noun}`,
	deleteNote: 'Delete note',

	noteCreated: (path) => `Created ${path}`,
	noteCreateFailed: (err) => `Could not create the note: ${err}`,
	editCancelledChanged: 'The note changed, so the edit was cancelled',
	editCancelledGone: 'The note being edited is gone, so the edit was cancelled',
	deleteCancelledChanged: 'The note changed, so the delete was cancelled',
	itemDeleted: 'Item deleted',

	modalTitle: (noun) => `Create ${noun}`,
	modalBody: (noun) => `There is no ${noun}. Create one?`,
	createAndOpen: 'Create & Open',
	create: 'Create',
	cancel: 'Cancel',

	setLanguage: 'Language',
	setLanguageDesc:
		'Interface language for the plugin. The ribbon and command names update after restarting Obsidian.',
	langKorean: '한국어',
	langEnglish: 'English',

	setWeekStart: 'First day of the week',
	setWeekStartDesc:
		'Drives the weekday header order and the week-number calculation.',
	sunday: 'Sunday',
	monday: 'Monday',

	setShowWeekNumbers: 'Show week numbers',
	setShowWeekNumbersDesc: 'Show the W column on the left of the calendar.',

	setShowNoteDot: 'Note marker',
	setShowNoteDotDesc:
		'Draw a short rule under a date or week number that has a note. Affects the calendar only, never the notes.',

	setSaturdayColor: 'Saturday color',
	setSundayColor: 'Sunday color',
	setWeekendColorDesc:
		'Color used in the calendar’s weekday header. Defaults to the same color as every other weekday; the reset button goes back to it.',
	resetColor: 'Reset to default',

	setDayPreview: 'Show items on days',
	setDayPreviewDesc:
		'Show a daily note’s list / checklist items as bands under its day. A narrow column ellipsises the text; hovering shows all of it. Off, the calendar reads no files at all.',
	setDayPreviewMax: 'Bands per day',
	setDayPreviewMaxDesc:
		'Every day cell reserves this many lines. A day with more spends its last line on a "+n" counter; hovering that shows what it hides.',
	setBandOverflow: 'Text that does not fit',
	setBandOverflowDesc: 'How a band ends text too long for its column.',
	bandOverflowFade: 'Fade out at the right edge',
	bandOverflowEllipsis: 'Trim with ".."',
	bandOverflowNone: 'Just cut it off',
	setDayPreviewHideDone: 'Hide checked items',
	setDayPreviewHideDoneDesc: 'Leave checked items out of the bands and the count.',
	sectionInCalendar:
		'This section’s items appear in the day bands on the calendar — click to hide them there (notes are not changed)',
	sectionNotInCalendar:
		'This section’s items are hidden from the day bands on the calendar — click to show them there (notes are not changed)',

	headingYearlyNote: 'Yearly note',
	headingMonthlyNote: 'Monthly note',
	headingWeeklyNote: 'Weekly note',
	headingDailyNote: 'Daily note',
	headingBehaviour: 'Behavior',
	headingMaintenance: 'Maintenance',

	setFolder: 'Folder',
	setFolderDesc: 'Supports the {YYYY} / {YY} / {MMMM} / {MM} / {M} tokens.',
	setFilenameFormat: 'Filename format',
	setWeeklyFilenameFormatDesc:
		"Supports YYYY / MM / DD / WW / ww tokens and 'quoted' literals.",
	setTemplateFile: 'Template file',
	setTemplateFileDesc: 'Leave empty to create from the built-in scaffold.',
	yearlyTemplatePlaceholder: 'e.g. Templates/Yearly.md',
	monthlyTemplatePlaceholder: 'e.g. Templates/Monthly.md',
	weeklyTemplatePlaceholder: 'e.g. Templates/Weekly.md',
	dailyTemplatePlaceholder: 'e.g. Templates/Daily.md',

	headingSections: 'Sections',
	headingSectionsDesc:
		'Renaming a section here does not touch headings in notes you already wrote.',
	noteKind: {
		yearly: 'Yearly note',
		monthly: 'Monthly note',
		weekly: 'Weekly note',
		daily: 'Daily note',
	},
	copySections: 'Apply to the other kinds',
	copySectionsDesc: (kind) =>
		`Copy the ${kind} section list shown here to every other note kind.`,
	copySectionsBtn: 'Apply to all',
	copySectionsConfirm: (kind) =>
		`Overwrite the section list of the other three note kinds with the ${kind} one? Whatever they are set to now is lost.`,
	copiedSections: 'Applied the section list to every note kind.',
	addSection: 'Add section',
	newSectionHeading: 'NEW SECTION',
	sectionIndex: (n) => `Section ${n}`,
	typeList: 'List',
	typeChecklist: 'Checklist',
	typeFree: 'Free-form',
	moveSectionUp: 'Move up',
	moveSectionDown: 'Move down',
	removeSection: 'Remove section',
	removeSectionConfirm: (heading) =>
		`Remove the "${heading}" section from the settings? Nothing already written in your notes is deleted, but it will no longer show in the sidebar.`,
	noSections: 'No sections. Add one.',

	setMoveNotes: 'Move notes to the configured folders',
	setMoveNotesDesc:
		'Move notes made before a folder path or language change into the folders configured now. Links to them are kept.',
	moveNotesBtn: 'Move notes',
	noNotesToMove: 'No notes to move.',
	moveNotesConfirm: (n: number): string =>
		`Move ${n} note${n === 1 ? '' : 's'} into the configured folders?`,
	movedNotes: (n: number): string =>
		`Moved ${n} note${n === 1 ? '' : 's'}.`,
	setDeleteEmpty: 'Delete empty notes',
	setDeleteEmptyDesc:
		'Find empty notes matching the default template in the yearly / monthly / ' +
		'weekly / daily folders and move them to trash.',
	deleteEmptyBtn: 'Delete empty notes',
	noEmptyNotes: 'No empty notes to delete.',
	deleteEmptyConfirm: (n) =>
		`Move ${n} empty note${n === 1 ? '' : 's'} to trash?`,
	deletedEmptyNotes: (n) =>
		`Deleted ${n} empty note${n === 1 ? '' : 's'}.`,

	setOpenLocation: 'Where to open notes',
	setOpenLocationDesc:
		'Where the right-click menu’s "Go to…" opens the note.',
	openTab: 'Current tab',
	openNewTab: 'New tab',
	openSplit: 'Split',

	setAllowPanelEditing: 'Allow editing in the panel',
	setDoneStyle: 'Checked item style',
	setDoneStyleDesc: 'How the text of a checked item is shown.',
	doneStyleStrikeDim: 'Strikethrough + faded',
	doneStyleDim: 'Faded only',
	doneStyleStrike: 'Strikethrough only',
	doneStylePlain: 'Unchanged',
	doneSampleText: 'Completed item',
	setSectionCollapsible: 'Collapsible sections',
	setSectionCollapsibleDesc:
		'Show a fold arrow on the Event / Todo / Memo section headers. Off keeps them always expanded.',

	setNewItemPosition: 'Where new items go',
	posTop: 'Top of the section',
	posBottom: 'Bottom of the section',
};

export const translations: Record<Lang, Strings> = { ko, en };

/** Resolve the string table for a language, falling back to Korean. */
export function t(lang: Lang): Strings {
	return translations[lang] ?? translations.ko;
}
