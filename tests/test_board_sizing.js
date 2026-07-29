// Play-board canvas sizing regression test.
//
// The bug this guards against: PlayEngine's canvas was created once at a
// hardcoded 360x260 CSS px and never resized, so any maze bigger than that
// was simply clipped - in the kiosk "Play Game" popout and in the in-page
// Play tab alike. The cellSize computation also only ever looked at the
// available WIDTH, so a tall maze overflowed downwards even once the canvas
// did resize.
//
// This boots the real app.js in a fake DOM that models enough layout
// (clientWidth, getBoundingClientRect heights, window.innerHeight,
// devicePixelRatio, document.fullscreenElement) for the sizing maths to be
// exercised for real, then asserts on the canvas element the engine
// actually produced.
//
// Run:  node tests/test_board_sizing.js
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

// ---------------------------------------------------------------- fake DOM
//
// Heights the real stylesheet gives the non-board rows of .play-frame.
// These only have to be plausible - the point is that playBoardMaxHeight()
// subtracts them, not that they match a real browser to the pixel.
const CLASS_HEIGHT = {
  "titlecard-frame": 96,
  "play-topbar": 40,
  "play-status-grid": 52,
  "sidebar-group-title": 22,
  "play-checklist": 130,
  "play-live-banner": 34,
  "play-broken-notice": 24,
};
// styles.css display:none's these inside the kiosk popout, and a
// display:none box measures 0 - see "body.kiosk-mode #kioskPlayView ...".
const KIOSK_HIDDEN = ["titlecard-frame", "sidebar-group-title", "play-checklist", "play-live-banner"];
// ...and the same progress chrome (minus the title card) inside
// ".viz-panel:fullscreen #vizPlayView ...".
const FULLSCREEN_HIDDEN = ["sidebar-group-title", "play-checklist", "play-live-banner"];

function makeCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      return function () { return makeCtx(); };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function createWorld(opts) {
  const kiosk = !!opts.kiosk;
  const registry = new Map();
  let fullscreenElement = null;

  function classes(node) { return String(node.className || "").split(/\s+/).filter(Boolean); }

  function heightOf(node) {
    if (node.hidden) return 0;
    if (node._height != null) return node._height;
    const cls = classes(node);
    if (kiosk && cls.some((c) => KIOSK_HIDDEN.includes(c))) return 0;
    if (!kiosk && fullscreenElement && fullscreenElement.id === "vizPanel"
        && cls.some((c) => FULLSCREEN_HIDDEN.includes(c))) return 0;
    for (const c of cls) if (CLASS_HEIGHT[c] != null) return CLASS_HEIGHT[c];
    if (node.tagName === "CANVAS") return parseFloat(node.style.height) || 0;
    return 0;
  }
  function inheritedWidth(node) {
    let p = node;
    while (p) {
      if (p._clientWidth != null) return Math.max(0, p._clientWidth - (p === node ? 0 : (p._padX || 0)));
      p = p.parentNode;
    }
    return 0;
  }
  function inheritedTop(node) {
    let p = node;
    while (p) {
      if (p._top != null) return p._top;
      p = p.parentNode;
    }
    return 0;
  }
  function matches(node, sel) {
    if (sel.startsWith("#")) return node.id === sel.slice(1);
    if (sel.startsWith(".")) return classes(node).includes(sel.slice(1));
    return node.tagName === sel.toUpperCase();
  }
  function findIn(node, sel) {
    for (const c of node.children) {
      if (matches(c, sel)) return c;
      const deep = findIn(c, sel);
      if (deep) return deep;
    }
    return null;
  }
  function findAllIn(node, sel, out) {
    out = out || [];
    for (const c of node.children) {
      if (matches(c, sel)) out.push(c);
      findAllIn(c, sel, out);
    }
    return out;
  }

  function makeEl(tag) {
    const node = {
      tagName: String(tag || "div").toUpperCase(),
      className: "", id: "", style: {}, dataset: {}, children: [], parentNode: null,
      hidden: false, textContent: "", value: "", checked: false, disabled: false,
      _listeners: {},
      _height: undefined, _clientWidth: undefined, _padX: 0, _top: undefined,
      classList: {
        add() {}, remove() {}, toggle() {}, contains() { return false; },
      },
      appendChild(c) { if (c && typeof c === "object") c.parentNode = node; node.children.push(c); return c; },
      insertBefore(c) { return node.appendChild(c); },
      removeChild() {},
      remove() {},
      setAttribute(k, v) { if (k === "id") { node.id = v; registry.set(v, node); } if (k === "hidden") node.hidden = true; },
      removeAttribute(k) { if (k === "hidden") node.hidden = false; },
      getAttribute() { return null; },
      addEventListener(name, fn) { (node._listeners[name] = node._listeners[name] || []).push(fn); },
      removeEventListener() {},
      dispatch(name, ev) { (node._listeners[name] || []).forEach((fn) => fn(ev || { type: name, preventDefault() {}, stopPropagation() {} })); },
      querySelector(sel) { return findIn(node, sel); },
      querySelectorAll(sel) { return findAllIn(node, sel); },
      contains(other) { let p = other; while (p) { if (p === node) return true; p = p.parentNode; } return false; },
      getContext() { return makeCtx(); },
      getClientRects() { return []; },
      getBoundingClientRect() {
        const w = node.tagName === "CANVAS" ? (parseFloat(node.style.width) || 0) : inheritedWidth(node);
        const h = heightOf(node);
        const top = inheritedTop(node);
        return { top, left: 0, right: w, bottom: top + h, width: w, height: h, x: 0, y: top };
      },
      scrollIntoView() {}, focus() {}, blur() {}, click() { node.dispatch("click"); },
      offsetWidth: 0, offsetHeight: 0, scrollTop: 0, scrollHeight: 0,
      selectionStart: 0, selectionEnd: 0,
      requestFullscreen() { fullscreenElement = node; return Promise.resolve(); },
      set innerHTML(_v) { node.children.length = 0; },
      get innerHTML() { return ""; },
    };
    Object.defineProperty(node, "clientWidth", { get() { return inheritedWidth(node); }, configurable: true });
    Object.defineProperty(node, "clientHeight", { get() { return heightOf(node); }, configurable: true });
    return node;
  }

  // The ids index.html declares. Everything app.js looks up must exist, or
  // it silently early-returns and we would be testing nothing.
  const IDS = [
    "fileProtocolBanner", "pyodideBanner", "playPopoutBtn", "downloadProjectBtn",
    "progressMenu", "saveProgressBtn", "loadProgressBtn", "loadProgressInput", "resetAllBtn",
    "layoutRoot", "sidebar", "mainPanel", "vizPanel", "vizTabStep", "vizTabPlay",
    "stepViewFullscreenBtn", "vizStepView", "vizPlayView", "kioskRoot", "kioskHeader",
    "kioskTitle", "kioskSubtitle", "kioskFullscreenBtn", "kioskGate", "kioskPlayView",
    "modalRoot", "gradeBtn",
  ];
  IDS.forEach((id) => { const n = makeEl("div"); n.id = id; registry.set(id, n); });

  const docListeners = {};
  const documentStub = {
    documentElement: makeEl("html"),
    body: makeEl("body"),
    head: makeEl("head"),
    title: "",
    createElement: (tag) => makeEl(tag),
    createTextNode: (t) => ({ nodeValue: t, children: [], tagName: "#text" }),
    createDocumentFragment: () => makeEl("div"),
    getElementById: (id) => registry.get(id) || null,
    querySelector: (sel) => (sel.startsWith("#") ? registry.get(sel.slice(1)) || null : null),
    querySelectorAll: () => [],
    addEventListener: (name, fn) => { (docListeners[name] = docListeners[name] || []).push(fn); },
    removeEventListener: () => {},
    get fullscreenElement() { return fullscreenElement; },
    exitFullscreen() { fullscreenElement = null; return Promise.resolve(); },
  };
  documentStub.body.appendChild(registry.get("vizPanel"));

  const storage = (() => {
    const map = new Map();
    if (opts.progress) map.set("dijkstraMaze.progress.v1", JSON.stringify(opts.progress));
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
      clear: () => map.clear(),
      get length() { return map.size; },
      key: (i) => Array.from(map.keys())[i] ?? null,
    };
  })();

  const winListeners = {};
  const rafQueue = [];
  const win = {
    document: documentStub,
    localStorage: storage,
    location: { search: kiosk ? "?mode=play" : "", protocol: "https:", href: "https://example.test/" },
    navigator: { userAgent: "node" },
    innerWidth: opts.innerWidth,
    innerHeight: opts.innerHeight,
    devicePixelRatio: opts.dpr || 1,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    addEventListener: (name, fn) => { (winListeners[name] = winListeners[name] || []).push(fn); },
    removeEventListener: () => {},
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval,
    // Queued (not synchronous) rAF, drained on demand by flushRAF(): the
    // editor's own "is my textarea laid out yet?" retry re-queues itself
    // every frame, so running callbacks inline would recurse forever.
    // relayoutSoon()'s extra pass still lands before the assertions.
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: () => {},
    performance: { now: () => Date.now() },
    URLSearchParams,
    console: { log() {}, warn() {}, error() {}, info() {} },
    Image: function () { return { set src(_v) {}, naturalWidth: 0, naturalHeight: 0 }; },
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

  function flushRAF() { rafQueue.splice(0).forEach((fn) => fn(0)); }

  return {
    win, registry, docListeners, winListeners, flushRAF,
    boot() {
      (docListeners["DOMContentLoaded"] || []).forEach((fn) => fn({ type: "DOMContentLoaded" }));
      flushRAF();
    },
    setFullscreen(node) {
      fullscreenElement = node;
      (docListeners["fullscreenchange"] || []).forEach((fn) => fn({ type: "fullscreenchange" }));
      flushRAF();
    },
    fireResize() {
      (winListeners["resize"] || []).forEach((fn) => fn({ type: "resize" }));
      flushRAF();
    },
  };
}

// ---------------------------------------------------------------- helpers
function canvasOf(world) {
  const host = world.registry.get(world.win.location.search === "?mode=play" ? "kioskPlayView" : "vizPlayView");
  return host.querySelector(".viz-canvas");
}
function boardSize(canvas) {
  return { w: parseFloat(canvas.style.width), h: parseFloat(canvas.style.height) };
}
// A painted TODO 6 round is the only way to drive arbitrary board
// dimensions from outside the engine, so every size case below uses one.
function paintedProgress(rows, cols) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push("FLOOR");
    grid.push(row);
  }
  return {
    currentStepId: "1",
    steps: { "6": { status: "completed" } },
    mapEditorData: { activeRound: 0, rounds: [{ rows, cols, seed: 1, clusterSize: 3, grid, start: [0, 0], goal: [rows - 1, cols - 1] }] },
  };
}

function mountKiosk(rows, cols, innerWidth, innerHeight, dpr) {
  const world = createWorld({
    kiosk: true, innerWidth, innerHeight, dpr,
    progress: rows ? paintedProgress(rows, cols) : null,
  });
  // Model the kiosk chrome: .kiosk-root padding 16, header ~44 + 12 margin.
  const playView = world.registry.get("kioskPlayView");
  playView._clientWidth = Math.min(innerWidth - 32, 1600);
  playView._top = 16 + 44 + 12;
  world.boot();
  // The gate's "Start Playing" button is what mounts PlayEngine.
  const startBtn = world.registry.get("kioskGate").querySelector(".kiosk-start-btn");
  if (!startBtn) throw new Error("kiosk gate start button not found");
  startBtn.dispatch("click");
  world.flushRAF();
  return world;
}

function mountInPage(rows, cols, innerWidth, innerHeight, panelWidth) {
  const world = createWorld({
    kiosk: false, innerWidth, innerHeight, dpr: 1,
    progress: rows ? paintedProgress(rows, cols) : null,
  });
  const playView = world.registry.get("vizPlayView");
  // .viz-content has 16px padding, so its clientWidth OVERSTATES the room
  // the canvas actually gets - the engine must measure .play-frame instead.
  playView._clientWidth = panelWidth;
  playView._padX = 32;
  playView._top = 76 + 46;
  world.boot();
  world.registry.get("vizTabPlay").dispatch("click");
  world.flushRAF();
  return world;
}

// ---------------------------------------------------------------- 1. kiosk
console.log("--- kiosk popout (?mode=play) ---");
const KIOSK_W = 1440, KIOSK_H = 900;
// Room the engine should have found: width = 1440-32, height = viewport
// minus the kiosk chrome above the frame, minus the slim HUD rows.
const KIOSK_AVAIL_W = KIOSK_W - 32 - 2;
const KIOSK_AVAIL_H = KIOSK_H - (16 + 44 + 12) - (40 + 52) - 24;

[
  ["small 11x15", 11, 15],
  ["medium 15x21", 15, 21],
  ["largest configured 17x25", 17, 25],
  ["tall & narrow 31x9", 31, 9],
  ["wide & short 7x33", 7, 33],
].forEach(([label, rows, cols]) => {
  const world = mountKiosk(rows, cols, KIOSK_W, KIOSK_H, 1);
  const canvas = canvasOf(world);
  if (!canvas) { check(`kiosk ${label}: board canvas exists`, false); return; }
  const { w, h } = boardSize(canvas);
  const cell = w / cols;

  check(`kiosk ${label}: canvas is no longer stuck at 360x260`,
    !(w === 360 && h === 260), `(${w}x${h})`);
  check(`kiosk ${label}: canvas CSS box equals the real board size`,
    Number.isInteger(cell) && Math.abs(h - cell * rows) < 0.001,
    `(cell ${cell}, ${w}x${h} for ${rows}x${cols})`);
  check(`kiosk ${label}: fits the available width`, w <= KIOSK_AVAIL_W, `(${w} <= ${KIOSK_AVAIL_W})`);
  check(`kiosk ${label}: fits the available height`, h <= KIOSK_AVAIL_H, `(${h} <= ${KIOSK_AVAIL_H})`);
  // "미로가 화면의 거의 전체를 차지하도록" - at least one axis must be
  // (near-)saturated, otherwise something other than the screen is the
  // binding constraint and the board is being needlessly cramped.
  const fillsW = w >= 0.9 * KIOSK_AVAIL_W, fillsH = h >= 0.9 * KIOSK_AVAIL_H;
  check(`kiosk ${label}: fills nearly the whole screen on at least one axis`,
    fillsW || fillsH,
    `(w ${(100 * w / KIOSK_AVAIL_W).toFixed(0)}%, h ${(100 * h / KIOSK_AVAIL_H).toFixed(0)}%)`);
});

// devicePixelRatio: the drawing buffer must be the CSS box times dpr, the
// same contract makeCanvas() has always had.
[1, 2].forEach((dpr) => {
  const world = mountKiosk(15, 21, KIOSK_W, KIOSK_H, dpr);
  const canvas = canvasOf(world);
  const { w, h } = boardSize(canvas);
  check(`kiosk: drawing buffer honours devicePixelRatio ${dpr}`,
    canvas.width === Math.round(w * dpr) && canvas.height === Math.round(h * dpr),
    `(buffer ${canvas.width}x${canvas.height}, css ${w}x${h})`);
});

// A small kiosk window must shrink, not clip.
{
  const world = mountKiosk(17, 25, 800, 600, 1);
  const canvas = canvasOf(world);
  const { w, h } = boardSize(canvas);
  check("kiosk: a small window shrinks the board instead of clipping it",
    w <= 800 - 32 && h <= 600 - 72 - 92, `(${w}x${h})`);
}

// ------------------------------------------------- 2. in-page Play tab
console.log("");
console.log("--- in-page Play tab (narrow sidebar) ---");
{
  const world = mountInPage(15, 21, 1600, 900, 420);
  const canvas = canvasOf(world);
  const { w, h } = boardSize(canvas);
  check("sidebar: board stays inside the 380px sidebar budget", w <= 380, `(${w})`);
  check("sidebar: board never exceeds the padded panel's real content width",
    w <= 420 - 32, `(${w} <= 388)`);
  check("sidebar: canvas CSS box equals the real board size",
    Math.abs(w / 21 - h / 15) < 0.001, `(${w}x${h})`);
}
// A very tall painted map in the sidebar must not run off the panel.
{
  const world = mountInPage(60, 9, 1600, 900, 420);
  const canvas = canvasOf(world);
  const { w, h } = boardSize(canvas);
  const budget = 900 - (76 + 46) - (96 + 40 + 52 + 22 + 130) - 24;
  check("sidebar: a very tall map is constrained by HEIGHT, not just width",
    h <= Math.max(320, budget), `(${h} <= ${Math.max(320, budget)})`);
}

// ------------------------------------------- 3. Step View fullscreen
console.log("");
console.log("--- in-page Play tab, #vizPanel fullscreen ---");
{
  const world = mountInPage(15, 21, 1920, 1080, 420);
  const canvas = canvasOf(world);
  const before = boardSize(canvas);

  // Fullscreen makes #vizPanel fill the screen; model that, then fire the
  // event the engine listens for.
  const panel = world.registry.get("vizPanel");
  const playView = world.registry.get("vizPlayView");
  playView._clientWidth = 1920;
  playView._top = 46;
  world.setFullscreen(panel);

  const after = boardSize(canvas);
  check("fullscreen: the board actually grows when #vizPanel goes fullscreen",
    after.w > before.w && after.h > before.h,
    `(${before.w}x${before.h} -> ${after.w}x${after.h})`);
  check("fullscreen: the board is no longer capped at the 380px sidebar width",
    after.w > 380, `(${after.w})`);

  const availW = 1920 - 32 - 2;
  // Fullscreen hides the checklist + its heading (see styles.css), so only
  // the title card, the toolbar and the HUD are still above/below the board.
  const availH = 1080 - 46 - (96 + 40 + 52) - 24;
  check("fullscreen: fits the available width", after.w <= availW, `(${after.w} <= ${availW})`);
  check("fullscreen: fits the available height", after.h <= availH, `(${after.h} <= ${availH})`);
  check("fullscreen: fills nearly the whole screen on at least one axis",
    after.w >= 0.9 * availW || after.h >= 0.9 * availH,
    `(w ${(100 * after.w / availW).toFixed(0)}%, h ${(100 * after.h / availH).toFixed(0)}%)`);

  // ...and shrinks back on exit.
  playView._clientWidth = 420;
  playView._top = 76 + 46;
  world.setFullscreen(null);
  const restored = boardSize(canvas);
  check("fullscreen: leaving fullscreen restores the sidebar-sized board",
    restored.w <= 380, `(${restored.w})`);
}

// ------------------------------------------------------ 4. window resize
console.log("");
console.log("--- window resize ---");
{
  const world = mountKiosk(15, 21, 1440, 900, 1);
  const canvas = canvasOf(world);
  const big = boardSize(canvas);
  world.win.innerHeight = 500;
  world.registry.get("kioskPlayView")._clientWidth = 700 - 32;
  world.win.innerWidth = 700;
  world.fireResize();
  const small = boardSize(canvas);
  check("resize: shrinking the window shrinks the board",
    small.w < big.w && small.h < big.h, `(${big.w}x${big.h} -> ${small.w}x${small.h})`);
  check("resize: the shrunk board still fits", small.h <= 500 - 72 - 92, `(${small.h})`);
}

console.log("");
if (failures.length) {
  console.log(`${failures.length} FAILURE(S):`);
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
console.log("ALL BOARD-SIZING CHECKS PASSED");
process.exit(0);
