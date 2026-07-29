# HANDOFF — 다음 Claude 세션이 이어서 할 일

작성 시각: 2026-07-29 (보드 크기 수정 + Bonus 파트 분할 세션)
저장소: `https://github.com/chaeyoung999/dijkstra-maze-web`
배포: `https://dijkstra-maze-web.chaeyoungson9.workers.dev/` — **`main`에 push하면 Cloudflare가 자동 배포**

---

## 이번 세션에서 한 일 (전부 커밋/푸시 완료, 테스트 4종 통과)

### 1. Play 보드 캔버스 크기 버그 수정 ★ 선생님이 요청한 것

**증상**: 키오스크 "▶ Play Game" 팝업에서도, 페이지 안의 Play 탭 전체화면에서도
미로가 **잘려서 일부만** 보였습니다.

**원인** (3중):
1. `PlayEngine.mount()` 이 `makeCanvas(360, 260)` 으로 캔버스를 **한 번 만들고 다시는
   리사이즈하지 않았습니다.** 계산된 `cellSize` 가 캔버스 크기에 반영된 적이 없어서,
   360×260 을 넘는 보드는 그냥 잘렸습니다.
2. `cellSize` 계산이 **가로폭만** 봤습니다 (`Math.floor(width / cols)`). 세로가 긴 미로는
   캔버스를 고쳐도 여전히 아래로 넘쳤습니다.
3. 크기 프로필이 "키오스크냐 아니냐" 둘뿐이라, **`#vizPanel` 전체화면** 케이스가 아예
   없었습니다. 그래서 전체화면 버튼을 눌러도 380px 사이드바 크기 그대로였습니다.
4. (추가로 발견) `styles.css` 의 `.kiosk-play-view { max-width: 920px }` 가 키오스크
   보드 폭까지 조용히 묶고 있었습니다.

**수정** (`app.js` PlayEngine 안 + `styles.css`):
- `applyBoardSize()` — 캔버스의 `width/height`(devicePixelRatio 반영) **와**
  `style.width/height` 를 실제 보드 크기(`cellSize*cols` × `cellSize*rows`)로 맞춥니다.
- `computeCellSize(rows, cols, hint)` — **가로·세로 둘 다** 로 `Math.min` 합니다.
- `playBoardMaxHeight()` — `.play-frame` 의 형제 요소 높이를 **실측**해서 세로 예산을
  구합니다. 키오스크에서 CSS로 숨겨진 요소는 자동으로 0으로 잡힙니다.
- `playBoardIsFullscreen()` / `playBoardRoomy()` — 키오스크 **또는** `#vizPanel`
  전체화면이면 넉넉한 프로필(최대 2400px, 셀 상한 120)을 씁니다.
- `relayout()` + `relayoutSoon()` 을 **라운드 시작 / window resize / fullscreenchange /
  mount / refresh** 에 연결했습니다. `unmount()` 에서 리스너를 뗍니다.
- 폭은 `container` 가 아니라 **`.play-frame`** 기준으로 잽니다 (container 의 clientWidth 는
  16px 패딩을 포함해서, `.viz-canvas` 의 `max-width:100%` 가 보드를 가로로 찌그러뜨렸음).
- `styles.css`: `.kiosk-play-view` / `.kiosk-header` 의 max-width 920 → **1600**.
- `styles.css`: `#vizPanel` 전체화면일 때 Capabilities 체크리스트·제목·LIVE 배너를
  숨깁니다(키오스크가 이미 하던 것과 같은 처리). 세로 ~150px 를 미로에 돌려줍니다.

**검증**: 새 테스트 `tests/test_board_sizing.js` (실제 app.js 를 레이아웃까지 흉내낸
가짜 DOM에 띄워서 진짜 캔버스를 검사). 1440×900 키오스크 기준 실측:

| 라운드 | 이전 | 이후 | 세로 점유 |
|---|---|---|---|
| 11×15 (작음) | 360×260 (잘림) | **960×704** | 99% |
| 15×21 | 360×260 (잘림) | **987×705** | 99% |
| 17×25 (가장 큼) | 360×260 (잘림) | **1025×697** | 98% |
| 31×9 (세로로 김) | 360×260 (심하게 잘림) | **198×682** | 96% |
| 7×33 (가로로 김) | 360×260 (잘림) | **1386×294** | 가로 99% |

페이지 안 Play 탭 전체화면(1920×1080): 378×270 → **1113×795** (세로 예산의 97%).
작은 창(800×600)·devicePixelRatio 2·리사이즈 축소도 전부 검사합니다.

> **"play the game 버튼 제거해줘"는 삭제가 아니라 버그 수정으로 해석했습니다.**
> 바로 이어서 그 버튼의 표시 버그를 고치는 방법을 설명하셨기 때문입니다.
> `#playPopoutBtn` 은 그대로 있습니다. 정말 삭제를 원하신 것이면 그때 지우면 됩니다.

### 2. Bonus TODO 파트 분할 (11 → 24파트) ★ 선생님이 요청한 것

> "bonus todo 지금 너무 어렵다는 의견이 많아. todo갯수를 여러개로 나누어서 순서대로
> 어떻게 해야하는지 차례차례 알려줘… 최대한 여러가지. 대신 쉽게!"

**새 기능은 하나도 추가하지 않았습니다.** 기존 내용을 더 작고 순서가 분명한 조각으로
나눈 것뿐이고, 채점도 그대로 개방형("안 터지면 통과")입니다.

| TODO | 이전 | 이후 | 파트 |
|---|---|---|---|
| **6** | 3 | **6** | 1 `ROUND_CONFIGS` · 2 걷는 속도 한 줄 · 3 힌트 설정 · 4 아이템 위치 · 5 아이템 생성 · 6 폭탄 |
| **7** | 3 | **8** | 1 플레이어·목표 이미지 · 2 폭탄·바닥 이미지 · 3 크기 3개 · 4 벽·플레이어·목표 색 · 5 폭탄·폭발 색 · 6 소리 파일 2개 · 7 폭발 길이+음량 · 8 음악 재생 방식 |
| **8** | 3 | **6** | 1 `CUSTOM_ITEMS` · 2 `add_time` · 3 `add_hint` · 4 발밑 아이템 찾기 · 5 효과 실행 · 6 아이템별 소리 |
| **9** | 2 | **4** | 1 `MISSION_RULES` · 2 `HOW_TO_PLAY_RULES` · 3 승리 가드 · 4 승리 처리 |
| 합계 | 11 | **24** | (전체 코드 칸 19 → **30**) |

- 파트 하나가 보통 **1~3줄**입니다. 힌트는 파트마다 하나씩, 기존 기준(거의 정답 수준) 유지.
- `dijkstra_maze/{student,complete}/{settings.py,game.py}` 에 마커를 새로 넣었습니다.
- `data.js` 의 `parts` 배열, `app.js` 의 하네스 4개(인자 수 변경 + 파트별 메시지),
  `export-data.js`(재생성), `todos.json`(재생성), README, 교사용 문서 전부 갱신.

**주의할 설계 하나**: TODO 8 의 Part 5/6·6/6 은 Part 4/6 이 연 `if` **안쪽**에
들어갑니다(들여쓰기 16칸). 그래서 `buildFnSourceParts()` 는 파트를 **먼저 이어붙인 뒤**
한 번만 reindent 합니다 — 파트마다 따로 reindent 하면 중첩이 풀려버립니다.
이 불변식은 `test_alt_implementations.py` 의
"canonical (starter split: one effect per part, pickup across 4/5/6)" 케이스가 지킵니다.

### 3. `answers.html` / `교사용/정답_해설.md` 재생성 + 생성기 복원

이전 세션 스크래치 폴더와 함께 사라졌던 생성 스크립트를 **저장소 안에 다시 만들었습니다**:

```
scripts/gen_export_data.js   # student/*.py  -> export-data.js
scripts/gen_answers.js       # complete/*.py -> answers.html + 교사용/정답_해설.md
scripts/gen_todos.js         # data.js       -> dijkstra_maze/todos.json
scripts/answer_notes.json    # 한국어 해설만 손으로 (정답 코드는 절대 여기 없음)
```

- **정답 코드는 항상 `complete/*.py` 에서 직접 추출**합니다. 손으로 적힌 건 한국어 해설뿐이라
  정답이 실제 코드와 어긋날 수 없습니다.
- `0924` 게이트는 **그대로** 입니다 (`answers.html` 의 `var CODE = "0924"`,
  `app.js` 의 `TEACHER_OVERRIDE_CODE = "0924"`). 메커니즘은 손대지 않았습니다.
- 재생성 전 `answers.html` 은 **TODO 2를 가속도/마찰 3파트로** 보여주고 있었습니다(구버전).
  지금은 한 칸 이동 정답이 나옵니다. 30개 항목 전부 확인했습니다.

### 4. 덤으로 고친 것 (테스트가 잡아낸 진짜 버그 2개)

`tests/test_trace_harnesses.py` 는 이전 세션이 "한 번도 통과 확인 못 함"이라고 남긴
파일인데, 돌려보니 **영원히 멈춰 있었습니다.** 원인은 테스트가 아니라 제품 코드였습니다:

1. **`traceHarness_playerMove` 에 무한루프 가드가 없었습니다.** 채점 하네스에는 전부
   있는 `_run_guarded` 가 이 **미리보기** 경로에만 빠져 있었습니다. Pyodide 가 UI
   스레드에서 도니까, 학생이 TODO 2 초안에 `while True:` 를 남기면 **Play 탭/키오스크
   창이 통째로 얼어붙습니다.** 키를 누를 때마다 지나가는 경로라 위험도가 높았습니다.
   → `_preview_guarded` (같은 line-budget 방식) 추가.
2. **문법 오류 줄 번호가 1씩 밀려 있었습니다.** 생성된 `def _fn(...)` 줄을 빼주는 보정이
   채점 경로(`_compile_body`)에만 있고 미리보기 경로엔 없었습니다. → 보정 추가.

**아직 남은 같은 종류의 구멍** (이번엔 손대지 않음, 범위 밖):
`traceHarness_hintRoute` 와 `traceHarness_customItems` 도 학생 코드를 가드 없이 돌립니다.
TODO 8 Part 1/6 은 이제 Bonus에서 많이 만지는 곳이라, `while True:` 가 들어가면
Play 탭이 멈출 수 있습니다. `traceHarness_playerMove` 에 넣은 `_preview_guarded` 블록을
그대로 복사해 넣으면 됩니다. **다음 세션에서 먼저 해주세요.**

---

## 테스트 (전부 통과 확인함)

```
cd C:\Users\손채영\Desktop\kazh\pygame\dijkstra_maze_web
node   tests/test_app_load.js               # 가장 빠름
node   tests/test_board_sizing.js           # 이번에 추가 (보드 크기)
python tests/test_alt_implementations.py    # 72 케이스
python tests/test_trace_harnesses.py        # 18 케이스
```

Node 는 PATH 에 없습니다: `C:\Users\손채영\tools\node-v22.14.0-win-x64\node.exe`
파이썬 출력이 깨지면 `PYTHONIOENCODING=utf-8` 을 붙이세요 (콘솔이 cp949).

**이전에 알려져 있던 "TODO 6 friction warning" 실패는 사라졌습니다.** 그 케이스는
`PLAYER_ACCELERATION` / `PLAYER_FRICTION` / `PLAYER_MOVE_THRESHOLD` 경고를 검사했는데,
그 설정들은 이 과정 어디에도 더 이상 존재하지 않습니다(되돌려진 가속도 설계의 잔재).
**삭제한 게 아니라**, 지금 실제로 있는 설정(`PLAYER_MOVE_DELAY_MS`, `MAX_HINT_COUNT`)의
범위 초과 경고를 검사하는 **같은 취지의 케이스로 교체**했습니다.
`test_alt_implementations.py`: 이전 59통과/1실패 → **지금 72통과/0실패**.

`tests/test_fuzz_harnesses.py` (약 20분)는 이번에도 완주 확인을 못 했습니다.

---

## ⚠️ 절대 되돌리면 안 되는 결정들

- **TODO 2 는 한 번 누르면 한 칸.** 가속도/마찰 **아님**. 이건 예전에 한 세션이 애매한
  지시를 확대해석해서 물리 엔진으로 다시 짜고, "교실 블루투스 컨트롤러" 라는 **근거 없는
  이유까지 지어냈다가** 발각되어 되돌린 부분입니다. 손대지 마세요.
- **키는 방향키 + 컨트롤러 E/F/C/D 만.** WASD 없음. K=종료, M=리셋, H=힌트.
- Bonus 채점은 **개방형: "안 터지면 통과"**. 게임을 못 하게 만드는 것만 오답
  (예외, 잘못된 타입, 목표에서 멀리 있는데 클리어). 나머지는 전부 경고.
- Required(1~5)는 **결과 기반** 채점 — 구현 방식 자유.
- 단계마다 힌트는 **정확히 1개**, 거의 정답 수준으로.
- TODO 9 잠금 없음. Required 끝나면 Bonus 4개 동시 오픈.

---

## 자동 생성 파일 — 손으로 고치지 마세요

| 파일 | 생성 명령 |
|---|---|
| `dijkstra_maze_web/export-data.js` | `node scripts/gen_export_data.js` |
| `dijkstra_maze_web/answers.html` | `node scripts/gen_answers.js` |
| `교사용/정답_해설.md` | 같은 명령이 함께 생성 |
| `dijkstra_maze/todos.json` | `node scripts/gen_todos.js` |

`student/*.py` 나 `complete/*.py` 나 `data.js` 를 고쳤으면 **반드시** 다시 돌리세요.
세 스크립트 모두 멱등이고, 마커가 어긋나면 **파일을 쓰지 않고 에러를 냅니다.**

---

## 이 프로젝트의 구조 (빠른 지도)

```
pygame/
  dijkstra_maze/            # 파이썬 원본 (git 아님!)
    student/*.py            # 학생 배포용 (TODO 비어 있음)
    complete/*.py           # 정답본
    todos.json              # 메타데이터 (자동 생성)
  dijkstra_maze_web/        # ★ git 저장소 = 배포 대상
    index.html app.js data.js export-data.js styles.css answers.html
    scripts/                # 자동 생성기 (이번 세션에 복원)
    tests/                  # 회귀 테스트 5종
  교사용/                    # 교사 자료 (git 아님)
```

**중요**: `dijkstra_maze/` 와 `교사용/` 은 **git에 들어 있지 않습니다.** 백업이 없습니다.

### app.js 안에서 찾아야 할 것들
- `COURSE_STEPS` 는 `data.js` — TODO 콘텐츠(설명/스타터/힌트)
- 채점기: `harness_movement_2`, `harness_guardClause_3`, `harness_positionDelta_4`,
  `harness_dijkstra_5`, `harness_roundDesign_6`, `harness_lookAndFeel_7`,
  `harness_customItems_8`, `harness_gameRules_9`, `harness_syntax_1`
- 공용 파이썬 헬퍼: `PY_BONUS_HELPERS` (`_run_guarded`, `_finish_or_report` 등)
- 파트 이어붙이기: `buildFnSourceParts` (중첩 들여쓰기 보존 — 위 2번 주의사항 참고)
- Play 탭: `PlayEngine` (크기 계산은 `computeCellSize`/`applyBoardSize`/`relayout`)
- 미리보기: `traceHarness_playerMove`
- 시연 모드: `isShowcaseMode()`, `SHOWCASE_CODE`, `showcaseState()`
- 교사 코드: `TEACHER_OVERRIDE_CODE = "0924"`

---

## 남은 일 / 다음 세션 후보

1. **위 4번의 남은 가드 구멍 2개** (`traceHarness_hintRoute`, `traceHarness_customItems`).
   가장 우선순위 높습니다 — 수업 중 탭이 얼 수 있습니다.
2. `python tests/test_fuzz_harnesses.py` 완주 확인 (약 20분).
3. **TODO별 설명 문서** — 이전 세션에 요청받았지만 아직 안 만들었습니다:
   > "todo 각각 순서대로 설명해줄꺼야. todo별 설명 **영어로** 적어놔줘.
   >  **대본 형식 말고 bullet 형식**이라 내가 보면서 말할 수 있도록. 문서 파일로."
   - 영어, 불릿, TODO 1 → 9 순서. 각 TODO마다 무엇을/왜/어디에(파일)/자주 하는 실수/보여줄 것.
   - 파일명 제안: `pygame/교사용/TODO_TALKING_POINTS.md`
   - **이제 파트가 30개**라는 점을 반영해야 합니다.
4. 실제 브라우저에서 보드 크기 눈으로 확인 (자동 테스트는 가짜 DOM 기준입니다).
   교실 프로젝터 해상도에서 키오스크 팝업을 한 번 띄워보시면 확실합니다.
