// Proves the "Download my project" export still produces a COMPLETE,
// RUNNABLE pygame project after the Bonus renumbering.
//
// Everything else in the suite checks pieces. This one checks the promise
// the feature actually makes to a student: "you get the whole game, with
// your own answers in it, and `python main.py` works". It does that the
// only way that can't lie - it splices a real answer set in through
// app.js's own splice code, writes the files to a temp folder, and boots
// them with a real Python interpreter.
//
// Run:  node tests/test_project_export.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const COMPLETE = path.join(ROOT, "..", "dijkstra_maze", "complete");
const STUDENT = path.join(ROOT, "..", "dijkstra_maze", "student");
const failures = [];

function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!ok) failures.push(label + (detail ? " " + detail : ""));
}

// ---- boot app.js in the same minimal DOM test_app_load.js uses ---------
function makeElement(tag) {
  return {
    tagName: (tag || "div").toUpperCase(), style: {}, dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); return c; },
    removeChild() {}, remove() {}, setAttribute() {}, removeAttribute() {},
    getAttribute() { return null; }, addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    getContext() { return null; }, getClientRects() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }; },
    scrollIntoView() {}, focus() {}, blur() {}, click() {},
    offsetWidth: 0, offsetHeight: 0, clientWidth: 0, clientHeight: 0,
    scrollTop: 0, scrollHeight: 0, value: "", textContent: "",
    selectionStart: 0, selectionEnd: 0,
    insertBefore(c) { this.children.push(c); return c; },
    set innerHTML(_v) {}, get innerHTML() { return ""; },
  };
}

const documentStub = {
  documentElement: makeElement("html"), body: makeElement("body"), head: makeElement("head"),
  title: "", createElement: (t) => makeElement(t), createTextNode: (t) => ({ nodeValue: t }),
  createDocumentFragment: () => makeElement("div"),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener: () => {}, removeEventListener: () => {},
};

const storage = (() => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k), clear: () => map.clear(),
    get length() { return map.size; }, key: (i) => Array.from(map.keys())[i] ?? null,
  };
})();

const win = {
  document: documentStub, localStorage: storage,
  location: { search: "", protocol: "https:", href: "https://example.test/" },
  navigator: { userAgent: "node" },
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  addEventListener: () => {}, removeEventListener: () => {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (fn) => setTimeout(() => fn(0), 0), cancelAnimationFrame: clearTimeout,
  performance: { now: () => Date.now() }, URLSearchParams, console,
  Image: function () { return { set src(_v) {} }; },
  Audio: function () { return { play: () => Promise.resolve(), volume: 0 }; },
  TextEncoder,
  btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
  fetch: () => Promise.reject(new Error("no network in this test")),
  prompt: () => null, alert: () => {}, confirm: () => false, open: () => null,
};
win.window = win; win.self = win; win.globalThis = win;
const sandbox = vm.createContext(win);
for (const file of ["data.js", "export-data.js", "app.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), sandbox, { filename: file });
}

const DATA = sandbox.window.COURSE_DATA;
const EXPORT = sandbox.window.EXPORT_DATA;
const hooks = sandbox.window.__courseTestHooks;

// ---- 1. the export ships the whole project ----------------------------
//
// The teacher's requirement, spelled out: every source file, not just the
// TODO-marked ones, plus requirements.txt.
const REQUIRED_IN_ZIP = [
  "main.py", "game.py", "maze.py", "pathfinding.py", "settings.py",
  "cell.py", "goal.py", "items.py", "player.py", "requirements.txt",
];
const shipped = hooks.exportFileNames();
REQUIRED_IN_ZIP.forEach((name) => {
  check(`export includes ${name}`, shipped.indexOf(name) !== -1);
});

// Nothing in the real student tree may be silently left out.
const onDisk = fs.readdirSync(STUDENT).filter((f) => f.endsWith(".py"));
const missing = onDisk.filter((f) => shipped.indexOf(f) === -1);
check("no .py file in student/ is missing from the export", missing.length === 0,
  missing.length ? `(missing: ${missing.join(", ")})` : `(${onDisk.length} files)`);

check("every exported file is byte-identical to the real starter",
  shipped.every((name) => {
    const real = fs.readFileSync(path.join(STUDENT, name), "utf8").replace(/\r\n/g, "\n");
    return EXPORT.EXPORT_FILES[name] === real;
  }));

// ---- 2. pull a real answer set out of complete/ ------------------------
//
// Read between each marker's BEGIN/END in the COMPLETE tree: that is a
// genuine, known-good answer for every single sub-step, so the spliced
// project below is the strongest case the export has to handle.
function answerFor(marker) {
  const [, file, , indent, begin, end] = marker;
  const src = fs.readFileSync(path.join(COMPLETE, file), "utf8").replace(/\r\n/g, "\n");
  const lines = src.split("\n");
  const b = lines.findIndex((l) => l.trim() === begin.trim());
  const e = lines.findIndex((l) => l.trim() === end.trim());
  if (b === -1 || e === -1 || e <= b) return null;
  return { body: lines.slice(b + 1, e).join("\n"), indent };
}

const answers = {};
let unresolved = [];
EXPORT.EXPORT_MARKERS.forEach((m) => {
  const a = answerFor(m);
  if (!a) { unresolved.push(m[0]); return; }
  const key = m[2] == null ? m[0] : m[0] + "#" + m[2];
  answers[key] = a.body;
});
check("every marker has a matching answer region in complete/", unresolved.length === 0,
  unresolved.length ? `(unresolved: ${unresolved.join(", ")})` : `(${EXPORT.EXPORT_MARKERS.length} markers)`);

// ---- 3. splice it all in through app.js's own export code --------------
const state = hooks.freshState();
DATA.COURSE_STEPS.forEach((step) => {
  const sd = state.steps[step.id];
  if (step.parts) {
    sd.code = step.parts.map((_p, i) => answers[step.id + "#" + i] ?? sd.code[i]);
  } else if (answers[step.id] !== undefined) {
    sd.code = answers[step.id];
  }
  sd.status = "completed";
});
hooks.setState(state);

const built = {};
shipped.forEach((name) => { built[name] = hooks.buildFullFileLive(name); });
check("every file spliced without returning null", shipped.every((n) => typeof built[n] === "string"));

// A spliced file must not still contain a starter value the answer set
// replaces - that would mean the splice silently no-op'd.
check("splicing actually changed the files it should have",
  built["settings.py"] !== EXPORT.EXPORT_FILES["settings.py"] &&
  built["game.py"] !== EXPORT.EXPORT_FILES["game.py"] &&
  built["pathfinding.py"] !== EXPORT.EXPORT_FILES["pathfinding.py"]);

check("no TODO marker was consumed or duplicated by the splice",
  shipped.every((name) => {
    const before = (EXPORT.EXPORT_FILES[name].match(/WRITE YOUR CODE BELOW/g) || []).length;
    const after = (built[name].match(/WRITE YOUR CODE BELOW/g) || []).length;
    return before === after;
  }));

// ---- 4. the spliced project actually RUNS ------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maze-export-"));
shipped.forEach((name) => { fs.writeFileSync(path.join(tmp, name), built[name], "utf8"); });
// Assets come from the site at download time; copy the real ones so image
// and sound paths in the answer set resolve exactly as they would.
function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from, { withFileTypes: true }).forEach((entry) => {
    const s = path.join(from, entry.name), d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  });
}
copyDir(path.join(STUDENT, "assets"), path.join(tmp, "assets"));

const BOOT = [
  "import os",
  "os.environ['SDL_VIDEODRIVER'] = 'dummy'",
  "os.environ['SDL_AUDIODRIVER'] = 'dummy'",
  "import pygame",
  "pygame.init()",
  "import main, settings, game, maze, pathfinding, cell, goal, items, player",
  "g = game.Game()",
  "g.load_round()",
  "print('ROUNDS', len(settings.ROUND_CONFIGS))",
  "print('ITEMS', type(g.items).__name__, 'BOMBS', type(g.bombs).__name__)",
  "print('EXPORT_BOOT_OK')",
].join("\n");

let bootOut = "";
let bootErr = null;
try {
  bootOut = execFileSync("python", ["-c", BOOT], {
    cwd: tmp, encoding: "utf8", timeout: 120000,
    env: Object.assign({}, process.env, { PYTHONIOENCODING: "utf-8" }),
  });
} catch (e) {
  bootErr = (e.stdout || "") + (e.stderr || e.message || "");
}
check("the exported project imports and boots under a real Python",
  bootErr === null && bootOut.indexOf("EXPORT_BOOT_OK") !== -1,
  bootErr ? `(${bootErr.split("\n").slice(-6).join(" | ")})` : bootOut.trim().split("\n").join(" · "));

// Every line has to be there, not just the TODO regions - the whole point
// of this export for advanced students is total freedom.
check("the exported settings.py carries the answer set, not the starter",
  built["settings.py"].indexOf("assets/images/player_ninja.png") !== -1);
check("the exported files keep their non-TODO code too",
  built["maze.py"].indexOf("def ") !== -1 && built["main.py"].indexOf("def ") !== -1);

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* leave it */ }

console.log("");
if (failures.length) {
  console.log(`${failures.length} FAILURE(S):`);
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
console.log("ALL PROJECT-EXPORT CHECKS PASSED");
process.exit(0);
