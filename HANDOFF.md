# HANDOFF — 다음 Claude 세션이 이어서 할 일

작성 시각: 2026-07-29 (이전 세션 사용량 소진으로 중단)
저장소: `https://github.com/chaeyoung999/dijkstra-maze-web`
배포: `https://dijkstra-maze-web.chaeyoungson9.workers.dev/` — **`main`에 push하면 Cloudflare가 자동 배포**

---

## ⚠️ 가장 먼저 할 일 (수업 임박)

로컬에 **푸시 안 된 커밋 2개**가 있습니다:

```
eb9d813  WIP: TODO 2 back to one grid step per press, WASD removed everywhere
5d4b224  Make the grading harnesses unbreakable, and document the course as it is
```

`origin/main`은 아직 `460a549`입니다.

**푸시 전에 반드시 아래 테스트를 통과시켜야 합니다** (통과 안 하면 학생 사이트가 깨질 수 있음):

```
cd C:\Users\손채영\Desktop\kazh\pygame\dijkstra_maze_web
node   tests/test_app_load.js               # 가장 빠름. 구조 불일치를 바로 잡아냄
python tests/test_alt_implementations.py    # 채점 하네스 회귀
python tests/test_trace_harnesses.py        # Play 탭 미리보기 (느림)
```

Node는 PATH에 없습니다: `C:\Users\손채영\tools\node-v22.14.0-win-x64\node.exe`

통과하면:
```
git push origin main
```
그리고 배포 확인 (약 30~60초 소요):
```
curl -s https://dijkstra-maze-web.chaeyoungson9.workers.dev/app.js | grep -c K_a   # 0이어야 함
```

---

## 지금 상태

### 이미 배포되어 라이브인 것 (`460a549`)
- TODO 9 잠금 해제 (Required 끝나면 Bonus 4개 동시 오픈)
- 교사용 코드 **`0924`** — 각 단계의 "Trouble with grading?" 링크 → Skip이 아닌 **정답 처리**
- Bonus 4개가 전부 **두 파일**로 확장 (총 코드 칸 19개)
- 라운드 개수 자유 변경, 아이템 개수 무제한, 아이템별 이미지/소리/크기
- **정답 페이지** `/answers.html` (코드 `0924`)
- **시연용 완성 게임** `/?mode=play&showcase=1`
- Play 탭이 학생 이미지/크기를 실제로 그림

### 로컬에만 있는 것 (푸시 대기)
- **채점기 보안 강화** — 무한루프 가드를 모든 파트에, `sys.exit()`/`KeyboardInterrupt` 방어,
  학생이 `self.player`를 지워도 채점기가 안 죽도록 `_finish_or_report` 래퍼
- **TODO 2 단일 파트 복귀** — 가속도/마찰 제거, **한 번에 한 칸씩** 이동
- **WASD 완전 제거** — 방향키 + 컨트롤러 **E/F/C/D**만. **K**=종료, **M**=리셋, **H**=힌트
- README, 교사용 문서, `todos.json` 갱신
- 퍼즈 테스트 스위트 추가 (`tests/test_fuzz_harnesses.py`)

---

## 아직 남은 일

### 1. ✅ 필수 — 테스트 통과 후 푸시
위 "가장 먼저 할 일" 참고. **이게 안 되면 나머지는 의미 없습니다.**

`tests/test_trace_harnesses.py`는 방금 단일 파트용으로 다시 썼는데
**아직 한 번도 통과 확인을 못 했습니다.** 실패하면 그 파일을 먼저 고치세요.

### 2. 📄 사용자가 방금 요청한 것 — TODO별 설명 문서
> "todo 각각 순서대로 설명해줄꺼야. todo별 설명 **영어로** 적어놔줘.
>  **대본 형식 말고 bullet 형식**이라 내가 보면서 말할 수 있도록. 문서 파일로 만들어줘."

- 선생님이 학생들 앞에서 **보면서 말할** 용도
- **영어**, **불릿**, TODO 1 → 9 순서
- 각 TODO마다: 무엇을/왜/어디에(파일)/자주 하는 실수/보여줄 것
- 파일명 제안: `pygame/교사용/TODO_TALKING_POINTS.md`
- ⚠️ 사용자가 "교사용 파일은 더 안 만들어도 된다, **정답 파일만** 있으면 된다"고 했었지만,
  이 발화 이후 **이 문서는 명시적으로 요청**했으므로 만들어야 합니다.

### 3. 정리 필요한 잔재
- `pygame/교사용/수업_운영안.md`, `체크리스트.md` — 이전 세션이 **가속도/마찰 기준으로** 써놨습니다.
  이제 TODO 2가 한 칸 이동으로 돌아갔으므로 **내용이 틀립니다.**
  사용자가 "교사용 파일 필요없다"고 했으니 **삭제하거나**, 남긴다면 TODO 2 부분을 고쳐야 합니다.
- `pygame/교사용/정답_해설.md` 와 `dijkstra_maze_web/answers.html` 은
  `complete/*.py` 에서 자동 생성됩니다. **TODO 2 복귀 후 아직 재생성 안 했습니다.**
  재생성 스크립트는 아래 참고.

### 4. 퍼즈 테스트 최종 확인 (선택)
`python tests/test_fuzz_harnesses.py` — 약 20분 소요. 855회 실행.
마지막 확인 시점에 남아 있던 문제는 전부 고쳤지만, 고친 뒤 **완주 확인은 못 했습니다.**

---

## 자동 생성 파일 — 손으로 고치지 마세요

| 파일 | 생성 방법 |
|---|---|
| `dijkstra_maze_web/export-data.js` | `student/*.py` 에서 생성. 파이썬 원본을 고치면 **반드시** 재생성 |
| `dijkstra_maze_web/answers.html` | `complete/*.py` 에서 생성 |
| `교사용/정답_해설.md` | 위와 같은 스크립트가 함께 생성 |
| `dijkstra_maze/todos.json` | `data.js` 에서 생성 |

생성 스크립트는 이전 세션의 스크래치 폴더에 있었고 **세션 종료와 함께 사라집니다.**
필요하면 다시 작성해야 합니다. 각 스크립트가 한 일:

- **export-data.js 생성**: `student/` 의 `.py` 파일 10개를 통째로 문자열로 넣고,
  `# --- TODO n (Part a/b): WRITE YOUR CODE BELOW ---` / `# --- END OF TODO ... ---`
  마커를 스캔해 `EXPORT_MARKERS = [[stepId, file, partIndex|null, indent, begin, end], ...]` 생성.
  파일 순서: settings, game, player, maze, pathfinding, cell, goal, items, main, requirements.txt
- **answers.html / 정답_해설.md 생성**: `complete/` 의 마커 사이 코드를 뽑아
  코드 `0924` 게이트가 걸린 HTML + 마크다운으로 출력.
- **todos.json 동기화**: node로 `data.js`+`export-data.js` 를 읽어 파트 구조를 JSON에 반영.

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
    tests/                  # 회귀 테스트 4종
  교사용/                    # 교사 자료 (git 아님)
```

**중요**: `dijkstra_maze/` 와 `교사용/` 은 **git에 들어 있지 않습니다.**
백업이 없으니 지우기 전에 조심하세요.

### app.js 안에서 찾아야 할 것들
- `COURSE_STEPS` 는 `data.js` — TODO 콘텐츠(설명/스타터/힌트)
- 채점기: `harness_movement_2`, `harness_guardClause_3`, `harness_positionDelta_4`,
  `harness_dijkstra_5`, `harness_roundDesign_6`, `harness_lookAndFeel_7`,
  `harness_customItems_8`, `harness_gameRules_9`, `harness_syntax_1`
- 공용 파이썬 헬퍼: `PY_BONUS_HELPERS` (무한루프 가드 `_run_guarded`, `_finish_or_report` 등)
- Play 탭: `PlayEngine`, 미리보기: `traceHarness_playerMove`
- 시연 모드: `isShowcaseMode()`, `SHOWCASE_CODE`, `showcaseState()`
- 교사 코드: `TEACHER_OVERRIDE_CODE = "0924"`

### 채점 정책 (이전 세션에서 사용자와 합의)
- Required(1~5)는 정답 고정, **결과 기반** 채점 — 구현 방식은 자유
- Bonus(6~9)는 **개방형: "안 터지면 통과"**. 게임을 못 하게 만드는 것만 오답
  (예외 발생, 잘못된 타입, 목표에서 멀리 있는데 클리어). 나머지는 전부 경고
- 학생 코드는 전부 실행량 예산(line budget) 뒤에서 실행 — 무한루프도 탭을 안 멈춤

---

## 사용자가 이 세션에서 확정한 결정들

- TODO 9 잠금 제거, Bonus 4개 동시 오픈
- 교사 코드 `0924` — Skip이 아니라 **정답 처리**
- Bonus는 두 파일에 걸쳐 자유도 최대화 ("다양성!!!")
- 라운드 개수 변경 가능, 라운드마다 다른 아이템 배치 가능
- 아이템: 개수 무제한, 각자 이미지·소리·**크기(size)**
- 캐릭터/아이템은 **이미지 경로 + 크기만** 설정 (그리기 코드는 안 씀)
- **TODO 2는 한 번에 한 칸 이동** (가속도/마찰 안 씀) ← 최종 결정, 되돌리지 말 것
- **WASD 제거**, 방향키 + E/F/C/D, K=종료, M=리셋
- 교사용 문서는 **정답 파일만** 필요 (단, TODO별 설명 문서는 별도 요청 — 위 2번)
