// Dumps, as JSON on stdout, the code app.js's own freshState() puts in the
// editor for every step on a completely fresh load. Used by
// test_prefilled_required.py so that test grades the REAL default a student
// sees, not a hand-copied approximation of it.
//
// Run from the repo root:  node tests/_dump_fresh_code.js
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

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
  fetch: () => Promise.reject(new Error("no network here")),
  prompt: () => null, alert: () => {}, confirm: () => false, open: () => null,
};
win.window = win; win.self = win; win.globalThis = win;

const sandbox = vm.createContext(win);
for (const file of ["data.js", "export-data.js", "app.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), sandbox, { filename: file });
}

const hooks = sandbox.window.__courseTestHooks;
const fresh = hooks.freshState();
const out = {};
Object.keys(fresh.steps).forEach((id) => { out[id] = fresh.steps[id].code; });
process.stdout.write(JSON.stringify(out) + "\n");
process.exit(0);
