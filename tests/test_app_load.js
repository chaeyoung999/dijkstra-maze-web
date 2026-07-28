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
