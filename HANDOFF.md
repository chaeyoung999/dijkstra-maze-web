# HANDOFF — 다음 Claude 세션이 이어서 할 일

## 🚨 지금 가장 중요한 것 — 오후 수업 학생들 이미지 (발표 전 필독)

**상황**: 오후에 수업한 학생들이 올린 이미지는 **어디에도 없습니다.**
그 시점의 코드는 업로드해도 파일을 저장하지 않고 **각자 PC의 다운로드 폴더로
내려받기만** 했고, 사이트에는 파일 **이름만** 기록했습니다. 따라서:

| 위치 | 그 학생들 이미지 있음? |
|---|---|
| `progress.json` | ❌ (기능이 나중에 들어감) |
| 다운로드 zip | ❌ (zip 은 브라우저 저장소에서 가져옴 — 비어 있음) |
| 브라우저 저장소(IndexedDB) | ❌ |
| **각 학생 PC 의 다운로드 폴더** | ✅ **여기에만 있음** |

**발표 전 해야 할 일 (학생당 1분)**:
1. 자기 `progress.json` 을 Load
2. TODO 9 에셋 패널 → "Files you've added" 목록에서 `missing` 표시된 줄의
   **`Re-upload`** 버튼 → 다운로드 폴더에서 같은 파일 선택
3. 전부 채운 뒤 **Save my work** → 이제 json 에 이미지가 들어갑니다
4. 그 뒤로는 zip 에도, 다른 PC 에서도 그대로 따라옵니다

`Re-upload` 는 **기록된 파일명 그대로** 저장하므로 학생 코드(`settings.py` 의 경로)를
건드리지 않습니다. 파일명이 기억 안 나면 목록에 그대로 적혀 있습니다
(예: `Zhanat.png`, `popeyes.png`, `floor1.png`, `roblox1.png`, `roblox-obby.png`).

⚠️ 되살릴 코드는 없습니다. 바이트가 존재하지 않으므로 **다시 올리는 것이 유일한 방법**입니다.


작성 시각: 2026-07-30 (Required 선행 제공 + 번호 재배치 세션 — 진행 중)
저장소: `https://github.com/chaeyoung999/dijkstra-maze-web`
배포: `https://dijkstra-maze-web.chaeyoungson9.workers.dev/` — **`main`에 push하면 Cloudflare가 자동 배포**

---

## 🔢 번호가 전부 바뀌었습니다 (2026-07-30) — 이 표를 먼저 보세요

Required TODO를 **6·7번 두 개 추가**하기 위해 Bonus 묶음 번호를 **전부 +2** 밀었습니다.

| 예전 | 지금 | 내용 (내용은 하나도 안 바뀜) |
|---|---|---|
| `6-1` … `6-8` | **`8-1` … `8-8`** | 라운드·속도·배치 |
| `7-1` … `7-12` | **`9-1` … `9-12`** | 그림·색·소리 |
| `8-1` … `8-6` | **`10-1` … `10-6`** | 내가 만드는 아이템 |
| `9-1` … `9-4` | **`11-1` … `11-4`** | 내 게임의 규칙 |

하네스 이름도 같이 바뀌었습니다: `harness_roundDesign_6`→`_8`, `lookAndFeel_7`→`_9`,
`customItems_8`→`_10`, `gameRules_9`→`_11`. `.py` 마커도 전부 새 번호입니다.
`step:` 표시 번호는 Bonus가 6..35 → **8..37** 이 됐습니다.

**아래 옛 세션 기록의 번호는 그때 당시 번호입니다** (역사 기록이라 일부러 안 고쳤습니다).
이 표로 환산해서 읽으세요.

### 지금의 전체 구조 (37단계 · 코드 칸 38개)

| | 단계 | 시작 상태 | 채점 |
|---|---|---|---|
| **Required 1~5** | 5 | **정답 선행 제공** · `prefilled: true` · 열면 바로 `completed` | 엄격 (열자마자 통과) |
| **Required 6~7** | 2 | **빈칸 (진짜 과제)** · `available` 로 시작 | 엄격 |
| **Bonus 8-1 … 11-4** | 30 | 그대로 (일부는 "동작하는 값을 바꿔라") | 개방형 "안 터지면 통과" |

**Required 6·7을 끝내야 Bonus가 열립니다.** (새로 열면 Bonus는 잠겨 있습니다 — 의도된 동작.)

---

## 🟢 체크포인트 3 — 배포된 사이트에서 이미지/소리 업로드가 실제로 동작

**증상 (선생님 보고)**: "웹사이트에서 이미지 첨부가 안 된다. 내 로컬 파일에서만 된다. 자꾸 에러난다."

**원인**: 업로드는 파일 바이트를 **어디에도 저장하지 않았습니다.** 로컬 프로젝트 폴더가
연결돼 있을 때만 거기에 썼고, 아니면 그냥 **다운로드**시킨 뒤 코드에는
`assets/images/foo.png` 경로만 적었습니다. 배포된 사이트에는 그 파일이 없으니
미리보기와 Play 탭은 **"not found"** 만 표시 — 학생 입장에선 그냥 에러.
게다가 학생은 파이썬 프로젝트 폴더 자체가 없어서 "Connect my project folder" 도 무의미.

**해결**: IndexedDB 에 **업로드 저장소(`uploads`)** 를 추가. DB 버전 1 → 2.

- 업로드하면 항상 브라우저에 바이트가 저장됨 (`assets/images/foo.png` → Blob).
- `UPLOADED_URLS` 레지스트리 + `resolveAssetPath()` 가 경로 → `blob:` URL 로 변환.
- `loadImageCached()` 와 새 `audioForPath()` / `playAssetPath()` 가 전부 이걸 통과 —
  그래서 미리보기·Play 탭·키오스크 모두 자동으로 업로드한 파일을 그림.
- 폴더 연결은 이제 **선택 사항**(로컬 파이썬 프로젝트가 있는 학생용 보너스)으로 문구 정리.
- 업로드 목록에 **"Download a copy"** 버튼 추가 (파이썬 프로젝트에 넣고 싶을 때).
- 새로고침해도 유지됨. 같은 이름 재업로드 시 옛 blob URL revoke + 이미지 캐시 무효화.
- IndexedDB 가 막힌 브라우저면 **조용히 성공한 척하지 않고** 다운로드 폴백 + 사실대로 안내.
- 다른 탭이 옛 DB 버전을 잡고 있을 때 `onblocked` 로 reject — 안 그러면 부팅이 영원히 멈춤.
- 업로드 로딩은 첫 렌더를 **막지 않음** (로드되면 한 번 더 렌더).

**주의**: 업로드 파일은 여전히 `progress.json` 에 안 들어갑니다 (브라우저 저장소에만).
다른 컴퓨터에서는 다시 올려야 합니다. 문구에 그대로 적어놨습니다.

**테스트**: `node tests/test_asset_uploads.js` — 24개 검증 (app.js 에서 함수를 그대로
추출해 가짜 IndexedDB 로 실행). 기존 테스트 3종도 전부 통과.

### 3-b. "Connect my project folder" 완전 제거 + 업로드가 진짜 assets/ 로 들어감

선생님 요청: "connect my project folder 를 제거해줘. 업로드하면 바로 assets 폴더에 넣어줘.
`PLAYER_IMAGE_PATH = 'assets/images/nubzuki.png' — this isn't one of the bundled files`
이 에러가 애초에 존재하지 않겠지."

1. **폴더 연결 기능 삭제** — `renderInstructions`, `renderConnectBar`,
   `saveViaDirectoryHandle`, `getConnectedDirHandle`, `writeExportedFilesToFolder`,
   `dirHandle`/`dirStatus`/`connectSectionNode`/`IDB_DIR_KEY`, 관련 CSS 3블록,
   export 모달의 "연결된 폴더에 쓰기" 옵션까지 전부 제거.
   배포 사이트 학생에겐 그 폴더가 없어서 **실패만 하는 버튼**이었습니다.
   `IDB_STORE`("handles")는 남겨둡니다 — 기존 학생 DB 에 이미 있고 기본 store 이름이라서.
2. **업로드 파일이 다운로드 zip 의 `assets/` 에 자동 포함** (`buildProjectZip`).
   전에는 zip 의 settings.py 가 `assets/images/내그림.png` 를 가리키는데 그 파일이 없어서
   다운로드한 게임이 기본 도형으로 떨어졌습니다. 이게 "자동으로 asset 폴더에 넣어줘"의 핵심.
3. **"isn't one of the bundled files" 경고 제거** — 새 `availableAssetNames(kind)` 가
   번들 파일 + 업로드 파일을 합쳐서 하네스의 `KNOWN_IMAGES`/`KNOWN_SOUNDS` 에 주입.
   업로드 안 한 파일은 **여전히 경고**가 뜹니다 (오타 잡아주는 원래 목적은 유지).
   ⚠️ 이 함수는 `tests/extract_harnesses.py` 가 **cscript(ES3)** 로 재실행하므로
   `Object.keys`/`forEach` 대신 `for...in` 을 씁니다. ES5 문법 쓰면 테스트가 깨집니다.
   추출기의 `FUNCS` 에 `availableAssetNames`, 그리고 `var UPLOADED_URLS = {};` 추가했습니다.
4. HOW_TO_RUN.txt 의 "직접 복사해 넣으세요" 문단 삭제, progress.json 경고문·README 갱신.

### 3-c. progress.json 이 이미지·소리를 같이 들고 다님

선생님 보고: "이미지 업로드하고 json 저장한 뒤 다른 컴퓨터에서 load 하면 이미지가 없다고 뜸."

맞는 지적이었습니다. 업로드 바이트는 IndexedDB 에 있고 IndexedDB 는 다운로드 파일을
따라가지 않으니, json 에는 **파일 이름만** 들어 있었습니다.

- 내보낸 파일에 **최상위 `uploads`** 맵 추가 (`에셋경로 → data: URL`), `version: 2`.
- ⚠️ **`state` 안에 넣으면 안 됩니다.** `state` 는 타이핑할 때마다 localStorage 에
  저장되는데, base64 수 MB 를 넣으면 ~5MB 쿼터가 터집니다. 그래서 저장 시점에
  IndexedDB 에서 읽어 **다운로드되는 파일에만** 합칩니다.
- 불러올 때 `uploads` 를 IndexedDB 로 되돌립니다. 이때 그 파일이 더 이상 참조하지 않는
  기존 업로드는 **지웁니다** — 안 지우면 이전 학생의 잔재가 다음 zip 에 딸려 들어갑니다.
- 옛 버전이 만든 파일에는 `uploads` 가 아예 없습니다. 그 경우 **기존 업로드를 건드리지
  않고** "이 파일엔 그림이 없다"고 알려줍니다 (지웠다간 멀쩡한 이미지를 날림).

### 3-e. `Re-upload` 버튼 + 옛 저장분 자동 보정

- **`Re-upload`**: "Files you've added" 목록에서 브라우저에 바이트가 없는 줄
  (`missing`)에 뜹니다. `reuploadMissing(f)` → 파일 선택 → **기록된 경로 그대로**
  IndexedDB 에 저장. 코드는 건드리지 않습니다 (경로가 이미 학생 코드에 있으므로).
- **`LATE_ADDED_SETTINGS` 마이그레이션** (`normalizeLoadedState` 끝에서 호출):
  설정 줄이 나중에 추가된 단계는, 옛 저장분을 불러올 때 빠진 줄을 스타터 기본값으로
  채웁니다. 지금은 `9-2 / MAZE_BACKGROUND_IMAGE_PATH = None` 하나.
  ⚠️ **앞으로 설정 단계에 줄을 추가하면 반드시 이 표에 추가하세요.** 안 그러면 옛
  저장분이 `Missing definition(s)` 로 채점 실패하고, 내려받은 프로젝트는 import
  에러로 아예 실행되지 않습니다.

### 3-d. 미로 전체 배경 이미지 `MAZE_BACKGROUND_IMAGE_PATH`

선생님 질문: "타일 하나만 바꿀 수 있는 거지? 전체 배경을 한 이미지로 넣을 수 있어?"

`FLOOR_TILE_IMAGE_PATH` 는 작은 이미지를 **모든 칸에 반복**하므로 사진을 넣으면 축소본이
격자로 깔렸습니다. 큰 그림 한 장을 쓸 방법이 없었습니다.

- **새 설정** `MAZE_BACKGROUND_IMAGE_PATH` (TODO 9-2). 기존 타일 설정은 그대로 둡니다.
- `Maze.draw()` 가 셀을 그리기 **전에** 미로 크기로 늘려서 blit → 타일·힌트 경로·스프
  라이트·벽이 모두 그 위에 올라옵니다. **둘 다 설정하면 타일이 배경을 가립니다** (설명·
  힌트에 명시). 범위는 **미로 격자만** — HUD/사이드 패널은 원래 디자인 유지.
- Play 탭도 같은 순서(배경 → 타일)로 그립니다. 에셋 피커에 슬롯 추가, 기존 것은
  "Floor tile (repeated)" 로 이름 변경.
- 검증: headless pygame 으로 **픽셀을 읽어** 확인 (네 모서리+중앙 덮임, 격자 밖 안 새김,
  타일이 위에 옴, 없는 경로면 무시). student/complete 양쪽 통과.
- ⚠️ `tests/test_alt_implementations.py` 의 group 9 픽스처에 새 이름을 넣어야 합니다.
  안 넣으면 "Missing definition(s): MAZE_BACKGROUND_IMAGE_PATH" 로 6건 실패합니다.

---

## 🟢 체크포인트 2 — Required 6·7 신규 추가 (완료·푸시) `baea5c8`

Required 1~5가 정답 선행 제공으로 바뀌면서 **Required에 실제 과제가 하나도 남지 않았습니다.**
그래서 **진짜 빈칸 과제 두 개**를 새로 넣었습니다. 둘 다 원래 **완성돼 있고 어떤 TODO도
가져가지 않은** 코드에서 꺼냈습니다 — **Bonus에서 뺏어온 것이 아닙니다.**

| TODO | 파일 | 함수 | 학생이 쓰는 것 |
|---|---|---|---|
| **6** | `game.py` | `check_bombs()` | `for bomb in self.bombs:` 의 **몸통 전체** — 플레이어와 같은 칸에 있는 살아 있는 폭탄을 찾아 터뜨리고 플레이어를 시작점으로 되돌리기 |
| **7** | `game.py` | `check_time_limit()` | 시간이 0 이하가 되면 `round_failed = True` + `failure_reason` 메시지 |

- **채점은 Required 1~5가 원래 그랬던 것처럼 엄격**합니다 (Bonus의 "안 터지면 통과" 아님).
- 힌트는 규칙대로 **각 1개, 거의 정답 수준**.
- TODO 6의 마커가 루프 몸통 전체(7줄)로 TODO 3보다 큽니다. **의도한 것입니다** —
  찾기→터뜨리기→되돌리기→멈추기가 한 덩어리라, 더 작게 쪼개려면 **정답 구현 자체를
  바꿔야** 했고 그건 허용 범위가 아니었습니다.
- 시각화 패널은 `bombReset` / `roundTimer` 라는 새 이름을 씁니다. **구현이 없어서 기존
  플레이스홀더 패널("Visualization coming in a future update")이 뜹니다.** `playerMove`를
  재사용하면 TODO 2/3/4 코드를 미리보기하므로 **이 단계와 무관한 걸 보여줘서** 일부러
  피했습니다. → **다음 세션 우선 후보**(아래 "남은 일" 참조).

### ⚠️ `prefilled` 플래그 — `required` 로 판단하면 안 됩니다

중간에 들어온 커밋 `8359ea6` 이 `defaultStepState()` 를
`status: step.required ? "completed" : "available"` 로 바꿨습니다. 근거는 "Required는
정답이 이미 있으니 채점할 게 없다" 였는데, **1~5에는 맞지만 새 6·7에는 틀립니다.**

그래서 `data.js` 의 Required **1~5에만 `prefilled: true`** 를 달고,
`defaultStepState()` 는 **`step.prefilled`** 를 봅니다.
6·7은 `required: true` 는 유지(순서·Bonus 잠금용)하되 **`available` 로 시작**합니다.
이게 없으면 **학생이 하지도 않은 작업을 통과 처리**받습니다.

**따라온 결과 (의도한 것입니다)**: 새로 열면 **Bonus가 다시 잠겨 있습니다.**
6·7을 끝내야 Required가 끝나기 때문입니다. Bonus가 바로 열리면 **남은 단 두 개의 Required
과제를 그냥 지나칠 수 있어서**, 이쪽이 맞습니다. `8359ea6` 의 "새로 열면 Bonus가 열려 있다"
검사는 새 구조에 맞는 검사들로 **교체**했고, 잠금 규칙 회귀 케이스는 **더 강하게** 만들었습니다
(전부 완료 상태에서 **7개를 하나씩 되돌려** 검사 — 새 상태에서 하나 되돌리는 건 무의미).

### 검증

- `test_alt_implementations.py` 에 **새 케이스 22개** (전체 **124개** 통과):
  정답, **서로 다르지만 맞는 구현 5가지**, 그리고 negative control —
  `<= 0` 대신 `== 0` · 시간 남았는데 실패시킴 · 메시지 없음 · 폭탄 위치 안 봄 ·
  플레이어 안 움직임 · 소리 파일 없을 때 `bomb_sound.play()` 크래시 · 손 안 댄 스타터 · 무한루프.
- **negative control 하나가 자기 전제를 반증했습니다**: `bomb.trigger()` 를 감싼 `if` 를
  빼도 **맞습니다** — `trigger()` 는 state가 ACTIVE가 아닐 때만 False를 돌려주고, 바깥
  조건이 이미 그걸 걸러내기 때문입니다. 지금은 **통과하는 대안**으로 문서화했고, 하네스는
  **두 가드 중 최소 하나**를 요구하며, **둘 다 없는** 진짜 오답 케이스로 그 요구가 실제로
  작동함을 증명합니다. (지우지 않고 남긴 이유: 다음 사람이 같은 착각을 반복하지 않도록.)
- 실제 headless pygame end-to-end: `complete/` 는 폭탄에서 (0,0)으로 되돌아가고 bomb이
  EXPLODING이 되고 시간 초과로 라운드 실패 + 메시지가 나옵니다. **빈칸인 `student/` 는 둘 다
  안 됩니다** — 그래서 진짜 과제입니다.
- `SHOWCASE_CODE` 에 6·7 항목을 넣었습니다. 없으면 시연 모드가 두 단계를 "완료"로 표시하면서
  편집기에는 `pass` 를 보여줍니다. 둘 다 **일부러 다른 모양의 동등 구현**이고, 각각
  `test_alt_implementations.py` 의 이름 붙은 케이스로 못박았습니다.
- 테스트 **6종 전부 통과**.

---

## 🟢 체크포인트 1 — Required 1~5를 정답이 미리 채워진 상태로 배포 (완료·푸시)

커밋 `18e91b2` (그 앞에 번호 재배치 커밋 `33affa5`).

**선생님이 직접 확인해준 의도적인 교육 방식 변경**입니다: Required는 이제 빈칸 채우기가
아니라 **정답이 이미 편집기에 적혀 있는 상태**로 시작합니다. 학생은 읽고, 돌려보고,
일부러 망가뜨려 보면서 이해합니다. **Bonus 30단계는 하나도 안 건드렸습니다** — 그대로 빈칸 과제입니다.

- `data.js`: TODO **2·3·4·5(두 파트)** 의 `starter` 를 `complete/*.py` 정답 구간과
  **바이트 단위로 동일**하게 교체했습니다.
- **TODO 1은 바꿀 게 없었습니다** — 원래부터 동작하는 예시(`TITLE = "Maze Runner"`)였고,
  학생이 자기 게임 이름으로 바꾸는 게 과제입니다. 그래서 **TODO 1의 lead에는
  "이미 채워져 있다"는 문장을 일부러 넣지 않았습니다.** 넣으면 "안 바꿔도 된다"는
  잘못된 신호가 됩니다.
- TODO 2·3·4·5 lead 맨 앞에만 한 문장 추가: *"This one is already filled in for you…
  feel free to change it, or break it on purpose… Reset this step always brings this
  version back."* (힌트는 그대로 뒀습니다 — 안 쓰이면 그만입니다.)
- `dijkstra_maze/student/*.py` 의 Required 마커 구간도 **정답으로 채웠습니다.**
  이게 없으면 **편집기엔 정답이 보이는데 내려받은 프로젝트엔 `pass` 가 들어갑니다**
  (내보내기는 채점 완료 전인 단계에 대해 raw starter 본문을 씁니다). 각 구간 위에
  `# (Already filled in - read it, run it, then try changing it.)` 한 줄을 넣었고,
  **마커 밖**에 두어서 splice 가 지워지지 않습니다.

### "View full file" 뷰어는 고칠 게 없었습니다 (확인함)

`getBodyForMarkerLive()` 가 **살아 있는 `stepData.code` 를 splice** 하므로 뷰어는
student 트리와 무관하게 항상 지금 편집기 내용을 보여줍니다. student/*.py 를 채운 이유는
**뷰어가 아니라 내보내기(export)** 때문입니다. 지금은 둘 다 일치하고, 테스트가 못박습니다.

### 검증 — "그럴 것이다"가 아니라 실제로 돌려봤습니다

- **새 테스트 `tests/test_prefilled_required.py`**: app.js **자신의 `freshState()`** 가
  편집기에 넣는 코드를 그대로 꺼내서, app.js 에서 추출한 **진짜 채점 하네스**에 넣고
  **진짜 파이썬으로 실행**합니다. 결과: **학생이 새로 열고 아무것도 안 하고 "Run my code"만
  눌러도 Required 전부 통과** — TODO 2~5 에서 **하네스 검사 27개** 통과, 빈 통과 없음.
  (TODO 1 은 syntax 모드라 `STEP_BY_ID`(data.js 구조)를 읽는데 ES3 추출 경로가 그걸
  안 들고 옵니다. 억지로 흉내내면 테스트가 거짓말을 하게 되므로, 같은 두 가지 단정
  (실행되는가 / TITLE·GAME_SUBTITLE 이 문자열로 정의되는가)을 따로 검사합니다.)
  보조 파일 `tests/_dump_fresh_code.js` 가 fresh state 를 JSON 으로 덤프합니다.
- **`tests/test_app_load.js` 4c 절 신규**: starter ≡ `complete/*.py` (바이트 단위) ·
  `Write your code here` 잔재 없음 · lead 가 실제로 안내함 · **뷰어가 새로 열었을 때
  raw student 파일과 완전히 일치** · **학생이 직접 쓴 (다르지만 맞는) 답이 새 기본값을
  이깁니다** · **변경 전 세이브에 들어 있던 옛 빈칸도 그대로 복원**(몰래 정답으로
  "업그레이드"하지 않음) · **빈칸이어야 할 Bonus 11개에 정답이 새지 않았음**.
- `tests/test_project_export.js`: "splice 가 실제로 파일을 바꿨는가" 검사를 고쳤습니다.
  `player.py`·`pathfinding.py` 는 Required 만 들어 있으니 정답을 splice 해도
  **바이트 단위로 똑같아야 맞습니다.** 예전 검사보다 **더 엄격**해졌습니다 —
  `data.js` 와 `student/*.py` 가 한 글자라도 어긋나면 여기서 터집니다.
- `tests/test_trace_harnesses.py`: "still empty" / "left at the starter" 케이스 이름을
  실제 의미대로 고쳤습니다 — 이제는 **학생이 동작하는 코드를 지웠거나 반쯤 고친** 상황이고,
  새 안내 문구가 바로 그걸 권하고 있으니 더 중요한 케이스가 됐습니다.
- 테스트 5종 + 신규 1종 전부 통과. `student/`·`complete/` 둘 다 실제 headless pygame
  으로 부팅되고, **`student/` 는 이제 Required 이동이 진짜로 됩니다**
  (열린 방향 이동 성공 / 벽 방향 거부 — `complete/` 와 동일).

> ⚠️ `dijkstra_maze/` 는 **git 밖**입니다. student/*.py 변경은 `git status` 에 안 뜹니다. 백업 없습니다.

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
node   tests/test_app_load.js               # 가장 빠름 (구조 + 잠금 규칙 + 선행제공 불변식)
node   tests/test_project_export.js         # zip 내용물 + 실제 파이썬 실행
node   tests/test_board_sizing.js           # 보드 크기
python tests/test_alt_implementations.py    # 124 케이스 (6·7 추가로 102 → 124)
python tests/test_trace_harnesses.py        # 18 케이스
python tests/test_prefilled_required.py     # 신규 — 새로 열고 Run만 눌러도 통과하는지
```

**테스트 6종입니다** (`test_prefilled_required.py` 가 이번에 추가됐습니다).
`tests/_dump_fresh_code.js` 는 그 테스트의 보조 파일로, app.js 의 `freshState()` 가
편집기에 넣는 코드를 JSON 으로 덤프합니다.

> **하네스를 새로 만들면 `tests/extract_harnesses.py` 의 `FUNCS` 목록에 반드시 추가하세요.**
> 안 넣으면 cscript 가 "그런 함수 없음"으로 죽습니다. `harness_bombCollision_6` 은
> `buildFnSourceBombLoop` 도 같이 필요합니다(학생 코드가 `for` 루프의 몸통이라
> 루프까지 생성해야 `break` 가 문법적으로 유효합니다).

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
