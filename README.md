# Calendar Planner

Obsidian 우측 사이드바에 월간 캘린더를 띄우고, Yearly / Monthly / Weekly / Daily 노트의
**섹션을 캘린더에서 바로 확인하고 사이드바 안에서 직접 편집**하는 커뮤니티 플러그인.
편집은 별도 저장 없이 원본 노트 파일에 즉시 반영된다.

## 기능

- 우측 사이드바에 월간 캘린더 (리본 아이콘 / `Open calendar` 커맨드로 토글)
- **헤더의 월 / 연도 클릭 → 그 Monthly / Yearly note 를 하단 패널에 표시** (날짜·주 번호 클릭과 같은 동작).
  노트가 있으면 라벨 아래에 점이 찍히고, 지금 패널에 떠 있는 라벨은 강조된다.
  연도 옆의 `▾` 아이콘 하나로 연/월 선택 다이얼로그를 연다 (`‹ 2026 ›` + 12개월 그리드)
- 주 시작일(일/월) 선택, `W` 열에 주 번호 — 노트가 있으면 날짜·주 번호 아래에 짧은 가로선 (설정에서 끌 수 있음)
- **날짜 아래 항목 띠지** — Daily note 의 리스트/체크리스트 항목을 달력에서 바로 확인 (설정에서 on/off).
  날짜 칸 높이는 항상 일정하며, 넘치는 항목은 마지막 줄의 `+n` 으로 묶이고 hover 하면 가려진 항목이 보인다.
  가로로 넘치는 글자는 오른쪽 끝에서 페이드아웃되거나 `..` 로 줄어들고(설정), hover 하면 툴팁으로 전문이 보인다
- **좌클릭 = 사이드바에 표시** (노트를 열지 않음)
  - 날짜 → Daily note, 주 번호 → Weekly note, 월 → Monthly note, 연도 → Yearly note 를 하단 패널에 렌더
  - 패널 제목을 클릭하면 그 노트를 연다 (없으면 생성 확인 후 만든다)
- **패널에서 바로 편집** — 모든 변경은 즉시 원본 노트에 write-back
  - 텍스트 클릭 → 인라인 수정 (Enter/blur 커밋, Esc 취소, 한글 IME 조합 중 Enter 무시)
  - 체크박스 클릭 → `- [ ]` ↔ `- [x]` 토글 (자유 형식 섹션 안에 쓴 체크리스트도 동일하게 노트에 반영)
  - 섹션 라벨의 `+` → 항목 추가, 항목 hover 의 `×` → 삭제
  - **줄 끝의 날짜/시간은 오른쪽에 흐리게** — `- 팀 주간 회의 14:00` 처럼 쓰면 `14:00` 이 항목 오른쪽에
    연한 색으로 떨어져 붙고, 달력 띠지에서는 빠진다 (띠지는 이미 그 날짜 아래에 있으므로).
    전용 문법이 아니라 **그냥 평범한 텍스트**라 다른 플러그인이나 기본 미리보기에서도 그대로 읽히고,
    항목을 클릭해 편집하면 시간까지 포함한 원문 한 줄이 그대로 나온다
  - **이미지 붙여넣기 / 드래그 앤 드롭** → vault 의 첨부파일 폴더에 저장되고 임베드 링크가 삽입됨.
    자유 형식 섹션(편집 중이든 아니든)과 리스트/체크리스트 항목 입력창 모두에서 동작.
    PNG · JPG · **GIF** · WEBP · AVIF · BMP · SVG 를 지원하며, 원본 바이트를 그대로 저장하므로
    **애니메이션 GIF 는 GIF 로 남고 사이드패널·본문 양쪽에서 재생된다**
  - 대상 노트가 없으면 생성 확인 후 템플릿(있으면) 또는 기본 스캐폴드로 생성
- **우클릭 = 컨텍스트 메뉴** — 노트로 이동 / 새 탭에서 열기 / 사이드바에 표시 (이동은 여기서만, 모바일 롱프레스 지원)
- 노트가 열려 있으면 에디터에도 실시간 반영, 외부 편집도 패널에 자동 반영
- Obsidian CSS 변수만 사용 — 라이트/다크 및 커뮤니티 테마에서 자연스럽게 표시. 데스크톱/모바일 모두 동작

노트는 `## 헤딩` + `---` + 내용의 반복으로 이루어진다. Daily / Weekly note 의 기본 구조:

```
## EVENT
---
- 팀 주간 미팅 10:00

## TODO
---
- [ ] 보고서 초안 작성
- [x] 회의 자료 준비

## MEMO
---
자유 형식 메모 (마크다운 렌더링)
```

기본 구성은 노트 종류마다 다르다 — 기간이 길수록 계획보다 회고에 가깝게:

| 노트 | 기본 섹션 |
|---|---|
| Yearly | `GOAL`(체크리스트) / `REFLECTION`(자유 형식) |
| Monthly | `EVENT`(리스트) / `TODO`(체크리스트) / `REFLECTION`(자유 형식) |
| Weekly | `EVENT`(리스트) / `TODO`(체크리스트) / `MEMO`(자유 형식) |
| Daily | `EVENT`(리스트) / `TODO`(체크리스트) / `MEMO`(자유 형식) |

섹션은 설정에서 **자유롭게 추가 / 삭제 / 이름 변경 / 순서 변경**할 수 있고, 위 네 종류를 **각각 따로**
관리한다 (설정의 `섹션` 그룹에서 편집할 노트 종류를 고른다. 네 종류를 똑같이 쓰고 싶으면
`전체에 적용` 버튼 한 번이면 된다). 개수와 이름에 제한은 없다. 각 섹션은 형식을 하나 고른다:

| 형식 | 노트에 쓰이는 모습 | 패널 동작 |
|---|---|---|
| 리스트 | `- 항목` | 항목 추가 / 수정 / 삭제 |
| 체크리스트 | `- [ ] 항목` | 위 + 체크박스 토글 |
| 자유 형식 | 아무 마크다운 | 블록 전체를 한 번에 편집 — **입력 중에도 실시간 렌더링**(Live Preview) |

Daily note 의 리스트/체크리스트 섹션은 Settings 의 섹션 행에 있는 눈 아이콘으로 **달력 띠지 표시 여부**를
개별 지정할 수 있다. 체크된 항목은 패널과 동일하게 `완료 항목 표시` 설정을 따른다.
띠지에는 `is-list` / `is-checklist` 클래스가 붙으므로, 섹션별로 색을 주고 싶으면 CSS 스니펫으로 지정하면 된다.

헤딩 매칭은 대소문자를 구분하지 않는다. 설정에서 이름을 바꿔도 **기존 노트의 헤딩은 그대로**이므로,
필요하면 노트 쪽도 함께 고쳐야 한다.

## 설정

| 설정 | 기본값 |
|---|---|
| 언어 | English |
| 주 시작일 | 일요일 |
| 주 번호 표시 | ON |
| 노트 표시선 | ON — 노트가 있는 날짜·주 번호 아래의 짧은 가로선 |
| 토요일 색 / 일요일 색 | 없음 (다른 요일과 같은 색) — 요일 헤더에 적용, 각 행의 되돌리기 버튼으로 복귀 |
| 날짜에 항목 표시 | ON — 끄면 달력이 노트를 전혀 읽지 않는다 |
| 하루 최대 표시 개수 / 완료 항목 숨기기 | 3 / OFF |
| 넘치는 글자 처리 | 오른쪽 끝에서 흐려지기 (`..` 붙이기 / 그대로 자르기 중 선택) |
| Yearly note 폴더 / 파일명 포맷 / 템플릿 | `Calendar Planner/Yearly` / `YYYY` / (없음) |
| Monthly note 폴더 / 파일명 포맷 / 템플릿 | `Calendar Planner/Monthly/{YYYY}` / `YYYY-MM` / (없음) |
| Weekly note 폴더 / 파일명 포맷 / 템플릿 | `Calendar Planner/Weekly/{YYYY}` / `YYYY 'W'WW` / (없음) |
| Daily note 폴더 / 파일명 포맷 / 템플릿 | `Calendar Planner/Daily/{YYYY}` / `YYYY-MM-DD` / (없음) |
| 섹션 (노트 종류별) | Yearly `GOAL`·`REFLECTION` / Monthly `EVENT`·`TODO`·`REFLECTION` / Weekly·Daily `EVENT`·`TODO`·`MEMO` |
| 노트 열기 위치 | 현재 탭 |
| 패널에서 편집 허용 | ON |
| 완료 항목 표시 | 취소선 + 흐리게 (4가지 조합 중 선택) |
| 섹션 접기 허용 | OFF |
| 새 항목 추가 위치 | 섹션 맨 아래 |
| 노트를 현재 폴더 설정으로 이동 | 버튼 — 폴더/언어를 바꾸기 전에 만든 노트를 지금 설정된 위치로 |
| 빈 노트 일괄 삭제 | 버튼 — 네 폴더에서 기본 템플릿 그대로에 아무것도 추가 안 한 노트를 휴지통으로 |

코어 Daily notes 플러그인과는 **완전히 독립적**으로 동작한다 (폴더/포맷을 공유하지 않음).

폴더 입력에는 자동완성이 붙고 `{YYYY}` `{YY}` `{MMMM}` `{MM}` `{M}` 토큰을 쓸 수 있다
(`{MMMM}`은 UI 언어의 전체 월 이름 — `September` / `9월`; weekly는 week-year 기준).
기본 폴더에는 월 이름이 없어 언어와 무관하지만, `{MM}-{MMMM}` 같은 세그먼트를 직접 넣어 두면 언어를 바꿀 때 함께 바뀐다.
폴더 설정을 바꿔도 **기존 노트와의 연동은 끊기지 않는다** — 설정된 경로에 파일이 없으면 같은 이름의 노트를
vault 전체에서 찾아 연결한다. 파일을 실제로 옮기려면 설정의 `노트를 현재 폴더 설정으로 이동` 버튼을 쓴다.
파일명 포맷은 `YYYY YY GGGG MM M DD D WW W ddd` 등 moment 유사 토큰과 `[대괄호]`/`'따옴표'`
리터럴을 지원한다 (weekly 이름의 `YYYY`는 week-year).

## 개발

```bash
npm install        # 의존성 설치 (vitest 포함)
npm run dev        # esbuild watch — src/*.ts → main.js 자동 컴파일
npm run build      # 타입체크 + production 번들
npm run lint       # eslint (eslint-plugin-obsidianmd)
npm test           # vitest — date.ts / parser.ts / mutate.ts 순수 함수 테스트
```

자유 형식 섹션의 편집기(`liveeditor.ts`)는 CodeMirror 6 로 구성한다. CodeMirror 자체(`@codemirror/*`)와
`@lezer/common` / `@lezer/highlight` 는 Obsidian 이 런타임에 제공하므로 external 이고, 마크다운 문법
(`@lezer/markdown`)만 번들된다. Obsidian private API 는 쓰지 않는다.

`date.ts`, `parser.ts`, `mutate.ts`, `paths.ts`, `sections.ts`, `attachments.ts`, `trim.ts`, `itemtime.ts` 는
`obsidian` 모듈을 import 하지 않는 순수 모듈이라 mocking 없이 테스트된다.
vault 접근(`notes.ts`), 뷰(`view.ts`), 설정(`settings.ts`), 모달(`modals.ts`), 자동완성(`suggest.ts`)은
Obsidian API에 의존한다. 전체 설계와 알려진 API 함정은 [`plan.md`](plan.md) 참고.

### 개발용 vault에 심볼릭 링크로 붙이기

`main.js` / `manifest.json` / `styles.css` 를 vault 로 복사하는 대신, 레포 폴더 전체를
`.obsidian/plugins/calendar-planner` 로 링크해 두면 `npm run dev` 결과가 바로 반영된다.

**Windows (PowerShell, 관리자 권한):**

```powershell
$repo  = "C:\Users\hyemin\문서\코딩\Obsidian_plugin\calendar-planner"
$vault = "C:\path\to\YourVault\.obsidian\plugins"
New-Item -ItemType Directory -Force $vault | Out-Null
New-Item -ItemType SymbolicLink -Path "$vault\calendar-planner" -Target $repo
```

> 개발자 모드가 켜져 있으면 관리자 권한 없이도 `mklink /D` 가 동작한다.

**macOS / Linux:**

```bash
ln -s "$(pwd)" "/path/to/YourVault/.obsidian/plugins/calendar-planner"
```

링크 후 Obsidian 재시작 → **설정 → 커뮤니티 플러그인** 에서 Calendar Planner 활성화.
코드를 고칠 때마다 명령 팔레트의 **Reload app without saving** 로 새로고침.

## 릴리스

`manifest.json` 의 `version` 을 SemVer 로 올리고 `versions.json` 에 `"버전": "최소 Obsidian 버전"` 을 추가한 뒤,
버전과 정확히 일치하는(`v` 접두사 없이) 태그로 GitHub 릴리스를 만든다.
`.github/workflows/release.yml` 이 태그 push 시 `main.js` / `manifest.json` / `styles.css` 를 첨부한 draft 릴리스를 생성한다.
