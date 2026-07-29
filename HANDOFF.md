# HANDOFF — 다음 Claude 세션이 이어서 할 일

작성 시각: 2026-07-29 (Bonus 완전 분리 세션 — 진행 중)
저장소: `https://github.com/chaeyoung999/dijkstra-maze-web`
배포: `https://dijkstra-maze-web.chaeyoungson9.workers.dev/` — **`main`에 push하면 Cloudflare가 자동 배포**

---

## 🔴 이번 세션 진행 상황 (중단되면 여기부터 읽으세요)

이번 세션은 **작업 단위마다 커밋+푸시**합니다. 아래 표가 현재 상태입니다.

| 작업 | 상태 | 커밋 |
|---|---|---|
| **1. Bonus 파트를 전부 독립 단계로 분리** | ✅ 완료·푸시 | `9451ece` |
| **2. 쉬운 Bonus 단계 추가 (24 → 30)** | ✅ 완료·푸시 | `05ddf5f` |
| **3. 전체 프로젝트 zip 내보내기 검증** | ✅ 완료·푸시 | 아래 참조 |

### 작업 3 — zip 내보내기 검증 (완료, 재작성 안 함)

**결론: 내보내기 기능 자체는 멀쩡했습니다.** 마커를 기준으로 동작하는 범용 코드라
작업 1의 번호 재배치를 **자동으로 따라왔습니다.** 메커니즘은 손대지 않았습니다.

새 테스트 **`tests/test_project_export.js`** 를 만들어 실제로 증명했습니다.
(이전엔 "내보내기가 돌아간다"를 확인하는 테스트가 아예 없었습니다.)

- 파일 목록 완전성: `main.py` `game.py` `maze.py` `pathfinding.py` `settings.py`
  `cell.py` `goal.py` `items.py` `player.py` `requirements.txt` — **전부 포함**.
  `student/` 안의 `.py` 9개 중 빠진 게 없다는 것도 검사합니다.
  zip에는 여기에 `HOW_TO_RUN.txt` + `assets/images` + `assets/sounds`가 더 들어갑니다.
- 마커 **36개 전부** `complete/` 에서 정답 구간을 찾아내고, app.js **본인의 splice 코드**로
  이어붙인 뒤, **진짜 파이썬으로 임시 폴더에서 실행**해 `Game()` 이 뜨는지까지 봅니다.
- TODO 영역 밖 코드도 그대로 남아 있는지(= "모든 줄을 고칠 수 있다") 확인합니다.

**고친 것 (기능이 아니라 안내 문구·작은 버그)**:

1. 내보내기 헤더의 `(part n/2)` 라벨이 **2로 하드코딩**돼 있었습니다. TODO 5만 파트가
   남아서 지금은 우연히 맞지만, 실제 파트 수를 읽도록 고쳤습니다.
2. **모달 문구가 이 기능을 과소평가하고 있었습니다** — 열자마자 진행률 숫자만 보여줬습니다.
   지금은 맨 위에 "**완성된 게임 전체가 진짜 파이썬 파일로**, VS Code로 열고
   `python main.py`, **모든 줄을 고칠 수 있음**"을 먼저 말합니다.
3. `HOW_TO_RUN.txt` 에도 같은 문장을 넣었습니다.
4. **마지막 단계까지 끝낸 학생에게** "더 넓은 데서 하고 싶으면 내 프로젝트 내려받기"
   링크가 뜨도록 했습니다 (빨리 끝내는 학생이 이 기능을 발견할 확률이 가장 낮았음).

> 참고로 `README.md` / `TODO_CHECKLIST.md` 같은 **문서 파일은 zip에 안 들어갑니다.**
> 대신 `HOW_TO_RUN.txt` 가 생성돼 들어갑니다. 선생님이 요청한 파일 목록은 전부 있으므로
> 이번엔 그대로 뒀습니다 — 문서도 넣고 싶으면 `gen_export_data.js` 의 `FILE_ORDER` 에
> 추가하면 됩니다.

### 작업 2 — 간단한 Bonus 단계 6개 추가 (완료)

> "간단한 bonus todo할만한거 있으면 최대한 더 추가해줘. 학생들이 너무 빨리 다 끝내고
> 놀것같아. 조금 귀찮은거라도."

**새 게임 시스템은 하나도 만들지 않았습니다.** 원래 코드에 **고정값으로 박혀 있던**
설정만 골라서 작은 커스터마이즈 단계로 꺼냈습니다 (`PLAYER_MOVE_DELAY_MS`를 꺼냈던 것과 같은 방식).

| 새 단계 | 파일 | 원래 어디에 박혀 있었나 | 왜 골랐나 |
|---|---|---|---|
| **6-7** | `settings.py` | `SHOW_DFS_GENERATION`, `DFS_STEPS_PER_FRAME` | 미로 생성 애니메이션. `1`로 두면 알고리즘이 칸 파는 걸 눈으로 볼 수 있어 수업 시연에도 좋습니다. |
| **6-8** | `settings.py` | `STUDENT_NORMAL_WEIGHT`, `STUDENT_BOMB_WEIGHT` | 힌트 경로가 폭탄을 얼마나 피할지. 6-3(힌트 설정)과 같은 묶음이라 자연스럽습니다. |
| **7-9** | `settings.py` | `BOMB_EXPLOSION_IMAGE_PATH` | **7번대의 진짜 빈칸이었습니다** — 다른 이미지 경로는 전부 TODO인데 이것만 하드코딩이었습니다. |
| **7-10** | `settings.py` | `VISITED_COLOR`, `CURRENT_CELL_COLOR`, `PATH_COLOR` | 미로 생성 애니메이션 + 힌트 경로 색. |
| **7-11** | `settings.py` | `BACKGROUND_COLOR`, `PANEL_COLOR`, `PANEL_BORDER` | 화면·정보판. 어둡게 하면 즉시 나이트 모드라 변화가 가장 크게 보입니다. |
| **7-12** | `settings.py` | `ACCENT`, `SUCCESS`, `WARNING`, `DANGER` | 상태 메시지 색. 딱 "조금 귀찮은" 반복 작업. |

- 전부 **설정 한 묶음 · 설명 짧게 · 힌트 하나 · 관대한 채점**("안 터지면 통과") — 기존과 같은 규칙.
- `SCREEN_WIDTH/HEIGHT`, `MAZE_OFFSET_*`, `FPS`는 **일부러 뺐습니다** — 레이아웃이 깨지거나
  게임이 못 할 정도로 느려질 수 있어서, "안전한 커스터마이즈"라는 기준에 맞지 않습니다.
- 결과: Bonus **24 → 30단계** (6번대 8 · 7번대 12 · 8번대 6 · 9번대 4), 전체 코드 칸 36개.
- `student/`와 `complete/`의 마커 순서를 이 김에 **완전히 일치**시켰습니다
  (힌트 가중치 블록이 두 트리에서 서로 다른 위치에 있었습니다).

### 작업 1 — Bonus를 24개 독립 단계로 분리 (완료)

**문제**: 파트를 나눠도 사이드바에서 "TODO 6"을 한 번 누르면 **편집기 6개가 한 화면에
세로로 쌓여서** 나왔습니다("파일이 너무 많이 뜬다"는 그 증상). 파일 배정이 아니라
**렌더링**이 문제였습니다 (`app.js`의 `step.parts.forEach(...)` 경로).

**해결**: `parts` 중첩을 없애고 **파트 하나 = 완전한 독립 단계**로 승격했습니다.

- 아이디: `6-1`~`6-6`, `7-1`~`7-8`, `8-1`~`8-6`, `9-1`~`9-4` — **총 24개**.
  (예전의 "하이픈 아이디 금지" 규칙을 이번 지시로 **의도적으로 뒤집었습니다.**)
- 한 단계 = **파일 하나 · 편집기 하나 · 설명 하나 · 힌트 하나**. Required와 완전히 같은 모양.
- `COURSE_STEPS`는 이제 **29개**(Required 5 + Bonus 24). `parts`가 남아 있는 단계는
  **TODO 5 하나뿐**입니다 (두 파트가 한 수식의 앞뒤라 진짜로 붙어 있어야 함).
- 설명(lead)은 전부 **짧게 다시 썼습니다.** "Part 1/6 …" 같은 표현은 전부 제거.
  (`test_app_load.js`가 "Bonus lead에 `Part n/m`이 남아 있으면 실패"로 강제합니다.)

**잠금 규칙** (`data.js`의 `BONUS_GROUPS`, `app.js`의 `computeStatus`):

- **묶음끼리는 자유** — Required가 끝나면 `6-1`·`7-1`·`8-1`·`9-1`이 **동시에** 열립니다.
- **묶음 안에서는 순서대로** — `6-1`을 완료/Skip해야 `6-2`가 열립니다 (Required와 같은 규칙).
- **9번대는 캡스톤이 아닙니다.** 다른 Bonus를 다 해야 열리는 잠금은 예전에 선생님
  요청으로 제거됐고, 그대로 유지했습니다. (사이드바에 남아 있던 "마지막 것은 잠긴다"는
  **틀린 안내 문구**를 이번에 삭제했습니다 — 실제 동작과 반대였습니다.)

**채점 방식 (중요)**: 하네스 4개는 그대로 두고 **`focus` 인자**를 하나 추가했습니다.

- 이유: `6-4`/`6-5`/`6-6`은 `create_game_objects()` **한 함수의 연속된 세 토막**입니다.
  따로 떼서는 실행이 안 되므로, 채점할 때는 **묶음 전체 코드를 항상 이어붙여 실행**하고,
  **보고·합불 판정만** 지금 채점 중인 단계로 좁힙니다.
- 이게 없으면 치명적인 버그가 납니다: `8-2`(add_time)를 채점할 때 `8-3`은 아직
  `pass` 스타터 그대로이므로, 묶음 전체로 판정하면 **아직 시키지도 않은 일로 학생이 불합격**합니다.
  이 시나리오는 `test_alt_implementations.py`의 "focused" 케이스 9개가 지킵니다.
- `focus`를 안 주면(=null) 예전처럼 묶음 전체를 채점합니다 → 기존 회귀 테스트는 그대로 통과.

**마커도 바꿨습니다**: `.py` 파일 안이 `# --- TODO 6 (Part 2/6): ... ---` 에서
`# --- TODO 6-2: ... ---` 로 바뀌었습니다. 사이트의 단계 이름과 파일 안 주석이
**글자 그대로 일치**해야 학생이 헷갈리지 않기 때문입니다. `(Part n/m)` 형식은
**TODO 5에만** 남아 있습니다. 생성기 정규식(`gen_export_data.js`)도 같이 갱신했습니다.

**같이 갱신한 것**: `data.js`(구조+`BONUS_GROUPS`), `app.js`(잠금·사이드바·채점·에셋 피커·
맵 에디터·Play 탭 capability·쇼케이스 프리셋·규칙 카드), `export-data.js`·`todos.json`·
`answers.html`·`교사용/정답_해설.md`(재생성), `scripts/answer_notes.json`(키 재배치),
`README.md`, `student/TODO_CHECKLIST.md`, 테스트 3종.

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
node   tests/test_app_load.js               # 가장 빠름 (구조 + 잠금 규칙)
node   tests/test_project_export.js         # 이번에 추가 (zip 내용물 + 실제 실행)
node   tests/test_board_sizing.js           # 보드 크기
python tests/test_alt_implementations.py    # 102 케이스
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
- **9번대에 캡스톤 잠금 없음.** Required가 끝나면 4개 묶음의 첫 단계가 동시에 열립니다.
  (묶음 **안**에서만 순서대로 — 이건 이번 세션에 새로 생긴 규칙입니다.)
- **Bonus 채점은 반드시 묶음 전체 코드를 이어붙여 실행하되 `focus`로 좁혀야 합니다.**
  단계 하나만 떼서 실행하면 `6-4`~`6-6`, `8-2`~`8-3`, `8-4`~`8-6`, `9-3`~`9-4`가
  깨집니다(한 함수의 연속된 토막이라서). 반대로 `focus` 없이 묶음 전체로 합불을
  판정하면 아직 손대지 않은 다음 단계 때문에 학생이 불합격합니다. 둘 다 필요합니다.

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

1. **미리보기 경로 가드 구멍 2개** (`traceHarness_hintRoute`, `traceHarness_customItems`).
   가장 우선순위 높습니다 — 학생이 `while True:` 를 남기면 수업 중 탭이 얼 수 있습니다.
   `traceHarness_playerMove` 에 이미 들어 있는 `_preview_guarded` 블록을 그대로 복사하면 됩니다.
   (`traceHarness_customItems` 는 이제 **TODO 8-1** 코드를 받습니다.)
2. `python tests/test_fuzz_harnesses.py` 완주 확인 (약 20분). 이번에도 못 돌렸습니다.
3. **TODO별 설명 문서** — 두 세션째 요청받았지만 아직 안 만들었습니다:
   > "todo 각각 순서대로 설명해줄꺼야. todo별 설명 **영어로** 적어놔줘.
   >  **대본 형식 말고 bullet 형식**이라 내가 보면서 말할 수 있도록. 문서 파일로."
   - 영어, 불릿. **이제 순서가 1~5 그리고 6-1 … 9-4 (총 35단계)** 입니다.
   - 파일명 제안: `pygame/교사용/TODO_TALKING_POINTS.md`
4. 실제 브라우저에서 **새 사이드바** 눈으로 확인. 이제 Bonus 항목이 30개라
   사이드바가 길어졌습니다 — 묶음 제목 4개로 접히지 않고 전부 나열됩니다.
   교실 노트북 화면에서 스크롤이 불편하면 묶음별 접기(`<details>`)를 넣는 게 다음 후보입니다.
5. `TEACHER_TODO_GUIDE.md`, `student/README.md`, `student/TODO_GUIDE.md` 는 아직
   옛 번호(“TODO 6/7/8/9”, “Part 1/2”)로 설명합니다. `student/TODO_CHECKLIST.md` 만
   이번에 새 구조로 다시 썼습니다. (셋 다 git 밖 파일입니다.)
