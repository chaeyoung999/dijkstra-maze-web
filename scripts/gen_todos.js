// Syncs dijkstra_maze/todos.json with the site's real content.
//
// todos.json is the teacher-facing metadata index. Everything that can be
// DERIVED (title, part list, per-part file, hints, part_count, which files a
// TODO touches, the grading harness/mode) is rewritten from data.js +
// export-data.js, which are the single source of truth. Hand-written
// teacher fields (concept_ko, grading.shape/notes/must_define/type_checks,
// answer_style, meta) are preserved as-is.
//
// The previous generator was lost with a scratch folder (see HANDOFF.md);
// this is the re-derived, committed version.
//
//   node scripts/gen_todos.js
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WEB = path.join(__dirname, "..");
const TODOS = path.join(WEB, "..", "dijkstra_maze", "todos.json");

const sandbox = vm.createContext({ window: {}, console: console });
["data.js", "export-data.js"].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(WEB, f), "utf8"), sandbox, { filename: f });
});
const DATA = sandbox.window.COURSE_DATA;
const MARKERS = sandbox.window.EXPORT_DATA.EXPORT_MARKERS;

const doc = JSON.parse(fs.readFileSync(TODOS, "utf8"));
const existingById = {};
(doc.todos || []).forEach(function (t) { existingById[t.id] = t; });

// Which files each TODO actually touches, straight from the markers.
const filesById = {};
MARKERS.forEach(function (m) {
  (filesById[m[0]] = filesById[m[0]] || {})[m[1]] = true;
});

let totalParts = 0;
const todos = DATA.COURSE_STEPS.map(function (step) {
  const prev = existingById[step.id] || {};
  const partCount = step.parts ? step.parts.length : 1;
  totalParts += partCount;
  const out = Object.assign({}, prev);
  out.id = step.id;
  out.kind = step.kind;
  out.file = step.file;
  out.title = step.title;
  if (out.answer_style === undefined) out.answer_style = step.required ? "fixed" : "open";
  out.parts = step.parts
    ? step.parts.map(function (p) {
        return { part: p.part, title: p.title, file: p.file || step.file };
      })
    : null;
  out.step = step.step;
  out.required = !!step.required;
  out.hints = step.hints.slice();
  out.visualizer = step.visualizer || null;
  out.grading = Object.assign({}, prev.grading || {}, {
    mode: step.grading.mode,
    harness: step.grading.harness || null,
  });
  // multi_part replaces the old two_parts flag now that parts range 2..8.
  delete out.grading.two_parts;
  out.grading.multi_part = !!step.parts;
  out.files = Object.keys(filesById[step.id] || {}).sort();
  out.part_count = partCount;
  return out;
});

doc.required_order = DATA.REQUIRED_ORDER.slice();
doc.bonus_order = DATA.BONUS_ORDER.slice();
doc.todo_count = todos.length;
doc.todos = todos;
doc.part_count = totalParts;
doc.source = doc.source || {};
doc.source.student = "student/";
doc.source.complete = "complete/";
doc.source.files = Object.keys(
  MARKERS.reduce(function (acc, m) { acc[m[1]] = true; return acc; }, {})
).sort();

fs.writeFileSync(TODOS, JSON.stringify(doc, null, 2) + "\n", "utf8");
console.log("todos.json synced: " + todos.length + " TODOs, " + totalParts + " parts total");
console.log("  " + todos.map(function (t) { return t.id + "=" + t.part_count; }).join(" "));
