// Regenerates the teacher answer key in BOTH of its forms:
//
//   dijkstra_maze_web/answers.html   (code-gated page on the live site)
//   교사용/정답_해설.md               (printable markdown)
//
// The CODE for every TODO part is extracted LIVE from the marker regions of
// dijkstra_maze/complete/*.py, so the key can never drift from the real
// answers. Structure (which TODOs, which parts, which file, kind) comes from
// data.js. Only the short Korean title and commentary are hand-written, in
// scripts/answer_notes.json.
//
// The previous generator was lost with a scratch folder (see HANDOFF.md);
// this is the re-derived, committed version.
//
//   node scripts/gen_answers.js
//
// The 0924 gate is deliberately unchanged: same client-side check, same
// honest warning that it is an accidental-discovery deterrent and not a
// security boundary.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WEB = path.join(__dirname, "..");
const COMPLETE = path.join(WEB, "..", "dijkstra_maze", "complete");
const TEACHER_MD = path.join(WEB, "..", "교사용", "정답_해설.md");
const GATE_CODE = "0924";

const sandbox = vm.createContext({ window: {}, console: console });
vm.runInContext(fs.readFileSync(path.join(WEB, "data.js"), "utf8"), sandbox, { filename: "data.js" });
const DATA = sandbox.window.COURSE_DATA;
const NOTES = JSON.parse(fs.readFileSync(path.join(__dirname, "answer_notes.json"), "utf8"));

const sourceCache = {};
function sourceOf(file) {
  if (!(file in sourceCache)) {
    const full = path.join(COMPLETE, file);
    sourceCache[file] = fs.existsSync(full) ? fs.readFileSync(full, "utf8").replace(/\r\n/g, "\n") : null;
  }
  return sourceCache[file];
}

// Pull the code between a TODO's begin/end markers out of complete/<file>,
// then strip the common leading indentation so the key reads like a snippet
// rather than a fragment floating at column 8.
function extract(file, id, partLabel) {
  const src = sourceOf(file);
  if (src === null) return { error: "complete/" + file + " not found" };
  const suffix = partLabel ? " (Part " + partLabel + ")" : "";
  const begin = "# --- TODO " + id + suffix + ": WRITE YOUR CODE BELOW ---";
  const end = "# --- END OF TODO " + id + suffix + " ---";
  const bi = src.indexOf(begin);
  const ei = src.indexOf(end);
  if (bi === -1) return { error: "begin marker not found in " + file + ": " + begin };
  if (ei === -1 || ei < bi) return { error: "end marker not found in " + file + ": " + end };
  const body = src.slice(src.indexOf("\n", bi) + 1, src.lastIndexOf("\n", ei) + 1);
  const lines = body.replace(/\n$/, "").split("\n");
  let indent = null;
  lines.forEach(function (l) {
    if (!l.trim()) return;
    const lead = l.match(/^[ \t]*/)[0];
    if (indent === null || lead.length < indent.length) indent = lead;
  });
  indent = indent || "";
  return { code: lines.map(function (l) { return l.startsWith(indent) ? l.slice(indent.length) : l; }).join("\n") };
}

const answers = [];
const problems = [];

DATA.COURSE_STEPS.forEach(function (step) {
  const entries = step.parts
    ? step.parts.map(function (p, i) { return { partLabel: p.part, index: i, file: p.file || step.file, title: p.title }; })
    : [{ partLabel: null, index: null, file: step.file, title: step.title }];
  entries.forEach(function (e) {
    const key = step.id + (e.index === null ? "" : "#" + e.index);
    const note = NOTES[key] || {};
    if (!NOTES[key]) problems.push("no answer_notes.json entry for " + key);
    const got = extract(e.file, step.id, e.partLabel);
    if (got.error) { problems.push(got.error); return; }
    answers.push({
      label: "TODO " + step.id + (e.partLabel ? " (Part " + e.partLabel + ")" : ""),
      kind: step.kind,
      file: e.file,
      title: note.title || e.title,
      englishTitle: e.title,
      note: note.note || "",
      code: got.code,
    });
  });
});

if (problems.length) {
  console.error("REFUSING TO WRITE — problems found:");
  problems.forEach(function (p) { console.error("  - " + p); });
  process.exit(1);
}

// ------------------------------------------------------------- answers.html
const HEAD = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Dijkstra Maze — 교사용 정답</title>
<link rel="stylesheet" href="styles.css">
<style>
  body { margin: 0; padding: 24px; }
  .sheet { max-width: 980px; margin: 0 auto; }
  .gate { max-width: 460px; margin: 12vh auto; text-align: center; }
  .gate input { font-size: 20px; padding: 10px 14px; width: 160px; text-align: center;
                letter-spacing: 6px; margin: 12px 0; }
  .ans { border: 1px solid rgba(120, 90, 40, 0.35); border-radius: 10px;
         padding: 14px 16px; margin: 0 0 16px; }
  .ans h3 { margin: 0 0 2px; font-size: 17px; }
  .ans .meta { font-size: 12px; opacity: 0.72; margin-bottom: 8px; }
  .ans .note { font-size: 14px; margin: 0 0 10px; line-height: 1.55; }
  .ans pre { margin: 0; padding: 12px; overflow-x: auto; border-radius: 8px;
             background: rgba(20, 16, 10, 0.9); color: #f2e7cf;
             font-family: ui-monospace, Consolas, monospace; font-size: 13px; line-height: 1.5; }
  .tag { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 99px;
         border: 1px solid currentColor; margin-right: 6px; }
  .tag.req { color: #a8551b; }
  .tag.bonus { color: #2f6f4f; }
  .warn { border-left: 4px solid #c2410c; padding: 10px 14px; margin: 0 0 20px;
          font-size: 14px; line-height: 1.6; }
  .links a { display: inline-block; margin-right: 16px; }
</style>
</head>
<body>
<div class="sheet">
  <div id="gate" class="gate">
    <h1>교사용 정답</h1>
    <p class="small muted">수업에서 쓰는 코드를 입력하세요.</p>
    <div><input id="code" type="password" inputmode="numeric" autocomplete="off"
                aria-label="교사용 코드"></div>
    <div><button id="go" class="btn btn-primary" type="button">열기</button></div>
    <p id="bad" class="small" style="color:#b91c1c" hidden>코드가 맞지 않습니다.</p>
  </div>

  <div id="body" hidden>
    <h1>Dijkstra Maze — 교사용 정답 해설</h1>
    <p class="warn">
      <strong>학생에게 이 주소를 알려주지 마세요.</strong>
      이 페이지는 순수 클라이언트 JavaScript라, 개발자도구를 열 줄 아는 학생은
      코드 없이도 내용을 볼 수 있습니다. 진짜 접근 차단이 아니라
      "우연히 발견되지는 않는" 수준의 장치입니다.
    </p>
    <p class="links">
      <a href="index.html">← 학생용 사이트</a>
      <a href="index.html?mode=play&amp;showcase=1" target="_blank" rel="noopener">
        ▶ 완성본 시연 게임 열기</a>
    </p>
    <p class="small muted">
      Required 5개는 정답이 정해져 있고, Bonus 4개는 개방형입니다 —
      아래 코드는 "이렇게 하면 된다"는 한 가지 예일 뿐, 채점기는 동작만 맞으면 통과시킵니다.
      채점이 잘못 걸릴 때는 각 단계의 <em>Trouble with grading?</em> 링크에 같은 코드를 넣으면
      정답 처리됩니다.
    </p>
    <p class="small muted">
      이 파일은 <code>scripts/gen_answers.js</code> 가 <code>complete/*.py</code> 에서
      자동 생성합니다. 손으로 고치지 마세요.
    </p>
    <div id="list"></div>
  </div>
</div>

<script>
(function () {
  "use strict";
  var ANSWERS = `;

const TAIL = `;
  var CODE = ${JSON.stringify(GATE_CODE)};

  function render() {
    var list = document.getElementById("list");
    ANSWERS.forEach(function (a) {
      var box = document.createElement("div");
      box.className = "ans";
      var h = document.createElement("h3");
      var tag = document.createElement("span");
      tag.className = "tag " + (a.kind === "Required" ? "req" : "bonus");
      tag.textContent = a.kind;
      h.appendChild(tag);
      h.appendChild(document.createTextNode(a.label + (a.title ? " — " + a.title : "")));
      box.appendChild(h);
      var meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = a.file + (a.englishTitle ? " · " + a.englishTitle : "");
      box.appendChild(meta);
      if (a.note) {
        var note = document.createElement("p");
        note.className = "note";
        note.textContent = a.note;
        box.appendChild(note);
      }
      var pre = document.createElement("pre");
      pre.textContent = a.code;
      box.appendChild(pre);
      list.appendChild(box);
    });
  }

  function unlock() {
    var entered = (document.getElementById("code").value || "").trim();
    if (entered !== CODE) {
      document.getElementById("bad").hidden = false;
      return;
    }
    document.getElementById("gate").hidden = true;
    document.getElementById("body").hidden = false;
    render();
  }

  document.getElementById("go").addEventListener("click", unlock);
  document.getElementById("code").addEventListener("keydown", function (e) {
    if (e.key === "Enter") unlock();
  });
})();
</script>
</body>
</html>
`;

const json = "[\n" + answers.map(function (a) { return " " + JSON.stringify(a, null, 1).split("\n").join("\n "); }).join(",\n") + "\n]";
fs.writeFileSync(path.join(WEB, "answers.html"), HEAD + json + TAIL, "utf8");

// -------------------------------------------------------- 정답_해설.md
const required = answers.filter(function (a) { return a.kind === "Required"; });
const bonus = answers.filter(function (a) { return a.kind !== "Required"; });

function mdSection(list) {
  return list.map(function (a) {
    return [
      "### " + a.label + " — " + a.title,
      "",
      "`" + a.file + "` · " + a.englishTitle,
      "",
      a.note ? "> " + a.note + "\n" : "",
      "```python",
      a.code,
      "```",
      "",
    ].join("\n");
  }).join("\n");
}

const md = [
  "# Dijkstra Maze — 정답 해설 (교사용)",
  "",
  "**⚠️ 이 문서는 교사용입니다. 학생에게 배포하지 마세요.**",
  "",
  "이 파일은 `dijkstra_maze/complete/*.py` 에서 **자동 생성**됩니다 —",
  "`node scripts/gen_answers.js`. 손으로 고치지 마세요; 실제 정답과 어긋납니다.",
  "",
  "같은 내용을 배포 사이트의 **`answers.html`** (코드 `" + GATE_CODE + "`) 에서도 볼 수 있습니다.",
  "",
  "- Required 5개는 정답이 정해져 있습니다.",
  "- Bonus 4개는 **개방형**입니다. 아래 코드는 \"이렇게 하면 된다\"는 한 가지 예일 뿐이고,",
  "  채점기는 동작만 맞으면 통과시킵니다. 학생 답이 아래와 다르다고 감점하지 마세요.",
  "- 채점이 잘못 걸릴 때는 각 단계의 *Trouble with grading?* 링크에 `" + GATE_CODE + "` 를 넣으면",
  "  Skip이 아니라 **정답 처리**됩니다.",
  "",
  "**파트 수**: " + DATA.COURSE_STEPS.map(function (s) {
    return "TODO " + s.id + " " + (s.parts ? s.parts.length : 1);
  }).join(" · ") + " (합계 " + answers.length + ")",
  "",
  "---",
  "",
  "## ✅ Required (정답 고정)",
  "",
  mdSection(required),
  "---",
  "",
  "## ⭐ Bonus (개방형 — 아래는 예시일 뿐입니다)",
  "",
  mdSection(bonus),
].join("\n");

fs.mkdirSync(path.dirname(TEACHER_MD), { recursive: true });
fs.writeFileSync(TEACHER_MD, md, "utf8");

console.log("answers.html + 교사용/정답_해설.md written: " + answers.length + " entries");
console.log("  Required " + required.length + " · Bonus " + bonus.length + " · gate " + GATE_CODE);
