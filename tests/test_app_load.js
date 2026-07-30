// Loads data.js, export-data.js and app.js in a minimal fake DOM and checks
// the things that would otherwise only blow up in a student's browser:
//
//   * app.js evaluates at all (a typo in any harness string is a load error)
//   * every course step's shape lines up with what app.js expects
//   * the showcase demo state (?mode=play&showcase=1) builds cleanly and
//     has one code entry per part for every step
//
// Run:  node tests/test_app_load.js
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const failures = [];

function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!ok) failures.push(label + (detail ? " " + detail : ""));
}

// ---- the smallest DOM app.js can boot against -------------------------
function makeElement(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); return c; },
    removeChild() {},
    remove() {},
    setAttribute() {},
    removeAttribute() {},
    getAttribute() { return null; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getContext() { return null; },
    getClientRects() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }; },
    scrollIntoView() {},
    focus() {},
    blur() {},
    click() {},
    offsetWidth: 0,
    offsetHeight: 0,
    clientWidth: 0,
    clientHeight: 0,
    scrollTop: 0,
    scrollHeight: 0,
    value: "",
    textContent: "",
    selectionStart: 0,
    selectionEnd: 0,
    insertBefore(c) { this.children.push(c); return c; },
    set innerHTML(_v) {},
    get innerHTML() { return ""; },
  };
  return el;
}

const listeners = {};
const documentStub = {
  documentElement: makeElement("html"),
  body: makeElement("body"),
  head: makeElement("head"),
  title: "",
  createElement: (tag) => makeElement(tag),
  createTextNode: (t) => ({ nodeValue: t }),
  createDocumentFragment: () => makeElement("div"),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); },
  removeEventListener: () => {},
};

const storage = (() => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    get length() { return map.size; },
    key: (i) => Array.from(map.keys())[i] ?? null,
    _map: map,
  };
})();

// The search string decides which mode app.js boots into.
function makeSandbox(search) {
  const win = {
    document: documentStub,
    localStorage: storage,
    location: { search, protocol: "https:", href: "https://example.test/" + search },
    navigator: { userAgent: "node" },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (fn) => setTimeout(() => fn(0), 0),
    cancelAnimationFrame: clearTimeout,
    performance: { now: () => Date.now() },
    URLSearchParams,
    console,
    Image: function () { return { set src(_v) {} }; },
    Audio: function () { return { play: () => Promise.resolve(), volume: 0 }; },
    TextEncoder,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    fetch: () => Promise.reject(new Error("no network in this test")),
    prompt: () => null,
    alert: () => {},
    confirm: () => false,
    open: () => null,
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;
  return vm.createContext(win);
}

function loadApp(search) {
  const sandbox = makeSandbox(search);
  for (const file of ["data.js", "export-data.js", "app.js"]) {
    const code = fs.readFileSync(path.join(ROOT, file), "utf8");
    vm.runInContext(code, sandbox, { filename: file });
  }
  return sandbox;
}

// ---- 1. it loads at all ----------------------------------------------
let sandbox = null;
try {
  sandbox = loadApp("");
  check("data.js + export-data.js + app.js evaluate without error", true);
} catch (e) {
  check("data.js + export-data.js + app.js evaluate without error", false, `(${e.message})`);
  console.error(e.stack);
  process.exit(1);
}

const DATA = sandbox.window.COURSE_DATA;
const EXPORT = sandbox.window.EXPORT_DATA;

// ---- 2. course data is internally consistent --------------------------
const steps = DATA.COURSE_STEPS;
check("every Required and Bonus id has a step", (() => {
  const ids = steps.map((s) => s.id);
  return DATA.REQUIRED_ORDER.concat(DATA.BONUS_ORDER).every((id) => ids.includes(id));
})());

// ---- 2b. the Bonus split: 24+ flat sub-steps, no stacked parts --------
const groups = DATA.BONUS_GROUPS;
check("BONUS_GROUPS exists and covers every Bonus id",
  !!groups && groups.reduce((acc, g) => acc.concat(g.ids), []).join(",") === DATA.BONUS_ORDER.join(","),
  `(${DATA.BONUS_ORDER.length} sub-steps)`);

check("no Bonus step renders as stacked parts any more",
  DATA.BONUS_ORDER.every((id) => !steps.find((s) => s.id === id).parts));

check("TODO 5 is the only step left with parts",
  steps.filter((s) => s.parts).map((s) => s.id).join(",") === "5",
  `(${steps.filter((s) => s.parts).map((s) => s.id).join(",") || "none"})`);

groups.forEach((g) => {
  g.ids.forEach((id, i) => {
    const step = steps.find((s) => s.id === id);
    check(`${id}: exists, belongs to group ${g.id}, one file, one hint`,
      !!step && step.group === g.id && typeof step.file === "string" && step.hints.length === 1);
    check(`${id}: grading points at its group harness and its own part index`,
      !!step && step.grading.group === g.id && step.grading.part === i + 1,
      step ? `(part ${step.grading.part})` : "");
    check(`${id}: id spells out its group and position`, id === `${g.id}-${i + 1}`);
  });
});

check("every Bonus step still carries a lead, a starter and a code reference",
  DATA.BONUS_ORDER.every((id) => {
    const s = steps.find((x) => x.id === id);
    return !!(s.lead && s.lead.length && s.starter && s.starter.length && s.codeReference && s.codeReference.length);
  }));

check("no Bonus lead still talks about 'Part n/m'",
  DATA.BONUS_ORDER.every((id) => !/Part \d+\/\d+/.test(steps.find((x) => x.id === id).lead)));

steps.forEach((step) => {
  const label = `TODO ${step.id}`;
  if (step.parts) {
    check(`${label}: every part has starter code`, step.parts.every((p) => p.starter && p.starter.length));
    check(`${label}: part labels match the part count`,
      step.parts.every((p, i) => p.part === `${i + 1}/${step.parts.length}`),
      `(${step.parts.map((p) => p.part).join(", ")})`);
    check(`${label}: grading is flagged multi-part`, step.grading.multiPart === true || step.grading.twoParts === true);
  } else {
    check(`${label}: has starter code`, !!(step.starter && step.starter.length));
  }
  check(`${label}: has exactly one hint`, step.hints.length === 1, `(${step.hints.length})`);
});

// ---- 3. export markers line up with the steps -------------------------
const markerKey = (id, part) => `${id}#${part === null ? "-" : part}`;
const markers = new Set(EXPORT.EXPORT_MARKERS.map((m) => markerKey(m[0], m[2])));
steps.forEach((step) => {
  if (step.parts) {
    step.parts.forEach((_p, i) => {
      check(`TODO ${step.id} part ${i + 1}: has an export marker`, markers.has(markerKey(step.id, i)));
    });
  } else {
    check(`TODO ${step.id}: has an export marker`, markers.has(markerKey(step.id, null)));
  }
});
check("no export marker is left over from a removed part",
  EXPORT.EXPORT_MARKERS.every((m) => {
    const step = steps.find((s) => s.id === m[0]);
    if (!step) return false;
    return m[2] === null ? !step.parts : !!(step.parts && step.parts[m[2]]);
  }));

// ---- 4. every marker's file exists in EXPORT_FILES ---------------------
check("every marker's file is present in EXPORT_FILES",
  EXPORT.EXPORT_MARKERS.every((m) => typeof EXPORT.EXPORT_FILES[m[1]] === "string"));
check("every marker text appears in its file",
  EXPORT.EXPORT_MARKERS.every((m) => {
    const src = EXPORT.EXPORT_FILES[m[1]] || "";
    return src.includes(m[4]) && src.includes(m[5]);
  }));

// ---- 4c. Required 1-5 ship PRE-FILLED with the reference answer --------
//
// Deliberate pedagogical change, confirmed by the teacher: Required is no
// longer a fill-in-the-blank exercise. The editor opens with the working
// answer already typed in, for students to read and experiment with. Bonus
// is untouched and stays a real exercise.
//
// Three separate things have to hold, and each one fails differently:
//   a) the starter really is the answer (else the site ships a wrong answer)
//   b) every surface agrees (else a student sees two versions of "their" code)
//   c) a save still beats the default (else it silently eats their own work)
(() => {
  const hooks = sandbox.window.__courseTestHooks;
  const COMPLETE = path.join(ROOT, "..", "dijkstra_maze", "complete");
  const STUDENT = path.join(ROOT, "..", "dijkstra_maze", "student");
  // Driven off data.js's own `prefilled` flag rather than a list typed here,
  // so the flag and the actual starter content have to agree. That flag is
  // load-bearing: defaultStepState() uses it to decide whether a step opens
  // already "completed", so a step wrongly flagged would hand out a free pass.
  const flagged = steps.filter((s) => s.prefilled).map((s) => s.id);
  check("exactly Required 1-5 are flagged prefilled", flagged.join(",") === "1,2,3,4,5", `(${flagged.join(", ")})`);
  check("every prefilled step is a Required step",
    steps.filter((s) => s.prefilled).every((s) => s.required === true && s.kind === "Required"));
  // TODO 1 is prefilled but excluded below: its starter is a working EXAMPLE
  // the student is meant to replace with their own game name, not a solution
  // copied out of complete/*.py, and its lead deliberately says so.
  const PREFILLED = flagged.filter((id) => id !== "1");

  // (a) starter === complete/*.py's marker region, read straight off disk.
  // Nothing hand-copied: if data.js and complete/ ever drift, this fails.
  function answerRegion(file, beginText, endText) {
    const src = fs.readFileSync(path.join(COMPLETE, file), "utf8").replace(/\r\n/g, "\n").split("\n");
    const b = src.findIndex((l) => l.trim() === beginText.trim());
    const e = src.findIndex((l) => l.trim() === endText.trim());
    return b === -1 || e <= b ? null : src.slice(b + 1, e).join("\n");
  }
  EXPORT.EXPORT_MARKERS.forEach((m) => {
    const [id, file, partIndex, , begin, end] = m;
    if (PREFILLED.indexOf(id) === -1) return;
    const step = steps.find((s) => s.id === id);
    const starter = partIndex == null ? step.starter : step.parts[partIndex].starter;
    const starterText = (Array.isArray(starter) ? starter.join("\n") : String(starter));
    const answer = answerRegion(file, begin, end);
    const label = `TODO ${id}${partIndex == null ? "" : " part " + (partIndex + 1)}`;
    check(`${label}: starter is byte-identical to complete/${file}'s answer`,
      answer !== null && starterText === answer);
  });

  // A pre-filled step must not still be carrying a fill-in-the-blank stub.
  PREFILLED.forEach((id) => {
    const step = steps.find((s) => s.id === id);
    const all = (step.parts ? step.parts.map((p) => p.starter) : [step.starter])
      .map((s) => (Array.isArray(s) ? s.join("\n") : String(s))).join("\n");
    check(`TODO ${id}: no "Write your code here" placeholder left in the starter`,
      !/Write your code here/i.test(all) && !/^\s*pass\s*$/m.test(all));
    // The framing sentence is what tells the student this one is to READ,
    // not to write. Without it the pre-filled code just looks like a bug.
    check(`TODO ${id}: lead tells the student it is already filled in`,
      /already filled in/i.test(step.lead));
  });

  // Bonus must NOT have been swept up in this. The real guarantee is that
  // a Bonus starter is still exactly whatever student/*.py ships, since the
  // pre-fill only rewrote the Required regions of that tree.
  //
  // Note what this deliberately does NOT assert: that Bonus starters differ
  // from complete/*.py. Most of them don't, and that is by design and
  // predates this change - 19 of the 30 Bonus sub-steps hand over WORKING
  // code or a working setting and ask the student to customize it ("the
  // starter already does exactly that"), so starter == answer there is
  // correct, not a leak. Only the 11 genuine blanks below must differ.
  function studentRegion(file, beginText, endText) {
    const src = fs.readFileSync(path.join(STUDENT, file), "utf8").replace(/\r\n/g, "\n").split("\n");
    const b = src.findIndex((l) => l.trim() === beginText.trim());
    const e = src.findIndex((l) => l.trim() === endText.trim());
    return b === -1 || e <= b ? null : src.slice(b + 1, e).join("\n");
  }
  // The mirror image of the pre-fill: Required 6 and 7 were added precisely
  // BECAUSE 1-5 stopped being exercises, so they must stay real blanks. If a
  // future session ever "helpfully" pre-fills these too, Required has no
  // exercise left in it at all - which is the whole point of their existence.
  ["6", "7"].forEach((id) => {
    const step = steps.find((s) => s.id === id);
    check(`TODO ${id} exists and is Required`, !!step && step.required === true && step.kind === "Required");
    if (!step) return;
    const starterText = (Array.isArray(step.starter) ? step.starter.join("\n") : String(step.starter));
    check(`TODO ${id} is still a real fill-in-the-blank exercise`,
      /Write your code here/.test(starterText));
    check(`TODO ${id}'s starter is NOT the answer`,
      EXPORT.EXPORT_MARKERS.filter((m) => m[0] === id).every((m) => starterText !== answerRegion(m[1], m[4], m[5])));
    check(`TODO ${id}'s lead does not claim to be pre-filled`, !/already filled in/i.test(step.lead));
    check(`TODO ${id} is behaviour-graded with exactly one hint`,
      step.grading.mode === "behaviour" && !!step.grading.harness && step.hints.length === 1);
    // The one that matters most: if these were ever flagged prefilled they
    // would open already "completed" and the student would never do them.
    check(`TODO ${id} is NOT flagged prefilled (so it does not auto-complete)`, !step.prefilled);
  });

  // The Bonus sub-steps that really are blanks a student must fill in. If
  // the answer set ever leaks into one of these, Bonus silently stops being
  // an exercise - the exact mistake this whole section exists to catch.
  const BONUS_REAL_BLANKS = ["8-7", "9-1", "9-2", "9-6", "9-9", "9-10", "9-11", "9-12", "10-1", "10-2", "10-3"];
  let bonusTotal = 0, bonusDrift = [], leaked = [], seenBlanks = [];
  EXPORT.EXPORT_MARKERS.forEach((m) => {
    const [id, file, partIndex, , begin, end] = m;
    if (DATA.BONUS_ORDER.indexOf(id) === -1) return;
    bonusTotal++;
    const step = steps.find((s) => s.id === id);
    const starter = partIndex == null ? step.starter : step.parts[partIndex].starter;
    const starterText = Array.isArray(starter) ? starter.join("\n") : String(starter);
    if (starterText !== studentRegion(file, begin, end)) bonusDrift.push(id);
    if (BONUS_REAL_BLANKS.indexOf(id) !== -1) {
      seenBlanks.push(id);
      if (starterText === answerRegion(file, begin, end)) leaked.push(id);
    }
  });
  check("every Bonus starter still matches the shipped student/*.py region",
    bonusDrift.length === 0,
    bonusDrift.length ? `(drifted: ${bonusDrift.join(", ")})` : `(${bonusTotal} markers)`);
  check("no answer has leaked into a Bonus sub-step that is meant to be blank",
    leaked.length === 0 && seenBlanks.length === BONUS_REAL_BLANKS.length,
    leaked.length ? `(leaked: ${leaked.join(", ")})` : `(${seenBlanks.length} blanks checked)`);
  check("no Bonus lead claims to be already filled in",
    DATA.BONUS_ORDER.every((id) => !/already filled in/i.test(steps.find((s) => s.id === id).lead)));

  // (b) every surface agrees. The "View full file" viewer splices the LIVE
  // stepData.code over the raw student file, so on a fresh load it must
  // show the answer - and because student/*.py's Required regions were
  // un-blanked to match, the spliced result must equal the raw file exactly.
  // That equality is the whole consistency guarantee in one line.
  hooks.setState(hooks.freshState());
  ["player.py", "pathfinding.py"].forEach((name) => {
    const live = hooks.buildFullFileLive(name);
    const raw = fs.readFileSync(path.join(STUDENT, name), "utf8").replace(/\r\n/g, "\n");
    check(`View full file: ${name} on a fresh load matches the raw student file`, live === raw);
    check(`View full file: ${name} shows no blank placeholder`,
      typeof live === "string" && !/Write your code here/.test(live));
  });
  const liveGame = hooks.buildFullFileLive("game.py");
  check("View full file: game.py shows TODO 2's answer, not a placeholder",
    liveGame.includes('moved = self.player.try_move("left", self.maze)') &&
    !liveGame.includes('the direction string is "left"'));

  // (c) a student's OWN answer must survive a reload. Different variable
  // names, different shape, same behaviour - exactly the case where a
  // "restore the default" bug would look harmless and destroy real work.
  const MY_3 = "        blocked = current is None or current.walls[direction]\n        if blocked:\n            return False";
  const MY_5B = "            best = distance.get(neighbor)\n            if best is None or new_cost < best:\n                distance[neighbor] = new_cost\n                parent[neighbor] = current\n                heapq.heappush(queue, (new_cost, neighbor))";
  const restored = hooks.normalizeLoadedState({
    steps: {
      "3": { code: MY_3, status: "completed", attempts: 2 },
      "5": { code: ["            new_cost = step_cost + cost", MY_5B], status: "completed" },
    },
  });
  check("a saved Required answer wins over the new pre-filled default (TODO 3)",
    restored.steps["3"].code === MY_3);
  check("a saved Required answer wins over the new pre-filled default (TODO 5, both parts)",
    restored.steps["5"].code[0] === "            new_cost = step_cost + cost" &&
    restored.steps["5"].code[1] === MY_5B);
  check("the saved status/attempts survive too", restored.steps["3"].status === "completed" && restored.steps["3"].attempts === 2);
  // A step the student never opened correctly falls back to the pre-fill.
  const step4 = steps.find((s) => s.id === "4");
  check("an untouched Required step still gets the pre-filled default",
    restored.steps["4"].code === step4.starter.join("\n"));
  // A save from BEFORE this change stored the old blank. It is still the
  // student's own code, so it must be restored verbatim - we must not
  // "helpfully" upgrade it to the answer behind their back.
  const oldBlank = hooks.normalizeLoadedState({ steps: { "4": { code: "        pass  # Write your code here." } } });
  check("a pre-change save holding the old blank is restored as-is, not silently upgraded",
    oldBlank.steps["4"].code === "        pass  # Write your code here.");
})();

// ---- 4b. Bonus locking: sequential inside a group, free between them --
//
// Driven through app.js's REAL computeStatus (via the test seam), not a
// re-implementation - the point is to catch the rule itself regressing.
(function checkBonusLocking() {
  const hooks = sandbox.window.__courseTestHooks;
  if (!hooks) { check("app.js exposes the lock rules for testing", false); return; }

  // A state where every Required step is done and nothing else is.
  function stateWith(done) {
    const s = hooks.freshState();
    DATA.REQUIRED_ORDER.forEach((id) => { s.steps[id].status = "completed"; });
    Object.keys(done || {}).forEach((id) => { s.steps[id].status = done[id]; });
    hooks.setState(s);
    return s;
  }

  // Required 1-5 ship pre-filled with the reference answer and default to
  // "completed" (see defaultStepState) - there is nothing left to solve.
  // Required 6 and 7 are the real fill-in-the-blank exercises, so they
  // default to "available" and the student genuinely has to pass them.
  //
  // Consequence, and it is the intended one: Bonus is LOCKED on a fresh load,
  // because Required is not finished until 6 and 7 are done. If Bonus opened
  // immediately, a student could skip past the only two Required exercises
  // the course still has - which is the whole reason 6 and 7 exist.
  const fresh = hooks.freshState();
  hooks.setState(fresh);
  check("a fresh state has the PRE-FILLED Required steps already completed",
    ["1", "2", "3", "4", "5"].every((id) => fresh.steps[id].status === "completed"));
  check("a fresh state leaves the two real Required exercises to do",
    fresh.steps["6"].status === "available" && fresh.steps["7"].status === "available");
  check("Required 6 is open on a fresh load, 7 waits for 6 (sequential)",
    hooks.computeStatus("6") === "available" && hooks.computeStatus("7") === "locked");
  check("Bonus stays locked on a fresh load until Required 6 and 7 are done",
    DATA.BONUS_ORDER.every((id) => hooks.computeStatus(id) === "locked"));

  // ...and opens as soon as they are.
  const reqDone = hooks.freshState();
  reqDone.steps["6"].status = "completed";
  reqDone.steps["7"].status = "completed";
  hooks.setState(reqDone);
  check("finishing Required 6 and 7 unlocks every Bonus group's first step",
    DATA.BONUS_GROUPS.map((g) => g.ids[0]).every((id) => hooks.computeStatus(id) === "available"));

  // Skipping counts, exactly like everywhere else in this course.
  const reqSkipped = hooks.freshState();
  reqSkipped.steps["6"].status = "skipped";
  reqSkipped.steps["7"].status = "skipped";
  hooks.setState(reqSkipped);
  check("skipping Required 6 and 7 also unlocks Bonus",
    DATA.BONUS_GROUPS.map((g) => g.ids[0]).every((id) => hooks.computeStatus(id) === "available"));

  // The underlying LOCK RULE itself (Bonus requires Required done-or-skipped)
  // must still hold if a Required step is ever put back into a non-done state
  // (e.g. the "Reset this step" action). Started from an all-Required-done
  // state on purpose: resetting a step in a fresh state would prove nothing,
  // since a fresh state already has Bonus locked via 6 and 7.
  DATA.REQUIRED_ORDER.forEach((resetId) => {
    const requiredReset = hooks.freshState();
    DATA.REQUIRED_ORDER.forEach((id) => { requiredReset.steps[id].status = "completed"; });
    requiredReset.steps[resetId].status = "available";
    hooks.setState(requiredReset);
    check(`Bonus re-locks when Required ${resetId} is put back to not-done`,
      DATA.BONUS_ORDER.every((id) => hooks.computeStatus(id) === "locked"));
  });

  stateWith({});
  const firsts = DATA.BONUS_GROUPS.map((g) => g.ids[0]);
  check("every group's FIRST sub-step unlocks together (groups are free between themselves)",
    firsts.every((id) => hooks.computeStatus(id) === "available"),
    `(${firsts.join(", ")})`);
  check("no group's LATER sub-steps are reachable yet",
    DATA.BONUS_GROUPS.every((g) => g.ids.slice(1).every((id) => hooks.computeStatus(id) === "locked")));
  check("the rules group is NOT a capstone - 11-1 is open with the rest",
    hooks.computeStatus("11-1") === "available");

  // Completing one sub-step opens exactly the next one in ITS group.
  stateWith({ "8-1": "completed" });
  check("completing 8-1 opens 8-2 and nothing further",
    hooks.computeStatus("8-2") === "available" && hooks.computeStatus("8-3") === "locked");
  check("progress in group 8 does not unlock anything in group 9",
    hooks.computeStatus("9-2") === "locked" && hooks.computeStatus("9-1") === "available");

  // Skipping counts exactly like completing, same as Required.
  stateWith({ "10-1": "skipped" });
  check("skipping 10-1 also opens 10-2", hooks.computeStatus("10-2") === "available");

  // A finished group hands the student on to the next group.
  const done9 = {};
  DATA.BONUS_GROUPS.filter((g) => g.id === "8")[0].ids.forEach((id) => { done9[id] = "completed"; });
  stateWith(done9);
  check("bonusGroupComplete('8') is true once every 8-x is completed", hooks.bonusGroupComplete("8") === true);
  check("bonusGroupComplete('9') is false while 9-x is untouched", hooks.bonusGroupComplete("9") === false);
  check("finishing the last sub-step of a group points at the next group's first step",
    hooks.nextStepAfter("8-6") === "9-1", `(${hooks.nextStepAfter("8-6")})`);
})();

// ---- 5. the showcase demo boots --------------------------------------
//
// Booting it for real is the point: showcaseState() has to build one code
// entry per part for every step, and a mismatch there is exactly the kind
// of thing that only surfaces as a blank window in front of a class.
function bootWithElements(search) {
  const before = listeners["DOMContentLoaded"] ? listeners["DOMContentLoaded"].length : 0;
  // Hand back a real stub for any element lookup, so rendering code can run.
  documentStub.getElementById = () => makeElement("div");
  documentStub.querySelector = () => makeElement("div");
  documentStub.querySelectorAll = () => [];
  try {
    loadApp(search);
    const fns = (listeners["DOMContentLoaded"] || []).slice(before);
    fns.forEach((fn) => fn({ type: "DOMContentLoaded" }));
    return null;
  } catch (e) {
    return e;
  } finally {
    documentStub.getElementById = () => null;
    documentStub.querySelector = () => null;
  }
}

let err = bootWithElements("?mode=play&showcase=1");
check("the showcase demo boots without throwing", err === null, err ? `(${err.message})` : "");
check("the showcase demo wrote nothing to localStorage", storage._map.size === 0,
  `(${storage._map.size} keys)`);

err = bootWithElements("");
check("the normal student page boots without throwing", err === null, err ? `(${err.message})` : "");

err = bootWithElements("?mode=play");
check("the kiosk Play window boots without throwing", err === null, err ? `(${err.message})` : "");

console.log("");
if (failures.length) {
  console.log(`${failures.length} FAILURE(S):`);
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
console.log("ALL APP-LOAD CHECKS PASSED");
// Booting the app starts the Play tab's timers and animation loop, which
// would otherwise keep node alive forever. The checks are done, so leave.
process.exit(0);
