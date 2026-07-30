/*
 * app.js — behaviour for the Dijkstra Maze TODO Quest.
 *
 * Sections:
 *   1. utils
 *   2. state (load/save, lock/unlock logic)
 *   3. theme
 *   4. modal (confirm dialog)
 *   5. Visualizer seam (documented extension point for a later task)
 *   6. Pyodide loading
 *   7. editor (textarea, gutters, autocomplete)
 *   8. sidebar + main panel rendering
 *   9. grading dispatch
 *  10. behaviour harnesses (Python source builders)
 *  11. syntax harnesses (Python source builders)
 *  12. hints / skip / reset / import-export
 *  13. bootstrap
 *
 * Security note: this file never contains a reference answer. Behaviour
 * harnesses test OBSERVABLE BEHAVIOUR (return values, mutated objects,
 * bound variable names) against hand-picked test cases; they do not contain
 * "the" solution line. Syntax harnesses only check shape (types, ranges,
 * required names) — never a single expected value for open-ended TODOs.
 */
"use strict";

(function () {
  // ------------------------------------------------------------ 1. utils

  var DATA = window.COURSE_DATA;
  var STEPS = DATA.COURSE_STEPS;
  var REQUIRED_ORDER = DATA.REQUIRED_ORDER;
  var BONUS_ORDER = DATA.BONUS_ORDER;
  var BONUS_GROUPS = DATA.BONUS_GROUPS;
  var KNOWN_ASSETS = DATA.KNOWN_ASSET_FILES;
  var STEP_BY_ID = {};
  STEPS.forEach(function (s) { STEP_BY_ID[s.id] = s; });

  // Bonus sub-step lookup. Every Bonus step is a standalone step with a
  // hyphenated id ("8-1" … "11-4"); its `group` says which of the four
  // original TODOs it came out of. Sub-steps in a group are still one
  // logical unit for GRADING (some of them are consecutive statement
  // groups of a single Python method, so the group's code has to be
  // spliced back together before it can run) - see gradingCodesFor().
  var BONUS_GROUP_IDS = {};      // "6" -> ["8-1", … "8-6"]
  var BONUS_GROUP_BY_ID = {};    // "8-3" -> the group record
  BONUS_GROUPS.forEach(function (g) {
    BONUS_GROUP_IDS[g.id] = g.ids.slice();
    g.ids.forEach(function (id) { BONUS_GROUP_BY_ID[id] = g; });
  });
  function bonusGroupOf(id) { return BONUS_GROUP_BY_ID[id] || null; }

  // The student's current code for one Bonus sub-step, always as a plain
  // string. Bonus steps are single-editor steps now, so `code` is a
  // string - but a progress file saved before the split still holds an
  // ARRAY under the old group id, so this stays defensive.
  function bonusCode(id) {
    try {
      var sd = state && state.steps && state.steps[id];
      if (!sd) return "";
      return Array.isArray(sd.code) ? sd.code.join("\n") : String(sd.code == null ? "" : sd.code);
    } catch (e) { return ""; }
  }
  // "every sub-step of this group is completed" - what the Play tab's
  // capability gates used to express as a single isDone("8").
  function bonusGroupComplete(groupId) {
    var ids = BONUS_GROUP_IDS[groupId] || [];
    for (var i = 0; i < ids.length; i++) {
      if (!state.steps[ids[i]] || state.steps[ids[i]].status !== "completed") return false;
    }
    return ids.length > 0;
  }

  // Per-part file support (Bonus multi-file groups, e.g. the TODO 10 group:
  // 10-1 in settings.py, 10-2 … 10-6 in game.py): a part's own `file` wins when
  // present, otherwise it falls back to the step-level `file` - so
  // single-file steps (and every Required step) never need to repeat the
  // same filename on every part. stepFiles() returns the DISTINCT files a
  // step actually touches, in part order, for anything that needs to show
  // "which file(s)" (file-tag header, "View full file" buttons, the export
  // modal's unfinished-TODO list, the sidebar).
  function partFile(step, part) { return (part && part.file) || step.file; }
  function stepFiles(step) {
    if (!step.parts) return [step.file];
    var files = [];
    step.parts.forEach(function (part) {
      var f = partFile(step, part);
      if (files.indexOf(f) === -1) files.push(f);
    });
    return files;
  }

  var LS_PROGRESS_KEY = "dijkstraMaze.progress.v1";
  var PYODIDE_VERSION = "0.26.4";
  var PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v" + PYODIDE_VERSION + "/full/";
  var PYODIDE_SCRIPT_URL = PYODIDE_INDEX_URL + "pyodide.js";

  function $(sel, root) { return (root || document).querySelector(sel); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === "class") node.className = v;
        else if (k === "html") node.innerHTML = v;
        else if (k === "text") node.textContent = v;
        else if (k.slice(0, 2) === "on" && typeof v === "function") node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function linesOf(x) { return Array.isArray(x) ? x.join("\n") : String(x || ""); }

  // Small hand-rolled "rich text" renderer for instructional prose (step
  // leads, hints, banners, instructions) - NOT a general markdown parser,
  // just the handful of things teacher-written copy needs:
  //   **bold**, `code`, blank-line-separated paragraphs, and "- " bullet
  //   lists (a block where every line starts with "- " becomes a <ul>).
  // Used with el(..., {html: richTextToHtml(text)}) instead of {text:}.
  function escapeHtmlLite(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function inlineRichText(s) {
    var escaped = escapeHtmlLite(s);
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
    return escaped;
  }
  function richTextToHtml(text) {
    var raw = String(text == null ? "" : text);
    var blocks = raw.split(/\n\s*\n/);
    var out = [];
    blocks.forEach(function (block) {
      var trimmed = block.trim();
      if (!trimmed) return;
      var lines = trimmed.split("\n").map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
      var isList = lines.length > 0 && lines.every(function (l) { return /^-\s+/.test(l); });
      if (isList) {
        var items = lines.map(function (l) { return "<li>" + inlineRichText(l.replace(/^-\s+/, "")) + "</li>"; });
        out.push("<ul>" + items.join("") + "</ul>");
      } else {
        out.push("<p>" + inlineRichText(lines.join(" ")) + "</p>");
      }
    });
    return out.join("");
  }

  function toBase64Utf8(str) {
    return btoa(unescape(encodeURIComponent(String(str == null ? "" : str))));
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function downloadJSON(filename, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // Dedent then re-indent Python source so a student's snippet can be
  // spliced into a test scaffold (or the real exported project file, see
  // getBodyForMarker) regardless of the absolute indentation they typed.
  // Blank lines are preserved (as indent-only) so line counts stay stable
  // for the on-screen gutter.
  //
  // Bug fix (teacher report: "comments shouldn't matter, but right now
  // one causes an error"): a comment is 100% inert in real Python
  // regardless of where it sits or how it's indented - the tokenizer
  // ignores a comment line's own indentation completely when building the
  // INDENT/DEDENT stack. The PRIOR version of this function computed
  // minIndent (the common leading whitespace to strip) across every
  // non-blank line, comments included. That meant a comment typed at a
  // shallower indent than the surrounding code (extremely easy to do by
  // accident - e.g. a comment flush-left above indented code) dragged
  // minIndent down to the comment's own indent. Then `line.slice(minIndent)`
  // on that SAME shallow comment sliced blindly by character count, not by
  // "how much whitespace does this line actually have" - so a comment
  // whose own indent was smaller than the computed minIndent could have
  // its leading "#" (and part of its text) chopped clean off, turning an
  // inert comment into a bare, broken fragment of "code" that Python then
  // failed to parse (a real SyntaxError, reported as an "index"/indent
  // mismatch by exactly the comment that should never have mattered).
  //
  // Fix: comment-only lines never participate in the minIndent
  // computation (matching real Python, where only actual statements
  // define indentation levels) and are reindented independently, by
  // stripping their OWN full leading whitespace and reapplying `indent` -
  // so a comment's content is always preserved intact and its position
  // can never influence, or be corrupted by, the surrounding code's
  // indentation math, matching how real Python treats it: fully inert,
  // regardless of where it is or how it lines up with anything else.
  function isCommentOnlyLine(line) { return line.trim().charAt(0) === "#"; }

  function reindentPython(code, indent) {
    var raw = String(code == null ? "" : code).replace(/\r\n/g, "\n").replace(/\t/g, "    ");
    var lines = raw.split("\n");
    var minIndent = Infinity;
    lines.forEach(function (line) {
      if (line.trim().length === 0) return;
      if (isCommentOnlyLine(line)) return;
      var m = line.match(/^ */)[0].length;
      if (m < minIndent) minIndent = m;
    });
    if (!isFinite(minIndent)) minIndent = 0;
    lines = lines.map(function (line) {
      if (line.trim().length === 0) return "";
      if (isCommentOnlyLine(line)) return line.replace(/^\s*/, "");
      return line.length >= minIndent ? line.slice(minIndent) : line.replace(/^ +/, "");
    });
    while (lines.length && lines[0].trim() === "") lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    if (lines.length === 0) lines = ["pass"];
    return lines.map(function (line) { return indent + line; }).join("\n");
  }

  // Wrap a student snippet in `def _fn(<params>): <body> return locals()`.
  // This is the single pattern used by every behaviour harness:
  //  - a bare `return` is always valid Python here (matches the real file,
  //    where every TODO lives inside a method), so we never misreport a
  //    student's legitimate code as a syntax error;
  //  - `return locals()` lets us inspect any *new* local name the student's
  //    code bound (e.g. `direction`, `next_cost`), not just mutations of
  //    objects we passed in;
  //  - if the student's own code returns early, we get their value back
  //    instead, which harnesses treat as "returned early" and report
  //    clearly rather than crashing.
  function buildFnSource(params, code, targetIndent) {
    var body = reindentPython(code, targetIndent || "    ");
    return "def _fn(" + params + "):\n" + body + "\n    return locals()\n";
  }

  // Same idea as buildFnSource, but for TODO 5's two coupled parts: they
  // are sequential statements at the SAME scope in the real file (Part 2
  // uses new_cost, which Part 1 just set), so for a "run it for real" demo
  // (the visualizer / Play tab, as opposed to grading, which tests each
  // part in isolation - see harness_dijkstra_5) the two student snippets
  // are simply reindented and concatenated in order inside one function.
  function buildFnSourceTwoParts(params, code1, code2, targetIndent) {
    var indent = targetIndent || "    ";
    var body1 = reindentPython(code1, indent);
    var body2 = reindentPython(code2, indent);
    return "def _fn(" + params + "):\n" + body1 + "\n" + body2 + "\n    return locals()\n";
  }

  // Generalisation of buildFnSourceTwoParts for the Bonus split: several
  // consecutive parts that are sequential statements at the SAME scope in
  // the real file (TODO 8's Parts 4-6, TODO 10's Parts 2-3, TODO 11's Parts
  // 3-4) get reindented and concatenated in order inside one function, so
  // the joined body is exactly what the student's real game.py would run.
  // IMPORTANT: the parts are concatenated BEFORE reindenting, not after.
  // reindentPython() dedents whatever it is given to its own smallest indent,
  // so reindenting each part separately would flatten a part that is meant to
  // sit INSIDE a block the previous part opened (TODO 10's Parts 5/6 live
  // inside the `if` that Part 4 opens). Joining first makes the whole group
  // share one minimum indent, which preserves the relative nesting exactly.
  function buildFnSourceParts(params, codes, targetIndent) {
    var joined = codes.map(function (c) { return String(c == null ? "" : c); }).join("\n");
    var body = reindentPython(joined, targetIndent || "    ");
    return "def _fn(" + params + "):\n" + body + "\n    return locals()\n";
  }

  function b64Line(varName, text) {
    return varName + ' = base64.b64decode("' + toBase64Utf8(text) + '").decode("utf-8")';
  }

  // ----------------------------------------------------------- 2. state

  function defaultStepState(step) {
    return {
      code: step.parts ? step.parts.map(function (p) { return linesOf(p.starter); }) : linesOf(step.starter),
      status: "available",
      hintsRevealed: 0,
      attempts: 0,
      lastFeedback: null,
    };
  }

  // mapEditorData: { activeRound, rounds: [paintedRound|null ...] }. A
  // painted round replaces DFS generation for that round once TODO 8 is
  // completed. The list length follows the student's OWN ROUND_CONFIGS
  // (they may add or remove rounds), grown on demand by ensureRoundSlots().
  // assetData: { uploadedFiles: [{name, kind, addedAt}] } - metadata only;
  // the actual uploaded bytes live on the student's disk, never in progress.
  function defaultMapEditorData() {
    return { activeRound: 0, rounds: [null, null, null] };
  }
  function defaultAssetData() {
    return { uploadedFiles: [] };
  }

  // Reshapes a step's saved code to whatever that step's parts look like
  // NOW. `fresh` is the step's default code (a string, or one starter per
  // part). Returns the reshaped code, or null when nothing can be salvaged.
  //
  //   single -> single   : keep it
  //   single -> parts    : the old body becomes part 0, new parts start fresh
  //   parts  -> parts    : keep every part that still exists, pad from fresh
  //   parts  -> single   : keep part 0
  function migrateSavedCode(step, savedCode, fresh) {
    var wantParts = !!step.parts;
    var savedIsArray = Array.isArray(savedCode);
    if (!wantParts) {
      if (typeof savedCode === "string") return savedCode;
      if (savedIsArray && typeof savedCode[0] === "string") return savedCode[0];
      return null;
    }
    var want = step.parts.length;
    var out = [];
    for (var i = 0; i < want; i++) {
      var candidate;
      if (savedIsArray) candidate = savedCode[i];
      else candidate = i === 0 ? savedCode : undefined;
      out.push(typeof candidate === "string" ? candidate : fresh[i]);
    }
    return out;
  }

  function freshState() {
    var s = {
      currentStepId: STEPS[0].id, steps: {},
      mapEditorData: defaultMapEditorData(),
      assetData: defaultAssetData(),
    };
    STEPS.forEach(function (step) { s.steps[step.id] = defaultStepState(step); });
    return s;
  }

  var state = null;

  function normalizeLoadedState(parsed) {
    var s = freshState();
    if (parsed && parsed.steps) {
      STEPS.forEach(function (step) {
        var saved = parsed.steps[step.id];
        if (!saved) return;
        var d = s.steps[step.id];
        // A step's shape can change between releases: a single-part step
        // gains parts (TODO 11), or a two-part step becomes three (TODO 8
        // or TODO 9 or TODO 10). Restoring saved.code blindly would either misbehave
        // (indexing a string with [0] returns a character, not a part) or
        // leave stepData.code[2] undefined and crash the editor. Salvage
        // whatever still lines up and fill the rest from the new starters,
        // so a student keeps the work they actually did and simply finds
        // the new part waiting at its starter code.
        if (saved.code !== undefined) {
          var migrated = migrateSavedCode(step, saved.code, d.code);
          if (migrated === null) return; // unusable shape: keep the fresh default
          d.code = migrated;
        }
        if (saved.status === "completed" || saved.status === "skipped") d.status = saved.status;
        // Clamp to this step's CURRENT hint count - a save made before a
        // hint-count content edit (e.g. a step trimmed from 3 hints to 1)
        // could otherwise carry over a hintsRevealed value that no longer
        // has a matching step.hints[i] to render.
        if (typeof saved.hintsRevealed === "number") d.hintsRevealed = Math.max(0, Math.min(saved.hintsRevealed, step.hints.length));
        if (typeof saved.attempts === "number") d.attempts = saved.attempts;
        if (saved.lastFeedback) d.lastFeedback = saved.lastFeedback;
      });
    }
    if (parsed && parsed.currentStepId && STEP_BY_ID[parsed.currentStepId]) {
      s.currentStepId = parsed.currentStepId;
    }
    try {
      if (parsed && parsed.mapEditorData && Array.isArray(parsed.mapEditorData.rounds)) {
        // Round count is the student's own choice now, so restore as many
        // painted rounds as were saved (capped only by MAX_DESIGNABLE_ROUNDS)
        // and let ensureRoundSlots() pad up to whatever ROUND_CONFIGS
        // currently declares.
        var rounds = parsed.mapEditorData.rounds.slice(0, MAX_DESIGNABLE_ROUNDS).map(function (r) { return r || null; });
        while (rounds.length < 3) rounds.push(null);
        var savedActive = parsed.mapEditorData.activeRound;
        s.mapEditorData = {
          activeRound: (typeof savedActive === "number" && savedActive >= 0 && savedActive < rounds.length) ? savedActive : 0,
          rounds: rounds,
        };
      }
    } catch (e) { console.warn("Could not restore map editor data", e); }
    try {
      if (parsed && parsed.assetData && Array.isArray(parsed.assetData.uploadedFiles)) {
        s.assetData = { uploadedFiles: parsed.assetData.uploadedFiles.slice(0, 300) };
      }
    } catch (e) { console.warn("Could not restore asset data", e); }
    return s;
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(LS_PROGRESS_KEY);
      if (!raw) return freshState();
      return normalizeLoadedState(JSON.parse(raw));
    } catch (e) {
      console.warn("Could not load saved progress, starting fresh.", e);
      return freshState();
    }
  }

  function saveState() {
    // The showcase demo runs on a seeded in-memory state; writing it out
    // would clobber whatever real progress is saved under this origin.
    if (isShowcaseMode()) return;
    try {
      localStorage.setItem(LS_PROGRESS_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save progress to localStorage.", e);
    }
  }
  var persist = debounce(saveState, 250);

  function isRequiredDone(id) {
    var st = state.steps[id].status;
    return st === "completed" || st === "skipped";
  }
  function allRequiredDone() { return REQUIRED_ORDER.every(isRequiredDone); }

  function computeStatus(id) {
    var saved = state.steps[id].status;
    if (saved === "completed" || saved === "skipped") return saved;
    if (REQUIRED_ORDER.indexOf(id) !== -1) {
      var idx = REQUIRED_ORDER.indexOf(id);
      for (var i = 0; i < idx; i++) {
        if (!isRequiredDone(REQUIRED_ORDER[i])) return "locked";
      }
      return "available";
    }
    // Bonus. All four GROUPS (8-x, 9-x, 10-x, 11-x) unlock together the
    // moment Required is fully completed/skipped, and stay workable in any
    // order relative to each other - including 11-x ("write your game's
    // rules"), which used to be a one-off "capstone" locked until every
    // other Bonus step was done first. That capstone lock was removed per
    // direct teacher request and must stay removed.
    //
    // WITHIN a group the sub-steps are sequential, the same way Required
    // is: 8-1 has to be completed or skipped before 8-2 opens. That order
    // encodes real dependencies (8-4 asks for the item positions that 8-5
    // turns into items), so it is not just presentation.
    if (!allRequiredDone()) return "locked";
    var group = bonusGroupOf(id);
    if (!group) return "available";
    var gidx = group.ids.indexOf(id);
    for (var g = 0; g < gidx; g++) {
      if (!isRequiredDone(group.ids[g])) return "locked";
    }
    return "available";
  }

  function nextStepAfter(id) {
    var ridx = REQUIRED_ORDER.indexOf(id);
    if (ridx !== -1) {
      if (ridx + 1 < REQUIRED_ORDER.length) return REQUIRED_ORDER[ridx + 1];
      return allRequiredDone() ? BONUS_ORDER[0] : null;
    }
    var bidx = BONUS_ORDER.indexOf(id);
    if (bidx === -1) return null;
    // Walk the flat Bonus order looking for the next step that is both
    // unfinished and actually reachable - so finishing the last sub-step
    // of a group hands the student the first sub-step of the next group
    // rather than something still locked behind its own siblings.
    for (var i = 1; i <= BONUS_ORDER.length; i++) {
      var cand = BONUS_ORDER[(bidx + i) % BONUS_ORDER.length];
      if (isRequiredDone(cand)) continue;
      if (computeStatus(cand) === "locked") continue;
      return cand;
    }
    return null;
  }

  function goToStep(id) {
    if (computeStatus(id) === "locked") return;
    state.currentStepId = id;
    persist();
    renderAll();
    var mp = $("#mainPanel");
    if (mp) mp.focus();
  }

  // Full course order for the "Next TODO ->" convenience button: Required in
  // order, then Bonus in order (the exact same order the sidebar renders in)
  // - independent of whether steps are currently unlocked, since the button
  // itself shows a locked/disabled state rather than skipping over locked
  // steps.
  function nextTodoIdInFullOrder(id) {
    var order = REQUIRED_ORDER.concat(BONUS_ORDER);
    var idx = order.indexOf(id);
    if (idx === -1 || idx + 1 >= order.length) return null;
    return order[idx + 1];
  }

  // ----------------------------------------------------------- 4. modal
  // (Section 3, "theme", removed entirely: this app is permanently the
  // warm parchment/torch look now - no dark mode, no toggle, no
  // prefers-color-scheme auto-switch. See styles.css's "Dark mode
  // removal" note for the CSS side of this same change.)

  function showConfirm(title, message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var root = $("#modalRoot");
      var confirmBtn = el("button", {
        class: "btn " + (opts.dangerConfirm ? "btn-outline-danger" : "btn-primary"),
        type: "button",
        onclick: function () { close(true); },
      }, [opts.confirmLabel || "Confirm"]);
      var overlay = el("div", { class: "modal-overlay", role: "dialog", "aria-modal": "true", "aria-label": title }, [
        el("div", { class: "modal-box" }, [
          el("div", { class: "modal-title", text: title }),
          el("div", { class: "modal-message", text: message }),
          el("div", { class: "modal-actions" }, [
            el("button", { class: "btn", type: "button", onclick: function () { close(false); } }, [opts.cancelLabel || "Cancel"]),
            confirmBtn,
          ]),
        ]),
      ]);
      function onKey(e) { if (e.key === "Escape") close(false); }
      function close(result) {
        root.innerHTML = "";
        document.removeEventListener("keydown", onKey);
        resolve(result);
      }
      document.addEventListener("keydown", onKey);
      root.innerHTML = "";
      root.appendChild(overlay);
      confirmBtn.focus();
    });
  }

  // ------------------------------------------------- 5. Visualizer seam
  //
  // Public API:
  //   Visualizer.register(name, impl)
  //     impl = {
  //       mount(container, stepState)   // called once when this visualizer
  //                                     // becomes active for a NEW step; build
  //                                     // your DOM here. stepState = {
  //                                     //   step, stepData, status, trigger
  //                                     // } where `step` is the data.js step
  //                                     // object (step.id, step.visualizer,
  //                                     // ...), `stepData` is the live,
  //                                     // mutable per-step state (stepData.code
  //                                     // is always the student's CURRENT
  //                                     // saved code - read it fresh, don't
  //                                     // cache it), and `trigger` is one of
  //                                     // "navigate" | "grade" | "hint" |
  //                                     // "skip" | "reset".
  //       show(stepState)              // called right after mount() for a
  //                                     // new step, AND on every later
  //                                     // re-render of the SAME step instead
  //                                     // of mount() (so DOM/animation state
  //                                     // survives hint reveals etc.)
  //       update(stepState)             // called after grading (trigger ===
  //                                     // "grade") in addition to show(); use
  //                                     // this to auto-run a fresh trace.
  //       unmount()                    // optional cleanup, called before a
  //                                     // DIFFERENT visualizer replaces this
  //                                     // one.
  //     }
  //   Visualizer.show(name, stepState) // app.js calls this on every render
  //   Visualizer.update(stepState)     // (kept for compatibility; app.js no
  //                                     // longer calls this directly - grade
  //                                     // notifications go through show()'s
  //                                     // trigger field instead)
  //
  // `name` is the step's `visualizer` field from data.js (one of:
  // titleCard, playerMove, dijkstraFrontier, mapEditor, assetPicker,
  // customItemLab). Steps whose visualizer has no registered implementation
  // yet fall back to a placeholder panel.
  var Visualizer = (function () {
    var registry = {};
    var activeName = null;
    var activeState = null;
    var activeStepId = null;

    function renderPlaceholder(container, name) {
      container.innerHTML = "";
      container.appendChild(el("div", { class: "viz-placeholder" }, [
        el("strong", { text: "Visualization coming in a future update" }),
        "This panel will animate what your code does as soon as it's built.",
        el("div", { class: "viz-tag", text: "visualizer: " + name }),
      ]));
    }

    function currentImplUnmount() {
      var impl = registry[activeName];
      if (impl && typeof impl.unmount === "function") {
        try { impl.unmount(); } catch (e) { console.warn("visualizer unmount failed", e); }
      }
    }

    function mountFresh() {
      var container = $("#vizStepView");
      if (!container) return;
      var impl = registry[activeName];
      if (!impl) { renderPlaceholder(container, activeName); return; }
      container.innerHTML = "";
      if (typeof impl.mount === "function") impl.mount(container, activeState);
      if (typeof impl.show === "function") impl.show(activeState);
    }

    function register(name, impl) {
      registry[name] = impl;
      if (activeName === name) mountFresh();
    }
    function show(name, stepState) {
      var stepId = stepState && stepState.step ? stepState.step.id : null;
      var sameVisualizerAndStep = name === activeName && stepId === activeStepId && registry[name];
      activeState = stepState;
      if (sameVisualizerAndStep) {
        activeName = name;
        activeStepId = stepId;
        var impl = registry[name];
        if (typeof impl.show === "function") impl.show(activeState);
        if (stepState && stepState.trigger === "grade" && typeof impl.update === "function") {
          impl.update(activeState);
        }
        return;
      }
      currentImplUnmount();
      activeName = name;
      activeStepId = stepId;
      mountFresh();
    }
    function update(stepState) {
      activeState = stepState;
      if (activeName && registry[activeName] && typeof registry[activeName].update === "function") {
        registry[activeName].update(stepState);
      }
    }
    return { register: register, show: show, update: update, _registry: registry };
  })();
  window.Visualizer = Visualizer;

  function initVizTabs() {
    var stepTab = $("#vizTabStep"), playTab = $("#vizTabPlay");
    var stepView = $("#vizStepView"), playView = $("#vizPlayView");
    function select(which) {
      var stepActive = which === "step";
      stepTab.classList.toggle("is-active", stepActive);
      playTab.classList.toggle("is-active", !stepActive);
      stepTab.setAttribute("aria-selected", stepActive ? "true" : "false");
      playTab.setAttribute("aria-selected", !stepActive ? "true" : "false");
      stepView.hidden = !stepActive;
      playView.hidden = stepActive;
      if (!stepActive) {
        if (!playView.dataset.rendered) {
          playView.dataset.rendered = "1";
          PlayEngine.mount(playView);
        } else {
          PlayEngine.refresh();
        }
      }
    }
    stepTab.addEventListener("click", function () { select("step"); });
    playTab.addEventListener("click", function () { select("play"); });
  }

  // -------------------------------------------------------- 6. Pyodide

  var pyState = { status: "idle", pyodide: null, error: null, loading: null };

  function updatePyodideBanner() {
    var banner = $("#pyodideBanner");
    if (!banner) return;
    if (pyState.status === "loading") {
      banner.hidden = false;
      banner.className = "banner banner-info";
      banner.innerHTML = '<span class="spinner" aria-hidden="true"></span> Loading the Python engine (Pyodide) — first load only, can take a little while on a slow connection.';
    } else if (pyState.status === "error") {
      banner.hidden = false;
      banner.className = "banner banner-error";
      banner.textContent = "Could not load the Python engine. Check your internet connection and reload the page — running code is disabled until this succeeds.";
    } else {
      banner.hidden = true;
    }
  }

  // One consistent "Run my code" action for every step, syntax-mode or
  // behaviour-mode alike (see runGrading()) - the RESULT panel is what
  // communicates correct/incorrect/ran-cleanly, not the button label.
  function gradeButtonLabel() {
    if (pyState.status === "loading") return "Loading Python engine…";
    if (pyState.status === "error") return "Can't run right now";
    return "Run my code";
  }

  function refreshGradeButtonAvailability() {
    var btn = document.getElementById("gradeBtn");
    if (!btn) return;
    btn.disabled = pyState.status === "loading" || pyState.status === "error";
    btn.textContent = gradeButtonLabel();
  }

  function ensurePyodide() {
    if (pyState.pyodide) return Promise.resolve(pyState.pyodide);
    if (pyState.loading) return pyState.loading;
    pyState.status = "loading";
    updatePyodideBanner();
    refreshGradeButtonAvailability();
    pyState.loading = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = PYODIDE_SCRIPT_URL;
      script.onload = function () {
        if (typeof window.loadPyodide !== "function") {
          pyState.status = "error";
          updatePyodideBanner();
          refreshGradeButtonAvailability();
          reject(new Error("Pyodide script loaded but window.loadPyodide is missing."));
          return;
        }
        window.loadPyodide({ indexURL: PYODIDE_INDEX_URL }).then(function (py) {
          pyState.pyodide = py;
          pyState.status = "ready";
          updatePyodideBanner();
          refreshGradeButtonAvailability();
          resolve(py);
        }).catch(function (err) {
          pyState.status = "error";
          pyState.error = err;
          updatePyodideBanner();
          refreshGradeButtonAvailability();
          reject(err);
        });
      };
      script.onerror = function () {
        pyState.status = "error";
        updatePyodideBanner();
        refreshGradeButtonAvailability();
        reject(new Error("Failed to load pyodide.js from the CDN."));
      };
      document.head.appendChild(script);
    });
    return pyState.loading;
  }

  function parseHarnessResult(resultJson) {
    try {
      var obj = JSON.parse(resultJson);
      return {
        ok: !!obj.ok,
        passed: obj.passed || [],
        failed: obj.failed || [],
        // `warnings`: non-blocking, informational notes (heads-up style, not
        // pass/fail). Currently only used by the relaxed syntax-mode
        // harnesses (open-ended TODOs 1/7/8/9/10) to flag something that
        // looks off WITHOUT gating completion on it - see runGrading().
        warnings: obj.warnings || [],
        error: obj.error || null,
        traceback: obj.traceback || null,
      };
    } catch (e) {
      return { ok: false, passed: [], failed: [], warnings: [], error: "Internal grading error: could not parse the result (" + e.message + ").", traceback: null };
    }
  }

  // --------------------------------------------------------- 7. editor

  var GENERIC_KEYWORDS = ["if", "elif", "def", "len", "return", "True", "False", "None", "for", "in", "not", "or", "and"];

  function extractIdentifiersBefore(text, cursorPos) {
    var before = text.slice(0, cursorPos);
    var found = before.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    var seen = {}, list = [];
    found.forEach(function (id) {
      if (!seen[id]) { seen[id] = true; list.push(id); }
    });
    return list;
  }

  function insertAtCursor(textarea, text) {
    var start = textarea.selectionStart, end = textarea.selectionEnd;
    var value = textarea.value;
    textarea.value = value.slice(0, start) + text + value.slice(end);
    var pos = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
  }

  function createAutocomplete(textarea, hostEl) {
    var popup = null, items = [], activeIndex = -1;

    function currentWordRange() {
      var pos = textarea.selectionStart;
      var text = textarea.value;
      var start = pos;
      while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) start--;
      return { start: start, end: pos };
    }

    function close() {
      if (popup) { popup.remove(); popup = null; }
      items = []; activeIndex = -1;
    }

    function buildMirror() {
      var cs = window.getComputedStyle(textarea);
      var mirror = document.createElement("div");
      ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingLeft", "paddingRight", "borderWidth", "boxSizing", "tabSize"].forEach(function (p) {
        mirror.style[p] = cs[p];
      });
      mirror.style.position = "absolute";
      mirror.style.visibility = "hidden";
      mirror.style.top = "0";
      mirror.style.left = "-9999px";
      mirror.style.width = textarea.clientWidth + "px";
      mirror.style.whiteSpace = "pre-wrap";
      mirror.style.wordBreak = "break-word";
      return mirror;
    }

    function positionPopup() {
      var range = currentWordRange();
      var mirror = buildMirror();
      var before = document.createTextNode(textarea.value.slice(0, range.start));
      var marker = document.createElement("span");
      marker.textContent = "​";
      mirror.appendChild(before);
      mirror.appendChild(marker);
      document.body.appendChild(mirror);
      var top = marker.offsetTop - textarea.scrollTop;
      var left = marker.offsetLeft - textarea.scrollLeft;
      mirror.remove();
      var hostRect = hostEl.getBoundingClientRect();
      var taRect = textarea.getBoundingClientRect();
      popup.style.top = Math.max(0, (taRect.top - hostRect.top) + top + 22) + "px";
      popup.style.left = Math.max(0, (taRect.left - hostRect.left) + left) + "px";
    }

    function renderPopup() {
      if (popup) popup.remove();
      popup = el("div", { class: "autocomplete-popup", role: "listbox" });
      items.forEach(function (item, i) {
        popup.appendChild(el("div", {
          class: "autocomplete-item" + (i === activeIndex ? " is-active" : ""),
          role: "option",
          "aria-selected": i === activeIndex ? "true" : "false",
          onmousedown: function (e) { e.preventDefault(); accept(i); },
        }, [item.name, el("span", { class: "autocomplete-kind", text: item.kind })]));
      });
      hostEl.appendChild(popup);
      positionPopup();
    }

    function accept(i) {
      var item = items[i];
      if (!item) return;
      var range = currentWordRange();
      var value = textarea.value;
      var tailStart = textarea.selectionStart;
      textarea.value = value.slice(0, range.start) + item.name + value.slice(tailStart);
      var pos = range.start + item.name.length;
      textarea.selectionStart = textarea.selectionEnd = pos;
      close();
      textarea.dispatchEvent(new Event("input"));
      textarea.focus();
    }

    function onInput() {
      var range = currentWordRange();
      var word = textarea.value.slice(range.start, range.end);
      if (!word) { close(); return; }
      var known = extractIdentifiersBefore(textarea.value, range.start);
      var pool = GENERIC_KEYWORDS.map(function (k) { return { name: k, kind: "keyword" }; }).concat(
        known.filter(function (id) { return GENERIC_KEYWORDS.indexOf(id) === -1; }).map(function (id) { return { name: id, kind: "your code" }; })
      );
      var lower = word.toLowerCase();
      items = pool.filter(function (p) { return p.name !== word && p.name.toLowerCase().indexOf(lower) === 0; }).slice(0, 8);
      if (items.length === 0) { close(); return; }
      activeIndex = 0;
      renderPopup();
    }

    function handleKeydown(e) {
      if (!popup) return false;
      if (e.key === "ArrowDown") { e.preventDefault(); activeIndex = (activeIndex + 1) % items.length; renderPopup(); return true; }
      if (e.key === "ArrowUp") { e.preventDefault(); activeIndex = (activeIndex - 1 + items.length) % items.length; renderPopup(); return true; }
      if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); accept(activeIndex); return true; }
      if (e.key === "Escape") { close(); return true; }
      return false;
    }

    textarea.addEventListener("blur", function () { setTimeout(close, 120); });
    return { onInput: onInput, handleKeydown: handleKeydown, close: close };
  }

  // ------------------------------------------------- 7a. Python syntax highlighting
  //
  // Small hand-rolled, regex-based tokenizer (not a full parser - keywords,
  // strings incl. f-strings/triple-quotes, comments, numbers, identifiers;
  // "self"/"cls" and def/class names and call-sites get their own token
  // types). Used to render VS Code Dark+/Light+ -like colors for both the
  // read-only context blocks and the editable textarea (via a synced
  // highlight-behind-textarea overlay - see buildEditableBlock).
  //
  // IMPORTANT: every character of the input MUST come back out somewhere in
  // the token stream, unchanged, or the highlight overlay will drift out of
  // pixel alignment with the real (invisible) textarea text and cursor.
  // This is validated by round-tripping tokens back into a string and
  // diffing against the original (see the report for how this was tested
  // without a browser available).
  var PY_KEYWORDS_LIST = ["False", "None", "True", "and", "as", "assert", "async", "await",
    "break", "class", "continue", "def", "del", "elif", "else", "except", "finally",
    "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not",
    "or", "pass", "raise", "return", "try", "while", "with", "yield"];
  var PY_KEYWORDS_SET = {};
  PY_KEYWORDS_LIST.forEach(function (k) { PY_KEYWORDS_SET[k] = true; });

  // Group 1 = comment, 2 = triple-quoted string, 3 = single/double-quoted
  // string, 4 = decorator, 5 = number, 6 = word (identifier/keyword). This
  // is a REGEX LITERAL on purpose (not built from a string via
  // `new RegExp(...)`) - safer/simpler escaping, one less place to get
  // double-backslashing wrong.
  var PY_TOKEN_RE = /(#[^\n]*)|([rRbBfFuU]{0,2}(?:'''[\s\S]*?'''|"""[\s\S]*?"""))|([rRbBfFuU]{0,2}(?:"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'))|(@[A-Za-z_][A-Za-z0-9_.]*)|(\b0[xX][0-9a-fA-F]+\b|\b\d+\.\d*(?:[eE][+-]?\d+)?\b|\b\.\d+\b|\b\d+[eE][+-]?\d+\b|\b\d+\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b)/g;

  function tokenizePython(code) {
    code = code == null ? "" : String(code);
    var tokens = [];
    var lastIndex = 0;
    var m;
    PY_TOKEN_RE.lastIndex = 0;
    while ((m = PY_TOKEN_RE.exec(code)) !== null) {
      if (m.index > lastIndex) tokens.push({ type: "plain", text: code.slice(lastIndex, m.index) });
      // Truthy checks (not `!== undefined`): every alternative requires at
      // least one character to match, so a real match is never "", and
      // this is also safe against engines that report non-participating
      // groups as "" instead of `undefined`.
      if (m[1]) tokens.push({ type: "comment", text: m[1] });
      else if (m[2]) tokens.push({ type: "string", text: m[2] });
      else if (m[3]) tokens.push({ type: "string", text: m[3] });
      else if (m[4]) tokens.push({ type: "decorator", text: m[4] });
      else if (m[5]) tokens.push({ type: "number", text: m[5] });
      else if (m[6]) {
        var w = m[6];
        var type = "identifier";
        if (PY_KEYWORDS_SET[w]) type = "keyword";
        else if (w === "self" || w === "cls") type = "self";
        tokens.push({ type: type, text: w });
      }
      lastIndex = PY_TOKEN_RE.lastIndex;
      if (m.index === PY_TOKEN_RE.lastIndex) PY_TOKEN_RE.lastIndex++; // guard against zero-length matches
    }
    if (lastIndex < code.length) tokens.push({ type: "plain", text: code.slice(lastIndex) });

    // Context-sensitive upgrades: name right after `def`/`class`, and any
    // identifier immediately followed by "(" (a call site), matching how
    // VS Code's default (TextMate-grammar) Python coloring works.
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i].type === "keyword" && (tokens[i].text === "def" || tokens[i].text === "class")) {
        var isClass = tokens[i].text === "class";
        for (var j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type === "plain" && tokens[j].text.trim() === "") continue;
          if (tokens[j].type === "identifier") tokens[j].type = isClass ? "classname" : "function";
          break;
        }
      }
    }
    for (var i2 = 0; i2 < tokens.length; i2++) {
      if (tokens[i2].type === "identifier") {
        var next = tokens[i2 + 1];
        if (next && next.type === "plain" && next.text.charAt(0) === "(") tokens[i2].type = "function";
      }
    }
    return tokens;
  }

  function escapeHtmlForCode(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  var PY_TOKEN_CLASS_MAP = {
    keyword: "tok-kw", string: "tok-str", comment: "tok-cm", number: "tok-num",
    decorator: "tok-fn", "function": "tok-fn", classname: "tok-cls", self: "tok-self",
  };

  function highlightPythonToHtml(code) {
    var tokens = tokenizePython(code);
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      var escaped = escapeHtmlForCode(t.text);
      var cls = PY_TOKEN_CLASS_MAP[t.type];
      out.push(cls ? '<span class="' + cls + '">' + escaped + '</span>' : escaped);
    }
    // A trailing newline needs a following blank "line" to render with the
    // same height a textarea gives it; a lone newline at the very end of
    // pre-wrap content can otherwise be collapsed visually.
    if (code.length === 0 || code.charAt(code.length - 1) === "\n") out.push(" ");
    return out.join("");
  }

  function makeGutter(startLine, count) {
    var nums = [];
    for (var i = 0; i < count; i++) nums.push(startLine + i);
    return nums.join("\n");
  }

  function buildContextBlock(lines, startLine, extraClass) {
    var text = linesOf(lines);
    var count = Math.max(1, text.split("\n").length);
    var block = el("div", { class: "code-block context-block " + extraClass }, [
      el("div", { class: "code-gutter", text: makeGutter(startLine, count) }),
      el("div", { class: "code-lines", html: highlightPythonToHtml(text) }),
    ]);
    block.dataset.startLine = String(startLine);
    return block;
  }

  // Re-renders a context block's text/highlighting in place (its own
  // gutter numbers only - NOT the numbering of whatever comes after it).
  // Used for TODO 5 Part 2's "before" block, which shows the student's own
  // live Part 1 code rather than a static data.js snippet (see
  // renderMain()) - keeps content accurate as Part 1 is edited, without
  // needing to re-flow the whole editor shell on every keystroke.
  function updateContextBlockContent(blockEl, lines) {
    if (!blockEl) return;
    var text = linesOf(lines);
    var count = Math.max(1, text.split("\n").length);
    var startLine = parseInt(blockEl.dataset.startLine || "1", 10);
    var gutterEl = blockEl.querySelector(".code-gutter");
    var linesEl = blockEl.querySelector(".code-lines");
    if (gutterEl) gutterEl.textContent = makeGutter(startLine, count);
    if (linesEl) linesEl.innerHTML = highlightPythonToHtml(text);
  }

  function buildEditableBlock(step, partIndex, startLine) {
    var stepData = state.steps[step.id];
    var initialCode = partIndex == null ? stepData.code : stepData.code[partIndex];
    var wrap = el("div", { class: "editable-wrap" });
    wrap.appendChild(el("div", { class: "editable-flag", text: "Your code" }));
    var grid = el("div", { class: "editable-grid" });
    var gutter = el("div", { class: "editor-gutter", "aria-hidden": "true" });
    // The textarea sits ON TOP of a synced, colorized highlight layer
    // ("highlight-behind-textarea" technique): the textarea's own text is
    // made transparent (see styles.css .code-textarea) so only its caret
    // and selection are visible, while the highlight layer underneath
    // shows the actual colored syntax. Both share one stacking wrapper so
    // they always occupy exactly the same box.
    var stack = el("div", { class: "code-editor-stack" });
    var highlightLayer = el("div", { class: "code-highlight-layer", "aria-hidden": "true" });
    var textarea = el("textarea", {
      class: "code-textarea",
      spellcheck: "false",
      autocapitalize: "off",
      autocomplete: "off",
      "aria-label": "Your code for TODO " + step.id + (partIndex != null ? ", part " + (partIndex + 1) : ""),
    });
    textarea.value = initialCode;
    stack.appendChild(highlightLayer);
    stack.appendChild(textarea);
    grid.appendChild(gutter);
    grid.appendChild(stack);
    wrap.appendChild(grid);

    var api = { node: wrap, textarea: textarea, onLineCountChange: null };
    api.lineCount = function () { return Math.max(1, textarea.value.split("\n").length); };

    function updateHighlight() {
      highlightLayer.innerHTML = highlightPythonToHtml(textarea.value);
    }

    // scrollHeight (and offsetHeight/clientHeight) read as 0 for any
    // element that isn't actually laid out yet - either because it's not
    // attached to `document` at all (buildEditorShell()'s returned node is
    // still an in-memory fragment the first time buildEditableBlock runs;
    // it only gets appended to #mainPanel by the caller afterwards), or
    // because it's attached but sitting inside a `display:none` ancestor
    // (e.g. an inactive tab). A single synchronous measurement in either
    // case would permanently pin the textarea's height to 0px, since
    // nothing re-triggers refresh() later on its own.
    //
    // `isRendered()` covers both cases at once: a disconnected node and a
    // node inside `display:none` both report zero client rects. Retry on
    // the next animation frame until it's actually rendered, so this can't
    // recur regardless of *why* the element wasn't ready yet (off-screen
    // rebuild, deferred insertion, etc.).
    function isRendered() {
      return textarea.getClientRects().length > 0;
    }
    function measureAndSetHeight() {
      textarea.style.height = "auto";
      var h = Math.min(420, textarea.scrollHeight);
      textarea.style.height = h + "px";
      textarea.style.overflowY = textarea.scrollHeight > 420 ? "auto" : "hidden";
    }
    var pendingMeasure = 0;
    function scheduleMeasure() {
      if (pendingMeasure) return;
      pendingMeasure = requestAnimationFrame(function () {
        pendingMeasure = 0;
        if (!isRendered()) { scheduleMeasure(); return; }
        measureAndSetHeight();
      });
    }

    function refresh() {
      var count = api.lineCount();
      gutter.textContent = makeGutter(startLine, count);
      if (isRendered()) measureAndSetHeight();
      else scheduleMeasure();
      if (api.onLineCountChange) api.onLineCountChange(count);
    }
    function syncScroll() {
      gutter.scrollTop = textarea.scrollTop;
      highlightLayer.scrollTop = textarea.scrollTop;
      highlightLayer.scrollLeft = textarea.scrollLeft;
    }

    updateHighlight();
    refresh();
    var autocomplete = createAutocomplete(textarea, wrap);

    textarea.addEventListener("input", function () {
      var code = textarea.value;
      if (partIndex == null) stepData.code = code; else stepData.code[partIndex] = code;
      persist();
      updateHighlight();
      refresh();
      syncScroll();
      autocomplete.onInput();
    });
    textarea.addEventListener("scroll", syncScroll);
    textarea.addEventListener("keydown", function (e) {
      if (autocomplete.handleKeydown(e)) return;
      if (e.key === "Tab") {
        e.preventDefault();
        insertAtCursor(textarea, "    ");
        textarea.dispatchEvent(new Event("input"));
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        gradeStep(step.id);
      }
    });

    return api;
  }

  // `overrideBeforeLines`, when given, replaces partLike.contextBefore -
  // used by TODO 5's Part 2, whose "what's above" context is the
  // student's own live Part 1 code rather than a fixed data.js snippet
  // (see renderMain()). Accepts the same array-or-string shapes as
  // everywhere else (linesOf() normalizes either).
  function buildEditorShell(step, partLike, partIndex, overrideBeforeLines) {
    var beforeLines = overrideBeforeLines !== undefined ? overrideBeforeLines : (partLike.contextBefore || []);
    var beforeText = linesOf(beforeLines);
    var afterLines = partLike.contextAfter || [];
    var container = el("div", { class: "editor-shell" });
    var cursorLine = 1;
    var beforeBlockEl = null;
    if (beforeText.length > 0) {
      beforeBlockEl = buildContextBlock(beforeLines, cursorLine, "context-before");
      container.appendChild(beforeBlockEl);
      cursorLine += beforeText.split("\n").length;
    }
    var editableStartLine = cursorLine;
    var editable = buildEditableBlock(step, partIndex, editableStartLine);
    container.appendChild(editable.node);

    var afterGutter = null;
    if (afterLines.length > 0) {
      var afterBlock = buildContextBlock(afterLines, editableStartLine + editable.lineCount(), "context-after");
      afterGutter = afterBlock.querySelector(".code-gutter");
      container.appendChild(afterBlock);
    }
    editable.onLineCountChange = function (newCount) {
      if (afterGutter) afterGutter.textContent = makeGutter(editableStartLine + newCount, afterLines.length);
    };
    return { node: container, editable: editable, beforeBlockEl: beforeBlockEl };
  }

  // ------------------------------------------------ 8. sidebar / main

  function badgeSvg(status, index) {
    if (status === "completed") {
      return '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    if (status === "skipped") {
      return '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M5 5v14l8-7z" fill="currentColor"/><rect x="15" y="5" width="3.2" height="14" fill="currentColor"/></svg>';
    }
    if (status === "locked") {
      return '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    }
    return String(index);
  }

  function renderSidebarGroup(title, note, ids, isSubGroup) {
    var frag = document.createDocumentFragment();
    frag.appendChild(el("div", { class: "sidebar-group-title" + (isSubGroup ? " sidebar-subgroup-title" : ""), text: title }));
    if (note) frag.appendChild(el("div", { class: "sidebar-group-note", text: note }));
    ids.forEach(function (id) {
      var step = STEP_BY_ID[id];
      var status = computeStatus(id);
      var unlocked = status !== "locked";
      var isCurrent = id === state.currentStepId;
      var displayStatus = (isCurrent && status === "available") ? "current" : status;
      var btn = el("button", {
        class: "sidebar-item status-" + displayStatus + (isCurrent ? " is-current" : ""),
        type: "button",
        disabled: unlocked ? null : "disabled",
        "aria-current": isCurrent ? "true" : null,
        onclick: unlocked ? function () { goToStep(id); } : null,
      }, [
        // Bonus badges count WITHIN their group (1..8 for 8-x), not
        // 8..37 across the whole course - the badge sits right next to
        // "TODO 8-3", so a global step number there just reads as a typo.
        el("span", { class: "sidebar-badge", "aria-hidden": "true", html: badgeSvg(displayStatus, step.group ? step.grading.part : step.step) }),
        el("span", { class: "sidebar-label" }, [
          el("span", { class: "sidebar-label-title", text: "TODO " + id + ". " + step.title }),
          el("span", { class: "sidebar-label-file", text: stepFiles(step).join(" + ") }),
        ]),
        status === "skipped" ? el("span", { class: "sidebar-tag tag-skipped", text: "Skipped" }) : null,
      ]);
      frag.appendChild(btn);
    });
    return frag;
  }

  function renderSidebar() {
    var nav = $("#sidebar");
    nav.innerHTML = "";
    nav.appendChild(renderSidebarGroup(
      "Required — do these in order",
      "Complete or skip each one to unlock the next. You cannot jump ahead.",
      REQUIRED_ORDER
    ));
    nav.appendChild(el("div", { class: "sidebar-divider" }));
    // Bonus is four independent GROUPS, each an ordered little run of
    // one-file, one-editor steps. The group headers say both halves of the
    // rule out loud, because the two halves are different: pick any group
    // you like, but inside a group go top to bottom.
    nav.appendChild(el("div", { class: "sidebar-group-title", text: "Bonus — pick any group" }));
    nav.appendChild(el("div", { class: "sidebar-group-note", text:
      allRequiredDone()
        ? "Unlocked! Start whichever group you like. Inside a group, go in order — each step is tiny."
        : "Unlocks once every Required step is completed or skipped."
    }));
    BONUS_GROUPS.forEach(function (g) {
      nav.appendChild(renderSidebarGroup("TODO " + g.id + " · " + g.title, g.note, g.ids, true));
    });
    var doneCount = STEPS.filter(function (s) { return isRequiredDone(s.id); }).length;
    nav.appendChild(el("div", { class: "sidebar-progress" }, [
      doneCount + " / " + STEPS.length + " steps done",
      el("div", { class: "sidebar-progress-bar" }, [
        el("div", { class: "sidebar-progress-fill", style: "width:" + Math.round((doneCount / STEPS.length) * 100) + "%" }),
      ]),
    ]));
  }

  function svgIcon(pathHtml) {
    return el("span", { "aria-hidden": "true", html: '<svg class="icon" viewBox="0 0 24 24">' + pathHtml + '</svg>' });
  }

  function renderStepStatusBanner(status) {
    if (status === "completed") {
      return el("div", { class: "feedback feedback-pass" }, [el("div", { class: "feedback-title", text: "✓ This step is completed." })]);
    }
    if (status === "skipped") {
      return el("div", { class: "feedback", style: "background:var(--warning-bg);border-color:color-mix(in srgb, var(--warning) 40%, transparent);" }, [
        el("div", { class: "feedback-title", text: "⏭ Skipped — your draft is saved. Submit a correct answer any time to mark this complete." }),
      ]);
    }
    return null;
  }

  // `step` is optional (older call sites / synthetic error feedback may
  // omit it) - when present and the step is syntax-mode (an open-ended
  // TODO with no single right answer), the header/subtitle read as "ran
  // cleanly" rather than "passed all checks", matching what's actually
  // being checked (see runGrading()'s relaxed syntax-mode criteria).
  function renderFeedback(feedback, step) {
    var isSyntax = !!(step && step.grading && step.grading.mode === "syntax");
    var box = el("div", { class: "feedback " + (feedback.ok ? "feedback-pass" : "feedback-fail") });
    var title;
    if (feedback.ok) title = isSyntax ? "✓ Ran with no errors — nice work!" : "✓ All checks passed — nice work!";
    else title = "Not quite yet — here's what to fix:";
    box.appendChild(el("div", { class: "feedback-title", text: title }));
    if (feedback.ok && isSyntax) {
      box.appendChild(el("div", { class: "feedback-subtitle", text: "This is an open-ended step — there's no single right answer, so this only checks that your code runs without a Python error." }));
    }
    feedback.passed.forEach(function (p) {
      box.appendChild(el("div", { class: "feedback-line" }, [el("span", { class: "feedback-mark ok", text: "✓" }), el("span", {}, [p])]));
    });
    (feedback.warnings || []).forEach(function (w) {
      box.appendChild(el("div", { class: "feedback-line" }, [el("span", { class: "feedback-mark warn", text: "!" }), el("span", {}, [w])]));
    });
    feedback.failed.forEach(function (f) {
      box.appendChild(el("div", { class: "feedback-line" }, [el("span", { class: "feedback-mark bad", text: "✗" }), el("span", {}, [f])]));
    });
    if (feedback.error) {
      box.appendChild(el("div", { class: "feedback-line" }, [el("span", { class: "feedback-mark bad", text: "✗" }), el("span", {}, [feedback.error])]));
      if (feedback.traceback) {
        box.appendChild(el("pre", { class: "feedback-trace", text: feedback.traceback }));
      }
    }
    return box;
  }

  // "Next TODO ->" convenience button: a secondary way to move forward
  // without going back to the sidebar. Never replaces the sidebar's own
  // lock rules - it just surfaces them here too, with a short reason,
  // instead of silently doing nothing when the next step isn't reachable
  // yet.
  function nextTodoLockReason(nextId) {
    if (REQUIRED_ORDER.indexOf(nextId) !== -1) {
      return "Complete or skip this step to continue.";
    }
    if (!allRequiredDone()) {
      return "Finish every Required step (complete or skip) first - every Bonus group unlocks at once after that.";
    }
    return "Complete or skip this step to continue - the steps inside a Bonus group go in order.";
  }

  function renderNextTodoControl(currentId) {
    var nextId = nextTodoIdInFullOrder(currentId);
    var wrap = el("div", { class: "next-todo-wrap" });
    if (!nextId) {
      wrap.appendChild(el("div", { class: "next-todo-done" }, [
        svgIcon('<path d="M4 12.5 9.5 18 20 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
        el("span", {}, ["You've reached the last step. Nice work getting all the way through."]),
      ]));
      // The obvious next thing for whoever gets here first: take the whole
      // project away and keep going without the TODO boxes.
      wrap.appendChild(el("div", { class: "small muted next-todo-reason" }, [
        "Want more room? ",
        el("button", {
          class: "linklike", type: "button", text: "Download my project",
          onclick: function () { openExportModal(); },
        }),
        " gives you the complete game as real Python files — every line editable, runnable with python main.py.",
      ]));
      return wrap;
    }
    var nextStep = STEP_BY_ID[nextId];
    var nextUnlocked = computeStatus(nextId) !== "locked";
    var btn = el("button", {
      class: "btn btn-small next-todo-btn" + (nextUnlocked ? "" : " is-locked"),
      type: "button",
      disabled: nextUnlocked ? null : "disabled",
      "aria-disabled": nextUnlocked ? "false" : "true",
      onclick: nextUnlocked ? function () { goToStep(nextId); } : null,
    }, [
      "Next: TODO " + nextId + " — " + nextStep.title + " →",
    ]);
    wrap.appendChild(btn);
    if (!nextUnlocked) {
      wrap.appendChild(el("div", { class: "small muted next-todo-reason" }, [nextTodoLockReason(nextId)]));
    }
    return wrap;
  }

  function renderMain() {
    var step = STEP_BY_ID[state.currentStepId];
    var main = $("#mainPanel");
    main.innerHTML = "";
    var stepData = state.steps[step.id];
    var status = computeStatus(step.id);

    var card = el("div", { class: "step-card" });

    var banner = renderStepStatusBanner(status);
    if (banner) card.appendChild(banner);

    var bonusGroup = bonusGroupOf(step.id);
    card.appendChild(el("div", { class: "step-kicker" }, [
      el("span", { class: "pill " + (step.required ? "pill-required" : "pill-bonus"), text: step.required ? "Required" : "Bonus" }),
      bonusGroup
        ? bonusGroup.title + " — " + (bonusGroup.ids.indexOf(step.id) + 1) + " of " + bonusGroup.ids.length
        : "Step " + step.step + " of " + STEPS.length,
    ]));
    card.appendChild(el("div", { class: "step-title", text: "TODO " + step.id + " — " + step.title }));
    var stepFileList = stepFiles(step);
    card.appendChild(el("div", { class: "step-file-tag", text: (stepFileList.length > 1 ? "Files: " : "File: ") + stepFileList.join(", ") }));
    card.appendChild(el("div", { class: "step-lead rich-text", html: richTextToHtml(step.lead) }));

    // Generic "Required steps go in order" / "Bonus unlocks together" flow
    // banners were removed here (steps 1-8) - they duplicated the
    // sidebar's own permanent group headers/notes (see renderSidebarGroup),
    // which are visible at all times regardless of which step is open.
    // TODO 11 used to have its own extra "capstone" banner here (locked
    // until every other Bonus was done) - that lock was removed entirely
    // per direct teacher request, so TODO 11 is a normal Bonus step now with
    // no special banner either.

    var refDetails = el("details", { class: "code-reference" }, [
      el("summary", { text: "Code reference — identifiers you'll see (" + step.codeReference.length + ")" }),
    ]);
    var refBody = el("div", { class: "code-reference-body" });
    step.codeReference.forEach(function (pair) {
      refBody.appendChild(el("div", { class: "code-reference-row" }, [
        el("code", { class: "code-reference-token", text: pair[0] }),
        el("div", { class: "code-reference-explain", text: pair[1] }),
      ]));
    });
    refDetails.appendChild(refBody);
    card.appendChild(refDetails);

    if (step.parts) {
      // TODO 5 is now the ONLY step that still renders as several editors
      // on one page. Every Bonus step used to do this too - clicking
      // "TODO 8" opened six stacked editors at once, which is exactly the
      // "too many files show up, kids find it hard" complaint - and each
      // of those parts is a separate sidebar step now. TODO 5 keeps the
      // stacked form because its two parts are genuinely one expression
      // split in half (Part 2 literally uses new_cost, which Part 1
      // defines), not two independent settings.
      //
      // Part 2's "before" context shows the STUDENT'S OWN live
      // Part 1 code (kept in sync as they type), not the reference form -
      // showing the reference answer here would leak Part 1's graded
      // answer outright, and it wouldn't even match what the student
      // just wrote if their own style/spacing differs.
      var partShells = [];
      step.parts.forEach(function (part, i) {
        card.appendChild(el("div", { class: "editor-file-label" }, [partFile(step, part), el("span", { class: "editor-part-label", text: "Part " + part.part }), el("span", {}, [part.title || ""])]));
        if (part.lead) {
          card.appendChild(el("div", { class: "step-lead rich-text part-lead", html: richTextToHtml(part.lead) }));
        }
        var overrideBefore;
        if (step.id === "5" && i === 1) overrideBefore = stepData.code[0];
        var shell = buildEditorShell(step, part, i, overrideBefore);
        partShells.push(shell);
        card.appendChild(shell.node);
      });
      if (step.id === "5" && partShells.length === 2 && partShells[1].beforeBlockEl) {
        partShells[0].editable.textarea.addEventListener("input", function () {
          updateContextBlockContent(partShells[1].beforeBlockEl, stepData.code[0]);
        });
      }
    } else {
      card.appendChild(el("div", { class: "editor-file-label" }, [step.file]));
      card.appendChild(buildEditorShell(step, step, null).node);
    }

    card.appendChild(el("div", { class: "editor-toolbar" }, [
      el("kbd", { text: "Tab" }), " = 4 spaces  ·  ",
      el("kbd", { text: "Ctrl" }), "+", el("kbd", { text: "Enter" }), " = Run  ·  autocomplete: ",
      el("kbd", { text: "↑" }), el("kbd", { text: "↓" }), " choose, ",
      el("kbd", { text: "Tab" }), "/", el("kbd", { text: "Enter" }), " accept, ", el("kbd", { text: "Esc" }), " dismiss",
    ]));

    var gradeBtn = el("button", {
      class: "btn btn-primary", type: "button", id: "gradeBtn",
      disabled: (pyState.status === "loading" || pyState.status === "error") ? "disabled" : null,
      onclick: function () { gradeStep(step.id); },
    }, [gradeButtonLabel()]);
    var totalHints = step.hints.length;
    var hintBtn = el("button", {
      class: "btn", type: "button",
      disabled: stepData.hintsRevealed >= totalHints ? "disabled" : null,
      onclick: function () { revealHint(step.id); },
    }, [stepData.hintsRevealed >= totalHints ? "All hints shown" : "Show hint (" + (stepData.hintsRevealed + 1) + "/" + totalHints + ")"]);
    var skipBtn = el("button", {
      class: "btn", type: "button",
      onclick: function () { skipStep(step.id); },
    }, [status === "completed" ? "Skip anyway" : "Skip this step"]);
    var resetBtn = el("button", {
      class: "btn btn-outline-danger btn-small", type: "button",
      onclick: function () { resetStep(step.id); },
    }, ["Reset this step"]);
    // Teacher-only escape hatch for a spurious grading bug (a student's
    // code is genuinely correct but the grader throws an error anyway) -
    // deliberately NOT a prominent button, just a small quiet link near
    // Run/Grade. See promptTeacherOverride() for what "the code" does.
    var overrideLink = el("button", {
      class: "override-link small muted", type: "button",
    }, ["Trouble with grading?"]);
    overrideLink.addEventListener("click", function () { promptTeacherOverride(step.id); });
    // C2: opens a read-only, VS-Code-like view of the COMPLETE real file
    // (step.file) with this step's own live code (and every other TODO's
    // live code in that same file) spliced into place - see
    // openFullFileViewer/buildFullFileLive near the project-export code.
    // Multi-file Bonus steps (e.g. TODO 10: settings.py + game.py) get one
    // button PER distinct file, each labeled with that filename so it's
    // unambiguous which one it opens; single-file steps keep the plain
    // "View full file" label.
    var viewFileBtns = stepFileList.map(function (fname) {
      return el("button", {
        class: "btn btn-small", type: "button",
        onclick: function () { openFullFileViewer(fname); },
      }, [stepFileList.length > 1 ? "📄 View " + fname : "📄 View full file"]);
    });

    card.appendChild(el("div", { class: "step-actions" }, [
      gradeBtn, hintBtn, skipBtn,
    ].concat(viewFileBtns).concat([
      el("span", { class: "spacer" }),
      el("span", { class: "attempt-count", text: stepData.attempts + " attempt" + (stepData.attempts === 1 ? "" : "s") }),
      overrideLink,
      resetBtn,
    ])));

    if (stepData.lastFeedback) card.appendChild(renderFeedback(stepData.lastFeedback, step));

    if (stepData.hintsRevealed > 0) {
      var hintsBlock = el("div", { class: "hints-block" });
      for (var i = 0; i < stepData.hintsRevealed; i++) {
        hintsBlock.appendChild(el("div", { class: "hint-item" }, [
          el("div", { class: "hint-tier", text: "Hint " + (i + 1) + " of " + step.hints.length }),
          el("div", { class: "rich-text", html: richTextToHtml(step.hints[i]) }),
        ]));
      }
      card.appendChild(hintsBlock);
    }

    card.appendChild(renderNextTodoControl(step.id));

    main.appendChild(card);
    Visualizer.show(step.visualizer, { step: step, stepData: stepData, status: status, trigger: consumeVizTrigger() });
  }

  function renderAll() {
    renderSidebar();
    renderMain();
  }

  // pendingVizTrigger lets action functions (grade/hint/skip/reset) tell the
  // active Visualizer WHY the next render is happening, without changing the
  // renderMain()/Visualizer.show() call sites scattered through the file.
  var pendingVizTrigger = "navigate";
  function consumeVizTrigger() {
    var t = pendingVizTrigger;
    pendingVizTrigger = "navigate";
    return t;
  }

  // ------------------------------------------------------- 9. grading

  function gradeStep(id) {
    var step = STEP_BY_ID[id];
    if (computeStatus(id) === "locked") return;
    var stepData = state.steps[id];
    stepData.attempts += 1;
    persist();
    var btn = document.getElementById("gradeBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Running your code in Python…"; }

    ensurePyodide().then(function (pyodide) {
      return runGrading(pyodide, step, stepData);
    }).then(function (feedback) {
      stepData.lastFeedback = feedback;
      if (feedback.ok) {
        stepData.status = "completed";
      }
      persist();
      pendingVizTrigger = "grade";
      renderAll();
      if (typeof PlayEngine !== "undefined") PlayEngine.refresh();
    }).catch(function (err) {
      stepData.lastFeedback = {
        ok: false, passed: [], failed: [], warnings: [],
        error: "The grading engine could not run: " + (err && err.message ? err.message : String(err)),
        traceback: null,
      };
      persist();
      renderMain();
    });
  }

  function runGrading(pyodide, step, stepData) {
    if (step.grading.mode === "syntax") {
      var builder = SYNTAX_HARNESSES[step.id];
      if (!builder) return Promise.resolve(noHarnessFeedback());
      // Syntax mode only ever grades module-level settings, so every part
      // can share one namespace - joining them is exactly right.
      var code = step.parts ? stepData.code.join("\n\n") : stepData.code;
      return pyodide.runPythonAsync(builder(code)).then(parseHarnessResult);
    }
    var b = BEHAVIOUR_HARNESSES[step.grading.harness];
    if (!b) return Promise.resolve(noHarnessFeedback());
    // A Bonus sub-step is graded by its GROUP's harness, focused on this
    // one sub-step. The group's code still has to be handed over whole,
    // because several sub-steps are consecutive statement groups of one
    // Python method (8-4/8-5/8-6 are one create_game_objects body) and
    // only make sense spliced back together. `focus` then decides which
    // checks actually run and get reported, so a student sitting on 10-2
    // is never failed by 10-3 still holding its `pass` starter.
    if (step.grading.group) {
      var groupIds = BONUS_GROUP_IDS[step.grading.group] || [];
      var codes = groupIds.map(function (gid) {
        var sd = state.steps[gid];
        var c = sd ? sd.code : "";
        return Array.isArray(c) ? c.join("\n") : String(c == null ? "" : c);
      });
      return pyodide.runPythonAsync(b.apply(null, codes.concat([step.grading.part]))).then(parseHarnessResult);
    }
    // Multi-part behaviour steps pass each part as its OWN argument, not
    // joined into one string like syntax mode does - the harness needs to
    // splice/grade each part separately so a mistake in one part can be
    // attributed specifically to that part (see harness_dijkstra_5). Only
    // TODO 5 is still shaped this way.
    var src = step.parts ? b.apply(null, stepData.code) : b(stepData.code);
    return pyodide.runPythonAsync(src).then(parseHarnessResult);
  }

  function noHarnessFeedback() {
    return { ok: false, passed: [], failed: ["No grading harness is registered for this step yet."], warnings: [], error: null, traceback: null };
  }

  // Teacher-only escape hatch: sometimes a student's code is genuinely
  // correct but the grader throws a spurious error anyway (a bug) - typing
  // the right code here marks the CURRENT step actually "completed" (never
  // "skipped" - Skip is a distinct, visually-marked state elsewhere) and
  // re-runs the exact same post-pass refresh a normal grade success
  // triggers, so Required unlocking / Bonus availability / the Play tab's
  // capabilities all update identically to a real pass.
  //
  // IMPORTANT (disclosed, not hidden): this whole site ships as plain
  // client-side JavaScript any student can open in dev tools, so this code
  // is not a real secret - a curious student could find the literal string
  // below and use it themselves. That's an accepted tradeoff for what this
  // is: a low-friction, accidental-discovery-deterrent convenience for a
  // teacher mid-class, NOT a security boundary. Deliberately not making it
  // MORE discoverable than necessary (unobtrusive link, no code shown in
  // any visible label) is the right amount of caution for that scope - not
  // pretending it's actually secret.
  var TEACHER_OVERRIDE_CODE = "0924";

  function applyTeacherOverride(id) {
    var step = STEP_BY_ID[id];
    var stepData = state.steps[id];
    stepData.attempts += 1;
    stepData.status = "completed";
    stepData.lastFeedback = {
      ok: true,
      passed: ["Marked complete by teacher override - not a real grading pass."],
      failed: [], warnings: [], error: null, traceback: null,
    };
    persist();
    pendingVizTrigger = "grade";
    renderAll();
    if (typeof PlayEngine !== "undefined") PlayEngine.refresh();
  }

  function promptTeacherOverride(id) {
    var entered = window.prompt("Grading trouble? Enter the code from your teacher to mark this step complete.");
    if (entered === null) return; // cancelled
    if (entered.trim() === TEACHER_OVERRIDE_CODE) {
      applyTeacherOverride(id);
    } else if (entered.trim() !== "") {
      window.alert("That code didn't work.");
    }
  }

  // ---------------------------------------- 10. behaviour harnesses
  //
  // Every harness wraps the student's snippet with buildFnSource(...) (see
  // section 1) and inspects the result via the function's return value
  // (a dict from `locals()`, or an early explicit return). None of the
  // strings below are "the answer" for a TODO — they are hand-built test
  // scaffolds (fake Cell/Maze/Player stand-ins) and assertions against
  // expected OBSERVABLE BEHAVIOUR.

  var PY_PRELUDE = "import json, base64, traceback\n";

  // TODO 2 grades WHAT HAPPENS to the player, never HOW the student got
  // there: a student who bypasses try_move entirely and inlines their own
  // row/col math and their own wall check still passes, as long as the
  // final position and moved are correct (same philosophy as Reach the
  // Star). The inputs are the arrow keys and the classroom bluetooth
  // controller's E/F/C/D (left/right/up/down); WASD is not used.
  function harness_movement_2(code) {
    var fnSrc = buildFnSource("self, pygame, keys, moved", code, "    ");
    return [
      PY_PRELUDE,
      b64Line("FN_SRC", fnSrc),
      "START_ROW = 2",
      "START_COL = 2",
      "DELTA = {'top': (-1, 0), 'right': (0, 1), 'bottom': (1, 0), 'left': (0, -1)}",
      "def _run():",
      "    result = {'ok': False, 'passed': [], 'failed': [], 'error': None, 'traceback': None}",
      "    class FakeCell:",
      "        def __init__(self, walls):",
      "            self.walls = walls",
      "    class FakeMaze:",
      // Independent reference maze: every cell is open EXCEPT the
      // player's own starting cell, which blocks whichever
      // direction(s) a given test case names. Good enough to check
      // real outcomes without depending on the student's own TODO 3/4.
      "        def __init__(self, blocked_dirs):",
      "            self.blocked_dirs = blocked_dirs",
      "        def get_cell(self, row, col):",
      "            if row == START_ROW and col == START_COL:",
      "                return FakeCell({d: (d in self.blocked_dirs) for d in DELTA})",
      "            return FakeCell({d: False for d in DELTA})",
      "    class FakePlayer:",
      // A correct, independent REFERENCE try_move - not the
      // student's own code - used only so a student who correctly
      // calls self.player.try_move(...) sees correct behaviour back.
      "        def __init__(self):",
      "            self.row = START_ROW",
      "            self.col = START_COL",
      "        def try_move(self, direction, maze):",
      "            current = maze.get_cell(self.row, self.col)",
      "            if current is None or current.walls[direction]:",
      "                return False",
      "            dr, dc = DELTA[direction]",
      "            self.row += dr",
      "            self.col += dc",
      "            return True",
      "    class Pygame:",
      "        K_LEFT = 1; K_e = 2; K_RIGHT = 3; K_f = 4",
      "        K_UP = 5; K_c = 6; K_DOWN = 7; K_d = 8",
      "    class SelfObj:",
      "        pass",
      "    ns = {}",
      "    try:",
      "        exec(compile(FN_SRC, '<student>', 'exec'), {}, ns)",
      "    except SyntaxError as e:",
      "        line = max(1, (e.lineno or 1) - 1)",
      "        result['error'] = 'Python syntax error on line %s: %s.' % (line, e.msg)",
      "        return json.dumps(result)",
      "    _fn = ns['_fn']",
      "    def run_case(pressed, blocked_dirs=()):",
      "        pygame = Pygame()",
      "        player = FakePlayer()",
      "        maze = FakeMaze(set(blocked_dirs))",
      "        self = SelfObj()",
      "        self.player = player",
      "        self.maze = maze",
      "        key_names = ['K_LEFT', 'K_e', 'K_RIGHT', 'K_f', 'K_UP', 'K_c', 'K_DOWN', 'K_d']",
      "        keys = {}",
      "        for name in key_names:",
      "            keys[getattr(pygame, name)] = name in pressed",
      "        out = _fn(self, pygame, keys, False)",
      "        if not isinstance(out, dict):",
      "            return 'RETURNED_EARLY', None, None",
      "        return (player.row, player.col), out.get('moved', False), None",
      "    try:",
      "        cases = [",
      "            ('no keys pressed: stays put', [], (), (START_ROW, START_COL), False),",
      "            ('LEFT moves one cell left', ['K_LEFT'], (), (START_ROW, START_COL - 1), True),",
      "            ('E (controller left) moves one cell left', ['K_e'], (), (START_ROW, START_COL - 1), True),",
      "            ('RIGHT moves one cell right', ['K_RIGHT'], (), (START_ROW, START_COL + 1), True),",
      "            ('F (controller right) moves one cell right', ['K_f'], (), (START_ROW, START_COL + 1), True),",
      "            ('UP moves one cell up', ['K_UP'], (), (START_ROW - 1, START_COL), True),",
      "            ('C (controller up) moves one cell up', ['K_c'], (), (START_ROW - 1, START_COL), True),",
      "            ('DOWN moves one cell down', ['K_DOWN'], (), (START_ROW + 1, START_COL), True),",
      "            ('D (controller down) moves one cell down', ['K_d'], (), (START_ROW + 1, START_COL), True),",
      "            ('a wall blocks the move (stays put)', ['K_LEFT'], ('left',), (START_ROW, START_COL), False),",
      "        ]",
      "        for label, pressed, blocked, expect_pos, expect_moved in cases:",
      "            pos, moved, _ = run_case(pressed, blocked)",
      "            if pos == 'RETURNED_EARLY':",
      "                result['failed'].append('%s: your code used return and exited update_player early. Remove any stray return statement.' % label)",
      "            elif pos != expect_pos:",
      "                result['failed'].append('%s: expected the player to end up at (row, col) = %s, got %s.' % (label, expect_pos, pos))",
      "            elif moved != expect_moved:",
      "                result['failed'].append('%s: the player ended up in the right place, but moved should be %r, got %r.' % (label, expect_moved, moved))",
      "            else:",
      "                result['passed'].append(label)",
      "        # Two opposite keys at once: exactly one direction should win",
      "        # (if/elif, not separate independent ifs) - accept EITHER",
      "        # neighbor, since which branch wins when both are held is a",
      "        # legitimate implementation choice, not something to grade.",
      "        pos, moved, _ = run_case(['K_LEFT', 'K_RIGHT'])",
      "        valid_positions = [(START_ROW, START_COL - 1), (START_ROW, START_COL + 1)]",
      "        if pos == 'RETURNED_EARLY':",
      "            result['failed'].append('Pressing LEFT and RIGHT together: your code used return and exited update_player early.')",
      "        elif pos not in valid_positions:",
      "            result['failed'].append('Pressing LEFT and RIGHT together should still move exactly one cell (use if/elif, not separate if statements); expected one of %s, got %s.' % (valid_positions, pos))",
      "        else:",
      "            result['passed'].append('Only one direction wins when multiple keys are pressed together.')",
      "    except Exception as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  function harness_guardClause_3(code) {
    var fnSrc = buildFnSource("current, direction", code, "    ");
    return [
      PY_PRELUDE,
      PY_BONUS_HELPERS,
      b64Line("FN_SRC", fnSrc),
      "def _run_inner():",
      "    result = {'ok': False, 'passed': [], 'failed': [], 'warnings': [], 'error': None, 'traceback': None}",
      "    class Cell:",
      "        def __init__(self):",
      "            self.walls = {'top': False, 'right': False, 'bottom': False, 'left': False}",
      "    ns = {}",
      "    try:",
      "        exec(compile(FN_SRC, '<student>', 'exec'), {}, ns)",
      "    except SyntaxError as e:",
      "        line = max(1, (e.lineno or 1) - 1)",
      "        result['error'] = 'Python syntax error on line %s: %s.' % (line, e.msg)",
      "        return json.dumps(result)",
      // Every call to the student's body goes through the line-budget guard,
      // so a `while True` here is a graded failure rather than a frozen tab.
      "    _raw_fn = ns['_fn']",
      "    def _fn(*args):",
      "        return _run_guarded(_raw_fn, args)",
      "    try:",
      "        r1 = _fn(None, 'left')",
      "        if r1 is False:",
      "            result['passed'].append('current=None correctly returns False')",
      "        else:",
      "            result['failed'].append('When current is None, your code should return False, but it fell through instead. Check `current is None`.')",
      "        c2 = Cell(); c2.walls['left'] = True",
      "        r2 = _fn(c2, 'left')",
      "        if r2 is False:",
      "            result['passed'].append('a wall in the movement direction correctly returns False')",
      "        else:",
      "            result['failed'].append('A wall blocks direction \"left\" but your code did not return False. Check current.walls[direction].')",
      "        c3 = Cell()",
      "        r3 = _fn(c3, 'left')",
      "        if isinstance(r3, dict):",
      "            result['passed'].append('an open direction correctly falls through without returning')",
      "        else:",
      "            result['failed'].append('When the path is open, your code should NOT return False (it should fall through to the rest of try_move), but it returned early.')",
      "        c4 = Cell(); c4.walls['top'] = True",
      "        r4 = _fn(c4, 'left')",
      "        if isinstance(r4, dict):",
      "            result['passed'].append('a wall in a different direction does not block this move')",
      "        else:",
      "            result['failed'].append('Only current.walls[direction] should block the move, not a wall in another direction.')",
      "    except BaseException as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "def _run():",
      "    return _finish_or_report(_run_inner)",
      "_run()",
    ].join("\n");
  }

  function harness_positionDelta_4(code) {
    var fnSrc = buildFnSource("self, dr, dc", code, "    ");
    return [
      PY_PRELUDE,
      PY_BONUS_HELPERS,
      b64Line("FN_SRC", fnSrc),
      "def _run_inner():",
      "    result = {'ok': False, 'passed': [], 'failed': [], 'warnings': [], 'error': None, 'traceback': None}",
      "    class SelfObj:",
      "        def __init__(self):",
      "            self.row = 5",
      "            self.col = 5",
      "    ns = {}",
      "    try:",
      "        exec(compile(FN_SRC, '<student>', 'exec'), {}, ns)",
      "    except SyntaxError as e:",
      "        line = max(1, (e.lineno or 1) - 1)",
      "        result['error'] = 'Python syntax error on line %s: %s.' % (line, e.msg)",
      "        return json.dumps(result)",
      // Guarded like every other student-code call: a runaway loop becomes a
      // graded failure instead of a hung browser tab.
      "    _raw_fn = ns['_fn']",
      "    def _fn(*args):",
      "        return _run_guarded(_raw_fn, args)",
      "    cases = [",
      "        ('top', -1, 0, 4, 5),",
      "        ('right', 0, 1, 5, 6),",
      "        ('bottom', 1, 0, 6, 5),",
      "        ('left', 0, -1, 5, 4),",
      "    ]",
      "    try:",
      "        for direction, dr, dc, exp_row, exp_col in cases:",
      "            self = SelfObj()",
      "            _fn(self, dr, dc)",
      "            if self.row == exp_row and self.col == exp_col:",
      "                result['passed'].append('direction %s updates (row, col) to (%d, %d)' % (direction, exp_row, exp_col))",
      "            elif self.row != exp_row and self.col == exp_col:",
      "                result['failed'].append('direction %s: row is wrong (expected %d, got %d) though col is right. The row update is not changing by the right amount.' % (direction, exp_row, self.row))",
      "            elif self.row == exp_row and self.col != exp_col:",
      "                result['failed'].append('direction %s: col is wrong (expected %d, got %d) though row is right. The column update is not changing by the right amount.' % (direction, exp_col, self.col))",
      "            else:",
      "                result['failed'].append('direction %s: expected (row, col) = (%d, %d), got (%d, %d).' % (direction, exp_row, exp_col, self.row, self.col))",
      "    except BaseException as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "def _run():",
      "    return _finish_or_report(_run_inner)",
      "_run()",
    ].join("\n");
  }

  // Required Dijkstra relaxation, split into two independently-graded parts
  // (TODO 5 Part 1/2 and Part 2/2 - the same coupling-aware split pattern
  // TODO 9 uses for images/sounds, except these two parts genuinely depend
  // on each other: Part 2's code uses new_cost, which Part 1 computes).
  // Each part gets its OWN isolated test: Part 1 is graded purely on
  // whether it computes new_cost correctly from (cost, step_cost); Part 2
  // is graded by supplying new_cost directly as an input (NOT by running
  // Part 1's code first), so a mistake in either part is attributed
  // specifically to that part - a correct Part 1 + broken Part 2 fails
  // only on Part 2's cases, and vice versa. heapq is exposed to Part 2's
  // isolated scope so heapq.heappush works exactly like the real function.
  function harness_dijkstra_5(code1, code2) {
    var fn1Src = buildFnSource("cost, step_cost", code1, "    ");
    var fn2Src = buildFnSource("new_cost, neighbor, current, distance, parent, queue", code2, "    ");
    return [
      PY_PRELUDE + "import heapq",
      PY_BONUS_HELPERS,
      b64Line("FN1_SRC", fn1Src),
      b64Line("FN2_SRC", fn2Src),
      "def _run_inner():",
      "    result = {'ok': False, 'passed': [], 'failed': [], 'warnings': [], 'error': None, 'traceback': None}",
      "    ns1 = {}",
      "    ns2 = {}",
      "    try:",
      "        exec(compile(FN1_SRC, '<student-part1>', 'exec'), {}, ns1)",
      "    except SyntaxError as e:",
      "        line = max(1, (e.lineno or 1) - 1)",
      "        result['error'] = 'Part 1: Python syntax error on line %s: %s.' % (line, e.msg)",
      "        return json.dumps(result)",
      "    try:",
      "        exec(compile(FN2_SRC, '<student-part2>', 'exec'), {'heapq': heapq}, ns2)",
      "    except SyntaxError as e:",
      "        line = max(1, (e.lineno or 1) - 1)",
      "        result['error'] = 'Part 2: Python syntax error on line %s: %s.' % (line, e.msg)",
      "        return json.dumps(result)",
      // Both parts run behind the line-budget guard, so a loop that never
      // ends is reported as a failure instead of freezing the browser.
      "    _raw_fn1 = ns1['_fn']",
      "    _raw_fn2 = ns2['_fn']",
      "    def _fn1(*args):",
      "        return _run_guarded(_raw_fn1, args)",
      "    def _fn2(*args):",
      "        return _run_guarded(_raw_fn2, args)",
      "    try:",
      "        cost_cases = [",
      "            ('cost=0, step_cost=5', 0, 5),",
      "            ('cost=10, step_cost=7', 10, 7),",
      "            ('cost=3, step_cost=3', 3, 3),",
      "            ('cost=-20, step_cost=5 (negative-weight case)', -20, 5),",
      "        ]",
      "        for label, cost, step_cost in cost_cases:",
      "            out = _fn1(cost, step_cost)",
      "            expected = cost + step_cost",
      "            got = out.get('new_cost') if isinstance(out, dict) else None",
      "            if got == expected:",
      "                result['passed'].append('Part 1 (%s): new_cost == %r' % (label, expected))",
      "            else:",
      "                result['failed'].append('Part 1 (%s): expected new_cost == %r, got %r.' % (label, expected, got))",
      "    except BaseException as e:",
      "        result['error'] = 'Part 1: %s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "        return json.dumps(result)",
      "    try:",
      "        route_cases = [",
      "            ('fresh neighbor', {}, {}, 'B', 'A', 5),",
      "            ('improving neighbor', {'D': 10}, {'D': 'X'}, 'D', 'C', 2),",
      "            ('non-improving neighbor', {'E': 3}, {'E': 'Y'}, 'E', 'X', 10),",
      "            ('negative-weight cost', {'Z': 40}, {'Z': 'Y'}, 'Z', 'W', -15),",
      "        ]",
      "        for label, dist0, par0, neighbor, current, new_cost in route_cases:",
      "            distance = dict(dist0)",
      "            parent = dict(par0)",
      "            queue = []",
      "            should_improve = (neighbor not in distance) or new_cost < distance[neighbor]",
      "            _fn2(new_cost, neighbor, current, distance, parent, queue)",
      "            if should_improve:",
      "                ok_d = distance.get(neighbor) == new_cost",
      "                ok_p = parent.get(neighbor) == current",
      "                ok_q = any(isinstance(q, tuple) and len(q) == 2 and q[0] == new_cost and q[1] == neighbor for q in queue)",
      "                if ok_d and ok_p and ok_q:",
      "                    result['passed'].append('Part 2 (%s): distance/parent updated and the improved route was pushed to the queue' % label)",
      "                else:",
      "                    msgs = []",
      "                    if not ok_d:",
      "                        msgs.append('distance[%r] is %r, expected %r' % (neighbor, distance.get(neighbor), new_cost))",
      "                    if not ok_p:",
      "                        msgs.append('parent[%r] is %r, expected %r' % (neighbor, parent.get(neighbor), current))",
      "                    if not ok_q:",
      "                        msgs.append('the improved (new_cost, neighbor) tuple was not pushed to the queue with heapq.heappush')",
      "                    result['failed'].append('Part 2 (%s): %s.' % (label, '; '.join(msgs)))",
      "            else:",
      "                ok_d = distance.get(neighbor) == dist0[neighbor]",
      "                ok_p = parent.get(neighbor) == par0[neighbor]",
      "                if ok_d and ok_p:",
      "                    result['passed'].append('Part 2 (%s): correctly left unchanged since it was not an improvement' % label)",
      "                else:",
      "                    result['failed'].append('Part 2 (%s): distance/parent were changed even though new_cost was not an improvement over the existing distance[%r]=%r.' % (label, neighbor, dist0[neighbor]))",
      "    except BaseException as e:",
      "        result['error'] = 'Part 2: %s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "def _run():",
      "    return _finish_or_report(_run_inner)",
      "_run()",
    ].join("\n");
  }

  // D1/D4/F changelog note: this file used to also define
  // harness_score_6/harness_score_7 (treasure/swamp score grading) and
  // harness_monsterFsm_13/harness_monsterChase_14 (monster FSM/chase
  // grading) here. All four were deleted along with the features they
  // graded - the monster was removed entirely (teacher: "monster attacks
  // by distance - remove this"), and score/treasure/swamp were removed
  // when the game was redefined as pure maze-solving (goal + timer +
  // bomb-reset only). See BEHAVIOUR_HARNESSES below for the current,
  // renumbered set.

  var BEHAVIOUR_HARNESSES = {
    movement_2: harness_movement_2,
    guardClause_3: harness_guardClause_3,
    positionDelta_4: harness_positionDelta_4,
    dijkstra_5: harness_dijkstra_5,
    roundDesign_8: harness_roundDesign_8,
    lookAndFeel_9: harness_lookAndFeel_9,
    customItems_10: harness_customItems_10,
    gameRules_11: harness_gameRules_11,
  };

  // ------------------------------------------------- 11. syntax harnesses
  //
  // These are the open-ended TODOs (1, 6, 7, 9): there is no single
  // "correct" value, so passing only requires two things:
  //   1. the code compiles and executes without a Python error, and
  //   2. every name in mustDefine actually got defined (so nothing crashes
  //      later when the real game imports this file).
  // Anything beyond that (types, ranges, "did you change it from the
  // starter") is reported as a non-blocking `warnings` note (a friendly
  // heads-up, shown with a ! mark) rather than a `failed` gate — it never
  // affects `ok` / step completion. This intentionally does NOT check for
  // a specific value anywhere, so nothing here can leak a solution.

  function pySyntaxPrelude(code, starter) {
    return [
      "import json, base64, traceback",
      b64Line("CODE", code),
      b64Line("STARTER", starter || ""),
      // Safe, length-capped repr for echoing back "here's what you wrote"
      // notes without ever risking an exception from a surprising type.
      "def _short_repr(v):",
      "    try:",
      "        r = repr(v)",
      "    except Exception:",
      "        r = '<value of type %s>' % type(v).__name__",
      "    return r if len(r) <= 70 else r[:67] + '...'",
    ].join("\n");
  }

  function harness_syntax_1(code) {
    var starter = linesOf(STEP_BY_ID["1"].starter);
    return [
      pySyntaxPrelude(code, starter),
      "def _run():",
      "    result = {'ok': False, 'passed': [], 'failed': [], 'warnings': [], 'error': None, 'traceback': None}",
      "    try:",
      "        compile(CODE, '<student>', 'exec')",
      "    except SyntaxError as e:",
      "        result['error'] = 'Python syntax error on line %s: %s.' % (e.lineno, e.msg)",
      "        return json.dumps(result)",
      "    try:",
      "        ns = {}",
      "        exec(compile(CODE, '<student>', 'exec'), {}, ns)",
      "        names = ['TITLE', 'GAME_SUBTITLE']",
      "        missing = [n for n in names if n not in ns]",
      "        if missing:",
      "            result['failed'].append('Missing definition(s): %s. Keep the variable names exactly as given.' % ', '.join(missing))",
      "        else:",
      "            result['passed'].append('Both are defined: TITLE=%s, GAME_SUBTITLE=%s.' % (_short_repr(ns['TITLE']), _short_repr(ns['GAME_SUBTITLE'])))",
      "            if not isinstance(ns['TITLE'], str) or not isinstance(ns['GAME_SUBTITLE'], str):",
      "                result['warnings'].append('Heads up: TITLE and GAME_SUBTITLE are usually plain strings — this still counts as complete, but double-check it looks right in the title-screen preview.')",
      "    except BaseException as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  // ---- shared helpers for the multi-part Bonus harnesses ---------------
  //
  // TODO 8 and TODO 9 and TODO 10 and TODO 11 each mix "settings block" parts (module-level
  // constants in settings.py) with "method body" parts (real code in
  // game.py), so they are all BEHAVIOUR harnesses that need the same few
  // things: run a settings block safely, run a student method body safely,
  // and describe a value without ever raising.
  //
  // _run_guarded is the important one. Every previous behaviour harness
  // owned its own loop and could enforce a step budget directly; these new
  // parts hand the loop to the STUDENT (`for row, col in ...`, and a
  // `while` is entirely plausible), and Pyodide runs on the UI thread, so
  // one runaway loop would freeze the whole tab with no way back. A
  // line-counting trace function turns that into an ordinary graded
  // failure after a fixed budget instead.
  var PY_BONUS_HELPERS = [
    "import sys",
    "class _StepBudget(Exception):",
    // Carries its own explanation so even a harness that only has a
    // catch-all `except Exception` still tells the student something
    // useful instead of printing a bare class name.
    "    def __str__(self):",
    "        return ('your code was still running after a very long time, so it was stopped. '",
    "                'This almost always means a loop that never ends - check that every '",
    "                'while loop can actually reach its stopping condition.')",
    "def _run_guarded(fn, args, budget=300000):",
    "    counter = [0]",
    "    def _tracer(frame, event, arg):",
    "        counter[0] += 1",
    "        if counter[0] > budget:",
    "            raise _StepBudget()",
    "        return _tracer",
    "    sys.settrace(_tracer)",
    "    try:",
    "        return fn(*args)",
    "    finally:",
    "        sys.settrace(None)",
    "def _short_repr(v):",
    "    try:",
    "        r = repr(v)",
    "    except Exception:",
    "        r = '<value of type %s>' % type(v).__name__",
    "    return r if len(r) <= 70 else r[:67] + '...'",
    "IMAGE_EXT = ('.png', '.jpg', '.jpeg', '.gif', '.bmp')",
    "SOUND_EXT = ('.wav', '.mp3', '.ogg')",
    "def _new_result():",
    "    return {'ok': False, 'passed': [], 'failed': [], 'warnings': [], 'error': None, 'traceback': None}",
    // Run one settings block. Returns its namespace, or None after recording
    // the error (syntax errors are reported against the student's own line
    // numbers, since a settings block is spliced in verbatim).
    "def _exec_settings(result, code, label):",
    "    try:",
    "        compile(code, '<student>', 'exec')",
    "    except SyntaxError as e:",
    "        result['error'] = '%s: Python syntax error on line %s: %s.' % (label, e.lineno, e.msg)",
    "        return None",
    "    ns = {}",
    "    def _go():",
    "        exec(compile(code, '<student>', 'exec'), {}, ns)",
    "    try:",
    // Settings blocks are ordinary top-level code, and a student can just
    // as easily leave a `while True` there as in a method body - so this
    // runs behind the same line budget as everything else.
    "        _run_guarded(_go, ())",
    "    except _StepBudget as e:",
    "        result['error'] = '%s: %s' % (label, e)",
    "        return None",
    // BaseException, not Exception: sys.exit() / exit() / quit() raise
    // SystemExit and Ctrl-C style code raises KeyboardInterrupt, neither of
    // which is an Exception. Letting those through would escape the whole
    // harness and surface as "The grading engine could not run", which
    // tells a student nothing.
    "    except BaseException as e:",
    "        result['error'] = '%s: %s: %s' % (label, type(e).__name__, e)",
    "        result['traceback'] = traceback.format_exc()",
    "        return None",
    "    return ns",
    // Compile a buildFnSource()-wrapped method body into a callable. The
    // wrapper adds one `def _fn(...)` line, so reported line numbers are
    // shifted back by one to match what the student sees in the editor.
    "def _compile_body(result, src, label):",
    "    ns = {}",
    "    try:",
    "        exec(compile(src, '<student>', 'exec'), {}, ns)",
    "    except SyntaxError as e:",
    "        line = max(1, (e.lineno or 1) - 1)",
    "        result['error'] = '%s: Python syntax error on line %s: %s.' % (label, line, e.msg)",
    "        return None",
    "    except BaseException as e:",
    "        result['error'] = '%s: %s: %s' % (label, type(e).__name__, e)",
    "        result['traceback'] = traceback.format_exc()",
    "        return None",
    "    return ns.get('_fn')",
    // Call a student body for one test case. Returns (ok, message): every
    // possible failure mode - raising, looping forever, anything - comes
    // back as a sentence a student can act on, never as a dead tab.
    "def _call_body(fn, args, label):",
    "    try:",
    "        _run_guarded(fn, args)",
    "        return True, None",
    "    except _StepBudget:",
    "        return False, ('%s: your code was still running after a very long time, so it was stopped. '",
    "                       'This almost always means a loop that never ends - check that every while loop '",
    "                       'can actually reach its stopping condition.') % label",
    // BaseException so sys.exit()/exit()/quit()/KeyboardInterrupt are graded
    // like any other mistake instead of escaping the harness entirely.
    "    except BaseException as e:",
    "        return False, '%s: raised %s: %s' % (label, type(e).__name__, e)",
    "def _check_path(result, label, val, folder, known):",
    "    exts = IMAGE_EXT if folder == 'assets/images/' else SOUND_EXT",
    "    if val is None:",
    "        return",
    "    if not isinstance(val, str):",
    "        result['warnings'].append('Heads up: %s should be None or a string path — this still counts as complete, but the real game will error when it tries to load this.' % label)",
    "        return",
    "    norm = val.replace(chr(92), '/')",
    "    if not norm.startswith(folder) or not norm.lower().endswith(exts):",
    "        result['warnings'].append(\"Heads up: %s = %s doesn't look like a path under %s with a valid extension — double-check it, though this still counts as complete.\" % (label, _short_repr(val), folder))",
    "        return",
    "    base = norm.rsplit('/', 1)[-1]",
    "    if base not in known:",
    "        result['warnings'].append(\"%s = %s — this isn't one of the bundled files, but it will work once you add your own file at that path.\" % (label, _short_repr(val)))",
    "def _check_color(result, label, val):",
    "    if not (isinstance(val, tuple) and len(val) == 3 and all(isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= 255 for v in val)):",
    "        result['warnings'].append('Heads up: %s is usually a 3-tuple of ints 0-255, e.g. (37, 99, 235) — this still counts as complete, but double-check it renders correctly in the Play tab.' % label)",
    "def _check_number(result, label, val, types, low=None, high=None):",
    "    if isinstance(val, bool) or not isinstance(val, types):",
    "        result['warnings'].append('Heads up: %s = %s is not the expected number type — this still counts as complete, but double-check it in the Play tab.' % (label, _short_repr(val)))",
    "        return",
    "    if (low is not None and val < low) or (high is not None and val > high):",
    "        result['warnings'].append('Heads up: %s = %s is outside its usual range — this still counts as complete, but double-check it behaves as expected.' % (label, _short_repr(val)))",
    "def _finish(result):",
    "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
    "    return json.dumps(result)",
    // Last line of defence. Student code runs behind _call_body/_exec_settings,
    // but what a harness does AFTERWARDS - reading self.player, self.items,
    // game.game_clear and so on - is not itself guarded, and code that
    // deletes or replaces those attributes makes the checker fall over
    // instead of grading. This wraps the whole run so any such escape
    // becomes an ordinary, explained failure.
    "def _finish_or_report(fn):",
    "    try:",
    "        return fn()",
    "    except BaseException as e:",
    "        r = _new_result()",
    "        r['error'] = ('The checker could not finish, because your code changed something it "
      + "needed to look at afterwards (%s: %s). Check that you are not deleting or replacing "
      + "things the game relies on, like self.player or self.items.') % (type(e).__name__, e)",
    "        try:",
    "            r['traceback'] = traceback.format_exc()",
    "        except BaseException:",
    "            pass",
    "        return json.dumps(r)",
  ].join("\n");

  // A minimal stand-in for the pygame API the student's game.py code can
  // touch, recording every call so a harness can report what happened
  // without needing real audio (or a real display) in the browser.
  var PY_FAKE_PYGAME = [
    "class _FakePygameError(Exception):",
    "    pass",
    "class _FakeSound(object):",
    "    def __init__(self, log, path):",
    "        self._log = log; self.path = path",
    "    def play(self, *a, **k):",
    "        self._log.append(('sound_play', self.path))",
    "    def set_volume(self, v):",
    "        self._log.append(('sound_volume', v))",
    "class _FakeMusic(object):",
    "    def __init__(self, log, fail_on_load=False):",
    "        self._log = log; self._fail = fail_on_load",
    "    def load(self, path):",
    "        self._log.append(('music_load', path))",
    "        if self._fail:",
    "            raise _FakePygameError('No file ' + str(path))",
    "    def set_volume(self, v):",
    "        self._log.append(('music_volume', v))",
    "    def play(self, *a, **k):",
    "        self._log.append(('music_play', a, sorted(k.items())))",
    "    def stop(self):",
    "        self._log.append(('music_stop',))",
    "    def fadeout(self, ms):",
    "        self._log.append(('music_fadeout', ms))",
    "    def queue(self, path):",
    "        self._log.append(('music_queue', path))",
    "class _FakeMixer(object):",
    "    def __init__(self, log, fail_on_load=False, inited=False):",
    "        self._log = log; self._inited = inited",
    "        self.music = _FakeMusic(log, fail_on_load)",
    "    def get_init(self):",
    "        return self._inited",
    "    def init(self, *a, **k):",
    "        self._inited = True; self._log.append(('mixer_init',))",
    "    def quit(self):",
    "        self._inited = False",
    "    def Sound(self, path):",
    "        self._log.append(('sound_load', path)); return _FakeSound(self._log, path)",
    "class _FakeTime(object):",
    "    def __init__(self):",
    "        self._t = 1000",
    "    def get_ticks(self):",
    "        self._t += 16; return self._t",
    "    def delay(self, ms):",
    "        pass",
    "class _FakePygame(object):",
    "    error = _FakePygameError",
    "    def __init__(self, log, fail_on_load=False, inited=False):",
    "        self.mixer = _FakeMixer(log, fail_on_load, inited)",
    "        self.time = _FakeTime()",
  ].join("\n");

  // ---- TODO 8: rounds + pacing + placement -----------------------------
  //
  // Parts 1 and 2 are the old open-ended settings checks, with one real
  // change: ROUND_CONFIGS is no longer pinned to exactly 3 rounds, because
  // students are now explicitly invited to add or remove rounds. Part 3 is
  // the placement code, run for real against a stand-in Game.
  // Six parts since the Bonus split: 1 ROUND_CONFIGS, 2 the walking speed,
  // 3 the two hint settings, 4/5/6 the placement code in game.py. Parts 4-6
  // are three consecutive statement groups inside ONE method, so they are
  // compiled individually (so an indent slip is blamed on the right part)
  // and then joined and RUN as the single body the real game would execute.
  // `focus` (the trailing argument) is the ONE sub-step being graded:
  // "1" grades TODO 8-1 and nothing else. Passing null/undefined grades
  // the whole group at once, which is what the regression tests do.
  //
  // Focusing matters because the six sub-steps are independent steps in
  // the sidebar but NOT independent code: 8-4/8-5/8-6 are three
  // consecutive statement groups of one create_game_objects() body, so
  // the group's code is always spliced back together before it runs -
  // only the reporting and the pass/fail decision are narrowed.
  function harness_roundDesign_8(code1, code2, code3, code4, code5, code6, code7, code8, focus) {
    var F = (focus === undefined || focus === null || focus === "") ? null : String(focus);
    function want(n) { return F === null || F === String(n); }
    var out = [];
    function push(arr) { for (var i = 0; i < arr.length; i++) out.push(arr[i]); }
    var placeParams = "self, forbidden, create_random_positions, CustomItem, Bomb, random, CUSTOM_ITEMS";
    push([
      PY_PRELUDE,
      PY_BONUS_HELPERS,
      b64Line("CODE1", code1),
      b64Line("CODE2", code2),
      b64Line("CODE3", code3),
      b64Line("CODE7", code7),
      b64Line("CODE8", code8),
      b64Line("FN4_SRC", buildFnSource(placeParams, code4, "    ")),
      b64Line("FN5_SRC", buildFnSource(placeParams, code5, "    ")),
      b64Line("FN6_SRC", buildFnSource(placeParams, code6, "    ")),
      b64Line("FN_PLACE_SRC", buildFnSourceParts(placeParams, [code4, code5, code6], "    ")),
      "ROUND_KEYS = " + JSON.stringify(ROUND_CONFIG_KEY_ORDER).replace(/"/g, "'"),
      "MAX_ROUNDS_UI = " + MAX_DESIGNABLE_ROUNDS,
      "import random as _rnd",
      "class _StubActor(object):",
      "    def __init__(self, pos):",
      "        self._pos = pos",
      "    def get_position(self):",
      "        return self._pos",
      "class _StubItem(object):",
      "    def __init__(self, row, col, cell_size, item_def):",
      "        self.row = row; self.col = col; self.cell_size = cell_size",
      "        self.item_def = item_def; self.active = True",
      "    def get_position(self):",
      "        return (self.row, self.col)",
      "class _StubBomb(object):",
      "    def __init__(self, row, col, cell_size):",
      "        self.row = row; self.col = col; self.cell_size = cell_size",
      "        self.state = 'ACTIVE'",
      "    def get_position(self):",
      "        return (self.row, self.col)",
      "class _StubGame(object):",
      "    def __init__(self, config, start, goal, round_index):",
      "        self.config = config",
      "        self.player = _StubActor(start)",
      "        self.goal = _StubActor(goal)",
      "        self.items = None",
      "        self.bombs = None",
      "        self.current_round = round_index",
      "        self.objects_created = False",
      "        self.start_time = None",
      "def _stub_create_random_positions(rows, cols, count, forbidden):",
      "    cands = [(r, c) for r in range(rows) for c in range(cols) if (r, c) not in forbidden]",
      "    _rnd.shuffle(cands)",
      "    try:",
      "        n = int(count)",
      "    except Exception:",
      "        n = 0",
      "    if n < 0:",
      "        n = 0",
      "    return cands[:n]",
      "STUB_ITEMS = [",
      "    {'name': 'A', 'color': (1, 2, 3), 'image': None, 'sound': None, 'size': 1.0, 'effect': 'add_time', 'amount': 5},",
      "    {'name': 'B', 'color': (4, 5, 6), 'image': None, 'sound': None, 'size': 1.0, 'effect': 'add_hint', 'amount': 1},",
      "]",
      "def _run_inner():",
      "    result = _new_result()",
      "    _rnd.seed(20260729)",
    ]);
    // ---------------- TODO 8-1: ROUND_CONFIGS
    if (want(1)) push([
      "    ns1 = _exec_settings(result, CODE1, 'TODO 8-1')",
      "    if ns1 is None:",
      "        return _finish(result)",
      "    if 'ROUND_CONFIGS' not in ns1:",
      "        result['failed'].append('TODO 8-1: Missing definition: ROUND_CONFIGS. Keep the variable name exactly as given.')",
      "    else:",
      "        rc = ns1['ROUND_CONFIGS']",
      "        if not isinstance(rc, list) or len(rc) == 0:",
      "            result['warnings'].append('Heads up: ROUND_CONFIGS is usually a non-empty list of round dictionaries — this still counts as complete, but the game needs at least one round to play.')",
      "            result['passed'].append('TODO 8-1: ROUND_CONFIGS is defined.')",
      "        else:",
      "            result['passed'].append('TODO 8-1: ROUND_CONFIGS is defined with %d round(s).' % len(rc))",
      "            if len(rc) > MAX_ROUNDS_UI:",
      "                result['warnings'].append('You designed %d rounds. The downloaded pygame game plays all of them, but the map editor and Play tab here only show the first %d.' % (len(rc), MAX_ROUNDS_UI))",
      "            ref_keys = set(ROUND_KEYS)",
      "            for i, rd in enumerate(rc):",
      "                label = 'round %d' % (i + 1)",
      "                if not isinstance(rd, dict):",
      "                    result['warnings'].append('Heads up: %s is not a dictionary.' % label)",
      "                    continue",
      "                keys = set(rd.keys())",
      "                missing = ref_keys - keys",
      "                extra = keys - ref_keys",
      "                if missing or extra:",
      "                    msg = 'Heads up: %s has different keys than the starter.' % label",
      "                    if missing:",
      "                        msg += ' Missing: %s.' % ', '.join(sorted(missing))",
      "                    if extra:",
      "                        msg += ' Extra: %s.' % ', '.join(sorted(extra))",
      "                    result['warnings'].append(msg + ' Removing a key the engine expects can crash the game — double-check this is intentional.')",
      "                    continue",
      "                bad = [k for k, v in rd.items() if type(v) is not int]",
      "                if bad:",
      "                    result['warnings'].append('Heads up: %s has non-integer value(s) for %s — the engine expects plain integers here.' % (label, ', '.join(sorted(bad))))",
      "                    continue",
      "                if rd['rows'] < 2 or rd['cols'] < 2:",
      "                    result['warnings'].append('Heads up: %s is smaller than 2x2, which leaves no maze to solve.' % label)",
      "                cells = rd['rows'] * rd['cols']",
      "                if rd['bomb_count'] + rd['custom_item_count'] > max(0, cells - 2):",
      "                    result['warnings'].append('Heads up: %s asks for more bombs+items (%d) than it has free cells (%d) — the extras simply will not be placed.' % (label, rd['bomb_count'] + rd['custom_item_count'], max(0, cells - 2)))",
      "                result['passed'].append('%s: %s' % (label, _short_repr(rd)))",
    ]);
    // ---------------- TODO 8-2: pacing
    if (want(2)) push([
      "    ns2 = _exec_settings(result, CODE2, 'TODO 8-2')",
      "    if ns2 is None:",
      "        return _finish(result)",
      "    if 'PLAYER_MOVE_DELAY_MS' not in ns2:",
      "        result['failed'].append('TODO 8-2: Missing definition: PLAYER_MOVE_DELAY_MS. Keep the variable name exactly as given.')",
      "    else:",
      "        result['passed'].append('TODO 8-2: one step every %s ms.' % _short_repr(ns2['PLAYER_MOVE_DELAY_MS']))",
      "        _check_number(result, 'PLAYER_MOVE_DELAY_MS', ns2['PLAYER_MOVE_DELAY_MS'], int, low=0, high=2000)",
    ]);
    // ---------------- TODO 8-3: the hint settings
    if (want(3)) push([
      "    ns3 = _exec_settings(result, CODE3, 'TODO 8-3')",
      "    if ns3 is None:",
      "        return _finish(result)",
      "    hint_names = ['ALLOW_PATH_HINT', 'MAX_HINT_COUNT']",
      "    missing_hint = [n for n in hint_names if n not in ns3]",
      "    if missing_hint:",
      "        result['failed'].append('TODO 8-3: Missing definition(s): %s.' % ', '.join(missing_hint))",
      "    else:",
      "        result['passed'].append('TODO 8-3: hints %s, up to %s per round.' % (",
      "            _short_repr(ns3['ALLOW_PATH_HINT']), _short_repr(ns3['MAX_HINT_COUNT'])))",
      "        if not isinstance(ns3['ALLOW_PATH_HINT'], bool):",
      "            result['warnings'].append('Heads up: ALLOW_PATH_HINT is usually True or False — this still counts as complete, but double-check the Hint button behaves as you expect.')",
      "        _check_number(result, 'MAX_HINT_COUNT', ns3['MAX_HINT_COUNT'], int, low=0, high=99)",
    ]);
    // ---------------- TODO 8-7: the maze-building animation
    if (want(7)) push([
      "    ns7 = _exec_settings(result, CODE7, 'TODO 8-7')",
      "    if ns7 is None:",
      "        return _finish(result)",
      "    dfs_names = ['SHOW_DFS_GENERATION', 'DFS_STEPS_PER_FRAME']",
      "    missing_dfs = [n for n in dfs_names if n not in ns7]",
      "    if missing_dfs:",
      "        result['failed'].append('TODO 8-7: Missing definition(s): %s.' % ', '.join(missing_dfs))",
      "    else:",
      "        result['passed'].append('TODO 8-7: maze-building animation %s, %s cell(s) per frame.' % (",
      "            'on' if ns7['SHOW_DFS_GENERATION'] else 'off', _short_repr(ns7['DFS_STEPS_PER_FRAME'])))",
      "        if not isinstance(ns7['SHOW_DFS_GENERATION'], bool):",
      "            result['warnings'].append('Heads up: SHOW_DFS_GENERATION is usually True or False — this still counts as complete, but double-check the animation behaves as you expect.')",
      // Below 1 the builder would never finish a cell, so the round would
      // never start - a warning, not a failure, per the open-ended policy.
      "        _check_number(result, 'DFS_STEPS_PER_FRAME', ns7['DFS_STEPS_PER_FRAME'], int, low=1, high=200)",
    ]);
    // ---------------- TODO 8-8: the Hint route's bomb weights
    if (want(8)) push([
      "    ns8 = _exec_settings(result, CODE8, 'TODO 8-8')",
      "    if ns8 is None:",
      "        return _finish(result)",
      "    weight_names = ['STUDENT_NORMAL_WEIGHT', 'STUDENT_BOMB_WEIGHT']",
      "    missing_w = [n for n in weight_names if n not in ns8]",
      "    if missing_w:",
      "        result['failed'].append('TODO 8-8: Missing definition(s): %s.' % ', '.join(missing_w))",
      "    else:",
      "        nw = ns8['STUDENT_NORMAL_WEIGHT']",
      "        bw = ns8['STUDENT_BOMB_WEIGHT']",
      "        result['passed'].append('TODO 8-8: a normal cell costs %s, a bomb cell costs %s.' % (_short_repr(nw), _short_repr(bw)))",
      // Any numbers are legal (an offset is added before Dijkstra runs), so
      // everything below is advice about what the hint will DO, not a rule.
      "        bad_w = [n for n in weight_names if isinstance(ns8[n], bool) or not isinstance(ns8[n], int)]",
      "        if bad_w:",
      "            result['warnings'].append('Heads up: %s should be a plain integer — this still counts as complete, but the Hint route may behave oddly.' % ', '.join(bad_w))",
      "        elif bw <= nw:",
      "            result['warnings'].append('Heads up: a bomb cell costs no more than a normal one, so the Hint route will walk you straight over bombs. That is allowed - just make sure you meant it.')",
    ]);
    // ---------------- TODO 8-4 / 8-5 / 8-6: the placement body
    //
    // One create_game_objects() body split across three sidebar steps, so
    // it is always run whole. Only the per-step compile check is narrowed
    // to whichever sub-step is being graded.
    if (want(4) || want(5) || want(6)) push([
      "    for _lbl, _src in (" + [
        want(4) ? "('TODO 8-4', FN4_SRC)," : "",
        want(5) ? "('TODO 8-5', FN5_SRC)," : "",
        want(6) ? "('TODO 8-6', FN6_SRC)," : "",
      ].join(" ") + "):",
      "        if _compile_body(result, _src, _lbl) is None:",
      "            return _finish(result)",
      "        result['passed'].append('%s: compiles.' % _lbl)",
      "    fn3 = _compile_body(result, FN_PLACE_SRC, 'TODO 8-4/8-5/8-6')",
      "    if fn3 is None:",
      "        return _finish(result)",
      "    cases = [",
      "        ('a normal round', {'rows': 9, 'cols': 11, 'cell_size': 30, 'extra_open_walls': 4, 'bomb_count': 3, 'custom_item_count': 2, 'time_limit_seconds': 60}, 0),",
      "        ('a round with no bombs and no items', {'rows': 7, 'cols': 7, 'cell_size': 30, 'extra_open_walls': 0, 'bomb_count': 0, 'custom_item_count': 0, 'time_limit_seconds': 30}, 1),",
      "        ('a tiny 3x3 round', {'rows': 3, 'cols': 3, 'cell_size': 30, 'extra_open_walls': 0, 'bomb_count': 1, 'custom_item_count': 1, 'time_limit_seconds': 20}, 2),",
      "        ('a round asking for more objects than it has cells', {'rows': 4, 'cols': 4, 'cell_size': 30, 'extra_open_walls': 0, 'bomb_count': 40, 'custom_item_count': 40, 'time_limit_seconds': 20}, 0),",
      "    ]",
      "    place_ok = True",
      "    for label, cfg, rindex in cases:",
      "        start = (0, 0)",
      "        goal = (cfg['rows'] - 1, cfg['cols'] - 1)",
      "        game = _StubGame(cfg, start, goal, rindex)",
      "        forbidden = set([start, goal])",
      "        ok, msg = _call_body(fn3, (game, forbidden, _stub_create_random_positions, _StubItem, _StubBomb, _rnd, STUB_ITEMS), 'Placement (%s)' % label)",
      "        if not ok:",
      "            result['failed'].append(msg)",
      "            place_ok = False",
      "            continue",
      "        if not isinstance(game.items, list):",
      "            result['failed'].append('Placement (%s): self.items must end up as a list (an empty list is fine), got %s. The drawing code loops over it every frame.' % (label, _short_repr(game.items)))",
      "            place_ok = False",
      "            continue",
      "        if not isinstance(game.bombs, list):",
      "            result['failed'].append('Placement (%s): self.bombs must end up as a list (an empty list is fine), got %s. The drawing code loops over it every frame.' % (label, _short_repr(game.bombs)))",
      "            place_ok = False",
      "            continue",
      "        placed = []",
      "        bad_shape = False",
      "        for obj in list(game.items) + list(game.bombs):",
      "            try:",
      "                pos = obj.get_position()",
      "                rr, cc = pos",
      "            except Exception:",
      "                result['warnings'].append('Heads up: %s produced something in self.items/self.bombs that is not a CustomItem or Bomb (%s) — the real game will error when it tries to draw it.' % (label, _short_repr(obj)))",
      "                bad_shape = True",
      "                break",
      "            placed.append((rr, cc))",
      "        if bad_shape:",
      "            continue",
      "        outside = [p for p in placed if not (0 <= p[0] < cfg['rows'] and 0 <= p[1] < cfg['cols'])]",
      "        if outside:",
      "            result['warnings'].append('Heads up: %s put %d object(s) outside the %dx%d grid, e.g. %s — those will never be reachable.' % (label, len(outside), cfg['rows'], cfg['cols'], _short_repr(outside[0])))",
      "        on_actor = [p for p in placed if p == start or p == goal]",
      "        if on_actor:",
      "            result['warnings'].append('Heads up: %s placed %d object(s) on the player start or the goal. Keep adding used positions to forbidden to avoid that.' % (label, len(on_actor)))",
      "        if len(set(placed)) != len(placed):",
      "            result['warnings'].append('Heads up: %s put two objects on the same cell. Remember forbidden.update(...) after each group you place.' % label)",
      "        result['passed'].append('Placement (%s): placed %d item(s) and %d bomb(s), no errors.' % (label, len(game.items), len(game.bombs)))",
      "    if place_ok:",
      "        result['passed'].append('Placement: your code ran cleanly for every round shape it was given.')",
    ]);
    push([
      "    return _finish(result)",
      "def _run():",
      "    return _finish_or_report(_run_inner)",
      "_run()",
    ]);
    return out.join("\n");
  }

  // ---- TODO 9-x: images + sizes + colors + sound + music playback ------
  //
  // Eight standalone sub-steps. 9-1 … 9-7 are each a two- or three-line
  // settings block, checked in a single table-driven loop; 9-8 (game.py)
  // is the only real code. `focus` narrows this to the one sub-step being
  // graded - see harness_roundDesign_8 for why the rest still runs.
  function harness_lookAndFeel_9(code1, code2, code3, code4, code5, code6, code7, code8, code9, code10, code11, code12, focus) {
    var F = (focus === undefined || focus === null || focus === "") ? null : String(focus);
    function want(n) { return F === null || F === String(n); }
    var out = [];
    function push(arr) { for (var i = 0; i < arr.length; i++) out.push(arr[i]); }
    var fn8 = buildFnSource("self, pygame, BACKGROUND_MUSIC_PATH, BACKGROUND_MUSIC_VOLUME", code8, "    ");
    // [part number, label, names, kind]. The part number is carried
    // explicitly rather than inferred from the row index, because part 8
    // (the music playback code) is NOT a settings block and so has no row
    // here - the settings parts are numbered 1 through 7 and 9 through
    // 12, with a hole at 8.
    var settingParts = [
      [1, "TODO 9-1", ["PLAYER_IMAGE_PATH", "GOAL_IMAGE_PATH"], "image"],
      [2, "TODO 9-2", ["BOMB_IMAGE_PATH", "FLOOR_TILE_IMAGE_PATH"], "image"],
      [3, "TODO 9-3", ["PLAYER_IMAGE_SCALE", "GOAL_IMAGE_SCALE", "BOMB_IMAGE_SCALE"], "scale"],
      [4, "TODO 9-4", ["WALL_COLOR", "PLAYER_COLOR", "GOAL_COLOR"], "color"],
      [5, "TODO 9-5", ["BOMB_COLOR", "BOMB_EXPLOSION_COLOR"], "color"],
      [6, "TODO 9-6", ["BOMB_SOUND_PATH", "BACKGROUND_MUSIC_PATH"], "sound"],
      [7, "TODO 9-7", ["BOMB_EXPLOSION_DURATION_MS", "BACKGROUND_MUSIC_VOLUME"], "tuning"],
      // 9-9 … 9-12 surface settings that used to be hardcoded: the
      // explosion picture, and the palettes the maze animation, the
      // screen and the info panel are drawn with. Same open-ended checks.
      [9, "TODO 9-9", ["BOMB_EXPLOSION_IMAGE_PATH"], "image"],
      [10, "TODO 9-10", ["VISITED_COLOR", "CURRENT_CELL_COLOR", "PATH_COLOR"], "color"],
      [11, "TODO 9-11", ["BACKGROUND_COLOR", "PANEL_COLOR", "PANEL_BORDER"], "color"],
      [12, "TODO 9-12", ["ACCENT", "SUCCESS", "WARNING", "DANGER"], "color"],
    ];
    push([
      PY_PRELUDE,
      PY_BONUS_HELPERS,
      PY_FAKE_PYGAME,
      b64Line("CODE1", code1),
      b64Line("CODE2", code2),
      b64Line("CODE3", code3),
      b64Line("CODE4", code4),
      b64Line("CODE5", code5),
      b64Line("CODE6", code6),
      b64Line("CODE7", code7),
      b64Line("CODE9", code9),
      b64Line("CODE10", code10),
      b64Line("CODE11", code11),
      b64Line("CODE12", code12),
      b64Line("FN3_SRC", fn8),
      "KNOWN_IMAGES = " + JSON.stringify(KNOWN_ASSETS.images).replace(/"/g, "'"),
      "KNOWN_SOUNDS = " + JSON.stringify(KNOWN_ASSETS.sounds).replace(/"/g, "'"),
      // Every settings block is still EXECUTED (TODO 9-8 needs 9-6's music
      // path and 9-7's volume to run against), but only the focused one is
      // reported on and only its problems can fail the step. The trailing
      // flag is that focus.
      "SETTING_PARTS = [",
      settingParts.map(function (p) {
        return "    ('" + p[1] + "', CODE" + p[0] + ", " + JSON.stringify(p[2]).replace(/"/g, "'") + ", '" + p[3] + "', " + (want(p[0]) ? "True" : "False") + "),";
      }).join("\n"),
      "]",
      "class _StubGame(object):",
      "    pass",
      "def _run_inner():",
      "    result = _new_result()",
      // ---------------- TODO 9-1 … 9-7: the settings blocks, one at a time
      "    seen = {}",
      "    for label, code, names, kind, focused in SETTING_PARTS:",
      "        ns = _exec_settings(result if focused else _new_result(), code, label)",
      "        if ns is None:",
      "            if focused:",
      "                return _finish(result)",
      "            continue",
      "        seen.update(ns)",
      "        if not focused:",
      "            continue",
      "        missing = [n for n in names if n not in ns]",
      "        if missing:",
      "            result['failed'].append('%s: Missing definition(s): %s. Keep every variable name exactly as given.' % (label, ', '.join(missing)))",
      "            continue",
      "        result['passed'].append('%s: %s defined.' % (label, ', '.join(names)))",
      "        for n in names:",
      "            if kind == 'image':",
      "                _check_path(result, n, ns[n], 'assets/images/', KNOWN_IMAGES)",
      "            elif kind == 'sound':",
      "                _check_path(result, n, ns[n], 'assets/sounds/', KNOWN_SOUNDS)",
      "            elif kind == 'color':",
      "                _check_color(result, n, ns[n])",
      "            elif kind == 'scale':",
      "                _check_number(result, n, ns[n], (int, float), low=0.1, high=3.0)",
      "        if kind == 'tuning':",
      "            _check_number(result, 'BOMB_EXPLOSION_DURATION_MS', ns['BOMB_EXPLOSION_DURATION_MS'], int, low=0)",
      "            _check_number(result, 'BACKGROUND_MUSIC_VOLUME', ns['BACKGROUND_MUSIC_VOLUME'], (int, float), low=0, high=1)",
      "    ns2 = seen",
    ]);
    // ---------------- TODO 9-8: music playback
    if (want(8)) push([
      "    fn3 = _compile_body(result, FN3_SRC, 'TODO 9-8')",
      "    if fn3 is None:",
      "        return _finish(result)",
      "    music_path = ns2.get('BACKGROUND_MUSIC_PATH') if isinstance(ns2, dict) else None",
      "    if not isinstance(music_path, str):",
      "        music_path = 'assets/sounds/bgm_1.wav'",
      "    volume = ns2.get('BACKGROUND_MUSIC_VOLUME') if isinstance(ns2, dict) else 0.25",
      "    if isinstance(volume, bool) or not isinstance(volume, (int, float)):",
      "        volume = 0.25",
      "    log = []",
      "    fake = _FakePygame(log)",
      "    ok, msg = _call_body(fn3, (_StubGame(), fake, music_path, volume), 'TODO 9-8 (with a music file set)')",
      "    if not ok:",
      "        result['failed'].append(msg)",
      "    else:",
      "        plays = [e for e in log if e[0] == 'music_play']",
      "        if plays:",
      "            args = plays[0][1]",
      "            loops = args[0] if args else None",
      "            if loops == -1:",
      "                result['passed'].append('TODO 9-8: the music starts and loops forever (play(-1)).')",
      "            elif loops == 0:",
      "                result['passed'].append('TODO 9-8: the music starts and plays through exactly once (play(0)).')",
      "            else:",
      "                result['passed'].append('TODO 9-8: the music starts with play(%s).' % _short_repr(loops))",
      "            if plays[0][2]:",
      "                result['passed'].append('TODO 9-8: extra playback options used: %s.' % ', '.join(k for k, v in plays[0][2]))",
      "        else:",
      "            result['warnings'].append('Heads up: your code ran fine, but it never called pygame.mixer.music.play(...), so no music will be heard. That is a valid choice if you meant it.')",
      "        if not [e for e in log if e[0] == 'music_volume']:",
      "            result['warnings'].append('Heads up: BACKGROUND_MUSIC_VOLUME is never applied (no set_volume call), so the music will play at full volume.')",
      // no music file at all
      "    log2 = []",
      "    ok2, msg2 = _call_body(fn3, (_StubGame(), _FakePygame(log2), None, volume), 'TODO 9-8 (with BACKGROUND_MUSIC_PATH = None)')",
      "    if not ok2:",
      "        result['failed'].append(msg2 + ' — with no music file chosen, this code still has to finish quietly instead of erroring.')",
      "    else:",
      "        result['passed'].append('TODO 9-8: with no music file chosen, your code finishes quietly.')",
      // a broken/missing file: warning only, per the open-ended grading policy
      "    log3 = []",
      "    ok3, msg3 = _call_body(fn3, (_StubGame(), _FakePygame(log3, fail_on_load=True), music_path, volume), 'TODO 9-8 (music file missing)')",
      "    if not ok3:",
      "        result['warnings'].append('Heads up: if the music file is missing or broken, your code raises instead of handling it (%s). This still counts as complete, but keeping the try / except (pygame.error, FileNotFoundError, TypeError) lines means a classmate can open your project without your sound files and still play it.' % msg3)",
      "    else:",
      "        result['passed'].append('TODO 9-8: a missing or broken music file is handled without crashing the game.')",
    ]);
    push([
      "    return _finish(result)",
      "def _run():",
      "    return _finish_or_report(_run_inner)",
      "_run()",
    ]);
    return out.join("\n");
  }

  // TODO 10 now spans two files (Part 1/6 in settings.py: the CUSTOM_ITEMS
  // data; Parts 2/3 and 3/3 in game.py: apply_custom_item_effect's
  // branching and the pickup itself, both real behaviour-graded TODOs
  // instead of given code) - graded together as
  // one BEHAVIOUR harness, same "Part 1: .../Part 2: ..." attribution
  // convention as TODO 5/7. Part 1 keeps the old open-ended/syntax-style
  // checks (compiles, defines CUSTOM_ITEMS, shape warnings only, no fixed
  // answer). Part 2 is graded on REAL outcomes: self.bonus_time_seconds /
  // self.hints_remaining after calling the student's code with a few
  // (effect, amount) pairs - including an unrecognized effect, which must
  // be a safe no-op (never a crash), preserving the exact flexibility
  // promise TODO 10 Part 1 makes about inventing new effect names.
  function harness_customItems_10(code1, code2, code3, code4, code5, code6, focus) {
    var F = (focus === undefined || focus === null || focus === "") ? null : String(focus);
    function want(n) { return F === null || F === String(n); }
    var out = [];
    function push(arr) { for (var i = 0; i < arr.length; i++) out.push(arr[i]); }
    // "image"/"sound"/"size" are intentionally NOT in ITEM_KEYS: they are
    // optional-with-a-default, exactly like every other asset path in this
    // project (TODO 9) - an item simply omitting them is equivalent to
    // explicitly writing None (or 1.0 for size), so it must never warn or
    // block just for being absent. Only checked (as a lenient warning)
    // when present.
    var itemKeys = ["name", "color", "effect", "amount"];
    // Since the Bonus split: Parts 2 and 3 are the two effect branches
    // (one per effect name) and Parts 4-6 are the three statement groups of
    // the pickup. Each group is joined back into the single method body the
    // real game runs, but the per-case labels below still point at whichever
    // individual part a failure actually belongs to.
    var fn2Src = buildFnSourceParts("self, effect, amount", [code2, code3], "    ");
    var fn3Src = buildFnSourceParts("self, player_position", [code4, code5, code6], "    ");
    push([
      PY_PRELUDE,
      PY_BONUS_HELPERS,
      b64Line("CODE1", code1),
      b64Line("FN2_SRC", fn2Src),
      b64Line("FN3_SRC", fn3Src),
      "ITEM_KEYS = " + JSON.stringify(itemKeys).replace(/"/g, "'"),
      "KNOWN_EFFECTS = ['add_time', 'add_hint']",
      "KNOWN_IMAGES = " + JSON.stringify(KNOWN_ASSETS.images).replace(/"/g, "'"),
      "KNOWN_SOUNDS = " + JSON.stringify(KNOWN_ASSETS.sounds).replace(/"/g, "'"),
      "IMAGE_EXT = ('.png', '.jpg', '.jpeg', '.gif', '.bmp')",
      "SOUND_EXT = ('.wav', '.mp3', '.ogg')",
      // Stand-ins for Parts 4-6: one spawned item, and just enough of Game
      // for the pickup body to run. apply_custom_item_effect and
      // get_custom_item_sound record what the student's code asked for,
      // rather than re-running Part 2 or touching real audio.
      "class _PickItem(object):",
      "    def __init__(self, pos, item_def, active=True):",
      "        self._pos = pos; self.item_def = item_def; self.active = active",
      "        self.row = pos[0]; self.col = pos[1]",
      "    def get_position(self):",
      "        return self._pos",
      "class _PickSound(object):",
      "    def __init__(self, played, path):",
      "        self._played = played; self.path = path",
      "    def play(self, *a, **k):",
      "        self._played.append(self.path)",
      "class _PickPlayer(object):",
      "    def __init__(self, pos):",
      "        self._pos = pos",
      "    def get_position(self):",
      "        return self._pos",
      "class _PickGame(object):",
      "    def __init__(self, items, player_pos):",
      // self.player mirrors the position passed in, so a student who writes
      // self.player.get_position() instead of using the player_position
      // local is graded on exactly the same scenario, not a different one.
      "        self.items = items",
      "        self.applied = []",
      "        self.played = []",
      "        self.bonus_time_seconds = 0",
      "        self.hints_remaining = 2",
      "        self.player = _PickPlayer(player_pos)",
      "    def apply_custom_item_effect(self, item_def):",
      "        self.applied.append(item_def)",
      "    def get_custom_item_sound(self, path):",
      "        if path is None or path == '<broken>':",
      "            return None",
      "        return _PickSound(self.played, path)",
      "def _run_inner():",
      "    result = {'ok': False, 'passed': [], 'failed': [], 'warnings': [], 'error': None, 'traceback': None}",
    ]);
    // ---------------- TODO 10-1: the CUSTOM_ITEMS data
    if (want(1)) push([
      "    try:",
      "        compile(CODE1, '<student-part1>', 'exec')",
      "    except SyntaxError as e:",
      "        result['error'] = 'TODO 10-1: Python syntax error on line %s: %s.' % (e.lineno, e.msg)",
      "        return json.dumps(result)",
      "    try:",
      "        ns1 = {}",
      // Behind the line budget like every other student-code run, so a
      // `while True` in the settings block is a graded failure rather than
      // a frozen browser tab.
      "        _run_guarded(lambda: exec(compile(CODE1, '<student-part1>', 'exec'), {}, ns1), ())",
      "        if 'CUSTOM_ITEMS' not in ns1:",
      "            result['failed'].append('TODO 10-1: Missing definition: CUSTOM_ITEMS.')",
      "        else:",
      "            items_list = ns1['CUSTOM_ITEMS']",
      "            if not isinstance(items_list, list) or len(items_list) == 0:",
      "                result['warnings'].append('Heads up: CUSTOM_ITEMS is usually a non-empty list of item dictionaries — this still counts as complete, but double-check it in the Play tab.')",
      "                result['passed'].append('TODO 10-1: CUSTOM_ITEMS is defined.')",
      "            else:",
      "                result['passed'].append('TODO 10-1: CUSTOM_ITEMS is defined with %d item(s).' % len(items_list))",
      "                for i, item_def in enumerate(items_list):",
      "                    label = 'item %d' % (i + 1)",
      "                    if not isinstance(item_def, dict):",
      "                        result['warnings'].append('Heads up: %s is not a dictionary.' % label)",
      "                        continue",
      "                    keys = set(item_def.keys())",
      "                    missing_keys = set(ITEM_KEYS) - keys",
      "                    if missing_keys:",
      "                        result['warnings'].append('Heads up: %s is missing key(s): %s.' % (label, ', '.join(sorted(missing_keys))))",
      "                        continue",
      "                    color = item_def.get('color')",
      "                    if not (isinstance(color, tuple) and len(color) == 3 and all(isinstance(v, int) and 0 <= v <= 255 for v in color)):",
      "                        result['warnings'].append('Heads up: %s color is usually a 3-tuple of ints 0-255, e.g. (255, 215, 0) — still counts as complete, but double-check it renders correctly.' % label)",
      "                    effect = item_def.get('effect')",
      "                    if effect not in KNOWN_EFFECTS:",
      "                        result['warnings'].append('Heads up: %s[\\'effect\\'] = %s is not one of the built-in effects (%s) — this still counts as complete (an unrecognized effect is a safe no-op in the real game), but double-check it is the effect you meant.' % (label, _short_repr(effect), ', '.join(KNOWN_EFFECTS)))",
      "                    if type(item_def.get('amount')) is not int:",
      "                        result['warnings'].append('Heads up: %s[\\'amount\\'] is usually a plain integer — this still counts as complete, but double-check it behaves as expected.' % label)",
      "                    if 'size' in item_def:",
      "                        sz = item_def.get('size')",
      "                        if isinstance(sz, bool) or not isinstance(sz, (int, float)):",
      "                            result['warnings'].append('Heads up: %s[\\'size\\'] should be a number like 1.0 — anything else is ignored and the item draws at its normal size.' % label)",
      "                        elif sz < 0.1 or sz > 3.0:",
      "                            result['warnings'].append('Heads up: %s[\\'size\\'] = %s is outside 0.1-3.0, so the game clamps it into that range — an item can never become invisible or fill the screen.' % (label, _short_repr(sz)))",
      "                    def _check_asset_field(field, folder, exts, known):",
      "                        val = item_def.get(field)",
      "                        if val is None:",
      "                            return",
      "                        if not isinstance(val, str):",
      "                            result['warnings'].append(\"Heads up: %s['%s'] should be None or a string path — this still counts as complete, but the real game will likely error when it tries to load this.\" % (label, field))",
      "                            return",
      "                        norm = val.replace(chr(92), '/')",
      "                        if not norm.startswith(folder) or not norm.lower().endswith(exts):",
      "                            result['warnings'].append(\"Heads up: %s['%s'] = %s doesn't look like a path under %s with a valid extension — double-check it, though this still counts as complete.\" % (label, field, _short_repr(val), folder))",
      "                            return",
      "                        base = norm.rsplit('/', 1)[-1]",
      "                        if base not in known:",
      "                            result['warnings'].append(\"%s['%s'] = %s — this isn't one of the bundled files, but it will work once you add your own file at that path.\" % (label, field, _short_repr(val)))",
      "                    _check_asset_field('image', 'assets/images/', IMAGE_EXT, KNOWN_IMAGES)",
      "                    _check_asset_field('sound', 'assets/sounds/', SOUND_EXT, KNOWN_SOUNDS)",
      "                    result['passed'].append('%s: %s' % (label, _short_repr(item_def)))",
      "    except BaseException as e:",
      "        result['error'] = 'TODO 10-1: %s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "        return json.dumps(result)",
    ]);
    // ---------------- TODO 10-2 / 10-3: the two effect branches
    //
    // One apply_custom_item_effect() body split across two sidebar steps,
    // so it is always compiled and run whole - but only the focused
    // sub-step's cases are asserted. That matters here more than anywhere
    // else in the course: both starters are a bare `pass`, so grading 10-2
    // against 10-3's untouched starter would otherwise be an instant fail.
    if (want(2) || want(3)) push([
      "    try:",
      "        exec(compile(FN2_SRC, '<student-part2>', 'exec'), {}, {})",
      "    except SyntaxError as e:",
      "        line = max(1, (e.lineno or 1) - 1)",
      "        result['error'] = 'TODO 10-2 / 10-3: Python syntax error on line %s: %s.' % (line, e.msg)",
      "        return json.dumps(result)",
      "    try:",
      "        class SelfObj:",
      "            def __init__(self, bonus_time_seconds, hints_remaining):",
      "                self.bonus_time_seconds = bonus_time_seconds",
      "                self.hints_remaining = hints_remaining",
      // The first element is which PART each case really belongs to, so a
      // student who has done Part 2 but not Part 3 is told exactly that.
      "        cases = [",
      want(2) ? "            ('TODO 10-2', 'add_time adds seconds', 'add_time', 15, (0, 2), (15, 2))," : "",
      want(2) ? "            ('TODO 10-2', 'add_time stacks on existing bonus time', 'add_time', 10, (30, 1), (40, 1))," : "",
      want(3) ? "            ('TODO 10-3', 'add_hint adds a hint use', 'add_hint', 1, (0, 2), (0, 3))," : "",
      want(3) ? "            ('TODO 10-3', 'add_hint with a larger amount', 'add_hint', 2, (5, 0), (5, 2))," : "",
      "            ('TODO 10-2 / 10-3', 'an unrecognized effect is a safe no-op', 'shrink_maze', 999, (3, 1), (3, 1)),",
      "        ]",
      "        for part, label, effect, amount, start, expect in cases:",
      "            ns2 = {}",
      "            exec(compile(FN2_SRC, '<student-part2>', 'exec'), {}, ns2)",
      "            self_ = SelfObj(start[0], start[1])",
      "            try:",
      "                _run_guarded(ns2['_fn'], (self_, effect, amount))",
      "            except _StepBudget as e:",
      "                result['failed'].append('%s (%s): %s' % (part, label, e))",
      "                continue",
      "            except BaseException as e:",
      "                result['failed'].append('%s (%s): raised %s: %s - an unrecognized effect must be a safe no-op, never an error.' % (part, label, type(e).__name__, e))",
      "                continue",
      "            if self_.bonus_time_seconds == expect[0] and self_.hints_remaining == expect[1]:",
      "                result['passed'].append('%s (%s): OK' % (part, label))",
      "            else:",
      "                result['failed'].append('%s (%s): expected (bonus_time_seconds, hints_remaining) == %r, got %r.' % (part, label, expect, (self_.bonus_time_seconds, self_.hints_remaining)))",
      "    except BaseException as e:",
      "        result['error'] = 'TODO 10-2 / 10-3: %s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "        return json.dumps(result)",
    ]);
    // ---------------- TODO 10-4 / 10-5 / 10-6: the pickup itself
    //
    // One check_items() body split across three sidebar steps. Every
    // starter here is already working code (unlike 10-2/10-3), so the whole
    // pickup is checked whichever of the three is being graded.
    if (want(4) || want(5) || want(6)) push([
      "    fn3 = _compile_body(result, FN3_SRC, 'TODO 10-4/10-5/10-6')",
      "    if fn3 is None:",
      "        return _finish(result)",
      "    def _mk_items(specs):",
      "        return [_PickItem(pos, defn, active) for pos, defn, active in specs]",
      "    DEF_A = {'name': 'A', 'color': (1, 2, 3), 'sound': 'assets/sounds/pickup_1.wav', 'size': 1.0, 'effect': 'add_time', 'amount': 5}",
      "    DEF_B = {'name': 'B', 'color': (4, 5, 6), 'sound': None, 'size': 1.0, 'effect': 'add_hint', 'amount': 1}",
      "    DEF_C = {'name': 'C', 'color': (7, 8, 9), 'sound': '<broken>', 'effect': 'mystery', 'amount': 2}",
      "    scenarios = [",
      "        ('the player is standing on an item', (1, 1), [((1, 1), DEF_A, True), ((4, 4), DEF_B, True)], 0),",
      "        ('the player is standing on empty floor', (2, 2), [((1, 1), DEF_A, True), ((4, 4), DEF_B, True)], None),",
      "        ('the item under the player has no sound', (3, 3), [((3, 3), DEF_B, True)], 0),",
      "        ('the item under the player has a broken sound file', (3, 3), [((3, 3), DEF_C, True)], 0),",
      "        ('there are no items at all this round', (0, 0), [], None),",
      "        ('the item under the player was already collected', (5, 5), [((5, 5), DEF_A, False)], None),",
      "    ]",
      "    pickup_clean = True",
      "    for label, ppos, specs, expect_idx in scenarios:",
      "        game = _PickGame(_mk_items(specs), ppos)",
      "        ok3, msg3 = _call_body(fn3, (game, ppos), 'Pickup (%s)' % label)",
      "        if not ok3:",
      "            result['failed'].append(msg3)",
      "            pickup_clean = False",
      "            continue",
      "        if expect_idx is None:",
      "            wrongly = [i for i, it in enumerate(game.items) if specs[i][2] and not it.active]",
      "            if wrongly:",
      "                result['warnings'].append('Heads up: Pickup (%s) still collected an item. Check the position comparison in your if statement.' % label)",
      "            elif game.applied and not specs:",
      "                pass",
      "            if game.applied and label.startswith('the item under the player was already'):",
      "                result['warnings'].append('Heads up: Pickup (%s) applied the effect again for an item that was already collected. Checking item.active first prevents that.' % label)",
      "            result['passed'].append('Pickup (%s): nothing was collected, as expected.' % label)",
      "            continue",
      "        target = game.items[expect_idx]",
      "        if target.active:",
      "            result['failed'].append('Pickup (%s): the item the player is standing on is still active. Set item.active = False when you collect it, or it gets collected again on every single frame.' % label)",
      "            pickup_clean = False",
      "            continue",
      "        if target.item_def not in game.applied:",
      "            result['failed'].append('Pickup (%s): the item was marked collected, but self.apply_custom_item_effect(item.item_def) was never called - so your TODO 10-2 / 10-3 effect never runs.' % label)",
      "            pickup_clean = False",
      "            continue",
      "        others = [i for i, it in enumerate(game.items) if i != expect_idx and specs[i][2] and not it.active]",
      "        if others:",
      "            result['warnings'].append('Heads up: Pickup (%s) also collected %d item(s) the player is not standing on.' % (label, len(others)))",
      "        result['passed'].append('Pickup (%s): collected correctly, and your effect was applied.' % label)",
      "    if pickup_clean:",
      "        sound_game = _PickGame(_mk_items([((1, 1), DEF_A, True)]), (1, 1))",
      "        _call_body(fn3, (sound_game, (1, 1)), 'Pickup (sound check)')",
      "        if sound_game.played:",
      "            result['passed'].append(\"Pickup: the collected item's own sound is played (%s).\" % sound_game.played[0])",
      "        else:",
      "            result['warnings'].append('Heads up: your pickup works, but it never plays the item sound. Look up the sound with self.get_custom_item_sound(...) and call .play() on the result when it is not None.')",
    ]);
    push([
      "    return _finish(result)",
      "def _run():",
      "    return _finish_or_report(_run_inner)",
      "_run()",
    ]);
    return out.join("\n");
  }

  // ---- TODO 11: the rules, written twice -------------------------------
  //
  // Parts 1/4 and 2/4 are the rules as English (settings.py), Parts 3/4 and 4/4 are the same
  // rules as the win condition (game.py). The grading policy here is
  // deliberately permissive: a student is allowed to invent a harder win
  // condition, so "standing on the goal did not clear the round" is only
  // ever a note. The two things that ARE failures are the ones that make a
  // game unplayable: raising, and clearing the round while the player is
  // nowhere near the goal.
  function harness_gameRules_11(code1, code2, code3, code4, focus) {
    var F = (focus === undefined || focus === null || focus === "") ? null : String(focus);
    function want(n) { return F === null || F === String(n); }
    var out = [];
    function push(arr) { for (var i = 0; i < arr.length; i++) out.push(arr[i]); }
    // 11-3 and 11-4 are two consecutive statement groups of check_goal, so
    // they are compiled separately (attribution) and then joined and run as
    // the one body the real game executes.
    var fn3 = buildFnSource("self, pygame, ROUND_CONFIGS", code3, "    ");
    var fn4 = buildFnSource("self, pygame, ROUND_CONFIGS", code4, "    ");
    var fnBoth = buildFnSourceParts("self, pygame, ROUND_CONFIGS", [code3, code4], "    ");
    push([
      PY_PRELUDE,
      PY_BONUS_HELPERS,
      PY_FAKE_PYGAME,
      b64Line("CODE1", code1),
      b64Line("CODE2", code2),
      b64Line("FN3_SRC", fn3),
      b64Line("FN4_SRC", fn4),
      b64Line("FN2_SRC", fnBoth),
      "class _GoalActor(object):",
      "    def __init__(self, pos):",
      "        self._pos = pos",
      "    def get_position(self):",
      "        return self._pos",
      "class _GoalItem(object):",
      "    def __init__(self, active):",
      "        self.active = active",
      "        self.item_def = {'name': 'x', 'effect': 'add_time', 'amount': 1}",
      "    def get_position(self):",
      "        return (9, 9)",
      "class _GoalGame(object):",
      "    def __init__(self, player_pos, goal_pos, items, round_index, total):",
      "        self.player = _GoalActor(player_pos)",
      "        self.goal = _GoalActor(goal_pos)",
      "        self.items = items",
      "        self.current_round = round_index",
      "        self.game_clear = False",
      "        self.round_failed = False",
      "        self.round_transition_time = None",
      "        self.config = {'rows': 9, 'cols': 9, 'cell_size': 30, 'extra_open_walls': 3, 'bomb_count': 2, 'custom_item_count': 2, 'time_limit_seconds': 60}",
      "        self.bonus_time_seconds = 0",
      "        self.hints_remaining = 2",
      "    def cleared(self):",
      "        return bool(self.game_clear) or self.round_transition_time is not None",
      "ROUNDS_STUB = [1, 2, 3]",
      "def _run_inner():",
      "    result = _new_result()",
    ]);
    // ---------------- TODO 11-1 / 11-2: the rules as text
    //
    // Two independent settings lists, one per sub-step, so only the
    // focused one is executed and reported.
    if (want(1)) push([
      "    ns1 = _exec_settings(result, CODE1, 'TODO 11-1')",
      "    if ns1 is None:",
      "        return _finish(result)",
    ]);
    if (want(2)) push([
      "    ns2 = _exec_settings(result, CODE2, 'TODO 11-2')",
      "    if ns2 is None:",
      "        return _finish(result)",
    ]);
    if (want(1) || want(2)) push([
      "    for label, rn, ns in (" + [
        want(1) ? "('TODO 11-1', 'MISSION_RULES', ns1)," : "",
        want(2) ? "('TODO 11-2', 'HOW_TO_PLAY_RULES', ns2)," : "",
      ].join(" ") + "):",
      "        if rn not in ns:",
      "            result['failed'].append('%s: Missing definition: %s. Keep the variable name exactly as given.' % (label, rn))",
      "            continue",
      "        val = ns[rn]",
      "        result['passed'].append('%s: %s (%s line(s)).' % (label, rn, len(val) if isinstance(val, (list, tuple)) else '?'))",
      "        if not isinstance(val, list) or len(val) == 0:",
      "            result['warnings'].append('Heads up: %s is usually a non-empty list of strings — this still counts as complete, but the screen that shows it will be blank.' % rn)",
      "        elif not all(isinstance(x, str) for x in val):",
      "            result['warnings'].append('Heads up: every entry in %s is usually a quoted string.' % rn)",
    ]);
    // ---------------- TODO 11-3 / 11-4: the same rules as code
    //
    // One check_goal() body split across two sidebar steps, always run
    // whole; both starters are already working code, so either sub-step
    // is checked against the complete win condition.
    if (want(3) || want(4)) push([
      "    for _lbl, _src in (" + [
        want(3) ? "('TODO 11-3', FN3_SRC)," : "",
        want(4) ? "('TODO 11-4', FN4_SRC)," : "",
      ].join(" ") + "):",
      "        if _compile_body(result, _src, _lbl) is None:",
      "            return _finish(result)",
      "        result['passed'].append('%s: compiles.' % _lbl)",
      "    fn2 = _compile_body(result, FN2_SRC, 'TODO 11-3/11-4')",
      "    if fn2 is None:",
      "        return _finish(result)",
      "    GOAL = (8, 8)",
      "    def _try(label, player_pos, items, round_index):",
      "        game = _GoalGame(player_pos, GOAL, items, round_index, 3)",
      "        ok, msg = _call_body(fn2, (game, _FakePygame([]), ROUNDS_STUB), 'Win condition (%s)' % label)",
      "        return game, ok, msg",
      "    all_collected = [_GoalItem(False), _GoalItem(False)]",
      "    some_left = [_GoalItem(False), _GoalItem(True)]",
      "    goal_ok = True",
      // Away from the goal: clearing here would make the game win itself.
      "    for label, items, rindex in [('away from the goal, items left', some_left, 0),",
      "                                 ('away from the goal, everything collected', all_collected, 0),",
      "                                 ('away from the goal on the last round', all_collected, 2)]:",
      "        game, ok, msg = _try(label, (0, 0), items, rindex)",
      "        if not ok:",
      "            result['failed'].append(msg)",
      "            goal_ok = False",
      "            continue",
      "        if game.cleared():",
      "            result['failed'].append('Win condition (%s): the round was cleared even though the player is nowhere near the goal. Keep the first check - if the player is not on the goal, return early.' % label)",
      "            goal_ok = False",
      "        else:",
      "            result['passed'].append('Win condition (%s): correctly does nothing.' % label)",
      // On the goal: any outcome is legal, but describe what happened.
      "    on_goal_mid, ok_a, msg_a = _try('on the goal, mid-game, everything collected', GOAL, all_collected, 0)",
      "    if not ok_a:",
      "        result['failed'].append(msg_a)",
      "        goal_ok = False",
      "    on_goal_last, ok_b, msg_b = _try('on the goal, last round, everything collected', GOAL, all_collected, 2)",
      "    if not ok_b:",
      "        result['failed'].append(msg_b)",
      "        goal_ok = False",
      "    on_goal_left, ok_c, msg_c = _try('on the goal with items still uncollected', GOAL, some_left, 0)",
      "    if not ok_c:",
      "        result['failed'].append(msg_c)",
      "        goal_ok = False",
      "    no_items, ok_d, msg_d = _try('on the goal in a round with no items at all', GOAL, [], 2)",
      "    if not ok_d:",
      "        result['failed'].append(msg_d)",
      "        goal_ok = False",
      "    if goal_ok:",
      "        if on_goal_last.game_clear:",
      "            result['passed'].append('Win condition: reaching the goal on the final round finishes the game.')",
      "        if on_goal_mid.round_transition_time is not None:",
      "            result['passed'].append('Win condition: reaching the goal mid-game moves on to the next round.')",
      "        if not on_goal_mid.cleared() and not on_goal_last.cleared():",
      "            result['warnings'].append('Heads up: even with every item collected and the player standing on the goal, nothing clears the round — as written, this game cannot be won. Check that you still set self.game_clear or self.round_transition_time somewhere.')",
      "        elif on_goal_left.cleared():",
      "            result['passed'].append('Win condition: reaching the goal is enough to clear the round (no extra condition).')",
      "        else:",
      "            result['passed'].append('Win condition: you added an extra win condition — reaching the goal is not enough on its own until the rest is done. Make sure MISSION_RULES says so too!')",
      "        if not no_items.cleared() and not on_goal_left.cleared():",
      "            result['warnings'].append('Heads up: your extra win condition also blocks a round that has no items at all. If any round sets custom_item_count to 0, that round could never be finished.')",
    ]);
    push([
      "    return _finish(result)",
      "def _run():",
      "    return _finish_or_report(_run_inner)",
      "_run()",
    ]);
    return out.join("\n");
  }

  // TODO 8 and TODO 9 and TODO 11 used to be graded here as pure "syntax" steps. They all
  // gained a real code part in game.py, so they moved to BEHAVIOUR_HARNESSES
  // (harness_roundDesign_8 / harness_lookAndFeel_9 / harness_gameRules_11),
  // which still run the same open-ended settings checks for their
  // settings.py parts. TODO 1 is the only step left that is settings-only.
  var SYNTAX_HARNESSES = {
    "1": harness_syntax_1,
  };

  // -------------------------------------------- 12. hints/skip/reset/io

  function revealHint(id) {
    var stepData = state.steps[id];
    var totalHints = STEP_BY_ID[id].hints.length;
    if (stepData.hintsRevealed >= totalHints) return;
    stepData.hintsRevealed += 1;
    persist();
    renderMain();
  }

  function skipStep(id) {
    var stepData = state.steps[id];
    if (stepData.status !== "completed") stepData.status = "skipped";
    persist();
    var next = nextStepAfter(id);
    if (next) state.currentStepId = next;
    persist();
    renderAll();
  }

  function resetStep(id) {
    showConfirm(
      "Reset this step?",
      "This clears your code, hints used, and attempt count for TODO " + id + ". This cannot be undone.",
      { confirmLabel: "Reset step", dangerConfirm: true }
    ).then(function (ok) {
      if (!ok) return;
      state.steps[id] = defaultStepState(STEP_BY_ID[id]);
      persist();
      renderAll();
      PlayEngine.refresh();
    });
  }

  function resetAll() {
    showConfirm(
      "Reset ALL progress?",
      "This clears every step's code, completion state, skips, hints, and attempt counts. Your theme preference is kept. This cannot be undone — consider using \"Save my work\" first.",
      { confirmLabel: "Reset everything", dangerConfirm: true }
    ).then(function (ok) {
      if (!ok) return;
      state = freshState();
      saveState();
      renderAll();
      PlayEngine.refresh();
    });
  }

  function exportProgress() {
    downloadJSON("progress.json", { kind: "dijkstra-maze-todo-progress", version: 1, savedAt: new Date().toISOString(), state: state });
    if (state.assetData && state.assetData.uploadedFiles && state.assetData.uploadedFiles.length) {
      showConfirm(
        "Remember your uploaded files",
        "progress.json saved your code, painted maps, and the list of " + state.assetData.uploadedFiles.length + " file(s) you added in TODO 9 — but NOT the image/sound files themselves. Those live on your disk (or your connected project folder). Keep them safe, or you'll need to re-upload them next time.",
        { confirmLabel: "Got it", cancelLabel: "Close" }
      );
    }
  }

  function importProgressFile(file) {
    showConfirm(
      "Load saved work?",
      "This will overwrite your CURRENT progress on this computer with the contents of \"" + file.name + "\". This cannot be undone.",
      { confirmLabel: "Load and overwrite", dangerConfirm: true }
    ).then(function (ok) {
      if (!ok) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(String(reader.result));
          var payload = parsed && parsed.state ? parsed.state : parsed;
          state = normalizeLoadedState(payload);
          saveState();
          renderAll();
          PlayEngine.refresh();
        } catch (e) {
          showConfirm("Could not load file", "This does not look like a valid progress.json file (" + e.message + ").", { confirmLabel: "OK", cancelLabel: "Close" });
        }
      };
      reader.readAsText(file);
    });
  }

  // ------------------------------------------------- 14. visualizers
  //
  // Every visualizer here follows one rule: NEVER fake an animation. Each
  // one splices the student's CURRENT saved code (read fresh from `state`
  // every run, never cached) into a small Pyodide harness that actually
  // executes it, and returns a JSON *trace* of events which this file then
  // draws on <canvas>. A wrong answer therefore produces a real wrong
  // animation - that is the point.
  //
  // Shared event vocabulary (fields vary by type, but reused across
  // visualizers so the playback code is generic):
  //   {type:"visit", cell:[r,c], cost:n, from:[r,c], queue:[...]}  (Dijkstra)
  //   {type:"path", cells:[[r,c],...]}                             (Dijkstra)
  // (DFS carve/backtrack and scoreboard event types used to exist here too,
  // back when maze generation was a graded TODO and the game had a score -
  // both are given/non-TODO or removed now, see the comment just below and
  // D4's changelog note, so no harness produces those event shapes any more.)
  //
  // Every harness that runs a student-code loop (BFS, Dijkstra) enforces a
  // hard step budget AND a hard cap on trace length, and reports a
  // `stopped_reason` so the UI can say "Stopped after N steps..." instead of
  // hanging the tab or exhausting memory on a runaway trace. (Maze
  // generation used to be one of these too, back when it was a student
  // TODO - see student/maze.py and TEACHER_TODO_GUIDE.md for why it's now
  // given code, generated directly in JS by jsGenerateMazeWalls().)

  var FLOOD_BUDGET = 5000;  // BFS / Dijkstra step budget
  var TRACE_CAP = 4000;     // hard cap on captured events per run

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  // ---------------------------------------------------- image asset cache
  var IMAGE_CACHE = {};
  function loadImageCached(path) {
    if (!path) return Promise.resolve(null);
    if (IMAGE_CACHE[path]) return IMAGE_CACHE[path];
    var p = new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = path;
    });
    IMAGE_CACHE[path] = p;
    return p;
  }
  // ------------------------------------------------------ canvas helpers
  function makeCanvas(cssWidth, cssHeight) {
    var canvas = document.createElement("canvas");
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas: canvas, ctx: ctx };
  }
  function fitWidth(container, maxWidth) {
    var w = container.clientWidth || 300;
    return Math.max(120, Math.min(w, maxWidth || 9999));
  }

  // ------------------------------------------------------- control bar UI
  function buildControlBar(opts) {
    var bar = el("div", { class: "viz-controlbar" });
    var stepBtn = el("button", { class: "btn btn-small", type: "button", text: "Step" });
    var runBtn = el("button", { class: "btn btn-small btn-primary", type: "button", text: "Run" });
    var pauseBtn = el("button", { class: "btn btn-small", type: "button", text: "Pause", disabled: "disabled" });
    var resetBtn = el("button", { class: "btn btn-small", type: "button", text: "Reset" });
    var speedSel = el("select", { class: "viz-speed", "aria-label": "Playback speed" }, [
      el("option", { value: "1" }, ["1x"]),
      el("option", { value: "2" }, ["2x"]),
      el("option", { value: "4" }, ["4x"]),
    ]);
    bar.appendChild(stepBtn); bar.appendChild(runBtn); bar.appendChild(pauseBtn); bar.appendChild(resetBtn); bar.appendChild(speedSel);
    if (opts && opts.onStep) stepBtn.addEventListener("click", opts.onStep);
    if (opts && opts.onRun) runBtn.addEventListener("click", function () {
      runBtn.disabled = true; pauseBtn.disabled = false; opts.onRun();
    });
    if (opts && opts.onPause) pauseBtn.addEventListener("click", function () {
      runBtn.disabled = false; pauseBtn.disabled = true; opts.onPause();
    });
    if (opts && opts.onReset) resetBtn.addEventListener("click", function () {
      runBtn.disabled = false; pauseBtn.disabled = true; opts.onReset();
    });
    if (opts && opts.onSpeed) speedSel.addEventListener("change", function () { opts.onSpeed(Number(speedSel.value)); });
    return { node: bar, stepBtn: stepBtn, runBtn: runBtn, pauseBtn: pauseBtn, resetBtn: resetBtn, speedSel: speedSel,
      setRunning: function (running) { runBtn.disabled = running; pauseBtn.disabled = !running; } };
  }

  function buildReadout(rows) {
    var table = el("table", { class: "viz-readout" });
    var refs = {};
    rows.forEach(function (row) {
      var valueCell = el("td", { class: "viz-readout-value", text: row.value || "" });
      refs[row.key] = valueCell;
      table.appendChild(el("tr", {}, [el("td", { class: "viz-readout-label", text: row.label }), valueCell]));
    });
    return { node: table, set: function (key, value) { if (refs[key]) refs[key].textContent = value; } };
  }

  function buildVerdict() {
    var node = el("div", { class: "viz-verdict", hidden: "hidden" });
    return {
      node: node,
      set: function (ok, text) {
        node.hidden = false;
        node.className = "viz-verdict " + (ok ? "verdict-good" : "verdict-bad");
        node.textContent = (ok ? "✓ " : "✗ ") + text;
      },
      info: function (text) {
        node.hidden = false;
        node.className = "viz-verdict verdict-info";
        node.textContent = text;
      },
      clear: function () { node.hidden = true; },
    };
  }

  // A generic trace-playback controller: given an array of events, lets the
  // UI Step/Run/Pause/Reset through them at 1x/2x/4x, calling onEvent(evt,
  // index) for each one as it plays, and onDone() once finished. Respects
  // prefers-reduced-motion by jumping straight to the end.
  function createPlaybackController(opts) {
    var trace = [];
    var idx = 0;
    var speed = 1;
    var playing = false;
    var rafId = null;
    var lastTime = 0;
    var msPerEvent = 90;

    function applyUpTo(target) {
      while (idx < target && idx < trace.length) {
        opts.onEvent(trace[idx], idx);
        idx++;
      }
    }
    function tick(now) {
      if (!playing) return;
      if (!lastTime) lastTime = now;
      var elapsed = now - lastTime;
      var perEvent = msPerEvent / speed;
      var steps = Math.floor(elapsed / perEvent);
      if (steps > 0) {
        lastTime = now;
        applyUpTo(idx + steps);
      }
      if (idx >= trace.length) {
        playing = false;
        if (opts.onDone) opts.onDone();
        return;
      }
      rafId = requestAnimationFrame(tick);
    }
    return {
      setTrace: function (newTrace) { trace = newTrace || []; idx = 0; },
      step: function () { applyUpTo(idx + 1); if (idx >= trace.length && opts.onDone) opts.onDone(); },
      run: function () {
        if (prefersReducedMotion()) { applyUpTo(trace.length); if (opts.onDone) opts.onDone(); return; }
        if (playing) return;
        playing = true; lastTime = 0;
        rafId = requestAnimationFrame(tick);
      },
      pause: function () { playing = false; if (rafId) cancelAnimationFrame(rafId); },
      reset: function () { playing = false; if (rafId) cancelAnimationFrame(rafId); idx = 0; if (opts.onReset) opts.onReset(); },
      setSpeed: function (s) { speed = s; },
      jumpToEnd: function () { applyUpTo(trace.length); },
      isDone: function () { return idx >= trace.length; },
      destroy: function () { playing = false; if (rafId) cancelAnimationFrame(rafId); },
    };
  }

  // -------------------------------------- tab-visibility-aware RAF helper
  var VISIBLE_RAF_CALLBACKS = [];
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) VISIBLE_RAF_CALLBACKS.forEach(function (fn) { fn(); });
  });

  // ---- deterministic fixture maze builder (test scaffolding, not a TODO) --
  // Builds one fixed, reproducible maze via a seeded randomized DFS carve,
  // used only to give the playerMove/bfsFlood visualizers a real, solvable
  // grid to work with. This is a JS test-fixture utility, structurally
  // unrelated to grading any TODO (different language, different shape -
  // full generation loop vs. one Python fill-in-the-blank line).
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function buildFixedMaze(rows, cols, seed) {
    var rng = mulberry32(seed);
    var grid = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) row.push({ top: true, right: true, bottom: true, left: true, visited: false });
      grid.push(row);
    }
    var opposite = { top: "bottom", right: "left", bottom: "top", left: "right" };
    function neighborsOf(r, c) {
      var cands = [["top", r - 1, c], ["right", r, c + 1], ["bottom", r + 1, c], ["left", r, c - 1]];
      var out = [];
      cands.forEach(function (cd) {
        var d = cd[0], nr = cd[1], nc = cd[2];
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !grid[nr][nc].visited) out.push([d, nr, nc]);
      });
      return out;
    }
    var stack = [];
    var cr = 0, cc = 0;
    grid[cr][cc].visited = true;
    var guard = 0;
    while (true) {
      guard++;
      if (guard > rows * cols * 20) break;
      var nbrs = neighborsOf(cr, cc);
      if (nbrs.length) {
        var pick = nbrs[Math.floor(rng() * nbrs.length)];
        var d = pick[0], nr = pick[1], nc = pick[2];
        grid[cr][cc][d] = false;
        grid[nr][nc][opposite[d]] = false;
        stack.push([cr, cc]);
        cr = nr; cc = nc;
        grid[cr][cc].visited = true;
      } else if (stack.length) {
        var p = stack.pop(); cr = p[0]; cc = p[1];
      } else {
        break;
      }
    }
    for (var i = 0; i < Math.floor(rows * cols / 6); i++) {
      var rr = Math.floor(rng() * rows), ccx = Math.floor(rng() * (cols - 1));
      if (grid[rr][ccx].right) { grid[rr][ccx].right = false; grid[rr][ccx + 1].left = false; }
    }
    return grid.map(function (row) {
      return row.map(function (cell) { return { top: cell.top, right: cell.right, bottom: cell.bottom, left: cell.left }; });
    });
  }
  var NAV_ROWS = 6, NAV_COLS = 8;
  var NAV_MAZE = buildFixedMaze(NAV_ROWS, NAV_COLS, 20260724);

  function drawMazeGrid(ctx, grid, cellSize, colorFn, opts) {
    opts = opts || {};
    var wallColor = opts.wallColor || "#f2e9d0";
    for (var r = 0; r < grid.length; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        var x = c * cellSize, y = r * cellSize;
        var fill = colorFn ? colorFn(r, c) : null;
        if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, cellSize, cellSize); }
        var cell = grid[r][c];
        ctx.strokeStyle = wallColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (cell.top) { ctx.moveTo(x, y); ctx.lineTo(x + cellSize, y); }
        if (cell.right) { ctx.moveTo(x + cellSize, y); ctx.lineTo(x + cellSize, y + cellSize); }
        if (cell.bottom) { ctx.moveTo(x, y + cellSize); ctx.lineTo(x + cellSize, y + cellSize); }
        if (cell.left) { ctx.moveTo(x, y); ctx.lineTo(x, y + cellSize); }
        ctx.stroke();
      }
    }
  }

  // -------------------------------------------- 14a. trace harness builders
  //
  // Same splicing pattern as the grading harnesses (buildFnSource + base64),
  // but instead of pass/fail these RUN one concrete scenario and RECORD a
  // trace. None of these contain a reference answer: every TODO line is
  // still just the student's own (possibly wrong, possibly blank) code,
  // spliced verbatim into scaffolding built from the GIVEN (non-TODO) parts
  // of the real files.

  function traceHarness_titleCard(code) {
    return [
      "import json, base64, traceback",
      b64Line("CODE", code),
      "def _run():",
      "    result = {'ok': True, 'error': None, 'title': '', 'subtitle': '', 'mission': [], 'howto': []}",
      "    try:",
      "        compile(CODE, '<student>', 'exec')",
      "    except SyntaxError as e:",
      "        result['ok'] = False",
      "        result['error'] = 'Python syntax error on line %s: %s.' % (e.lineno, e.msg)",
      "        return json.dumps(result)",
      "    try:",
      "        ns = {}",
      "        exec(compile(CODE, '<student>', 'exec'), {}, ns)",
      "        result['title'] = str(ns.get('TITLE', '(TITLE not set yet)'))",
      "        result['subtitle'] = str(ns.get('GAME_SUBTITLE', ''))",
      "        mr = ns.get('MISSION_RULES', [])",
      "        hr = ns.get('HOW_TO_PLAY_RULES', [])",
      "        result['mission'] = [str(x) for x in mr] if isinstance(mr, list) else []",
      "        result['howto'] = [str(x) for x in hr] if isinstance(hr, list) else []",
      "    except BaseException as e:",
      "        result['ok'] = False",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  // Runs one key press through the student's REAL code for TODO 2/3/4, the
  // same way the pygame game does one simulated frame: TODO 2 decides which
  // direction (if any) to call try_move with, TODO 3 supplies the guard
  // clause, and TODO 4 supplies the position update - single grid step,
  // instant, no acceleration/friction/glide.
  function traceHarness_playerMove(code2, code3, code4, mazeGrid, pressed, startRow, startCol) {
    var fn2 = buildFnSource("self, pygame, keys, moved", code2, "    ");
    var fn3 = buildFnSource("current, direction", code3, "    ");
    var fn4 = buildFnSource("self, dr, dc", code4, "    ");
    return [
      "import json, base64, traceback, sys",
      // Same line-budget guard the GRADING harnesses use (see _run_guarded in
      // PY_BONUS_HELPERS). It was missing here, which meant a `while True:`
      // left in a student's TODO 2 draft froze the Play tab / kiosk window
      // outright - Pyodide runs on the UI thread, so there was no way back
      // except closing the tab. This is the preview path, so it is reached
      // on every single key press, graded or not.
      "class _PreviewBudget(Exception):",
      "    pass",
      "def _preview_guarded(fn, args, budget=200000):",
      "    counter = [0]",
      "    def _tracer(frame, event, arg):",
      "        counter[0] += 1",
      "        if counter[0] > budget:",
      "            raise _PreviewBudget()",
      "        return _tracer",
      "    sys.settrace(_tracer)",
      "    try:",
      "        return fn(*args)",
      "    finally:",
      "        sys.settrace(None)",
      b64Line("FN2_SRC", fn2),
      b64Line("FN3_SRC", fn3),
      b64Line("FN4_SRC", fn4),
      "GRID = " + JSON.stringify(JSON.stringify(mazeGrid)),
      "PRESSED = " + JSON.stringify(pressed || ""),
      "START_ROW = " + Number(startRow),
      "START_COL = " + Number(startCol),
      "def _run():",
      "    result = {'ok': True, 'error': None, 'traceback': None, 'moved': None, 'calls': [], 'row': START_ROW, 'col': START_COL, 'wall_violation': False, 'unexpected_delta': False, 'direction_requested': None, 'try_move_returned': None}",
      "    grid = json.loads(GRID)",
      "    rows = len(grid); cols = len(grid[0]) if rows else 0",
      "    ns2 = {}",
      "    try:",
      "        exec(compile(FN2_SRC, '<t2>', 'exec'), {}, ns2)",
      "        exec(compile(FN3_SRC, '<t3>', 'exec'), {}, {})",
      "        exec(compile(FN4_SRC, '<t4>', 'exec'), {}, {})",
      "    except SyntaxError as e:",
      "        result['ok'] = False",
      // buildFnSource() prepends exactly one `def _fn(...)` line to each of
      // the three snippets, so Python's line number is one ahead of what the
      // student sees in the editor. The grading path already corrected for
      // this (see _compile_body); this preview path did not.
      "        result['error'] = 'Python syntax error on line %s: %s.' % (max(1, (e.lineno or 1) - 1), e.msg)",
      "        return json.dumps(result)",
      "    fn2 = ns2['_fn']",
      "    class Cell:",
      "        def __init__(self, r, c):",
      "            self.row = r; self.col = c",
      "            self.walls = dict(grid[r][c])",
      "    cells = [[Cell(r, c) for c in range(cols)] for r in range(rows)]",
      "    class Maze:",
      "        def get_cell(self, r, c):",
      "            if 0 <= r < rows and 0 <= c < cols:",
      "                return cells[r][c]",
      "            return None",
      "    maze = Maze()",
      "    DR_DC = {'top': (-1, 0), 'right': (0, 1), 'bottom': (1, 0), 'left': (0, -1)}",
      "    class Pygame:",
      "        K_LEFT = 1; K_e = 2; K_RIGHT = 3; K_f = 4",
      "        K_UP = 5; K_c = 6; K_DOWN = 7; K_d = 8",
      "    pygame = Pygame()",
      "    key_map = {'K_LEFT': pygame.K_LEFT, 'K_e': pygame.K_e,",
      "               'K_RIGHT': pygame.K_RIGHT, 'K_f': pygame.K_f,",
      "               'K_UP': pygame.K_UP, 'K_c': pygame.K_c,",
      "               'K_DOWN': pygame.K_DOWN, 'K_d': pygame.K_d}",
      "    keys = dict((v, False) for v in key_map.values())",
      "    if PRESSED in key_map:",
      "        keys[key_map[PRESSED]] = True",
      "    class Player:",
      "        def __init__(self, row, col):",
      "            self.row = row; self.col = col",
      "        def try_move(self, direction, maze_arg):",
      "            result['calls'].append(direction)",
      "            result['direction_requested'] = direction",
      "            current = maze_arg.get_cell(self.row, self.col)",
      "            ns3 = {'current': current, 'direction': direction}",
      "            exec(compile(FN3_SRC, '<t3>', 'exec'), {}, ns3)",
      "            out3 = ns3['_fn'](current, direction)",
      "            if out3 is False:",
      "                result['try_move_returned'] = False",
      "                return False",
      "            dr, dc = DR_DC[direction]",
      "            ns4 = {}",
      "            exec(compile(FN4_SRC, '<t4>', 'exec'), {}, ns4)",
      "            ns4['_fn'](self, dr, dc)",
      "            result['try_move_returned'] = True",
      "            return True",
      "    player = Player(START_ROW, START_COL)",
      "    class SelfObj:",
      "        pass",
      "    self_ = SelfObj()",
      "    self_.player = player",
      "    self_.maze = maze",
      "    try:",
      "        out2 = _preview_guarded(fn2, (self_, pygame, keys, False))",
      "        moved = out2.get('moved', False) if isinstance(out2, dict) else out2",
      "        result['moved'] = moved if isinstance(moved, bool) else bool(moved)",
      "        old_row, old_col = START_ROW, START_COL",
      "        result['row'] = player.row",
      "        result['col'] = player.col",
      "        if result['calls']:",
      "            last_dir = result['calls'][-1]",
      "            dr, dc = DR_DC[last_dir]",
      "            cell_before = cells[old_row][old_col]",
      "            wall_present = cell_before.walls.get(last_dir, True)",
      "            if wall_present and (player.row != old_row or player.col != old_col):",
      "                result['wall_violation'] = True",
      "            if player.row != old_row or player.col != old_col:",
      "                exp_row, exp_col = old_row + dr, old_col + dc",
      "                if player.row != exp_row or player.col != exp_col:",
      "                    result['unexpected_delta'] = True",
      // Must come BEFORE `except Exception` - _PreviewBudget is one.
      "    except _PreviewBudget:",
      "        result['ok'] = False",
      "        result['error'] = ('your code never finished - it was still running after a very long '",
      "                           'time, so it was stopped. This almost always means a loop that never '",
      "                           'ends; check that every while loop can actually reach its stopping condition.')",
      "    except Exception as e:",
      "        result['ok'] = False",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  // D4 changelog note: swamp placement and the treasure/swamp/custom-item/
  // custom-terrain "score board" preview used to be built here
  // (traceHarness_swampPlacement / traceHarness_scoreBoard). Both were
  // deleted along with score/swamp/treasure/custom-terrain themselves -
  // the game is pure maze-solving now (goal + timer + bomb-reset), so
  // there is no running score to animate and nothing left to place along
  // the shortest path except bombs, which spawn randomly (see game.py's
  // create_game_objects - given, not a TODO). TODO 10's Bonus preview is
  // the much simpler traceHarness_customItems below.

  // Lightweight preview for the CUSTOM_ITEMS Bonus (TODO 10): parses the
  // student's list and returns it as-is (name/color/effect/amount) for
  // the customItemLab visualizer to render as a simple card list - no
  // simulation needed since there's no cumulative score to animate any
  // more, just "here's what your item(s) look like and do."
  function traceHarness_customItems(code) {
    return [
      "import json, base64, traceback",
      b64Line("CODE", code),
      "def _run():",
      "    result = {'ok': True, 'error': None, 'items': []}",
      "    try:",
      "        ns = {}",
      "        exec(compile(CODE, '<t8>', 'exec'), {}, ns)",
      "        items = ns.get('CUSTOM_ITEMS') or []",
      "        out = []",
      "        for item_def in items:",
      "            if not isinstance(item_def, dict):",
      "                continue",
      // image/size travel with the preview too, so the Play tab and the
      // custom-item lab can draw the student's OWN artwork at the size
      // they chose rather than a generic swatch.
      "            raw_size = item_def.get('size', 1.0)",
      "            if isinstance(raw_size, bool) or not isinstance(raw_size, (int, float)):",
      "                raw_size = 1.0",
      "            size = max(0.1, min(3.0, float(raw_size)))",
      "            image = item_def.get('image')",
      "            sound = item_def.get('sound')",
      "            out.append({",
      "                'name': str(item_def.get('name', 'Custom Item')),",
      "                'color': list(item_def.get('color', (180, 180, 180))),",
      "                'effect': str(item_def.get('effect', '')),",
      "                'amount': item_def.get('amount', 0),",
      "                'size': size,",
      "                'image': image if isinstance(image, str) else None,",
      "                'sound': sound if isinstance(sound, str) else None,",
      "            })",
      "        result['items'] = out",
      "    except BaseException as e:",
      "        result['ok'] = False",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  // Standalone weighted-grid demo for Required TODO 5 (relaxation, now
  // split into Part 1/2 + Part 2/2). Splices the student's two blocks,
  // reassembled in their real sequential order, fresh on every neighbor
  // visit, same style as the other trace harnesses that animate a live
  // student function.
  function traceHarness_dijkstra(code5a, code5b, rows, cols, weights, start, end) {
    var fn5 = buildFnSourceTwoParts("cost, step_cost, neighbor, current, distance, parent, queue", code5a, code5b, "    ");
    return [
      "import json, base64, heapq, traceback",
      b64Line("FN5_SRC", fn5),
      "ROWS = " + Number(rows),
      "COLS = " + Number(cols),
      "WEIGHTS = " + JSON.stringify(JSON.stringify(weights)),
      "START = " + JSON.stringify(start),
      "END = " + JSON.stringify(end),
      "BUDGET = " + FLOOD_BUDGET,
      "TRACE_CAP = " + TRACE_CAP,
      "def _run():",
      "    result = {'ok': True, 'error': None, 'traceback': None, 'trace': [], 'stopped_reason': None, 'path': [], 'total_cost': None, 'weight_shift': None}",
      "    weights = json.loads(WEIGHTS)",
      "    start = tuple(START); end = tuple(END)",
      "    def get_open_neighbors(pos):",
      "        r, c = pos",
      "        out = []",
      "        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):",
      "            nr, nc = r + dr, c + dc",
      "            if 0 <= nr < ROWS and 0 <= nc < COLS:",
      "                out.append((nr, nc))",
      "        return out",
      "    try:",
      "        exec(compile(FN5_SRC, '<t5>', 'exec'), {'heapq': heapq}, {})",
      "    except SyntaxError as e:",
      "        result['ok'] = False",
      "        result['error'] = 'Python syntax error on line %s: %s.' % (e.lineno, e.msg)",
      "        return json.dumps(result)",
      "    all_weights = [weights[r][c] for r in range(ROWS) for c in range(COLS)]",
      "    minimum_weight = min(all_weights)",
      "    weight_shift = 1 - minimum_weight",
      "    result['weight_shift'] = weight_shift",
      "    def get_positive_weight(pos):",
      "        return weights[pos[0]][pos[1]] + weight_shift",
      "    queue = [(0, start)]",
      "    distance = {start: 0}",
      "    parent = {start: None}",
      "    visited = set()",
      "    steps = 0",
      "    try:",
      "        while queue:",
      "            steps += 1",
      "            if steps > BUDGET:",
      "                result['stopped_reason'] = 'budget'",
      "                break",
      "            cost, current = heapq.heappop(queue)",
      "            if current in visited:",
      "                continue",
      "            visited.add(current)",
      "            if current == end:",
      "                break",
      "            for neighbor in get_open_neighbors(current):",
      "                if neighbor in visited:",
      "                    continue",
      "                step_cost = get_positive_weight(neighbor)",
      "                if step_cost <= 0:",
      "                    continue",
      "                ns5 = {}",
      "                exec(compile(FN5_SRC, '<t5>', 'exec'), {'heapq': heapq}, ns5)",
      "                ns5['_fn'](cost, step_cost, neighbor, current, distance, parent, queue)",
      "                if neighbor in distance and len(result['trace']) < TRACE_CAP:",
      "                    result['trace'].append({'type': 'visit', 'cell': list(neighbor), 'cost': distance[neighbor], 'from': list(current), 'queue': [[q[0], list(q[1])] for q in sorted(queue)[:8]]})",
      "        if end in parent:",
      "            path = [end]; cur = end; seen = {end}",
      "            while cur != start:",
      "                nxt = parent.get(cur)",
      "                if nxt is None or nxt in seen:",
      "                    path = []",
      "                    break",
      "                path.append(nxt); seen.add(nxt); cur = nxt",
      "            path.reverse()",
      "            result['path'] = [list(p) for p in path]",
      "            result['total_cost'] = distance.get(end)",
      "    except BaseException as e:",
      "        result['ok'] = False",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  // D3/D4 changelog note: this file used to also define
  // traceHarness_customValues (extracted a custom item AND custom terrain
  // preview) and traceHarness_scoreDelta (one real scoring step for the
  // Play tab). Both were deleted - custom terrain no longer exists, score
  // no longer exists, and CUSTOM_ITEMS' new preview is
  // traceHarness_customItems above.

  // Dijkstra's hint route drawn on the REAL round maze (walls only - no
  // terrain concept exists any more), using the student's Required TODO 5
  // code (both parts, reassembled) and BOMB-avoidance route weights - the
  // sole remaining purpose of find_path_dijkstra after D (monster/swamp/
  // treasure removed): mirrors game.py's get_current_route_weight exactly
  // (STUDENT_NORMAL_WEIGHT for every open cell, STUDENT_BOMB_WEIGHT for a
  // cell an ACTIVE bomb currently occupies).
  function traceHarness_hintRoute(code5a, code5b, mazeGrid, bombPositions, start, end) {
    var fn5 = buildFnSourceTwoParts("cost, step_cost, neighbor, current, distance, parent, queue", code5a, code5b, "    ");
    return [
      "import json, heapq, base64, traceback",
      b64Line("FN5_SRC", fn5),
      "GRID = " + JSON.stringify(JSON.stringify(mazeGrid)),
      "BOMB_POSITIONS = " + JSON.stringify(JSON.stringify(bombPositions)),
      "START = " + JSON.stringify(start),
      "END = " + JSON.stringify(end),
      "BUDGET = " + FLOOD_BUDGET,
      "STUDENT_NORMAL_WEIGHT = 0",
      "STUDENT_BOMB_WEIGHT = 1000",
      "def _run():",
      "    result = {'ok': True, 'error': None, 'traceback': None, 'path': [], 'total_cost': None}",
      "    grid = json.loads(GRID); bomb_positions = json.loads(BOMB_POSITIONS)",
      "    rows = len(grid); cols = len(grid[0]) if rows else 0",
      "    start = tuple(START); end = tuple(END)",
      "    def get_open_neighbors(pos):",
      "        r, c = pos",
      "        cell = grid[r][c]",
      "        out = []",
      "        for d, dr, dc in (('top', -1, 0), ('right', 0, 1), ('bottom', 1, 0), ('left', 0, -1)):",
      "            if not cell.get(d, True):",
      "                nr, nc = r + dr, c + dc",
      "                if 0 <= nr < rows and 0 <= nc < cols:",
      "                    out.append((nr, nc))",
      "        return out",
      "    def get_route_weight(pos):",
      "        key = str(pos[0]) + ',' + str(pos[1])",
      "        return STUDENT_BOMB_WEIGHT if bomb_positions.get(key) else STUDENT_NORMAL_WEIGHT",
      "    try:",
      "        exec(compile(FN5_SRC, '<t5>', 'exec'), {'heapq': heapq}, {})",
      "    except SyntaxError as e:",
      "        result['ok'] = False",
      "        result['error'] = 'Python syntax error on line %s: %s.' % (e.lineno, e.msg)",
      "        return json.dumps(result)",
      "    all_weights = [get_route_weight((r, c)) for r in range(rows) for c in range(cols)]",
      "    shift = 1 - min(all_weights)",
      "    queue = [(0, start)]; distance = {start: 0}; parent = {start: None}; visited = set()",
      "    steps = 0",
      "    try:",
      "        while queue:",
      "            steps += 1",
      "            if steps > BUDGET:",
      "                break",
      "            cost, current = heapq.heappop(queue)",
      "            if current in visited:",
      "                continue",
      "            visited.add(current)",
      "            if current == end:",
      "                break",
      "            for neighbor in get_open_neighbors(current):",
      "                if neighbor in visited:",
      "                    continue",
      "                step_cost = get_route_weight(neighbor) + shift",
      "                if step_cost <= 0:",
      "                    continue",
      "                ns5 = {}",
      "                exec(compile(FN5_SRC, '<t5>', 'exec'), {'heapq': heapq}, ns5)",
      "                ns5['_fn'](cost, step_cost, neighbor, current, distance, parent, queue)",
      "        if end in parent:",
      "            path = [end]; cur = end; seen = {end}",
      "            while cur != start:",
      "                nxt = parent.get(cur)",
      "                if nxt is None or nxt in seen:",
      "                    path = []",
      "                    break",
      "                path.append(nxt); seen.add(nxt); cur = nxt",
      "            path.reverse()",
      "            result['path'] = [list(p) for p in path]",
      "            result['total_cost'] = distance.get(end)",
      "    except BaseException as e:",
      "        result['ok'] = False",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  // -------------------------------------------------- 14b. titleCard viz

  var TitleCardViz = (function () {
    var refs = null;
    var boundTextarea = null;
    var onInputHandler = null;
    var debouncedRefresh = null;

    function renderTitleList(ul, items) {
      ul.innerHTML = "";
      (items || []).forEach(function (item) { ul.appendChild(el("li", { text: item })); });
    }

    function refresh(state) {
      if (!refs) return;
      // TODO 1 is one step, one string. The TODO 11 group is two separate
      // sub-steps (11-1 mission, 11-2 how-to-play) that share one preview,
      // so feed the whole group's settings code in - otherwise opening
      // 11-1 would blank out the how-to-play half of the card.
      var group = bonusGroupOf(state.step.id);
      var code = group
        ? group.ids.map(bonusCode).join("\n")
        : state.stepData.code;
      refs.status.textContent = "Running your code...";
      refs.status.className = "titlecard-status muted";
      ensurePyodide().then(function (py) {
        return py.runPythonAsync(traceHarness_titleCard(code));
      }).then(function (json) {
        if (!refs) return;
        var data = JSON.parse(json);
        if (!data.ok) {
          refs.title.textContent = "(fix the syntax error below to preview your title)";
          refs.subtitle.textContent = "";
          renderTitleList(refs.missionList, []);
          renderTitleList(refs.howtoList, []);
          refs.status.textContent = data.error || "Could not run your code.";
          refs.status.className = "titlecard-status status-bad";
          return;
        }
        refs.title.textContent = data.title;
        refs.subtitle.textContent = data.subtitle;
        renderTitleList(refs.missionList, data.mission);
        renderTitleList(refs.howtoList, data.howto);
        refs.status.textContent = "Live preview of your actual TITLE / rules — updates as you type.";
        refs.status.className = "titlecard-status muted";
      }).catch(function (err) {
        if (!refs) return;
        refs.status.textContent = "Could not run: " + (err && err.message ? err.message : err);
        refs.status.className = "titlecard-status status-bad";
      });
    }

    function attachToEditor(state) {
      var ta = document.querySelector("#mainPanel .code-textarea");
      if (ta && ta !== boundTextarea) {
        if (boundTextarea && onInputHandler) boundTextarea.removeEventListener("input", onInputHandler);
        onInputHandler = function () { debouncedRefresh(state); };
        ta.addEventListener("input", onInputHandler);
        boundTextarea = ta;
      }
    }

    return {
      mount: function (container, state) {
        container.innerHTML = "";
        var frame = el("div", { class: "titlecard-frame" });
        var title = el("div", { class: "titlecard-title" });
        var subtitle = el("div", { class: "titlecard-subtitle" });
        var missionHead = el("div", { class: "titlecard-section-head", text: "Mission" });
        var missionList = el("ul", { class: "titlecard-list" });
        var howtoHead = el("div", { class: "titlecard-section-head", text: "How To Play" });
        var howtoList = el("ul", { class: "titlecard-list" });
        frame.appendChild(title); frame.appendChild(subtitle);
        frame.appendChild(missionHead); frame.appendChild(missionList);
        frame.appendChild(howtoHead); frame.appendChild(howtoList);
        var status = el("div", { class: "titlecard-status muted", text: "Loading…" });
        container.appendChild(frame);
        container.appendChild(status);
        refs = { title: title, subtitle: subtitle, missionList: missionList, howtoList: howtoList, status: status };
        debouncedRefresh = debounce(refresh, 450);
        boundTextarea = null;
        attachToEditor(state);
        refresh(state);
      },
      show: function (state) { attachToEditor(state); refresh(state); },
      update: function (state) { refresh(state); },
      unmount: function () {
        if (boundTextarea && onInputHandler) boundTextarea.removeEventListener("input", onInputHandler);
        refs = null; boundTextarea = null; onInputHandler = null;
      },
    };
  })();
  Visualizer.register("titleCard", TitleCardViz);

  // -------------------------------------------------- 14c. playerMove viz
  //
  // TODO 2 (key dispatch) -> TODO 3 (guard clause) -> TODO 4 (position delta)
  // is a strict AND-chain: a perfectly-correct TODO 2 still produces zero
  // visible movement if TODO 3/4 are untouched `pass` starters, because
  // nothing yet exists to actually change self.row/self.col. Each step's own
  // demo must be isolated to the TODO the student is actually working on, so
  // the other two fall back to a REFERENCE implementation whenever the
  // student hasn't completed them yet (once completed, their real code is
  // used instead - more accurate and more satisfying).
  //
  // These reference bodies are intentionally NOT the literal graded answer
  // (see REFERENCE_* below) - they're a different-shaped-but-behaviourally-
  // equivalent stand-in, the same principle harness_movement_2 itself now
  // uses (its FakePlayer.try_move is an independent, correct reference
  // implementation, not the student's own TODO 3/4 code - see B1's
  // changelog note above harness_movement_2): compute the same result via
  // a different code shape, without reproducing the exact expected snippet
  // a student is graded on. Verified
  // against the REAL grading harnesses (harness_movement_2/guardClause_3/
  // positionDelta_4) to confirm they are behaviourally correct substitutes.
  var REFERENCE_CODE = {
    "2": [
      // A loop-based dispatch - a different shape than the canonical
      // if/elif chain, but behaviourally equivalent (verified against the
      // real grading harness), recognizing the arrow keys and the
      // classroom controller alike.
      'key_direction_pairs = [',
      '    (pygame.K_LEFT, "left"), (pygame.K_e, "left"),',
      '    (pygame.K_RIGHT, "right"), (pygame.K_f, "right"),',
      '    (pygame.K_UP, "top"), (pygame.K_c, "top"),',
      '    (pygame.K_DOWN, "bottom"), (pygame.K_d, "bottom"),',
      ']',
      'for key_const, direction in key_direction_pairs:',
      '    if keys[key_const]:',
      '        moved = self.player.try_move(direction, self.maze)',
      '        break',
    ].join("\n"),
    "3": [
      'if current is None:',
      '    return False',
      'if current.walls[direction]:',
      '    return False',
    ].join("\n"),
    "4": [
      'self.row = self.row + dr',
      'self.col = self.col + dc',
    ].join("\n"),
    // TODO 5's two relaxation blocks. Unlike 2/3/4 there is no meaningfully
    // different way to write these, so this is close to the answer - but
    // that is not a new disclosure: data.js's hint for TODO 5 already
    // spells both parts out in full, deliberately (see its header comment
    // about near-complete hints). Used only so the Hint button works in
    // the showcase demo and in the Play tab while TODO 5 is unfinished.
    "5": [
      'new_cost = cost + step_cost',
      [
        'if neighbor not in distance or new_cost < distance[neighbor]:',
        '    distance[neighbor] = new_cost',
        '    parent[neighbor] = current',
        '    heapq.heappush(queue, (new_cost, neighbor))',
      ].join("\n"),
    ],
  };

  var PlayerMoveViz = (function () {
    var refs = null;
    var pos = { row: 0, col: 0 };
    var violations = 0;
    var lastKeyLabel = "—";
    var busy = false;
    var CELL = 0;
    var viewingStepId = null;

    // Real code for the step currently being viewed (always - that's the
    // whole point of the demo); for the OTHER two steps, real code once
    // they're completed, otherwise the reference stand-in above so an
    // unfinished downstream step can never block seeing today's TODO work.
    function codeFor(id) {
      var st = state.steps[id];
      if (id === viewingStepId || st.status === "completed") return st.code;
      return REFERENCE_CODE[id];
    }

    function currentCode() {
      return {
        code2: codeFor("2"),
        code3: codeFor("3"),
        code4: codeFor("4"),
      };
    }

    function draw() {
      if (!refs) return;
      var ctx = refs.ctx;
      ctx.clearRect(0, 0, refs.canvas.width, refs.canvas.height);
      ctx.fillStyle = "#171310";
      ctx.fillRect(0, 0, refs.canvas.width, refs.canvas.height);
      drawMazeGrid(ctx, NAV_MAZE, CELL, function (r, c) {
        if (r === NAV_ROWS - 1 && c === NAV_COLS - 1) return "rgba(201,151,31,0.30)";
        return null;
      }, { wallColor: "#e8dcc4" });
      ctx.fillStyle = "#c9971f";
      ctx.beginPath();
      ctx.arc((NAV_COLS - 0.5) * CELL, (NAV_ROWS - 0.5) * CELL, CELL * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4fa3e3";
      ctx.beginPath();
      ctx.arc((pos.col + 0.5) * CELL, (pos.row + 0.5) * CELL, CELL * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1c1a17";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    function updateReadout() {
      if (!refs) return;
      refs.readout.set("pos", "(" + pos.row + ", " + pos.col + ")");
      refs.readout.set("lastKey", lastKeyLabel);
      refs.readout.set("violations", String(violations));
    }

    function resetPos() {
      pos = { row: 0, col: 0 };
      violations = 0;
      lastKeyLabel = "—";
      if (refs) refs.verdict.clear();
      updateReadout();
      draw();
    }

    function handleKey(pressedName) {
      if (busy) return;
      busy = true;
      var codes = currentCode();
      ensurePyodide().then(function (py) {
        var src = traceHarness_playerMove(
          codes.code2, codes.code3, codes.code4,
          NAV_MAZE, pressedName, pos.row, pos.col);
        return py.runPythonAsync(src);
      }).then(function (json) {
        busy = false;
        var data = JSON.parse(json);
        lastKeyLabel = pressedName.replace("K_", "") + " → " + (data.direction_requested || "(no branch matched — check TODO 2)");
        if (!data.ok) {
          if (refs) refs.verdict.set(false, data.error || "Your code raised an error while moving.");
          updateReadout();
          return;
        }
        pos.row = data.row; pos.col = data.col;
        if (data.wall_violation) {
          violations++;
          if (refs) refs.verdict.set(false, "The player just walked straight through a wall (violation #" + violations + "). Check TODO 3's guard clause.");
        } else if (data.unexpected_delta) {
          if (refs) refs.verdict.set(false, "The player moved to an unexpected cell — not a single step in the requested direction. Check TODO 4.");
        } else if (data.calls.length === 0) {
          if (refs) refs.verdict.info("No branch matched this key in TODO 2 — moved: " + data.moved + ".");
        } else {
          if (refs) refs.verdict.set(true, "try_move(\"" + data.direction_requested + "\") → " + data.try_move_returned);
        }
        updateReadout();
        draw();
      }).catch(function (err) {
        busy = false;
        if (refs) refs.verdict.set(false, "Could not run: " + (err && err.message ? err.message : err));
      });
    }

    // The arrow keys and the classroom bluetooth controller's buttons
    // (E/F/C/D = left/right/up/down). WASD is not used.
    var KEY_TO_KEYNAME = {
      ArrowLeft: "K_LEFT", e: "K_e", E: "K_e",
      ArrowRight: "K_RIGHT", f: "K_f", F: "K_f",
      ArrowUp: "K_UP", c: "K_c", C: "K_c",
      ArrowDown: "K_DOWN", d: "K_d", D: "K_d",
    };

    // Captured at the document level (not just the canvas) so a student who
    // types code then presses arrow keys WITHOUT first clicking the board
    // (the natural flow) still sees it work - the only thing that should
    // suppress this is focus actually being inside a typing target (the
    // code editor textarea, in particular), same rule as the Play tab uses
    // to keep code-editing and game-piloting keys from colliding.
    function isTypingTarget(e) {
      var t = e.target;
      var tag = t && t.tagName;
      return tag === "TEXTAREA" || tag === "INPUT" || (t && t.isContentEditable);
    }
    function onKeydown(e) {
      if (isTypingTarget(e)) return;
      var keyname = KEY_TO_KEYNAME[e.key];
      if (!keyname) return;
      e.preventDefault();
      handleKey(keyname);
    }

    return {
      mount: function (container, state0) {
        viewingStepId = state0 && state0.step ? state0.step.id : null;
        container.innerHTML = "";
        container.appendChild(el("p", { class: "small muted", text: "Use the Arrow keys (or E/F/C/D) anywhere on this page — no need to click the board first. Hold a direction and watch the player build up speed, then glide a little after you let go." }));
        var boardWrap = el("div", { class: "viz-board-wrap" });
        var width = fitWidth(container, 340);
        CELL = Math.max(20, Math.floor(width / NAV_COLS));
        var made = makeCanvas(CELL * NAV_COLS, CELL * NAV_ROWS);
        made.canvas.tabIndex = 0;
        made.canvas.className = "viz-canvas viz-canvas-focusable";
        made.canvas.setAttribute("aria-label", "Maze board — use the arrow keys or E/F/C/D to move, anywhere on this page");
        boardWrap.appendChild(made.canvas);
        container.appendChild(boardWrap);
        var readout = buildReadout([
          { key: "pos", label: "Position (row, col)" },
          { key: "lastKey", label: "Last key → direction" },
          { key: "violations", label: "Wall violations" },
        ]);
        container.appendChild(readout.node);
        var verdict = buildVerdict();
        container.appendChild(verdict.node);
        var resetBtn = el("button", { class: "btn btn-small mt-8", type: "button", text: "Reset position", onclick: resetPos });
        container.appendChild(resetBtn);
        refs = { canvas: made.canvas, ctx: made.ctx, readout: readout, verdict: verdict };
        document.addEventListener("keydown", onKeydown);
        resetPos();
      },
      show: function (state0) {
        if (state0 && state0.step) viewingStepId = state0.step.id;
        draw(); updateReadout();
      },
      update: function (state0) {
        if (state0 && state0.step) viewingStepId = state0.step.id;
        draw(); updateReadout();
      },
      unmount: function () {
        document.removeEventListener("keydown", onKeydown);
        refs = null;
      },
    };
  })();
  Visualizer.register("playerMove", PlayerMoveViz);

  // -------------------------------------------------- 14f. customItemLab viz

  // D4 replacement for the old ScoreBoardViz (which animated a running
  // score across treasure/swamp/custom_item/custom_terrain tiles - none of
  // that exists any more). TODO 10's Bonus is now just "design your own
  // collectible(s)", so the preview is equally simple: parse CUSTOM_ITEMS
  // and show each entry as a card (swatch, name, and a plain-English
  // description of its effect) - no simulation, nothing to step through.
  var CustomItemLabViz = (function () {
    var refs = null;

    function effectDescription(item) {
      var effect = item.effect, amount = item.amount;
      if (effect === "add_time") return "+" + amount + "s time when collected";
      if (effect === "add_hint") return "+" + amount + " hint use(s) when collected";
      if (effect) return "effect: " + effect + " (not a built-in effect - safe no-op in the real game)";
      return "no effect set";
    }

    function renderItems(items) {
      if (!refs) return;
      refs.list.innerHTML = "";
      if (!items.length) {
        refs.list.appendChild(el("p", { class: "small muted", text: "CUSTOM_ITEMS is empty right now - add at least one dictionary to see a preview here." }));
        return;
      }
      items.forEach(function (item) {
        var color = "rgb(" + item.color.join(",") + ")";
        var card = el("div", { class: "viz-readout", style: "display:flex;align-items:center;gap:10px;padding:8px 0;" }, [
          el("span", { style: "width:22px;height:22px;border-radius:50%;flex-shrink:0;display:inline-block;background:" + color + ";border:1px solid rgba(0,0,0,0.25);" }),
          el("span", {}, [
            el("strong", { text: item.name }),
            el("br"),
            el("span", { class: "small muted", text: effectDescription(item) }),
          ]),
        ]);
        refs.list.appendChild(card);
      });
    }

    function runFresh() {
      // The TODO 10 group is six sub-steps now (10-1 is the settings.py data,
      // 10-2 … 10-6 are the game.py effect code) - this preview only needs 10-1.
      var code = bonusCode("10-1");
      if (refs) refs.verdict.info("Running your code…");
      ensurePyodide().then(function (py) {
        return py.runPythonAsync(traceHarness_customItems(code));
      }).then(function (json) {
        var data = JSON.parse(json);
        if (!data.ok) {
          if (refs) { refs.verdict.set(false, data.error || "Your code raised an error."); renderItems([]); }
          return;
        }
        renderItems(data.items);
        if (refs) refs.verdict.info(data.items.length + " item(s) defined. Each round spawns several, randomly drawn from this list.");
      }).catch(function (err) { if (refs) refs.verdict.set(false, "Could not run: " + (err && err.message ? err.message : err)); });
    }

    return {
      mount: function (container) {
        container.innerHTML = "";
        var actions = el("div", { class: "viz-controlbar" }, [
          el("button", { class: "btn btn-small btn-secondary", type: "button", text: "↻ Refresh preview", onclick: runFresh }),
        ]);
        container.appendChild(actions);
        container.appendChild(el("p", { class: "small muted", text: "\"Refresh preview\" re-reads your last-saved code here without submitting an attempt — press \"Run my code\" above (in the editor) to check your answer." }));
        var list = el("div", {});
        container.appendChild(list);
        var verdict = buildVerdict();
        container.appendChild(verdict.node);
        refs = { list: list, verdict: verdict };
        runFresh();
      },
      show: function () { runFresh(); },
      update: function () { runFresh(); },
      unmount: function () { refs = null; },
    };
  })();
  Visualizer.register("customItemLab", CustomItemLabViz);

  // -------------------------------------------------- 14g. dijkstraFrontier viz

  var DijkstraViz = (function () {
    var refs = null;
    var CELL = 0;
    var ROWS = 6, COLS = 6;
    var weights = null;
    var CYCLE = [1, 2, 3, 5, 9];
    var negativePreset = false;
    var visited = [];
    var pathCells = [];
    var playback = null;
    var START = [0, 0], END = [5, 5];
    var pqSnapshot = [];

    function defaultWeights() {
      var w = [];
      for (var r = 0; r < ROWS; r++) { var row = []; for (var c = 0; c < COLS; c++) row.push(1); w.push(row); }
      for (var c2 = 0; c2 < COLS - 1; c2++) w[3][c2] = 9;
      return w;
    }
    function negativeWeights() {
      var w = [];
      for (var r = 0; r < ROWS; r++) { var row = []; for (var c = 0; c < COLS; c++) row.push(0); w.push(row); }
      w[0][2] = -100; w[1][3] = -100;
      w[4][1] = 100; w[4][4] = 100;
      return w;
    }

    function draw() {
      if (!refs) return;
      var ctx = refs.ctx;
      ctx.clearRect(0, 0, refs.canvas.width, refs.canvas.height);
      ctx.fillStyle = "#171310";
      ctx.fillRect(0, 0, refs.canvas.width, refs.canvas.height);
      var visitedMap = {};
      visited.forEach(function (v) { visitedMap[v.cell[0] + "," + v.cell[1]] = v.cost; });
      var pathSet = {};
      pathCells.forEach(function (p) { pathSet[p[0] + "," + p[1]] = true; });
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var x = c * CELL, y = r * CELL;
          var key = r + "," + c;
          var bg = "rgba(255,255,255,0.03)";
          if (pathSet[key]) bg = "#8b5cf6";
          else if (visitedMap[key] !== undefined) bg = "rgba(111,184,236,0.28)";
          ctx.fillStyle = bg;
          ctx.fillRect(x, y, CELL, CELL);
          ctx.strokeStyle = "#3a3327";
          ctx.strokeRect(x, y, CELL, CELL);
          ctx.fillStyle = "#ece3cf";
          ctx.font = (CELL * 0.28) + "px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(weights[r][c]), x + CELL / 2, y + CELL * 0.35);
          if (visitedMap[key] !== undefined) {
            ctx.font = (CELL * 0.22) + "px monospace";
            ctx.fillStyle = "#8fbf9a";
            ctx.fillText("c" + visitedMap[key], x + CELL / 2, y + CELL * 0.72);
          }
        }
      }
      ctx.fillStyle = "#57c084";
      ctx.beginPath(); ctx.arc((START[1] + 0.5) * CELL, (START[0] + 0.5) * CELL, CELL * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#c9971f";
      ctx.beginPath(); ctx.arc((END[1] + 0.5) * CELL, (END[0] + 0.5) * CELL, CELL * 0.14, 0, Math.PI * 2); ctx.fill();
    }

    function renderPQ() {
      if (!refs) return;
      refs.pqList.innerHTML = "";
      pqSnapshot.forEach(function (q) {
        refs.pqList.appendChild(el("li", { text: "cost " + q[0] + " → (" + q[1][0] + "," + q[1][1] + ")" }));
      });
    }

    function applyEvent(evt) {
      if (evt.type === "visit") { visited.push(evt); pqSnapshot = evt.queue || []; renderPQ(); }
      else if (evt.type === "path") { pathCells = evt.cells; }
      draw();
    }

    function runFresh() {
      var c5 = state.steps["5"].code;
      if (refs) refs.verdict.info("Running your code…");
      ensurePyodide().then(function (py) {
        return py.runPythonAsync(traceHarness_dijkstra(c5[0], c5[1], ROWS, COLS, weights, START, END));
      }).then(function (json) {
        var data = JSON.parse(json);
        visited = []; pathCells = []; pqSnapshot = [];
        renderPQ(); draw();
        if (!data.ok) { if (refs) refs.verdict.set(false, data.error || "Your code raised an error."); return; }
        playback.setTrace(data.trace);
        playback._lastData = data;
        if (refs) refs.readout.set("shift", "min weight " + (Math.min.apply(null, weights.reduce(function (a, r2) { return a.concat(r2); }, []))) + " → offset +" + data.weight_shift);
      }).catch(function (err) { if (refs) refs.verdict.set(false, "Could not run: " + (err && err.message ? err.message : err)); });
    }

    function showFinalVerdict() {
      var data = playback._lastData;
      if (!refs || !data) return;
      if (data.stopped_reason === "budget") { refs.verdict.set(false, "Stopped after " + FLOOD_BUDGET + " steps."); return; }
      if (data.stopped_reason === "todo_incomplete") { refs.verdict.set(false, "TODO 5 isn't producing a route yet."); return; }
      // Ground truth optimum for verdict comparison: computed with a plain
      // generic JS Dijkstra over the CURRENT weights (comparison-only, not
      // Python, not shown as a stand-in for any TODO).
      var optimum = jsReferenceDijkstra(weights, START, END);
      if (data.total_cost != null && optimum != null && data.total_cost === optimum) {
        refs.verdict.set(true, "Path cost " + data.total_cost + " (optimum " + optimum + ")");
      } else if (data.total_cost != null) {
        refs.verdict.set(false, "Path cost " + data.total_cost + " (optimum " + (optimum == null ? "?" : optimum) + ")");
      } else {
        refs.verdict.set(false, "No path reconstructed yet.");
      }
    }

    function cycleCell(r, c) {
      var cur = weights[r][c];
      var i = CYCLE.indexOf(cur);
      weights[r][c] = i === -1 ? CYCLE[0] : CYCLE[(i + 1) % CYCLE.length];
      draw();
    }

    function onCanvasClick(e) {
      var rect = refs.canvas.getBoundingClientRect();
      var x = e.clientX - rect.left, y = e.clientY - rect.top;
      var c = Math.floor(x / CELL), r = Math.floor(y / CELL);
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) cycleCell(r, c);
    }

    return {
      mount: function (container) {
        container.innerHTML = "";
        container.appendChild(el("p", { class: "small muted", text: "Click a tile to cycle its weight (1→2→3→5→9), then press \"Run my code\" above (in the editor) to see the animation." }));
        var width = fitWidth(container, 320);
        CELL = Math.max(30, Math.floor(width / COLS));
        weights = defaultWeights();
        var made = makeCanvas(CELL * COLS, CELL * ROWS);
        made.canvas.className = "viz-canvas";
        made.canvas.addEventListener("click", onCanvasClick);
        container.appendChild(made.canvas);
        var bar = buildControlBar({
          onStep: function () { playback.step(); if (playback.isDone()) showFinalVerdict(); },
          onRun: function () { playback.run(); },
          onPause: function () { playback.pause(); },
          onReset: function () { playback.reset(); visited = []; pathCells = []; pqSnapshot = []; renderPQ(); draw(); if (refs) refs.verdict.clear(); },
          onSpeed: function (s) { playback.setSpeed(s); },
        });
        container.appendChild(bar.node);
        var presetBar = el("div", { class: "viz-controlbar" }, [
          el("button", { class: "btn btn-small btn-secondary", type: "button", text: "↻ Replay animation", onclick: runFresh }),
          el("button", { class: "btn btn-small", type: "button", text: "Negative-weight preset", onclick: function () { negativePreset = !negativePreset; weights = negativePreset ? negativeWeights() : defaultWeights(); draw(); } }),
        ]);
        container.appendChild(presetBar);
        container.appendChild(el("p", { class: "small muted", text: "\"Replay animation\" re-plays your last-saved code here without submitting an attempt — press \"Run my code\" above (in the editor) to check your answer." }));
        var readout = buildReadout([{ key: "shift", label: "Weight offset (min → +1)" }]);
        container.appendChild(readout.node);
        var pqBox = el("div", { class: "viz-pq-box" }, [
          el("div", { class: "viz-pq-label", text: "Priority queue (next 8)" }),
          el("ul", { class: "viz-pq-list" }),
        ]);
        container.appendChild(pqBox);
        var verdict = buildVerdict();
        container.appendChild(verdict.node);
        refs = { canvas: made.canvas, ctx: made.ctx, readout: readout, verdict: verdict, pqList: pqBox.querySelector(".viz-pq-list") };
        playback = createPlaybackController({ onEvent: applyEvent, onDone: showFinalVerdict });
        draw();
        runFresh();
      },
      show: function () { draw(); },
      update: function () { runFresh(); },
      unmount: function () { if (refs && refs.canvas) refs.canvas.removeEventListener("click", onCanvasClick); if (playback) playback.destroy(); refs = null; },
    };
  })();
  Visualizer.register("dijkstraFrontier", DijkstraViz);

  // JS-side reference Dijkstra used ONLY to compute a comparison "optimum"
  // number for the verdict banner above. This is a generic graph-search
  // utility over the CURRENT (student-editable) weights — it is not Python,
  // is not shown as a stand-in for any TODO, and is unrelated to grading.
  function jsReferenceDijkstra(weights, start, end) {
    var rows = weights.length, cols = weights[0].length;
    var all = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) all.push(weights[r][c]);
    var shift = 1 - Math.min.apply(null, all);
    var dist = {};
    var key = function (p) { return p[0] + "," + p[1]; };
    dist[key(start)] = 0;
    var pq = [[0, start]];
    var seen = {};
    var guard = 0;
    while (pq.length && guard++ < 100000) {
      pq.sort(function (a, b) { return a[0] - b[0]; });
      var top = pq.shift();
      var cost = top[0], cell = top[1];
      var k = key(cell);
      if (seen[k]) continue;
      seen[k] = true;
      if (cell[0] === end[0] && cell[1] === end[1]) return cost;
      var deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (var i = 0; i < deltas.length; i++) {
        var nr = cell[0] + deltas[i][0], nc = cell[1] + deltas[i][1];
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        var nk = nr + "," + nc;
        if (seen[nk]) continue;
        var stepCost = weights[nr][nc] + shift;
        var newCost = cost + stepCost;
        if (dist[nk] === undefined || newCost < dist[nk]) {
          dist[nk] = newCost;
          pq.push([newCost, [nr, nc]]);
        }
      }
    }
    return dist[key(end)] !== undefined ? dist[key(end)] : null;
  }

  // -------------------------------------------------- 14h. mapEditor viz
  //
  // Painted rounds use a simple TILE-obstacle model: a WALL tile blocks
  // movement; every other tile is open floor (NORMAL) and may additionally
  // carry a CUSTOM_ITEM or BOMB marker - no terrain-effect tile types exist
  // any more (SWAMP/CUSTOM terrain were removed along with score, see D4's
  // changelog note). This reads naturally as "click to paint a square" for
  // a student - deliberately simpler than the edge-wall maze DFS generation
  // uses. paintedGridToWallGrid() below converts a painted grid into the
  // exact same {top,right,bottom,left} wall format used everywhere else in
  // this file, so a painted round can be fed straight into the existing
  // Play tab / trace harnesses without changing any of that code.

  var MAP_MIN_SIZE = 5, MAP_MAX_SIZE = 33;
  // Reference-only fixed window budget (matches the real game's fixed
  // SCREEN_WIDTH/SCREEN_HEIGHT and maze offset from settings.py). Used only
  // to WARN the student that cells will look cramped, never to block them.
  var MAP_WINDOW_PIXEL_W = 976, MAP_WINDOW_PIXEL_H = 542;
  var MAP_MIN_COMFY_CELL = 16;
  var ROUND_CONFIG_KEY_ORDER = ["rows", "cols", "cell_size", "extra_open_walls", "bomb_count", "custom_item_count", "time_limit_seconds"];
  // Students may add or remove rounds freely (TODO 8 Part 1/6). These caps
  // exist only so the map editor stays usable and one stray paste can't
  // make the browser draw a 500x500 board or 300 round tabs - the real
  // pygame game has no such limit, and the grader only ever warns.
  var MAX_DESIGNABLE_ROUNDS = 8;
  var MAX_ROUND_ROWS = 41;
  var MAX_ROUND_COLS = 61;

  function makeGrid(rows, cols, fill) {
    var g = [];
    for (var r = 0; r < rows; r++) { var row = []; for (var c = 0; c < cols; c++) row.push(fill); g.push(row); }
    return g;
  }
  function cloneGrid(grid) { return grid.map(function (row) { return row.slice(); }); }

  function floodReachable(grid, start) {
    var rows = grid.length, cols = grid[0].length;
    var seen = {};
    if (!start || grid[start[0]][start[1]] === "WALL") return seen;
    seen[start[0] + "," + start[1]] = true;
    var queue = [start], qi = 0;
    var deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    while (qi < queue.length) {
      var cur = queue[qi++], r = cur[0], c = cur[1];
      for (var i = 0; i < 4; i++) {
        var nr = r + deltas[i][0], nc = c + deltas[i][1];
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (grid[nr][nc] === "WALL") continue;
        var k = nr + "," + nc;
        if (seen[k]) continue;
        seen[k] = true;
        queue.push([nr, nc]);
      }
    }
    return seen;
  }

  function paintedVerdict(round) {
    var grid = round.grid;
    var reach = floodReachable(grid, round.start);
    var goalReachable = !!reach[round.goal[0] + "," + round.goal[1]];
    var itemCells = [];
    for (var r = 0; r < grid.length; r++) for (var c = 0; c < grid[r].length; c++) if (grid[r][c] === "CUSTOM_ITEM") itemCells.push([r, c]);
    var itemsReachable = itemCells.filter(function (p) { return !!reach[p[0] + "," + p[1]]; }).length;
    return { goalReachable: goalReachable, itemsTotal: itemCells.length, itemsReachable: itemsReachable, reach: reach };
  }

  function paintedGridToWallGrid(grid) {
    var rows = grid.length, cols = grid[0].length;
    var out = [];
    for (var r = 0; r < rows; r++) { var row = []; for (var c = 0; c < cols; c++) row.push({ top: true, right: true, bottom: true, left: true }); out.push(row); }
    function isWall(r, c) { return r < 0 || r >= rows || c < 0 || c >= cols || grid[r][c] === "WALL"; }
    for (var r2 = 0; r2 < rows; r2++) {
      for (var c2 = 0; c2 < cols; c2++) {
        if (grid[r2][c2] === "WALL") continue;
        out[r2][c2].top = isWall(r2 - 1, c2);
        out[r2][c2].bottom = isWall(r2 + 1, c2);
        out[r2][c2].left = isWall(r2, c2 - 1);
        out[r2][c2].right = isWall(r2, c2 + 1);
      }
    }
    return out;
  }
  // (paintedTerrainGrid used to exist here for SWAMP/CUSTOM terrain tiles -
  // deleted along with terrain itself; maze.py's get_terrain() always
  // returns "NORMAL" now, so there is nothing left for a painted map to
  // encode about terrain.)
  // itemAssignments (optional): the map editor's own {"r,c": itemIndex}
  // record of which specific CUSTOM_ITEMS entry a student placed at each
  // item cell (see MapEditorViz's selectedItemIndex/paintCell) - each
  // returned item position carries its assigned index (or null if never
  // assigned, e.g. a round painted before item placement existed), so the
  // Play tab can spawn EXACTLY the item the student chose there instead of
  // a random one.
  function paintedItemsAndBombs(grid, itemAssignments) {
    var items = [], bombs = [];
    for (var r = 0; r < grid.length; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        if (grid[r][c] === "CUSTOM_ITEM") {
          var key = r + "," + c;
          var idx = itemAssignments && itemAssignments[key] != null ? itemAssignments[key] : null;
          items.push([r, c, idx]);
        } else if (grid[r][c] === "BOMB") bombs.push([r, c]);
      }
    }
    return { items: items, bombs: bombs };
  }

  function pickEligibleSeed(grid, rng, predicate, avoid) {
    var rows = grid.length, cols = grid[0].length;
    var attempts = 0;
    while (attempts++ < 600) {
      var r = Math.floor(rng() * rows), c = Math.floor(rng() * cols);
      if (avoid && avoid[r + "," + c]) continue;
      if (!predicate(grid[r][c])) continue;
      return [r, c];
    }
    return null;
  }

  // Random-walk "blob" grower: repeatedly expands the region by one random
  // adjacent eligible cell. This is what makes generated terrain read as
  // coherent clustered regions instead of per-tile static noise.
  function growCluster(grid, type, seed, targetSize, rng, eligible) {
    var rows = grid.length, cols = grid[0].length;
    var region = [seed];
    var inRegion = {}; inRegion[seed[0] + "," + seed[1]] = true;
    if (eligible(grid[seed[0]][seed[1]])) grid[seed[0]][seed[1]] = type;
    var guard = 0, deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    while (region.length < targetSize && guard < targetSize * 40) {
      guard++;
      var from = region[Math.floor(rng() * region.length)];
      var delta = deltas[Math.floor(rng() * 4)];
      var nr = from[0] + delta[0], nc = from[1] + delta[1];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      var k = nr + "," + nc;
      if (inRegion[k]) continue;
      inRegion[k] = true;
      if (!eligible(grid[nr][nc])) continue;
      grid[nr][nc] = type;
      region.push([nr, nc]);
    }
  }

  function ensureConnectivity(grid, start, rng) {
    var rows = grid.length, cols = grid[0].length;
    var guard = 0;
    while (guard++ < rows * cols * 4) {
      var reach = floodReachable(grid, start);
      var reachCount = Object.keys(reach).length;
      var openCount = 0;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) if (grid[r][c] !== "WALL") openCount++;
      if (reachCount >= openCount) return;
      var candidates = [];
      Object.keys(reach).forEach(function (k) {
        var parts = k.split(","), r2 = +parts[0], c2 = +parts[1];
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
          var nr = r2 + d[0], nc = c2 + d[1];
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === "WALL") candidates.push([nr, nc]);
        });
      });
      if (!candidates.length) return;
      var pick = candidates[Math.floor(rng() * candidates.length)];
      grid[pick[0]][pick[1]] = "NORMAL";
    }
  }

  function generatePaintedGrid(rows, cols, seed, clusterSize, opts) {
    opts = opts || {};
    var rng = mulberry32(seed >>> 0);
    var grid = makeGrid(rows, cols, "NORMAL");
    var start = [0, 0], goal = [rows - 1, cols - 1];
    var protectedCells = {};
    [start, goal].forEach(function (p) {
      protectedCells[p[0] + "," + p[1]] = true;
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
        var nr = p[0] + d[0], nc = p[1] + d[1];
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) protectedCells[nr + "," + nc] = true;
      });
    });
    var area = rows * cols;
    var avgClusterCells = Math.max(3, clusterSize * clusterSize);

    var wallBudget = Math.round(area * 0.20);
    var numWallSeeds = Math.max(1, Math.round(wallBudget / avgClusterCells));
    for (var i = 0; i < numWallSeeds; i++) {
      var seedCell = pickEligibleSeed(grid, rng, function (v) { return v === "NORMAL"; }, protectedCells);
      if (!seedCell) break;
      growCluster(grid, "WALL", seedCell, avgClusterCells, rng, function (v) { return v === "NORMAL"; });
    }
    Object.keys(protectedCells).forEach(function (k) {
      var parts = k.split(","), r = +parts[0], c = +parts[1];
      if (grid[r][c] === "WALL") grid[r][c] = "NORMAL";
    });
    ensureConnectivity(grid, start, rng);

    function scatterSmallClusters(type, count) {
      var placed = 0, perCluster = Math.max(1, Math.round(clusterSize / 1.5)), guard2 = 0;
      while (placed < count && guard2++ < count * 6 + 20) {
        var sc2 = pickEligibleSeed(grid, rng, function (v) { return v === "NORMAL"; }, protectedCells);
        if (!sc2) break;
        var before = 0;
        for (var r3 = 0; r3 < rows; r3++) for (var c3 = 0; c3 < cols; c3++) if (grid[r3][c3] === type) before++;
        growCluster(grid, type, sc2, Math.min(perCluster, count - placed), rng, function (v) { return v === "NORMAL"; });
        var after = 0;
        for (var r4 = 0; r4 < rows; r4++) for (var c4 = 0; c4 < cols; c4++) if (grid[r4][c4] === type) after++;
        placed += Math.max(1, after - before);
      }
    }
    scatterSmallClusters("CUSTOM_ITEM", opts.itemCount != null ? opts.itemCount : Math.max(3, Math.round(area * 0.03)));
    scatterSmallClusters("BOMB", opts.bombCount != null ? opts.bombCount : Math.max(2, Math.round(area * 0.015)));

    return { grid: grid, start: start, goal: goal };
  }

  function derivedCountsFromGrid(grid, existingDict, timeLimitSeconds) {
    var rows = grid.length, cols = grid[0].length;
    var item = 0, bomb = 0;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var t = grid[r][c];
        if (t === "CUSTOM_ITEM") item++;
        else if (t === "BOMB") bomb++;
      }
    }
    var out = {};
    ROUND_CONFIG_KEY_ORDER.forEach(function (k) { out[k] = existingDict && existingDict[k] != null ? existingDict[k] : 0; });
    out.rows = rows; out.cols = cols;
    out.bomb_count = bomb; out.custom_item_count = item;
    if (!out.cell_size) out.cell_size = Math.max(MAP_MIN_COMFY_CELL, Math.floor(Math.min(MAP_WINDOW_PIXEL_W / cols, MAP_WINDOW_PIXEL_H / rows)));
    if (!out.time_limit_seconds) out.time_limit_seconds = timeLimitSeconds || 60;
    if (!out.extra_open_walls) out.extra_open_walls = 0;
    return out;
  }

  function parseSimpleDict(text) {
    var out = {};
    var re = /["']([A-Za-z_]+)["']\s*:\s*(-?\d+)/g;
    var m;
    while ((m = re.exec(text))) out[m[1]] = parseInt(m[2], 10);
    return out;
  }

  // Best-effort, whitespace/formatting-tolerant parse of ROUND_CONFIGS from
  // raw source text. Returns an array of plain dicts (ANY number of rounds -
  // students are explicitly encouraged to add a 4th, 5th, ... round), or
  // null when nothing usable is there. This is a convenience for live UI
  // sync ONLY - the grading harness is still the authority.
  function parseRoundConfigsSource(code) {
    try {
      var m = code.match(/ROUND_CONFIGS\s*=\s*\[/);
      if (!m) return null;
      var start = m.index + m[0].length - 1;
      var depth = 0, i = start, n = code.length, inS = false, inD = false;
      for (; i < n; i++) {
        var ch = code[i];
        if (inS) { if (ch === "\\") { i++; continue; } if (ch === "'") inS = false; continue; }
        if (inD) { if (ch === "\\") { i++; continue; } if (ch === '"') inD = false; continue; }
        if (ch === "'") { inS = true; continue; }
        if (ch === '"') { inD = true; continue; }
        if (ch === "[") depth++;
        else if (ch === "]") { depth--; if (depth === 0) break; }
      }
      var listText = code.slice(start, i + 1);
      var dicts = [], di = 0;
      while (true) {
        var openIdx = listText.indexOf("{", di);
        if (openIdx === -1) break;
        var d = 0, j = openIdx, inS2 = false, inD2 = false;
        for (; j < listText.length; j++) {
          var c2 = listText[j];
          if (inS2) { if (c2 === "\\") { j++; continue; } if (c2 === "'") inS2 = false; continue; }
          if (inD2) { if (c2 === "\\") { j++; continue; } if (c2 === '"') inD2 = false; continue; }
          if (c2 === "'") { inS2 = true; continue; }
          if (c2 === '"') { inD2 = true; continue; }
          if (c2 === "{") d++;
          else if (c2 === "}") { d--; if (d === 0) break; }
        }
        dicts.push(parseSimpleDict(listText.slice(openIdx, j + 1)));
        di = j + 1;
      }
      return dicts.length >= 1 ? dicts.slice(0, MAX_DESIGNABLE_ROUNDS) : null;
    } catch (e) { return null; }
  }

  // ---- variable round count -------------------------------------------
  //
  // ROUND_CONFIGS used to be pinned at exactly 3 rounds everywhere: the
  // grader failed anything else, the map editor drew 3 fixed tabs, and the
  // Play tab looped over a hardcoded 3-entry list. Students are now told
  // they may add or remove rounds, so every one of those reads the
  // student's OWN list instead, falling back to the shipped defaults while
  // TODO 8 is untouched or unparseable. Capped only to keep the map editor
  // usable (and one runaway paste from generating hundreds of tabs).
  var PLAY_ROUND_DEFAULTS = [
    { rows: 11, cols: 15, cellSize: 30, extraOpenWalls: 5, bombCount: 2, customItemCount: 2, timeLimitSeconds: 70 },
    { rows: 15, cols: 21, cellSize: 24, extraOpenWalls: 6, bombCount: 4, customItemCount: 3, timeLimitSeconds: 55 },
    { rows: 17, cols: 25, cellSize: 20, extraOpenWalls: 8, bombCount: 6, customItemCount: 4, timeLimitSeconds: 45 },
  ];

  function clampInt(v, lo, hi, fallback) {
    var n = typeof v === "number" ? Math.round(v) : NaN;
    if (!isFinite(n)) return fallback;
    return Math.max(lo, Math.min(hi, n));
  }

  // One ROUND_CONFIGS dict -> the Play tab's own shape. Every value is
  // clamped to something drawable: a student experimenting with rows: 900
  // or a negative bomb_count gets a playable board and a grading warning,
  // never a frozen tab or a crash.
  function roundDictToPlayConfig(d, fallback) {
    fallback = fallback || PLAY_ROUND_DEFAULTS[0];
    var rows = clampInt(d.rows, 2, MAX_ROUND_ROWS, fallback.rows);
    var cols = clampInt(d.cols, 2, MAX_ROUND_COLS, fallback.cols);
    var cells = rows * cols;
    return {
      rows: rows,
      cols: cols,
      cellSize: clampInt(d.cell_size, 8, 60, fallback.cellSize),
      extraOpenWalls: clampInt(d.extra_open_walls, 0, cells, fallback.extraOpenWalls),
      // Leave room for the player, the goal, and at least one free cell so
      // placement can never be asked for more cells than the grid has.
      bombCount: clampInt(d.bomb_count, 0, Math.max(0, cells - 3), fallback.bombCount),
      customItemCount: clampInt(d.custom_item_count, 0, Math.max(0, cells - 3), fallback.customItemCount),
      timeLimitSeconds: clampInt(d.time_limit_seconds, 5, 3600, fallback.timeLimitSeconds),
    };
  }

  // The TODO 8 group is six standalone sub-steps: 8-1 = ROUND_CONFIGS,
  // 8-2 = PLAYER_MOVE_DELAY_MS, 8-3 = ALLOW_PATH_HINT + MAX_HINT_COUNT,
  // 8-4/8-5/8-6 = the placement code in game.py. Anything reading "the
  // student's rounds" goes through here, so a save made before the split
  // (one array under the old id "8") can never leak through as a string
  // indexed by mistake.
  function step6PartCode(index) { return bonusCode("6-" + (index + 1)); }
  function step6RoundConfigsCode() { return step6PartCode(0); }

  // The rounds the Play tab and the map editor should show right now.
  function playRounds() {
    try {
      var raw = step6RoundConfigsCode();
      var parsed = raw ? parseRoundConfigsSource(raw) : null;
      if (!parsed || !parsed.length) return PLAY_ROUND_DEFAULTS;
      return parsed.map(function (d, i) {
        return roundDictToPlayConfig(d, PLAY_ROUND_DEFAULTS[Math.min(i, PLAY_ROUND_DEFAULTS.length - 1)]);
      });
    } catch (e) {
      return PLAY_ROUND_DEFAULTS;
    }
  }
  function playRoundCount() { return playRounds().length; }
  function playRoundAt(i) {
    var list = playRounds();
    return list[i] || list[list.length - 1] || PLAY_ROUND_DEFAULTS[0];
  }

  // TODO 8 Parts 2/6 and 3/6's pacing numbers, read live the same way, so
  // the Play tab actually feels like the game the student is designing.
  function parseNumberSetting(code, name, lo, hi, fallback) {
    try {
      var m = String(code || "").match(new RegExp("^\\s*" + name + "\\s*=\\s*(-?\\d+(?:\\.\\d+)?)", "m"));
      if (!m) return fallback;
      var v = parseFloat(m[1]);
      if (!isFinite(v)) return fallback;
      return Math.max(lo, Math.min(hi, v));
    } catch (e) { return fallback; }
  }
  function parseBoolSetting(code, name, fallback) {
    try {
      var m = String(code || "").match(new RegExp("^\\s*" + name + "\\s*=\\s*(True|False)", "m"));
      return m ? m[1] === "True" : fallback;
    } catch (e) { return fallback; }
  }
  function playPacing() {
    // Part 1 is the walking speed on its own; part 2 is the two hint
    // settings. Both are read together (and joined) so a save made before
    // the split - where all three lived in part 1 - still works.
    var raw = step6PartCode(1) + "\n" + step6PartCode(2);
    return {
      moveDelayMs: parseNumberSetting(raw, "PLAYER_MOVE_DELAY_MS", 0, 2000, 100),
      allowHint: parseBoolSetting(raw, "ALLOW_PATH_HINT", true),
      maxHints: Math.round(parseNumberSetting(raw, "MAX_HINT_COUNT", 0, 99, 2)),
    };
  }

  // Grows/trims the map editor's saved rounds to match the current round
  // count, and keeps activeRound inside it. Painted rounds are never
  // discarded on shrink - a student who deletes round 4 and puts it back
  // gets their drawing back.
  function ensureRoundSlots() {
    var md = state.mapEditorData;
    var n = playRoundCount();
    while (md.rounds.length < n) md.rounds.push(null);
    if (md.activeRound >= n) md.activeRound = Math.max(0, n - 1);
    return n;
  }

  function buildRoundConfigsSource(rounds) {
    var lines = ["ROUND_CONFIGS = ["];
    rounds.forEach(function (r) {
      lines.push("    {");
      ROUND_CONFIG_KEY_ORDER.forEach(function (k) {
        var v = r[k] != null ? Math.round(r[k]) : 0;
        lines.push('        "' + k + '": ' + v + ",");
      });
      lines.push("    },");
    });
    lines.push("]");
    return lines.join("\n");
  }

  function dictsRoughlyEqual(a, b) {
    if (!a || !b) return false;
    return ["rows", "cols", "custom_item_count", "bomb_count"].every(function (k) { return a[k] === b[k]; });
  }

  var MapEditorViz = (function () {
    var refs = null;
    var tool = "WALL";
    var painting = false;
    var eraseMode = false;
    var cursor = { r: 0, c: 0 };
    var undoStack = [], redoStack = [];
    var CELL = 0;
    var syncConflict = null; // {codeDict} when a hand-edit conflicts with the painted round
    var boundTextarea = null, onInputHandler = null, debouncedTextSync = null;
    var windowMouseupAttached = false;
    // Cross-file dependency (Task 3's "harder, multi-file" philosophy
    // applied to TODO 8): the map editor reads the student's OWN CUSTOM_ITEMS
    // (TODO 10 Part 1/6, settings.py) so a specific item from their own list
    // can be placed on the map, not just a generic "an item goes here"
    // marker. itemDefsCache is a plain preview cache (never authoritative -
    // PlayEngine re-derives the real thing the same way at Play-tab time),
    // refreshed whenever this panel becomes visible so edits to TODO 10 show
    // up here without a manual reload.
    var itemDefsCache = null;
    var selectedItemIndex = 0;
    // Assigned by mount() to its own renderTabs(), so show()/update() (and
    // the debounced hand-edit sync) can rebuild the round tabs when the
    // student adds or removes a round in ROUND_CONFIGS.
    var renderTabsActive = null;

    function loadItemDefs() {
      ensurePyodide().then(function (py) {
        return py.runPythonAsync(traceHarness_customItems(bonusCode("10-1")));
      }).then(function (json) {
        var data = JSON.parse(json);
        itemDefsCache = (data.ok && data.items && data.items.length) ? data.items : null;
        if (itemDefsCache && selectedItemIndex >= itemDefsCache.length) selectedItemIndex = 0;
        renderPalette();
        draw();
      }).catch(function () { itemDefsCache = null; });
    }

    var TILE_META = {
      WALL: { label: "Wall", color: "#3a3327", desc: "Blocks movement." },
      NORMAL: { label: "Floor (eraser)", color: "#12100c", desc: "Open, no effect." },
      CUSTOM_ITEM: { label: "Item", color: "#22c55e", desc: "Spawns a specific item from your own TODO 10 CUSTOM_ITEMS list here." },
      BOMB: { label: "Bomb", color: "#e0685f", desc: "Touching it resets the player to the start position." },
      GOAL: { label: "Goal", color: "#f0c04a", desc: "Round exit (exactly one)." },
      START: { label: "Start", color: "#4fa3e3", desc: "Player start (exactly one)." },
    };

    function activeRoundData() {
      var idx = state.mapEditorData.activeRound;
      var round = state.mapEditorData.rounds[idx];
      // Defensive normalize: rounds painted/saved before item placement
      // existed won't have this field yet.
      if (round && !round.itemAssignments) round.itemAssignments = {};
      return { idx: idx, round: round };
    }

    function paletteTypes() {
      return ["WALL", "NORMAL", "CUSTOM_ITEM", "BOMB", "GOAL", "START"];
    }

    function ensureRound(idx, rows, cols) {
      var existing = state.mapEditorData.rounds[idx];
      if (existing && existing.rows === rows && existing.cols === cols) return existing;
      var gen = generatePaintedGrid(rows, cols, Math.floor(Math.random() * 1000000), 3, {});
      var fresh = { rows: rows, cols: cols, seed: 1, clusterSize: 3, grid: gen.grid, start: gen.start, goal: gen.goal, lastSyncedDict: null, itemAssignments: {} };
      state.mapEditorData.rounds[idx] = fresh;
      return fresh;
    }

    function pushUndo() {
      var d = activeRoundData().round;
      if (!d) return;
      undoStack.push({ grid: cloneGrid(d.grid), start: d.start.slice(), goal: d.goal.slice(), itemAssignments: Object.assign({}, d.itemAssignments) });
      if (undoStack.length > 20) undoStack.shift();
      redoStack = [];
    }

    // Always paints exactly one tile per click/drag step (no brush-size
    // concept any more - the simplified editor is strictly "pick a tool,
    // click/drag the board"). Painting CUSTOM_ITEM always (re)stamps the
    // CURRENTLY SELECTED item (see selectedItemIndex/renderPalette) onto
    // that cell - painting the same tool over an already-placed item cell
    // with a newly-selected item is how you change which item is there,
    // consistent with how every other tool already just "stamps" onto a
    // cell with no separate first-click-vs-repeat-click behavior.
    function paintCell(r, c, typeOverride) {
      var d = activeRoundData().round;
      if (!d) return;
      var rows = d.rows, cols = d.cols;
      if (r < 0 || r >= rows || c < 0 || c >= cols) return;
      var t = typeOverride || (eraseMode ? "NORMAL" : tool);
      var key = r + "," + c;
      if (t === "GOAL") { d.goal = [r, c]; if (d.grid[r][c] === "WALL") d.grid[r][c] = "NORMAL"; delete d.itemAssignments[key]; }
      else if (t === "START") { d.start = [r, c]; if (d.grid[r][c] === "WALL") d.grid[r][c] = "NORMAL"; delete d.itemAssignments[key]; }
      else if (t === "CUSTOM_ITEM") { d.grid[r][c] = t; d.itemAssignments[key] = selectedItemIndex; }
      else { d.grid[r][c] = t; delete d.itemAssignments[key]; }
    }

    function draw() {
      if (!refs) return;
      var d = activeRoundData().round;
      if (!d) return;
      var ctx = refs.ctx;
      ctx.clearRect(0, 0, refs.canvas.width, refs.canvas.height);
      ctx.fillStyle = "#0e0d0a";
      ctx.fillRect(0, 0, refs.canvas.width, refs.canvas.height);
      var verdict = paintedVerdict(d);
      for (var r = 0; r < d.rows; r++) {
        for (var c = 0; c < d.cols; c++) {
          var x = c * CELL, y = r * CELL;
          var t = d.grid[r][c];
          var meta = TILE_META[t] || TILE_META.NORMAL;
          var fillColor = meta.color;
          if (t === "CUSTOM_ITEM" && itemDefsCache && itemDefsCache.length) {
            var assignedIdx = d.itemAssignments[r + "," + c];
            var assignedDef = itemDefsCache[assignedIdx] || itemDefsCache[0];
            if (assignedDef && assignedDef.color) fillColor = "rgb(" + assignedDef.color.join(",") + ")";
          }
          ctx.fillStyle = fillColor;
          ctx.fillRect(x, y, CELL - 1, CELL - 1);
          var reachable = !!verdict.reach[r + "," + c];
          if (t !== "WALL" && !reachable) {
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(x, y, CELL - 1, CELL - 1);
          }
        }
      }
      // start/goal markers
      ctx.fillStyle = TILE_META.START.color;
      ctx.beginPath(); ctx.arc((d.start[1] + 0.5) * CELL, (d.start[0] + 0.5) * CELL, CELL * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = TILE_META.GOAL.color;
      ctx.beginPath(); ctx.arc((d.goal[1] + 0.5) * CELL, (d.goal[0] + 0.5) * CELL, CELL * 0.3, 0, Math.PI * 2); ctx.fill();
      // keyboard cursor
      if (refs.canvas === document.activeElement) {
        ctx.strokeStyle = "#f0c04a"; ctx.lineWidth = 2;
        ctx.strokeRect(cursor.c * CELL + 1, cursor.r * CELL + 1, CELL - 2, CELL - 2);
      }
      refs.verdictLine.textContent = (verdict.goalReachable ? "Goal reachable ✓" : "Goal reachable ✗") + " · " +
        verdict.itemsReachable + "/" + verdict.itemsTotal + " custom items reachable" +
        (verdict.itemsReachable < verdict.itemsTotal ? " ✗" : (verdict.itemsTotal > 0 ? " ✓" : ""));
      refs.verdictLine.className = "small " + (verdict.goalReachable && verdict.itemsReachable === verdict.itemsTotal ? "verdict-good-text" : "verdict-bad-text");
    }

    function renderPalette() {
      if (!refs) return;
      refs.palette.innerHTML = "";
      paletteTypes().forEach(function (t) {
        var meta = TILE_META[t] || TILE_META.NORMAL;
        var label = meta.label, color = meta.color, title = meta.label + " — " + meta.desc;
        var hasItems = t === "CUSTOM_ITEM" && itemDefsCache && itemDefsCache.length;
        if (hasItems) {
          var def = itemDefsCache[selectedItemIndex] || itemDefsCache[0];
          label = "Item: " + def.name;
          color = "rgb(" + def.color.join(",") + ")";
          title = itemDefsCache.length > 1
            ? "Paints \"" + def.name + "\" — click again while selected to cycle to your next item (" + itemDefsCache.length + " defined in TODO 10)"
            : "Paints \"" + def.name + "\" here.";
        } else if (t === "CUSTOM_ITEM") {
          title = "Finish TODO 10 (Part 1/6) to define your own item(s) here — using a generic placeholder for now.";
        }
        var swatch = el("button", {
          class: "map-palette-item" + (tool === t && !eraseMode ? " is-active" : ""),
          type: "button",
          title: title,
          onclick: function () {
            if (t === "CUSTOM_ITEM" && tool === "CUSTOM_ITEM" && !eraseMode && itemDefsCache && itemDefsCache.length > 1) {
              selectedItemIndex = (selectedItemIndex + 1) % itemDefsCache.length;
            }
            tool = t; eraseMode = false; renderPalette();
          },
        }, [
          el("span", { class: "map-palette-swatch", style: "background:" + color }),
          el("span", { class: "map-palette-label", text: label }),
        ]);
        refs.palette.appendChild(swatch);
      });
      var eraser = el("button", { class: "map-palette-item" + (eraseMode ? " is-active" : ""), type: "button", title: "Eraser (right-click also erases)", onclick: function () { eraseMode = true; renderPalette(); } }, [
        el("span", { class: "map-palette-swatch", style: "background:#12100c;border:1px dashed #888" }),
        el("span", { class: "map-palette-label", text: "Eraser → Floor" }),
      ]);
      refs.palette.appendChild(eraser);
    }

    function syncCodeFromPaint(force) {
      var ad = activeRoundData();
      var d = ad.round;
      if (!d || !refs) return;
      var ta = document.querySelector("#mainPanel .code-textarea");
      // TODO 8 is a multi-part step, so its saved code is an ARRAY - part 0
      // is the ROUND_CONFIGS block this editor owns (and the first
      // .code-textarea on the page is that same part's editor).
      var code = ta ? ta.value : step6RoundConfigsCode();
      var parsed = parseRoundConfigsSource(code);
      var derived = derivedCountsFromGrid(d.grid, parsed ? parsed[ad.idx] : null, parsed ? parsed[ad.idx] && parsed[ad.idx].time_limit_seconds : null);
      if (!force && parsed && d.lastSyncedDict && !dictsRoughlyEqual(parsed[ad.idx], d.lastSyncedDict)) {
        syncConflict = { parsed: parsed, idx: ad.idx };
        renderConflict();
        return;
      }
      syncConflict = null;
      renderConflict();
      // Keep however many rounds the student actually declared - painting
      // round 2 of a five-round game must not silently rewrite it down to
      // three. When nothing parses, fall back to one entry per round tab.
      var allRounds;
      if (parsed) {
        allRounds = parsed.slice();
      } else {
        allRounds = [];
        for (var ri = 0; ri < Math.max(1, playRoundCount()); ri++) allRounds.push(derived);
      }
      while (allRounds.length <= ad.idx) allRounds.push(derived);
      allRounds[ad.idx] = derived;
      var newCode = buildRoundConfigsSource(allRounds);
      d.lastSyncedDict = derived;
      writeStep6Code(newCode);
      persist();
    }

    function writeStep6Code(newCode) {
      // ROUND_CONFIGS lives in TODO 8-1 and nowhere else. Only type into
      // the live editor when 8-1 is the step actually on screen - every
      // Bonus step renders one textarea now, so a blind querySelector
      // would happily overwrite whichever OTHER sub-step the student is
      // looking at while they paint a map.
      var ta = state.currentStepId === "8-1" ? document.querySelector("#mainPanel .code-textarea") : null;
      if (ta) {
        ta.value = newCode;
        ta.dispatchEvent(new Event("input"));
      } else {
        var sd = state.steps["8-1"];
        if (!sd) return;
        sd.code = newCode;
        persist();
      }
    }

    function renderConflict() {
      if (!refs) return;
      if (!syncConflict) { refs.conflictBox.hidden = true; return; }
      refs.conflictBox.hidden = false;
      refs.conflictBox.innerHTML = "";
      refs.conflictBox.appendChild(el("div", { text: "Your code and your painted map for Round " + (syncConflict.idx + 1) + " disagree (size/counts differ). Which should win?" }));
      var actions = el("div", { class: "viz-controlbar" }, [
        el("button", { class: "btn btn-small", type: "button", text: "Use my code", onclick: function () {
          var dict = syncConflict.parsed[syncConflict.idx];
          var idx = syncConflict.idx;
          var rows = clampInt(dict.rows, MAP_MIN_SIZE, MAP_MAX_SIZE, 11);
          var cols = clampInt(dict.cols, MAP_MIN_SIZE, MAP_MAX_SIZE, 15);
          var gen = generatePaintedGrid(rows, cols, 1, 3, { itemCount: dict.custom_item_count, bombCount: dict.bomb_count });
          state.mapEditorData.rounds[idx] = { rows: rows, cols: cols, seed: 1, clusterSize: 3, grid: gen.grid, start: gen.start, goal: gen.goal, lastSyncedDict: dict };
          syncConflict = null;
          persist();
          refreshForRound();
        } }),
        el("button", { class: "btn btn-small btn-primary", type: "button", text: "Use the painted map", onclick: function () {
          syncConflict = null;
          syncCodeFromPaint(true);
        } }),
      ]);
      refs.conflictBox.appendChild(actions);
    }

    function refreshForRound() {
      var ad = activeRoundData();
      if (!ad.round) {
        var cfg = playRoundAt(ad.idx);
        ensureRound(ad.idx, cfg.rows, cfg.cols);
      }
      var width = fitWidth(refs ? refs.container : document.body, 340);
      var d = activeRoundData().round;
      CELL = Math.max(6, Math.floor(width / d.cols));
      if (refs) {
        var made = makeCanvas(CELL * d.cols, CELL * d.rows);
        made.canvas.tabIndex = 0;
        made.canvas.className = "viz-canvas viz-canvas-focusable";
        made.canvas.setAttribute("aria-label", "Round map — click, drag, or use arrow keys + Enter to paint");
        wireCanvasEvents(made.canvas);
        refs.boardWrap.innerHTML = "";
        refs.boardWrap.appendChild(made.canvas);
        refs.canvas = made.canvas; refs.ctx = made.ctx;
      }
      undoStack = []; redoStack = [];
      renderPalette();
      draw();
      renderConflict();
    }

    function wireCanvasEvents(canvas) {
      function posFromEvent(e) {
        var rect = canvas.getBoundingClientRect();
        var x = e.clientX - rect.left, y = e.clientY - rect.top;
        return [Math.floor(y / CELL), Math.floor(x / CELL)];
      }
      canvas.addEventListener("mousedown", function (e) {
        e.preventDefault();
        canvas.focus();
        painting = true;
        pushUndo();
        var p = posFromEvent(e);
        paintCell(p[0], p[1], e.button === 2 ? "NORMAL" : null);
        draw();
      });
      canvas.addEventListener("mousemove", function (e) {
        if (!painting) return;
        var p = posFromEvent(e);
        paintCell(p[0], p[1], e.buttons === 2 ? "NORMAL" : null);
        draw();
      });
      if (!windowMouseupAttached) {
        windowMouseupAttached = true;
        window.addEventListener("mouseup", function () {
          if (painting) { painting = false; syncCodeFromPaint(false); persist(); }
        });
      }
      canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      canvas.addEventListener("keydown", function (e) {
        var d = activeRoundData().round;
        if (!d) return;
        if (e.key === "ArrowLeft") { e.preventDefault(); cursor.c = Math.max(0, cursor.c - 1); draw(); }
        else if (e.key === "ArrowRight") { e.preventDefault(); cursor.c = Math.min(d.cols - 1, cursor.c + 1); draw(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); cursor.r = Math.max(0, cursor.r - 1); draw(); }
        else if (e.key === "ArrowDown") { e.preventDefault(); cursor.r = Math.min(d.rows - 1, cursor.r + 1); draw(); }
        else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault(); pushUndo(); paintCell(cursor.r, cursor.c, null); draw(); syncCodeFromPaint(false); persist();
        } else if (e.key === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doUndo(); }
        else if (e.key === "y" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doRedo(); }
      });
    }

    function doUndo() {
      var ad = activeRoundData();
      if (!undoStack.length || !ad.round) return;
      var snap = undoStack.pop();
      redoStack.push({ grid: cloneGrid(ad.round.grid), start: ad.round.start.slice(), goal: ad.round.goal.slice(), itemAssignments: Object.assign({}, ad.round.itemAssignments) });
      ad.round.grid = snap.grid; ad.round.start = snap.start; ad.round.goal = snap.goal; ad.round.itemAssignments = snap.itemAssignments || {};
      draw(); syncCodeFromPaint(false); persist();
    }
    function doRedo() {
      var ad = activeRoundData();
      if (!redoStack.length || !ad.round) return;
      var snap = redoStack.pop();
      undoStack.push({ grid: cloneGrid(ad.round.grid), start: ad.round.start.slice(), goal: ad.round.goal.slice(), itemAssignments: Object.assign({}, ad.round.itemAssignments) });
      ad.round.grid = snap.grid; ad.round.start = snap.start; ad.round.goal = snap.goal; ad.round.itemAssignments = snap.itemAssignments || {};
      draw(); syncCodeFromPaint(false); persist();
    }

    function attachTextSync() {
      var ta = document.querySelector("#mainPanel .code-textarea");
      if (ta && ta !== boundTextarea) {
        if (boundTextarea && onInputHandler) boundTextarea.removeEventListener("input", onInputHandler);
        onInputHandler = function () { debouncedTextSync(); };
        ta.addEventListener("input", onInputHandler);
        boundTextarea = ta;
      }
    }

    function onHandEdit() {
      var ta = document.querySelector("#mainPanel .code-textarea");
      if (!ta) return;
      var parsed = parseRoundConfigsSource(ta.value);
      if (!parsed) { if (refs) refs.parseNotice.textContent = "Couldn't read your ROUND_CONFIGS code right now — showing your last painted map."; return; }
      // The student may have just added or deleted a round: refresh the tab
      // row (and clamp activeRound) BEFORE reading the active round, so the
      // reconcile below never compares against a round that no longer exists.
      if (renderTabsActive) renderTabsActive();
      var ad = activeRoundData();
      if (refs) {
        refs.parseNotice.textContent = parsed.length === 1
          ? "Your ROUND_CONFIGS has 1 round. Add another dictionary to the list to design more."
          : "Your ROUND_CONFIGS has " + parsed.length + " rounds — one tab each above.";
      }
      if (!parsed[ad.idx]) return;
      if (!ad.round) {
        // Not painted yet (shouldn't normally happen - refreshForRound()
        // always ensures a round exists on mount) - nothing to reconcile
        // against yet, so no conflict is possible.
        return;
      }
      if (ad.round.lastSyncedDict && !dictsRoughlyEqual(parsed[ad.idx], ad.round.lastSyncedDict)) {
        syncConflict = { parsed: parsed, idx: ad.idx };
        renderConflict();
      }
    }

    return {
      mount: function (container) {
        container.innerHTML = "";
        // One tab per round the student's OWN ROUND_CONFIGS declares, not a
        // fixed three - adding a 4th dictionary in TODO 8 Part 1/6 makes a
        // "Round 4" tab appear here as soon as it parses, so the map editor
        // never silently ignores rounds they invented.
        var tabs = el("div", { class: "viz-controlbar" });
        container.appendChild(tabs);
        var tabCountRendered = -1;

        // NOTE (this session): the teacher found rows/cols + "Apply size",
        // cluster size + seed + "Generate", and the brush-size selector to
        // all be confusing, unexplained controls for what should just be
        // "pick a tile from the palette, click/drag the board" - all three
        // were removed entirely. Each round now uses a fixed size (from
        // PLAY_ROUND_CONFIGS, the same numbers ROUND_CONFIGS ships with per
        // round) that the student never sees or sets - see ensureRound(),
        // which already used PLAY_ROUND_CONFIGS as the size for a
        // never-painted round even before this simplification. A sensible
        // starting layout is still generated automatically the first time a
        // round is opened (so students paint OVER something, not a totally
        // blank grid) - only the student-facing re-roll/resize controls are
        // gone, not the one-time internal generation itself.
        var palette = el("div", { class: "map-palette" });
        container.appendChild(el("div", { class: "sidebar-group-title", text: "Palette (click to select, then paint the board)" }));
        container.appendChild(palette);

        var actionsRow = el("div", { class: "viz-controlbar" });
        var undoBtn = el("button", { class: "btn btn-small", type: "button", text: "Undo", onclick: doUndo });
        var redoBtn = el("button", { class: "btn btn-small", type: "button", text: "Redo", onclick: doRedo });
        actionsRow.appendChild(undoBtn); actionsRow.appendChild(redoBtn);
        container.appendChild(actionsRow);

        container.appendChild(el("p", { class: "small muted", text: "Click or drag the board to paint the selected tile. Keyboard: click the board, then Arrow keys + Enter to paint. Right-click (or the Eraser tool) reverts a tile to floor." }));
        var boardWrap = el("div", { class: "viz-board-wrap" });
        container.appendChild(boardWrap);
        var verdictLine = el("div", { class: "small mt-8" });
        container.appendChild(verdictLine);
        var parseNotice = el("div", { class: "small muted mt-8" });
        container.appendChild(parseNotice);
        var conflictBox = el("div", { class: "viz-verdict verdict-info", hidden: "hidden" });
        container.appendChild(conflictBox);
        container.appendChild(el("p", { class: "small muted mt-8", text: "Once TODO 8 is complete, this round uses your painted map in the Play tab instead of a randomly-generated one — including exactly which of your own TODO 10 items you placed and where." }));

        refs = {
          container: container, boardWrap: boardWrap, palette: palette,
          verdictLine: verdictLine, parseNotice: parseNotice, conflictBox: conflictBox,
          canvas: null, ctx: null,
        };

        function renderTabs() {
          var n = ensureRoundSlots();
          if (n !== tabCountRendered) {
            tabs.innerHTML = "";
            for (var i = 0; i < n; i++) {
              (function (idx) {
                tabs.appendChild(el("button", {
                  class: "btn btn-small", type: "button", text: "Round " + (idx + 1),
                  onclick: function () {
                    state.mapEditorData.activeRound = idx;
                    persist(); refreshForRound(); renderTabs();
                  },
                }));
              })(i);
            }
            tabCountRendered = n;
          }
          Array.prototype.forEach.call(tabs.querySelectorAll("button"), function (btn, idx) {
            btn.className = "btn btn-small" + (state.mapEditorData.activeRound === idx ? " btn-primary" : "");
          });
        }
        renderTabsActive = renderTabs;

        debouncedTextSync = debounce(onHandEdit, 500);
        attachTextSync();
        renderTabs();
        refreshForRound();
        loadItemDefs();
      },
      show: function () { attachTextSync(); if (renderTabsActive) renderTabsActive(); refreshForRound(); loadItemDefs(); },
      update: function () { attachTextSync(); if (renderTabsActive) renderTabsActive(); refreshForRound(); loadItemDefs(); },
      unmount: function () {
        if (boundTextarea && onInputHandler) boundTextarea.removeEventListener("input", onInputHandler);
        refs = null; boundTextarea = null;
      },
    };
  })();
  function clampInt(v, lo, hi, fallback) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return fallback;
    return Math.max(lo, Math.min(hi, n));
  }
  Visualizer.register("mapEditor", MapEditorViz);

  // -------------------------------------------------- 14h2. assetPicker viz
  //
  // Two independent paths into the same 10 settings.py variables:
  //  1. Pick a bundled file from assets/images|sounds (always works).
  //  2. Upload your own - primary path is the File System Access API
  //     (writes straight into the project folder + IndexedDB remembers the
  //     folder handle); automatic fallback is a normalized download plus
  //     precise copy instructions when the API is unavailable, permission
  //     is denied, or the page is opened via file://.

  // stepId says which Bonus sub-step actually owns each path setting:
  // 9-1 = player+goal images, 9-2 = bomb+floor images, 9-6 = the two
  // sound paths. ASSET_PATH_STEPS is the same list, deduplicated - every
  // sub-step that can legally contain one of these names.
  var ASSET_SLOTS = [
    { key: "PLAYER_IMAGE_PATH", kind: "image", stepId: "9-1", label: "Player sprite" },
    { key: "GOAL_IMAGE_PATH", kind: "image", stepId: "9-1", label: "Goal sprite" },
    { key: "BOMB_IMAGE_PATH", kind: "image", stepId: "9-2", label: "Bomb" },
    { key: "FLOOR_TILE_IMAGE_PATH", kind: "image", stepId: "9-2", label: "Floor tile" },
    { key: "BOMB_SOUND_PATH", kind: "sound", stepId: "9-6", label: "Bomb explosion sound" },
    { key: "BACKGROUND_MUSIC_PATH", kind: "sound", stepId: "9-6", label: "Background music" },
  ];
  var ASSET_PATH_STEPS = ["9-1", "9-2", "9-6"];
  var IMAGE_EXT_OK = ["png", "jpg", "jpeg", "gif", "webp"];
  var SOUND_EXT_OK = ["wav", "mp3", "ogg"];
  var IDB_NAME = "dijkstraMazeAssets", IDB_STORE = "handles", IDB_DIR_KEY = "projectDir";

  // Takes TODO 9's whole per-part code array (or any subset of it) and
  // reads every NAME = None | "path" it can find. Scanning the parts that
  // actually hold paths (ASSET_PATH_STEPS) rather than a fixed code0/code1
  // pair is what kept this working when TODO 9 became eight sub-steps.
  function parseAssetPaths(codes) {
    var out = {};
    var re = /([A-Z_]+)\s*=\s*(None|"[^"]*"|'[^']*')/g;
    (Array.isArray(codes) ? codes : [codes]).forEach(function (text) {
      var m;
      re.lastIndex = 0;
      while ((m = re.exec(text || ""))) {
        var literal = m[2];
        out[m[1]] = literal === "None" ? null : literal.slice(1, -1);
      }
    });
    return out;
  }

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error("IndexedDB not available")); return; }
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readonly");
        var r = tx.objectStore(IDB_STORE).get(key);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
    }).catch(function () { return null; });
  }
  function idbSet(key, val) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(val, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () {});
  }

  function sanitizeFilename(name) {
    var dot = name.lastIndexOf(".");
    var base = dot > 0 ? name.slice(0, dot) : name;
    var ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
    var safeBase = base
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!safeBase) safeBase = "asset";
    var safeExt = ext.replace(/[^a-z0-9]/g, "");
    return { name: safeBase + (safeExt ? "." + safeExt : ""), base: safeBase, ext: safeExt, changed: (safeBase + (safeExt ? "." + safeExt : "")) !== name };
  }

  function uniqueFilename(name, kind) {
    var known = (kind === "image" ? KNOWN_ASSETS.images : KNOWN_ASSETS.sounds) || [];
    var used = state.assetData.uploadedFiles.filter(function (f) { return f.kind === kind; }).map(function (f) { return f.name; });
    var taken = {};
    known.forEach(function (n) { taken[n] = true; });
    used.forEach(function (n) { taken[n] = true; });
    if (!taken[name]) return name;
    var dot = name.lastIndexOf(".");
    var base = dot > 0 ? name.slice(0, dot) : name;
    var ext = dot > 0 ? name.slice(dot) : "";
    var i = 1;
    while (taken[base + "_" + i + ext]) i++;
    return base + "_" + i + ext;
  }

  var AssetPickerViz = (function () {
    var refs = null;
    var activeSlotKey = ASSET_SLOTS[0].key;
    // Bundled sounds get their OWN always-visible section (see
    // renderAlwaysVisibleSounds) independent of activeSlotKey, since the
    // default/most-common activeSlotKey is an image slot and a student
    // browsing images would otherwise never see that a sound list exists
    // at all (teacher report: "no way to listen to sounds in the sidebar"
    // unless you happen to click a sound row in the slot list first).
    var soundSlots = ASSET_SLOTS.filter(function (s) { return s.kind === "sound"; });
    var activeSoundSlotKey = soundSlots.length ? soundSlots[0].key : null;
    var dirHandle = null;
    var dirStatus = "unchecked"; // unchecked | none | granted | denied | unsupported
    // The custom-upload flow (folder connect + drag/drop + uploaded list)
    // is collapsed behind a toggle by default - most students only ever
    // use the bundled picker above it. `connectSectionNode` is built once
    // and cached (not rebuilt on every slot switch) so re-opening it never
    // re-triggers the folder-permission check unnecessarily.
    var customSectionExpanded = false;
    var connectSectionNode = null;

    function slotByKey(key) { return ASSET_SLOTS.filter(function (s) { return s.key === key; })[0]; }

    function currentPaths() {
      return parseAssetPaths(ASSET_PATH_STEPS.map(bonusCode));
    }

    function writeAssetSlot(slot, valueLiteral) {
      // Each path setting belongs to exactly one sub-step now, so the
      // picker writes into the live editor only when THAT sub-step is the
      // one on screen; otherwise it edits saved progress directly and the
      // student sees the change when they open that step.
      var ta = state.currentStepId === slot.stepId ? document.querySelector("#mainPanel .code-textarea") : null;
      var code = ta ? ta.value : bonusCode(slot.stepId);
      var re = new RegExp("(" + slot.key + "\\s*=\\s*)(None|\"[^\"]*\"|'[^']*')");
      var newCode = re.test(code) ? code.replace(re, "$1" + valueLiteral) : (code + "\n" + slot.key + " = " + valueLiteral);
      if (ta) { ta.value = newCode; ta.dispatchEvent(new Event("input")); }
      else if (state.steps[slot.stepId]) { state.steps[slot.stepId].code = newCode; persist(); }
      renderAllPanels();
    }

    function pathFor(filename, kind) { return "assets/" + (kind === "image" ? "images" : "sounds") + "/" + filename; }

    function renderInstructions(container) {
      var box = el("div", { class: "asset-instructions" });
      box.appendChild(el("div", { class: "sidebar-group-title", text: "How custom uploads work" }));
      var diagram = el("div", { class: "asset-folder-diagram", html:
        '<svg viewBox="0 0 20 20" class="icon"><path d="M2 5a1 1 0 0 1 1-1h4l1.5 2H17a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z" fill="currentColor" opacity="0.85"/></svg> dijkstra_maze/<br>' +
        '&nbsp;&nbsp;<svg viewBox="0 0 20 20" class="icon"><path d="M2 5a1 1 0 0 1 1-1h4l1.5 2H17a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z" fill="currentColor" opacity="0.85"/></svg> student/  ← select THIS folder<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;<svg viewBox="0 0 20 20" class="icon"><path d="M4 3h5l1 2h6a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg> settings.py<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;<svg viewBox="0 0 20 20" class="icon"><path d="M2 5a1 1 0 0 1 1-1h4l1.5 2H17a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z" fill="currentColor" opacity="0.85"/></svg> assets/<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<svg viewBox="0 0 20 20" class="icon"><path d="M2 5a1 1 0 0 1 1-1h4l1.5 2H17a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z" fill="currentColor" opacity="0.6"/></svg> images/<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<svg viewBox="0 0 20 20" class="icon"><path d="M2 5a1 1 0 0 1 1-1h4l1.5 2H17a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z" fill="currentColor" opacity="0.6"/></svg> sounds/'
      });
      box.appendChild(diagram);
      var steps = el("ol", { class: "asset-steps" }, [
        el("li", {}, ["Click \"Connect my project folder\" below. Your browser will ask for permission — that's normal. The site can only read/write inside the one folder you pick."]),
        el("li", {}, ["Select your ", el("code", { text: "dijkstra_maze/student" }), " folder — the one with ", el("code", { text: "settings.py" }), " directly inside (see the diagram above)."]),
        el("li", {}, ["Click \"Allow\" in the dialog. Clicked \"Deny\" by mistake? Just press \"Connect my project folder\" again."]),
        el("li", {}, ["Drag a file onto a slot below, or use its \"Upload\" button. It's copied into your ", el("code", { text: "assets/" }), " folder and the path is written into your code automatically."]),
        el("li", {}, ["Next time, one click on \"Reconnect\" — no need to pick the folder again."]),
      ]);
      box.appendChild(steps);
      box.appendChild(el("p", { class: "small muted", text: "Browser doesn't support this (or you're on file://)? Uploads still work — the site prepares a renamed download and tells you exactly where to put it." }));
      container.appendChild(box);
    }

    function renderConnectBar(container) {
      var bar = el("div", { class: "viz-controlbar" });
      var statusEl = el("span", { class: "small" });
      var connectBtn = el("button", { class: "btn btn-small btn-primary", type: "button", text: "Connect my project folder" });
      bar.appendChild(connectBtn);
      bar.appendChild(statusEl);
      container.appendChild(bar);

      function setStatus(text, cls) { statusEl.textContent = text; statusEl.className = "small " + (cls || ""); }

      if (window.location.protocol === "file:") {
        setStatus("You're on file:// — connect only works over http(s). Run 로컬서버_실행.bat, then reload.", "verdict-bad-text");
        connectBtn.disabled = true;
      } else if (!window.showDirectoryPicker) {
        setStatus("Your browser doesn't support folder access (try Chrome or Edge). Upload still works via download instead.", "muted");
        connectBtn.disabled = true;
      } else {
        idbGet(IDB_DIR_KEY).then(function (handle) {
          if (!handle) { setStatus("Not connected yet.", "muted"); return; }
          handle.queryPermission({ mode: "readwrite" }).then(function (perm) {
            if (perm === "granted") {
              dirHandle = handle; dirStatus = "granted";
              setStatus("Connected to your project folder ✓", "verdict-good-text");
            } else {
              setStatus("Found a remembered folder, but permission needs re-granting.", "muted");
              connectBtn.textContent = "Reconnect";
            }
          }).catch(function () { setStatus("Not connected yet.", "muted"); });
        });
        connectBtn.addEventListener("click", function () {
          idbGet(IDB_DIR_KEY).then(function (handle) {
            if (handle) {
              return handle.requestPermission({ mode: "readwrite" }).then(function (perm) {
                if (perm === "granted") { dirHandle = handle; dirStatus = "granted"; setStatus("Connected to your project folder ✓", "verdict-good-text"); return; }
                dirStatus = "denied";
                setStatus("Permission was not granted. Click Connect again and choose \"Allow\".", "verdict-bad-text");
              });
            }
            return window.showDirectoryPicker({ id: "dijkstra-maze-student", mode: "readwrite" }).then(function (h) {
              return h.getFileHandle("settings.py").then(function () {
                return h.getDirectoryHandle("assets");
              }).then(function () {
                dirHandle = h; dirStatus = "granted";
                setStatus("Connected to your project folder ✓", "verdict-good-text");
                idbSet(IDB_DIR_KEY, h);
              }).catch(function () {
                setStatus("That doesn't look like the student/ folder — it's missing settings.py or an assets/ folder. Please select the folder that directly contains settings.py.", "verdict-bad-text");
              });
            });
          }).catch(function (err) {
            if (err && err.name === "AbortError") { setStatus("Cancelled — no folder selected yet.", "muted"); return; }
            setStatus("Could not connect: " + (err && err.message ? err.message : err), "verdict-bad-text");
          });
        });
      }
    }

    function downscaleImageBlob(file, targetSize) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement("canvas");
          canvas.width = targetSize; canvas.height = targetSize;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, targetSize, targetSize);
          canvas.toBlob(function (blob) { resolve(blob); }, "image/png");
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    }

    function saveViaDirectoryHandle(kind, safeName, blob) {
      return dirHandle.getDirectoryHandle("assets").then(function (assetsDir) {
        return assetsDir.getDirectoryHandle(kind === "image" ? "images" : "sounds", { create: true });
      }).then(function (subDir) {
        return subDir.getFileHandle(safeName, { create: true });
      }).then(function (fileHandle) {
        return fileHandle.createWritable().then(function (writable) {
          return writable.write(blob).then(function () { return writable.close(); });
        });
      });
    }

    function downloadFallback(safeName, blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = safeName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }

    function handleUpload(slot, file) {
      var ext = (file.name.split(".").pop() || "").toLowerCase();
      var okList = slot.kind === "image" ? IMAGE_EXT_OK : SOUND_EXT_OK;
      if (okList.indexOf(ext) === -1) {
        showConfirm("Unsupported file type", "\"" + file.name + "\" doesn't look like a " + slot.kind + " file (expected: " + okList.join(", ") + ").", { confirmLabel: "OK", cancelLabel: "Close" });
        return;
      }
      var sanitized = sanitizeFilename(file.name);
      var finalName = uniqueFilename(sanitized.name, slot.kind);
      var warnings = [];
      if (sanitized.changed) warnings.push("Renamed to \"" + finalName + "\" (spaces/non-English characters cause problems for pygame file paths).");
      if (slot.kind === "sound" && ext !== "wav") warnings.push("pygame handles WAV most reliably — " + ext.toUpperCase() + " may not play on every machine.");

      function afterFileReady(blob) {
        var save = dirHandle ? saveViaDirectoryHandle(slot.kind, finalName, blob) : Promise.reject(new Error("no-handle"));
        save.then(function () {
          finishUpload(slot, finalName, warnings.concat(["Saved directly into your project's assets/ folder ✓"]));
        }).catch(function () {
          downloadFallback(finalName, blob);
          finishUpload(slot, finalName, warnings.concat(["Downloaded \"" + finalName + "\" — move it into assets/" + (slot.kind === "image" ? "images" : "sounds") + "/ in your project folder, then this path will work in the game."]));
        });
      }

      if (slot.kind === "image") {
        var img2 = new Image();
        img2.onload = function () {
          if (img2.naturalWidth > 512 || img2.naturalHeight > 512) {
            showConfirm("Large image", "\"" + file.name + "\" is " + img2.naturalWidth + "×" + img2.naturalHeight + "px — much bigger than a maze tile. Downscale it to 128×128 automatically?", { confirmLabel: "Downscale", cancelLabel: "Keep original" }).then(function (ok) {
              if (ok) downscaleImageBlob(file, 128).then(afterFileReady);
              else afterFileReady(file);
            });
          } else {
            afterFileReady(file);
          }
        };
        img2.onerror = function () { showConfirm("Could not read image", "\"" + file.name + "\" could not be opened as an image.", { confirmLabel: "OK", cancelLabel: "Close" }); };
        img2.src = URL.createObjectURL(file);
      } else {
        var audioCheck = document.createElement("audio");
        audioCheck.preload = "metadata";
        audioCheck.onloadedmetadata = function () {
          if (slot.key !== "BACKGROUND_MUSIC_PATH" && audioCheck.duration > 10) {
            warnings.push("This is " + Math.round(audioCheck.duration) + "s long for a sound-effect slot — sound effects usually work best under a few seconds.");
          }
          afterFileReady(file);
        };
        audioCheck.onerror = function () { afterFileReady(file); };
        audioCheck.src = URL.createObjectURL(file);
      }
    }

    function finishUpload(slot, finalName, warnings) {
      state.assetData.uploadedFiles.push({ name: finalName, kind: slot.kind, addedAt: Date.now() });
      persist();
      writeAssetSlot(slot, '"' + pathFor(finalName, slot.kind) + '"');
      if (warnings && warnings.length) {
        showConfirm("Upload complete", warnings.join(" "), { confirmLabel: "OK", cancelLabel: "Close" });
      }
    }

    function removeUploaded(file) {
      showConfirm("Remove from your uploaded list?", "\"" + file.name + "\" will no longer be tracked here. If it's already saved to disk it will stay there unless you delete it yourself.", { confirmLabel: "Remove", dangerConfirm: true }).then(function (ok) {
        if (!ok) return;
        state.assetData.uploadedFiles = state.assetData.uploadedFiles.filter(function (f) { return !(f.name === file.name && f.kind === file.kind); });
        persist();
        if (dirHandle) {
          dirHandle.getDirectoryHandle("assets").then(function (a) { return a.getDirectoryHandle(file.kind === "image" ? "images" : "sounds"); }).then(function (sub) { return sub.removeEntry(file.name).catch(function () {}); }).catch(function () {});
        }
        renderAllPanels();
      });
    }

    function renderSlotList(container) {
      var list = el("div", { class: "asset-slot-list" });
      var paths = currentPaths();
      ASSET_SLOTS.forEach(function (slot) {
        var val = paths[slot.key];
        var row = el("button", {
          class: "asset-slot-row" + (slot.key === activeSlotKey ? " is-active" : ""),
          type: "button",
          onclick: function () { activeSlotKey = slot.key; renderAllPanels(); },
        }, [
          el("span", { class: "asset-slot-key", text: slot.key }),
          el("span", { class: "asset-slot-value", text: val ? val.split("/").pop() : "None (built-in)" }),
        ]);
        list.appendChild(row);
      });
      container.appendChild(list);
    }

    function renderBundledGrid(container, slot) {
      var head = el("div", { class: "sidebar-group-title", text: (slot.kind === "image" ? "Bundled images" : "Bundled sounds") + " — click to use for " + slot.key });
      container.appendChild(head);
      if (slot.kind === "image") {
        var grid = el("div", { class: "asset-thumb-grid" });
        KNOWN_ASSETS.images.forEach(function (fname) {
          var thumb = el("button", { class: "asset-thumb", type: "button", title: fname, onclick: function () { writeAssetSlot(slot, '"' + pathFor(fname, "image") + '"'); } }, [
            el("img", { src: "assets/images/" + fname, alt: fname, loading: "lazy" }),
            el("span", { class: "asset-thumb-label", text: fname }),
          ]);
          grid.appendChild(thumb);
        });
        container.appendChild(grid);
      } else {
        var list = el("ul", { class: "asset-sound-list" });
        KNOWN_ASSETS.sounds.forEach(function (fname) {
          var li = el("li", {}, [
            el("button", { class: "btn btn-small", type: "button", text: "▶", "aria-label": "Preview " + fname, onclick: function () { try { new Audio("assets/sounds/" + fname).play().catch(function () {}); } catch (e) {} } }),
            el("span", { text: " " + fname + " " }),
            el("button", { class: "btn btn-small btn-secondary", type: "button", text: "Use", onclick: function () { writeAssetSlot(slot, '"' + pathFor(fname, "sound") + '"'); } }),
          ]);
          list.appendChild(li);
        });
        container.appendChild(list);
      }
    }

    // Always rendered directly below the bundled images, regardless of
    // which slot the main slot list has selected - a student browsing
    // player/goal/bomb/floor-tile images should still see (and be able to
    // preview + use) the bundled sounds without switching slots first. Has
    // its own tiny slot selector (one button per sound-kind ASSET_SLOTS
    // entry, e.g. "Bomb explosion sound" / "Background music") so "Use"
    // still knows which of the two sound variables to write into.
    function renderAlwaysVisibleSounds(container) {
      if (!soundSlots.length) return;
      var wrap = el("div", { class: "asset-sound-always" });
      if (soundSlots.length > 1) {
        var tabs = el("div", { class: "viz-controlbar" });
        soundSlots.forEach(function (s) {
          tabs.appendChild(el("button", {
            class: "btn btn-small" + (s.key === activeSoundSlotKey ? " btn-primary" : ""),
            type: "button",
            onclick: function () { activeSoundSlotKey = s.key; renderAllPanels(); },
          }, [s.label]));
        });
        wrap.appendChild(tabs);
      }
      renderBundledGrid(wrap, slotByKey(activeSoundSlotKey));
      container.appendChild(wrap);
    }

    function renderUploadArea(container, slot) {
      var box = el("div", { class: "asset-upload-box" });
      box.appendChild(el("div", { class: "sidebar-group-title", text: "Upload your own" }));
      var input = el("input", { type: "file", accept: slot.kind === "image" ? "image/*" : "audio/*" });
      input.addEventListener("change", function () { if (input.files[0]) handleUpload(slot, input.files[0]); input.value = ""; });
      box.appendChild(input);
      box.addEventListener("dragover", function (e) { e.preventDefault(); box.classList.add("is-dragover"); });
      box.addEventListener("dragleave", function () { box.classList.remove("is-dragover"); });
      box.addEventListener("drop", function (e) {
        e.preventDefault(); box.classList.remove("is-dragover");
        if (e.dataTransfer.files[0]) handleUpload(slot, e.dataTransfer.files[0]);
      });
      box.appendChild(el("p", { class: "small muted", text: "Drag a file here, or use the picker above." }));
      container.appendChild(box);
    }

    function renderPreview(container, slot) {
      var paths = currentPaths();
      var val = paths[slot.key];
      var box = el("div", { class: "asset-preview" });
      box.appendChild(el("div", { class: "sidebar-group-title", text: "Preview in context" }));
      if (slot.kind === "image") {
        var made = makeCanvas(72, 72);
        made.canvas.className = "viz-canvas";
        box.appendChild(made.canvas);
        var ctx = made.ctx;
        ctx.fillStyle = "#171310"; ctx.fillRect(0, 0, 72, 72);
        ctx.strokeStyle = "#e8dcc4"; ctx.strokeRect(1, 1, 70, 70);
        if (val) {
          loadImageCached(val).then(function (img) {
            if (img) ctx.drawImage(img, 8, 8, 56, 56);
            else { ctx.fillStyle = "#e0685f"; ctx.font = "10px sans-serif"; ctx.fillText("not found", 6, 40); }
          });
        } else {
          ctx.fillStyle = "#4fa3e3"; ctx.beginPath(); ctx.arc(36, 36, 18, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        if (val) {
          box.appendChild(el("button", { class: "btn btn-small btn-primary", type: "button", text: "▶ Play " + val.split("/").pop(), onclick: function () { try { new Audio(val).play().catch(function () {}); } catch (e) {} } }));
        } else {
          box.appendChild(el("p", { class: "small muted", text: "None selected — silent." }));
        }
      }
      container.appendChild(box);
    }

    function renderUploadedList(container) {
      if (!state.assetData.uploadedFiles.length) return;
      var box = el("div", { class: "asset-uploaded-list" });
      box.appendChild(el("div", { class: "sidebar-group-title", text: "Files you've added this session" }));
      var ul = el("ul");
      state.assetData.uploadedFiles.forEach(function (f) {
        ul.appendChild(el("li", {}, [
          f.name + " (" + f.kind + ") ",
          el("button", { class: "btn btn-small btn-outline-danger", type: "button", text: "Remove", onclick: function () { removeUploaded(f); } }),
        ]));
      });
      box.appendChild(ul);
      box.appendChild(el("p", { class: "small muted", text: "Metadata only, saved with your progress — the actual files live on your disk, so keep them. Exporting progress.json does not back up the images/sounds themselves." }));
      container.appendChild(box);
    }

    // Built once and cached (see customSectionExpanded/connectSectionNode
    // above) so switching slots or re-rendering doesn't re-run the
    // permission/IndexedDB check inside renderConnectBar every time.
    function ensureConnectSectionBuilt() {
      if (connectSectionNode) return connectSectionNode;
      var wrap = el("div", { class: "asset-connect-wrap" });
      renderInstructions(wrap);
      renderConnectBar(wrap);
      connectSectionNode = wrap;
      return wrap;
    }

    // Most students only ever use the bundled picker above - the whole
    // custom-upload flow (walkthrough, folder connect, drag/drop, uploaded
    // list) lives behind this one toggle, collapsed by default, so the
    // panel stays uncluttered for everyone else.
    function renderCustomUploadSection(container, slot) {
      var section = el("div", { class: "asset-custom-section" });
      section.appendChild(el("button", {
        class: "btn btn-small btn-secondary asset-custom-toggle", type: "button",
        "aria-expanded": customSectionExpanded ? "true" : "false",
        onclick: function () { customSectionExpanded = !customSectionExpanded; renderAllPanels(); },
      }, [customSectionExpanded ? "− Hide custom upload" : "+ Add my own image or sound instead"]));
      if (customSectionExpanded) {
        var inner = el("div", { class: "asset-custom-inner" });
        inner.appendChild(el("p", { class: "small muted", text: "Most students don't need this — the bundled options above already cover most games. This is only for adding your own picture or sound file." }));
        inner.appendChild(ensureConnectSectionBuilt());
        renderUploadArea(inner, slot);
        renderUploadedList(inner);
        section.appendChild(inner);
      }
      container.appendChild(section);
    }

    function renderAllPanels() {
      if (!refs) return;
      refs.body.innerHTML = "";
      renderSlotList(refs.body);
      var slot = slotByKey(activeSlotKey);
      renderPreview(refs.body, slot);
      renderBundledGrid(refs.body, slot);
      // Skip the always-visible sounds section when the main slot list is
      // ALREADY showing a sound slot (renderBundledGrid just rendered the
      // sound list above) - otherwise the same sound list would render
      // twice in a row.
      if (slot.kind !== "sound") renderAlwaysVisibleSounds(refs.body);
      renderCustomUploadSection(refs.body, slot);
    }

    return {
      mount: function (container) {
        container.innerHTML = "";
        var body = el("div", { class: "asset-body" });
        container.appendChild(body);
        refs = { container: container, body: body };
        renderAllPanels();
      },
      show: function () { renderAllPanels(); },
      update: function () { renderAllPanels(); },
      unmount: function () { refs = null; },
    };
  })();
  Visualizer.register("assetPicker", AssetPickerViz);

  // -------------------------------------------------------- 14i. Play tab
  //
  // One cumulative maze game, always mounted in the Play tab. It starts
  // deliberately broken and switches on real capabilities as Required steps
  // are COMPLETED (never for skipped steps). Every gated capability that
  // touches game logic (movement, the Dijkstra hint route) runs the
  // student's ACTUAL current code through Pyodide, exactly like the
  // Step-view visualizers above - nothing here is faked either. This is a
  // pure maze-solving game (goal + timer + bomb-reset only, see D4's
  // changelog note) - no score, no swamp, no monster.

  // The round list and the pacing numbers both come from the student's own
  // TODO 8 code now (see playRounds() / playPacing() above) - these are only
  // the values used before TODO 8 has been touched.
  var PLAY_MAX_HINT_COUNT = 2; // mirrors settings.py's MAX_HINT_COUNT
  var PLAY_MOVE_DELAY_MS = 100;

  var PlayEngine = (function () {
    var refs = null;
    var roundIndex = 0;
    var maze = null, rows = 0, cols = 0, cellSize = 0;
    var player = { row: 0, col: 0 };
    var playerStart = { row: 0, col: 0 };
    var goal = { row: 0, col: 0 };
    var items = [], bombs = [];
    var timeLeft = 0, timerId = null;
    var hintsRemaining = PLAY_MAX_HINT_COUNT;
    var running = false;
    var soundOn = false;
    // The student's parsed CUSTOM_ITEMS (TODO 10) - a list of {name, color,
    // effect, amount}, or null until TODO 10 is complete and loaded once via
    // loadCustomItems(). Each spawned item randomly picks one entry, same
    // as the real game's create_game_objects() (random.choice(CUSTOM_ITEMS)).
    var customItemDefs = null;
    var hintPath = [];
    var hintTimeout = null;
    var busyMove = false;
    var lastMoveAt = 0;
    var mounted = false;

    function isDoneExact(id) { return !!(state && state.steps[id] && state.steps[id].status === "completed"); }
    function capabilities() {
      return {
        title: isDoneExact("1"),
        movement: isDoneExact("2") && isDoneExact("3") && isDoneExact("4"),
        hint: isDoneExact("5"),
        // A Bonus capability turns on once EVERY sub-step of its group is
        // completed - the same gate as before the split, just spelled out
        // over the group instead of one id.
        mapEditor: bonusGroupComplete("8"),
        assets: bonusGroupComplete("9"),
        customItem: bonusGroupComplete("10"),
        rules: bonusGroupComplete("11"),
      };
    }
    function allRequiredCompleteExact() { return REQUIRED_ORDER.every(isDoneExact); }

    // ---------------------------------------------------------- board sizing
    //
    // Three sizing profiles, not two. The board used to be sized for width
    // only, against a canvas that was created once at a hardcoded 360x260
    // and never resized - so any board bigger than that was simply clipped.
    // Everything below exists to make the canvas match the REAL board size
    // (cellSize * cols by cellSize * rows) and to keep that true across
    // round changes, window resizes, and entering/leaving fullscreen.
    //
    //   "roomy"  = the kiosk popout (?mode=play) OR the in-page Play tab
    //              while #vizPanel is the fullscreen element. Both are
    //              whole-screen views whose entire point is "the maze fills
    //              the screen", so both get the same generous treatment.
    //   normal   = the in-page Play tab inside the narrow sticky sidebar.
    //              Unchanged from before: 380px wide, per-round cellSize.
    //
    // playBoardIsFullscreen(): true when the element currently in fullscreen
    // is the one this board lives inside. #vizPanel is the root passed to
    // initFullscreenToggle("#stepViewFullscreenBtn", "#vizPanel"); the
    // contains() check also covers #kioskRoot's own fullscreen button and
    // any future wrapper, so the board never has to know which one it is.
    function playBoardIsFullscreen() {
      var fsEl = document.fullscreenElement || document.webkitFullscreenElement || null;
      if (!fsEl) return false;
      if (refs && refs.canvas && fsEl.contains(refs.canvas)) return true;
      var panel = document.getElementById("vizPanel");
      return !!panel && fsEl === panel;
    }
    function playBoardRoomy() { return isKioskMode() || playBoardIsFullscreen(); }

    // The board's max CSS width. The normal in-page Play tab lives in a
    // narrow sidebar panel (380px is already generous there); a roomy view
    // is a whole screen, so the cap is only there to stop something absurd
    // on an ultrawide monitor - fitWidth() still clamps to the actual
    // container width, so a smaller window just uses what it has.
    function playBoardMaxWidth() {
      return playBoardRoomy() ? 2400 : 380;
    }
    // Per-round cell size is normally capped at PLAY_ROUND_CONFIGS' own
    // cellSize (tuned for the narrow sidebar) - in a roomy view that cap is
    // far too small for a board meant to dominate the screen, so it scales
    // up to fill the available box instead (still capped at something sane
    // so tiles never render absurdly large on a tiny painted map).
    function playBoardCellCap() {
      return playBoardRoomy() ? 120 : 999;
    }

    // Vertical room the board actually has. This is the half that was
    // missing entirely: cellSize used to be Math.floor(width / cols) with
    // no height term at all, so a tall/narrow maze overflowed downwards
    // even once the canvas resized correctly.
    //
    // The play frame is a flex column (title card / toolbar / board / notice
    // / HUD / checklist / banner), so the board's budget is "viewport below
    // the frame's top, minus every sibling that is not the board". Measured
    // live from the DOM rather than hardcoded, so it stays correct after
    // entering fullscreen (where the title card and checklist are still
    // shown) and in kiosk mode (where CSS display:none's them, and a
    // display:none element measures 0 here automatically).
    var PLAY_BOARD_V_SLACK = 24; // flex gaps + .viz-board-wrap margin + breathing room
    function playBoardMaxHeight() {
      var roomy = playBoardRoomy();
      var viewportH = window.innerHeight || document.documentElement.clientHeight || 700;
      // Never let a mis-measure collapse the board to nothing.
      var floorPx = roomy ? 240 : 320;
      if (!refs || !refs.frame || !refs.boardWrap || !refs.frame.parentNode) {
        return roomy ? Math.max(floorPx, viewportH - 180) : 99999;
      }
      var top = refs.frame.getBoundingClientRect().top;
      var used = 0;
      var kids = refs.frame.children;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i] === refs.boardWrap) continue;
        used += kids[i].getBoundingClientRect().height;
      }
      var budget = viewportH - Math.max(0, top) - used - PLAY_BOARD_V_SLACK;
      return Math.max(floorPx, budget);
    }

    // The one place cell size is decided. Constrained by BOTH axes.
    // roundCellHint is the round's own cell_size (TODO 8 / PLAY_ROUND_CONFIGS)
    // and only caps the normal sidebar view - a painted map passes null, and
    // a roomy view ignores it entirely in favour of filling the screen.
    function computeCellSize(r, c, roundCellHint) {
      // Measure the play frame, not the container: the container is
      // .viz-content / #kioskPlayView, whose clientWidth INCLUDES its 16px
      // padding, and overshooting there makes .viz-canvas's `max-width:100%`
      // squash the board horizontally while its style.height stays put.
      // .play-frame is the padding-free box the canvas actually gets.
      var host = (refs && refs.frame && refs.frame.clientWidth) ? refs.frame : (refs ? refs.container : document.body);
      var width = fitWidth(host, playBoardMaxWidth()) - 2;
      var height = playBoardMaxHeight();
      var cap = playBoardCellCap();
      if (!playBoardRoomy() && roundCellHint) cap = Math.min(cap, roundCellHint);
      var byWidth = Math.floor(width / Math.max(1, c));
      var byHeight = Math.floor(height / Math.max(1, r));
      return Math.max(6, Math.min(cap, byWidth, byHeight));
    }

    // Resizes the canvas element itself - both the drawing buffer
    // (width/height, in device pixels) and the CSS box (style.width/height),
    // honouring devicePixelRatio exactly the way makeCanvas() does. Without
    // this the canvas stayed at its mount-time 360x260 forever and anything
    // larger was clipped.
    function applyBoardSize() {
      if (!refs || !refs.canvas || !cols || !rows) return;
      var dpr = window.devicePixelRatio || 1;
      var cssW = Math.max(1, cellSize * cols);
      var cssH = Math.max(1, cellSize * rows);
      var bufW = Math.max(1, Math.round(cssW * dpr));
      var bufH = Math.max(1, Math.round(cssH * dpr));
      // Assigning width/height clears the canvas, so only do it on a real
      // change (also resets the transform, hence the setTransform below).
      if (refs.canvas.width !== bufW || refs.canvas.height !== bufH) {
        refs.canvas.width = bufW;
        refs.canvas.height = bufH;
      }
      refs.canvas.style.width = cssW + "px";
      refs.canvas.style.height = cssH + "px";
      refs.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Recompute + reapply the board size for the CURRENT round, without
    // regenerating it. Called on window resize, on fullscreenchange, and
    // whenever the surrounding container could have changed size.
    var roundCellHint = null;
    function relayout() {
      if (!refs || !maze || !rows || !cols) return;
      var next = computeCellSize(rows, cols, roundCellHint);
      if (next !== cellSize) cellSize = next;
      applyBoardSize();
      draw();
    }
    // Fullscreen/resize geometry isn't always final on the event itself
    // (the UA may still be animating into fullscreen), so re-measure once
    // more on the next frame and again shortly after.
    function relayoutSoon() {
      relayout();
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(relayout);
      setTimeout(relayout, 180);
    }
    function onViewportChange() { relayoutSoon(); }

    function emptyWalledGrid(r, c) {
      var g = [];
      for (var i = 0; i < r; i++) {
        var row = [];
        for (var j = 0; j < c; j++) row.push({ top: true, right: true, bottom: true, left: true });
        g.push(row);
      }
      return g;
    }
    // (blankTerrain used to exist here - terrain is gone entirely now, see
    // maze.py's get_terrain(), which always returns "NORMAL".)

    // Randomized DFS / recursive-backtracker maze generation - a direct JS
    // port of the given (non-TODO) algorithm in maze.py's generate_step().
    // Always produces a perfect maze (every cell reachable, no loops)
    // before openExtraWalls() punches a few extra connections in.
    function jsGenerateMazeWalls(rows, cols, rng) {
      var g = emptyWalledGrid(rows, cols);
      var visited = [];
      for (var i = 0; i < rows; i++) { var row = []; for (var j = 0; j < cols; j++) row.push(false); visited.push(row); }
      var opposite = { top: "bottom", right: "left", bottom: "top", left: "right" };
      function unvisitedNeighbors(r, c) {
        var candidates = [["top", r - 1, c], ["right", r, c + 1], ["bottom", r + 1, c], ["left", r, c - 1]];
        var out = [];
        candidates.forEach(function (cand) {
          var d = cand[0], nr = cand[1], nc = cand[2];
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc]) out.push([d, nr, nc]);
        });
        return out;
      }
      var stack = [];
      var cur = [0, 0];
      visited[0][0] = true;
      while (true) {
        var nbrs = unvisitedNeighbors(cur[0], cur[1]);
        if (nbrs.length > 0) {
          var pick = nbrs[Math.floor(rng() * nbrs.length)];
          var d = pick[0], nr = pick[1], nc = pick[2];
          g[cur[0]][cur[1]][d] = false;
          g[nr][nc][opposite[d]] = false;
          stack.push(cur);
          cur = [nr, nc];
          visited[nr][nc] = true;
        } else if (stack.length > 0) {
          cur = stack.pop();
        } else {
          break;
        }
      }
      return g;
    }

    // extra_open_walls post-processing: given/non-TODO logic from the
    // original game (punches extra loops into the perfect maze so it isn't
    // a single dead-end-only path). Pure grid bookkeeping, unrelated to any
    // TODO.
    function openExtraWalls(grid, count, rng) {
      var opposite = { top: "bottom", right: "left", bottom: "top", left: "right" };
      var candidates = [];
      for (var r = 0; r < grid.length; r++) {
        for (var c = 0; c < grid[r].length; c++) {
          if (c + 1 < grid[r].length && grid[r][c].right) candidates.push([r, c, r, c + 1, "right"]);
          if (r + 1 < grid.length && grid[r][c].bottom) candidates.push([r, c, r + 1, c, "bottom"]);
        }
      }
      for (var i = candidates.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
      }
      candidates.slice(0, count).forEach(function (cand) {
        var r1 = cand[0], c1 = cand[1], r2 = cand[2], c2 = cand[3], d = cand[4];
        grid[r1][c1][d] = false;
        grid[r2][c2][opposite[d]] = false;
      });
    }

    function placeRandom(rng, forbidden, count) {
      var out = [];
      var attempts = 0;
      while (out.length < count && attempts < 4000) {
        attempts++;
        var r = Math.floor(rng() * rows), c = Math.floor(rng() * cols);
        var key = r + "," + c;
        if (forbidden[key]) continue;
        forbidden[key] = true;
        out.push([r, c]);
      }
      return out;
    }

    // (The monster wander/catch simulation used to live here - deleted
    // along with the monster feature entirely, see D1's changelog note.)

    function statusLine(text, isError) {
      if (!refs) return;
      refs.notice.hidden = !text;
      refs.notice.textContent = text || "";
      refs.notice.className = "play-broken-notice" + (isError ? " status-bad" : "");
    }

    // Wraps a status message that exists only to explain an INCOMPLETE
    // TODO or a raw code/runtime error - exactly the "teaching artifact"
    // text the kiosk popout (?mode=play) must never show another student.
    // In kiosk mode this collapses to "" (statusLine("") fully hides the
    // notice, see above), so whatever didn't work just silently doesn't
    // happen - no TODO-numbered explanation, no visible error. The normal
    // in-page Play tab (used by the student themselves while working)
    // keeps the real message unchanged, since it's genuinely useful there.
    function teachingNote(text) {
      return isKioskMode() ? "" : text;
    }

    function refreshChecklist() {
      if (!refs) return;
      var caps = capabilities();
      var items2 = [
        ["title", "Title screen shows your title (TODO 1)"],
        ["movement", "Player moves & respects walls (TODO 2/3/4)"],
        ["hint", "Hint button computes a bomb-avoiding route (TODO 5)"],
        ["mapEditor", "Your painted rounds are used instead of random generation (TODO 8)"],
        ["assets", "Your chosen images/sounds are used (TODO 9)"],
        ["customItem", "Custom item(s) (TODO 10)"],
        ["rules", "Your game's rules (TODO 11)"],
      ];
      refs.checklist.innerHTML = "";
      items2.forEach(function (pair) {
        var on = caps[pair[0]];
        refs.checklist.appendChild(el("li", { class: on ? "on" : "" }, [el("span", { class: "dot" }), pair[1]]));
      });
      refs.liveBanner.hidden = !allRequiredCompleteExact();
    }

    // pickCustomItemDef(): every spawned item randomly draws ONE entry from
    // the student's own CUSTOM_ITEMS (TODO 10) - random.choice(CUSTOM_ITEMS)
    // in the real game's create_game_objects(). Falls back to a plain
    // generic "no effect yet" item until TODO 10 is complete/loaded, exactly
    // like the real game would if CUSTOM_ITEMS were left empty.
    // explicitIndex (optional): a painted round's own assignment for this
    // exact cell (see MapEditorViz's itemAssignments, TODO 8's item
    // placement) - when present and in range, spawns EXACTLY that item
    // instead of a random one, so a student's deliberate map-editor choice
    // is honored in the real Play tab, not silently re-randomized.
    function pickCustomItemDef(explicitIndex) {
      var list = (customItemDefs && customItemDefs.length) ? customItemDefs : [{ name: "Custom Item", color: [180, 180, 180], effect: null, amount: 0 }];
      if (explicitIndex != null && list[explicitIndex]) return list[explicitIndex];
      return list[Math.floor(Math.random() * list.length)];
    }

    function startRound(index) {
      roundIndex = index;
      var cfg = playRoundAt(roundIndex);
      var caps = capabilities();
      hintsRemaining = playPacing().maxHints;
      hintPath = [];
      running = false;

      // A completed TODO 8 with a painted layout for this round REPLACES
      // procedural DFS generation entirely - no Pyodide maze-gen call at
      // all, the student's own hand-painted map is the round.
      if (caps.mapEditor && state.mapEditorData.rounds[index]) {
        var painted = state.mapEditorData.rounds[index];
        rows = painted.rows; cols = painted.cols;
        // A hand-painted map has no per-round cell_size of its own, so it
        // sizes purely to the available box (both axes).
        roundCellHint = null;
        cellSize = computeCellSize(rows, cols, null);
        maze = paintedGridToWallGrid(painted.grid);
        var extracted = paintedItemsAndBombs(painted.grid, painted.itemAssignments);
        items = extracted.items.map(function (p) { return { row: p[0], col: p[1], active: true, itemDef: pickCustomItemDef(p[2]) }; });
        bombs = extracted.bombs.map(function (p) { return { row: p[0], col: p[1], active: true }; });
        player = { row: painted.start[0], col: painted.start[1] };
        playerStart = { row: painted.start[0], col: painted.start[1] };
        goal = { row: painted.goal[0], col: painted.goal[1] };
        timeLeft = cfg.timeLimitSeconds;
        applyBoardSize();
        statusLine(teachingNote("Using your hand-painted map for this round (TODO 8)."));
        renderAll();
        return;
      }

      rows = cfg.rows; cols = cfg.cols;
      roundCellHint = cfg.cellSize;
      cellSize = computeCellSize(rows, cols, roundCellHint);
      applyBoardSize();
      player = { row: 0, col: 0 };
      playerStart = { row: 0, col: 0 };
      goal = { row: rows - 1, col: cols - 1 };
      items = []; bombs = [];
      timeLeft = cfg.timeLimitSeconds;

      // Maze generation (randomized DFS / recursive backtracker) is given,
      // complete code in maze.py, not a student TODO - see student/maze.py
      // and TEACHER_TODO_GUIDE.md for why. It always works from round 1,
      // no capability gate needed, and (being fixed, not student code)
      // there's no need to round-trip it through Pyodide - jsGenerateMazeWalls
      // reimplements the exact same algorithm directly in JS.
      statusLine("Generating your maze…");
      var rng = mulberry32(1000 + roundIndex);
      var g = jsGenerateMazeWalls(rows, cols, rng);
      openExtraWalls(g, cfg.extraOpenWalls, rng);
      maze = g;

      var forbidden = {}; forbidden[player.row + "," + player.col] = true; forbidden[goal.row + "," + goal.col] = true;
      var itemSpots = placeRandom(rng, forbidden, cfg.customItemCount);
      items = itemSpots.map(function (p) { return { row: p[0], col: p[1], active: true, itemDef: pickCustomItemDef() }; });
      bombs = placeRandom(rng, forbidden, cfg.bombCount).map(function (p) { return { row: p[0], col: p[1], active: true }; });
      refreshPlayImages();
      renderAll();
    }

    // --- the student's own artwork -----------------------------------
    //
    // TODO 9 picks image paths and *_IMAGE_SCALE sizes, TODO 10 gives each
    // item its own image/size. The Play tab draws all of it, so the visual
    // choices a student makes actually show up in the game they are
    // testing - falling back to the built-in shapes for anything left as
    // None or still loading, exactly like the real pygame code does.
    var playImages = { player: null, goal: null, bomb: null, floor: null };
    var playItemImages = {};

    function playVisuals() {
      // Images live in 9-1/9-2, the sizes in 9-3, the sound paths in 9-6.
      // Everything is joined for the scale reads so an odd save (or a
      // student who pasted a scale into the wrong sub-step) still works.
      var code = BONUS_GROUP_IDS["9"].map(bonusCode);
      var all = code.join("\n");
      var paths = parseAssetPaths(code);
      return {
        paths: paths,
        playerScale: parseNumberSetting(all, "PLAYER_IMAGE_SCALE", 0.1, 3, 1),
        goalScale: parseNumberSetting(all, "GOAL_IMAGE_SCALE", 0.1, 3, 1),
        bombScale: parseNumberSetting(all, "BOMB_IMAGE_SCALE", 0.1, 3, 1),
      };
    }

    // Kicks off (cached) loads for every path currently configured, then
    // redraws once they arrive. Safe to call as often as you like.
    function refreshPlayImages() {
      var vis = playVisuals();
      var wanted = {
        player: vis.paths.PLAYER_IMAGE_PATH,
        goal: vis.paths.GOAL_IMAGE_PATH,
        bomb: vis.paths.BOMB_IMAGE_PATH,
        floor: vis.paths.FLOOR_TILE_IMAGE_PATH,
      };
      Object.keys(wanted).forEach(function (slot) {
        var path = wanted[slot];
        if (!path) { playImages[slot] = null; return; }
        loadImageCached(path).then(function (img) {
          playImages[slot] = img || null;
          if (refs) draw();
        });
      });
      (customItemDefs || []).forEach(function (def) {
        if (!def || !def.image || playItemImages[def.image] !== undefined) return;
        playItemImages[def.image] = null;
        loadImageCached(def.image).then(function (img) {
          playItemImages[def.image] = img || null;
          if (refs) draw();
        });
      });
    }

    // Draw an image centred on a cell at a given fraction of the cell,
    // preserving its aspect ratio so a non-square sprite is never squashed.
    function drawSpriteInCell(ctx, img, row, col, fraction) {
      var box = cellSize * Math.max(0.05, Math.min(2.5, fraction));
      var w = box, h = box;
      if (img.naturalWidth && img.naturalHeight) {
        var ratio = img.naturalWidth / img.naturalHeight;
        if (ratio >= 1) h = box / ratio; else w = box * ratio;
      }
      ctx.drawImage(img, (col + 0.5) * cellSize - w / 2, (row + 0.5) * cellSize - h / 2, w, h);
    }

    function draw() {
      if (!refs || !maze) return;
      var ctx = refs.ctx;
      var vis = playVisuals();
      // In CSS pixels, not device pixels: ctx is pre-scaled by devicePixelRatio
      // (see applyBoardSize/makeCanvas), so canvas.width/height would over-draw
      // by that factor on a HiDPI screen.
      var cssW = cellSize * cols, cssH = cellSize * rows;
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = "#12100c";
      ctx.fillRect(0, 0, cssW, cssH);
      if (playImages.floor) {
        for (var fr = 0; fr < rows; fr++) {
          for (var fc = 0; fc < cols; fc++) {
            ctx.drawImage(playImages.floor, fc * cellSize, fr * cellSize, cellSize, cellSize);
          }
        }
      }
      var hintSet = {};
      hintPath.forEach(function (p) { hintSet[p[0] + "," + p[1]] = true; });
      drawMazeGrid(ctx, maze, cellSize, function (r, c) {
        var key = r + "," + c;
        if (hintSet[key]) return "rgba(139,92,246,0.35)";
        return null;
      }, { wallColor: "#e8dcc4" });
      // bombs
      bombs.forEach(function (b) {
        if (!b.active) return;
        if (playImages.bomb) {
          drawSpriteInCell(ctx, playImages.bomb, b.row, b.col, 0.8 * vis.bombScale);
        } else {
          ctx.fillStyle = "#1c1a17";
          ctx.beginPath(); ctx.arc((b.col + 0.5) * cellSize, (b.row + 0.5) * cellSize, cellSize * 0.24 * vis.bombScale, 0, Math.PI * 2); ctx.fill();
        }
      });
      // items - each one's artwork, colour and size come from its own
      // CUSTOM_ITEMS entry (TODO 10), see pickCustomItemDef()
      items.forEach(function (it) {
        if (!it.active) return;
        var def = it.itemDef || {};
        var scale = typeof def.size === "number" ? Math.max(0.1, Math.min(3, def.size)) : 1;
        var img = def.image ? playItemImages[def.image] : null;
        if (img) {
          drawSpriteInCell(ctx, img, it.row, it.col, 0.72 * scale);
          return;
        }
        var color = def.color || [34, 197, 94];
        ctx.fillStyle = "rgb(" + color.join(",") + ")";
        ctx.beginPath(); ctx.arc((it.col + 0.5) * cellSize, (it.row + 0.5) * cellSize, cellSize * 0.18 * scale, 0, Math.PI * 2); ctx.fill();
      });
      // goal
      if (playImages.goal) {
        drawSpriteInCell(ctx, playImages.goal, goal.row, goal.col, 0.82 * vis.goalScale);
      } else {
        ctx.fillStyle = "#f0c04a";
        ctx.beginPath(); ctx.arc((goal.col + 0.5) * cellSize, (goal.row + 0.5) * cellSize, cellSize * 0.26 * vis.goalScale, 0, Math.PI * 2); ctx.fill();
      }
      // player
      if (playImages.player) {
        drawSpriteInCell(ctx, playImages.player, player.row, player.col, 0.86 * vis.playerScale);
      } else {
        ctx.fillStyle = "#4fa3e3";
        ctx.beginPath(); ctx.arc((player.col + 0.5) * cellSize, (player.row + 0.5) * cellSize, cellSize * 0.3 * vis.playerScale, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#0e0d0a"; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    function updateStatusGrid() {
      if (!refs) return;
      refs.roundEl.textContent = (roundIndex + 1) + " / " + playRoundCount();
      refs.timeEl.textContent = String(Math.max(0, timeLeft)) + "s";
      refs.hintsEl.textContent = hintsRemaining + " / " + playPacing().maxHints;
    }

    function renderAll() { draw(); updateStatusGrid(); refreshChecklist(); }

    function tickTimer() {
      if (!running) return;
      timeLeft--;
      draw();
      updateStatusGrid();
      if (timeLeft <= 0) {
        running = false;
        clearInterval(timerId); timerId = null;
        statusLine("Time's up! Press Restart to try this round again.", true);
        setControlsRunning(false);
      }
    }

    function setControlsRunning(isRunning) {
      if (!refs) return;
      refs.playBtn.disabled = isRunning;
      refs.pauseBtn.disabled = !isRunning;
      refs.pauseBtn.textContent = isRunning ? "Pause" : "Resume";
    }

    function playAudio(name) {
      if (!soundOn) return;
      try {
        var a = new Audio(SPRITE_SOUND[name]);
        a.volume = 0.5;
        a.play().catch(function () {});
      } catch (e) { /* ignore */ }
    }
    var SPRITE_SOUND = {
      pickup: "assets/sounds/pickup_3.wav",
      bomb: "assets/sounds/explosion_1.wav",
    };

    // Mirrors game.py's check_items()/apply_custom_item_effect()/
    // check_bombs()/check_goal() (D4's simplified game: pure maze-solving,
    // goal + timer + bomb-reset only - no score, no swamp, no monster).
    function checkTileEffects() {
      var landedItemIdx = -1;
      for (var i = 0; i < items.length; i++) {
        if (items[i].active && items[i].row === player.row && items[i].col === player.col) { landedItemIdx = i; break; }
      }
      if (landedItemIdx !== -1) {
        var it = items[landedItemIdx];
        it.active = false;
        var def = it.itemDef || {};
        var effect = def.effect, amount = def.amount || 0;
        var name = def.name || "a custom item";
        if (effect === "add_time") {
          timeLeft += amount;
          statusLine("Collected " + name + "! +" + amount + "s time");
        } else if (effect === "add_hint") {
          hintsRemaining += amount;
          statusLine("Collected " + name + "! +" + amount + " hint use(s)");
        } else if (effect) {
          statusLine("Collected " + name + " (effect: " + effect + " - not a built-in effect, so it's a safe no-op here).");
        } else {
          statusLine(teachingNote("Collected an item, but TODO 10 isn't finished yet, so it has no effect."));
        }
        playAudio("pickup");
        updateStatusGrid();
      }
      // A bomb touch is a one-shot trigger (matches Bomb.trigger() in
      // items.py: ACTIVE -> EXPLODING -> INACTIVE, never re-triggers) that
      // resets the player to the round's start position AND clears any
      // shown hint route - exactly game.py's check_bombs(), unchanged (D2).
      bombs.forEach(function (b) {
        if (b.active && b.row === player.row && b.col === player.col) {
          b.active = false;
          player.row = playerStart.row; player.col = playerStart.col;
          hintPath = [];
          playAudio("bomb");
          statusLine("Boom! Back to the start.");
          updateStatusGrid();
          draw();
        }
      });
      if (player.row === goal.row && player.col === goal.col) {
        running = false;
        clearInterval(timerId); timerId = null;
        setControlsRunning(false);
        if (roundIndex + 1 < playRoundCount()) {
          statusLine("Round " + (roundIndex + 1) + " clear! Starting round " + (roundIndex + 2) + "…");
          setTimeout(function () { startRound(roundIndex + 1); }, prefersReducedMotion() ? 0 : 900);
        } else {
          statusLine("You reached the goal in the final round - maze complete!");
        }
      }
    }

    // The arrow keys and the classroom bluetooth controller's buttons
    // (E/F/C/D = left/right/up/down). WASD is not used.
    var KEY_TO_KEYNAME = {
      ArrowLeft: "K_LEFT", e: "K_e", E: "K_e",
      ArrowRight: "K_RIGHT", f: "K_f", F: "K_f",
      ArrowUp: "K_UP", c: "K_c", C: "K_c",
      ArrowDown: "K_DOWN", d: "K_d", D: "K_d",
    };

    function onKeydown(e) {
      var keyname = KEY_TO_KEYNAME[e.key];
      if (!keyname) return;
      e.preventDefault();
      if (!running) return;
      var caps = capabilities();
      if (!caps.movement) { statusLine(teachingNote("Finish TODO 2, 3 and 4 to make the player move.")); return; }
      var pacing = playPacing();
      var now = performance.now();
      if (busyMove || now - lastMoveAt < pacing.moveDelayMs) return;
      busyMove = true;
      ensurePyodide().then(function (py) {
        var src = traceHarness_playerMove(
          state.steps["2"].code, state.steps["3"].code, state.steps["4"].code,
          maze, keyname, player.row, player.col);
        return py.runPythonAsync(src);
      }).then(function (json) {
        busyMove = false;
        lastMoveAt = performance.now();
        var data = JSON.parse(json);
        if (!data.ok) { statusLine(teachingNote("Your movement code raised an error: " + data.error), true); return; }
        player.row = data.row; player.col = data.col;
        draw();
        checkTileEffects();
      }).catch(function () { busyMove = false; });
    }

    function onHint() {
      var caps = capabilities();
      if (!caps.hint) return;
      // ALLOW_PATH_HINT (TODO 8 Part 3/6) can switch the Hint button off
      // entirely - the Play tab has to respect the student's own setting,
      // or the game they are designing isn't the game they are testing.
      if (!playPacing().allowHint) {
        statusLine("Hints are switched off in your settings (ALLOW_PATH_HINT = False).");
        return;
      }
      if (hintsRemaining <= 0) { statusLine("No hint uses left this round."); return; }
      var bombPositions = {};
      bombs.forEach(function (b) { if (b.active) bombPositions[b.row + "," + b.col] = true; });
      ensurePyodide().then(function (py) {
        var c5 = state.steps["5"].code;
        return py.runPythonAsync(traceHarness_hintRoute(c5[0], c5[1], maze, bombPositions, [player.row, player.col], [goal.row, goal.col]));
      }).then(function (json) {
        var d = JSON.parse(json);
        if (d.ok && d.path && d.path.length) {
          hintPath = d.path;
          hintsRemaining -= 1;
          updateStatusGrid();
          draw();
          if (hintTimeout) clearTimeout(hintTimeout);
          hintTimeout = setTimeout(function () { hintPath = []; draw(); }, 4000);
        } else {
          statusLine("Could not compute a hint route right now.", true);
        }
      });
    }

    // Loads the student's parsed CUSTOM_ITEMS (TODO 10) once (and again on
    // refresh()) - see pickCustomItemDef(), which every spawned item uses.
    function loadCustomItems() {
      if (!bonusGroupComplete("10")) { customItemDefs = null; return; }
      ensurePyodide().then(function (py) {
        return py.runPythonAsync(traceHarness_customItems(bonusCode("10-1")));
      }).then(function (json) {
        var d = JSON.parse(json);
        if (d.ok) {
          customItemDefs = d.items;
          // Each item can name its own picture, so newly-parsed defs may
          // bring in images the cache has never seen.
          refreshPlayImages();
        }
      }).catch(function () {});
    }

    return {
      mount: function (container) {
        mounted = true;
        container.innerHTML = "";
        var frame = el("div", { class: "play-frame" });
        var titleBox = el("div", { class: "titlecard-frame", style: "padding:14px;" });
        frame.appendChild(titleBox);
        var topbar = el("div", { class: "play-topbar" });
        var playBtn = el("button", { class: "btn btn-small btn-primary", type: "button", text: "Play" });
        var pauseBtn = el("button", { class: "btn btn-small", type: "button", text: "Pause", disabled: "disabled" });
        var restartBtn = el("button", { class: "btn btn-small", type: "button", text: "Restart" });
        var hintBtn = el("button", { class: "btn btn-small btn-secondary", type: "button", text: "Hint" });
        var soundLabel = el("label", { class: "play-sound-toggle" }, [
          el("input", { type: "checkbox" }),
          "Sound",
        ]);
        var soundCheckbox = soundLabel.querySelector("input");
        topbar.appendChild(playBtn); topbar.appendChild(pauseBtn); topbar.appendChild(restartBtn); topbar.appendChild(hintBtn); topbar.appendChild(soundLabel);
        frame.appendChild(topbar);
        var boardWrap = el("div", { class: "viz-board-wrap" });
        // Placeholder size only - startRound() -> applyBoardSize() resizes
        // this to the real board immediately, and again on every round
        // change / resize / fullscreen transition. (It used to stay at this
        // fixed size forever, which is exactly why bigger mazes were clipped.)
        var made = makeCanvas(360, 260);
        made.canvas.tabIndex = 0;
        made.canvas.className = "viz-canvas viz-canvas-focusable";
        made.canvas.setAttribute("aria-label", "Maze game board — click, then use the arrow keys or E/F/C/D");
        boardWrap.appendChild(made.canvas);
        frame.appendChild(boardWrap);
        var notice = el("div", { class: "play-broken-notice", hidden: "hidden" });
        frame.appendChild(notice);
        var statusGrid = el("div", { class: "play-status-grid" });
        var roundItem = el("div", { class: "play-status-item" }, [el("span", { class: "value", text: "1/3" }), el("span", { class: "label", text: "Round" })]);
        var timeItem = el("div", { class: "play-status-item" }, [el("span", { class: "value", text: "0s" }), el("span", { class: "label", text: "Time" })]);
        var hintsItem = el("div", { class: "play-status-item" }, [el("span", { class: "value", text: String(PLAY_MAX_HINT_COUNT) + " / " + String(PLAY_MAX_HINT_COUNT) }), el("span", { class: "label", text: "Hints" })]);
        statusGrid.appendChild(roundItem); statusGrid.appendChild(timeItem); statusGrid.appendChild(hintsItem);
        frame.appendChild(statusGrid);
        var checklistHead = el("div", { class: "sidebar-group-title", text: "Capabilities" });
        var checklist = el("ul", { class: "play-checklist" });
        frame.appendChild(checklistHead);
        frame.appendChild(checklist);
        var liveBanner = el("div", { class: "play-live-banner", text: "🏆 YOUR GAME IS LIVE — every Required step is complete!", hidden: "hidden" });
        frame.appendChild(liveBanner);
        container.appendChild(frame);

        refs = {
          container: container, canvas: made.canvas, ctx: made.ctx,
          // frame + boardWrap are what playBoardMaxHeight() measures against.
          frame: frame, boardWrap: boardWrap,
          playBtn: playBtn, pauseBtn: pauseBtn, notice: notice,
          roundEl: roundItem.querySelector(".value"), timeEl: timeItem.querySelector(".value"),
          hintsEl: hintsItem.querySelector(".value"),
          checklist: checklist, liveBanner: liveBanner, titleBox: titleBox, hintBtn: hintBtn,
        };

        // Keep the board sized to whatever room it currently has: window
        // resizes, and entering/leaving fullscreen (both the Step View
        // toggle on #vizPanel and the kiosk window's own button).
        window.addEventListener("resize", onViewportChange);
        document.addEventListener("fullscreenchange", onViewportChange);
        document.addEventListener("webkitfullscreenchange", onViewportChange);

        made.canvas.addEventListener("keydown", onKeydown);
        playBtn.addEventListener("click", function () {
          if (!maze) return;
          running = true;
          setControlsRunning(true);
          statusLine("");
          if (!timerId) timerId = setInterval(tickTimer, 1000);
        });
        pauseBtn.addEventListener("click", function () {
          running = !running;
          setControlsRunning(running);
        });
        restartBtn.addEventListener("click", function () { startRound(0); });
        hintBtn.addEventListener("click", onHint);
        soundCheckbox.addEventListener("change", function () { soundOn = soundCheckbox.checked; });

        refreshTitleCard();
        loadCustomItems();
        startRound(0);
        // The title card only gets its real height once refreshTitleCard()
        // has run, and the kiosk window may still be settling its layout -
        // re-measure once the first frame is on screen.
        relayoutSoon();
      },
      refresh: function () {
        if (!mounted) return;
        refreshTitleCard();
        loadCustomItems();
        // Picking a new sprite or size in TODO 9/8 should show up in the
        // game immediately, without waiting for the next round to start.
        refreshPlayImages();
        refreshChecklist();
        // The title card / checklist above the board can change height here
        // (a newly-completed TODO adds a line), which changes the board's
        // vertical budget.
        relayoutSoon();
      },
      unmount: function () {
        if (timerId) clearInterval(timerId);
        if (hintTimeout) clearTimeout(hintTimeout);
        if (refs && refs.canvas) refs.canvas.removeEventListener("keydown", onKeydown);
        window.removeEventListener("resize", onViewportChange);
        document.removeEventListener("fullscreenchange", onViewportChange);
        document.removeEventListener("webkitfullscreenchange", onViewportChange);
        mounted = false; refs = null;
      },
    };

    function refreshTitleCard() {
      if (!refs) return;
      if (!isDoneExact("1")) {
        refs.titleBox.innerHTML = "";
        refs.titleBox.appendChild(el("div", { class: "titlecard-title", text: "Maze Runner" }));
        refs.titleBox.appendChild(el("div", { class: "titlecard-subtitle", text: "Finish TODO 1 to show your own title here." }));
        return;
      }
      ensurePyodide().then(function (py) {
        return py.runPythonAsync(traceHarness_titleCard(state.steps["1"].code));
      }).then(function (json) {
        var data = JSON.parse(json);
        refs.titleBox.innerHTML = "";
        refs.titleBox.appendChild(el("div", { class: "titlecard-title", text: data.ok ? data.title : "Maze Runner" }));
        refs.titleBox.appendChild(el("div", { class: "titlecard-subtitle", text: data.ok ? data.subtitle : "" }));
      });
    }
  })();

  // -------------------------------------------------- 15. Python project export
  //
  // Turns the student's answers back into a real, runnable pygame project.
  // The splice base (EXPORT_FILES / EXPORT_MARKERS) comes from export-data.js
  // - the ORIGINAL student/ starter files, byte-for-byte, plus marker
  // metadata (file/indent/begin/end) for every TODO. Only steps with
  // status === "completed" get their own code spliced in; everything else
  // (skipped or in-progress) keeps the starter body, and a header comment on
  // the file lists exactly what's unfinished. Nothing here ever writes a
  // reference answer - only the student's own graded-correct code.

  // ---- pure-JS, store-only (no compression) ZIP writer ----------------
  var CRC_TABLE = (function () {
    var table = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function strToBytes(str) { return new TextEncoder().encode(str); }
  function dosDateTime(date) {
    date = date || new Date();
    var time = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() >> 1) & 0x1F);
    var d = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0xF) << 5) | (date.getDate() & 0x1F);
    return { time: time, date: d };
  }
  function ZipWriter() { this.files = []; }
  ZipWriter.prototype.addFile = function (name, bytesOrString) {
    var bytes = typeof bytesOrString === "string" ? strToBytes(bytesOrString) : bytesOrString;
    this.files.push({ name: name, bytes: bytes });
  };
  ZipWriter.prototype.build = function () {
    var chunks = [], centralChunks = [], offset = 0;
    var dt = dosDateTime();
    this.files.forEach(function (f) {
      var nameBytes = strToBytes(f.name);
      var crc = crc32(f.bytes);
      var size = f.bytes.length;
      var local = new Uint8Array(30 + nameBytes.length);
      var dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true); dv.setUint16(6, 0, true); dv.setUint16(8, 0, true);
      dv.setUint16(10, dt.time, true); dv.setUint16(12, dt.date, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, size, true); dv.setUint32(22, size, true);
      dv.setUint16(26, nameBytes.length, true); dv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      chunks.push(local); chunks.push(f.bytes);

      var central = new Uint8Array(46 + nameBytes.length);
      var cdv = new DataView(central.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true); cdv.setUint16(6, 20, true); cdv.setUint16(8, 0, true); cdv.setUint16(10, 0, true);
      cdv.setUint16(12, dt.time, true); cdv.setUint16(14, dt.date, true);
      cdv.setUint32(16, crc, true); cdv.setUint32(20, size, true); cdv.setUint32(24, size, true);
      cdv.setUint16(28, nameBytes.length, true); cdv.setUint16(30, 0, true); cdv.setUint16(32, 0, true);
      cdv.setUint16(34, 0, true); cdv.setUint16(36, 0, true); cdv.setUint32(38, 0, true);
      cdv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centralChunks.push(central);

      offset += local.length + f.bytes.length;
    });
    var centralStart = offset;
    var centralSize = 0;
    centralChunks.forEach(function (c) { centralSize += c.length; });
    var end = new Uint8Array(22);
    var edv = new DataView(end.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(4, 0, true); edv.setUint16(6, 0, true);
    edv.setUint16(8, this.files.length, true); edv.setUint16(10, this.files.length, true);
    edv.setUint32(12, centralSize, true); edv.setUint32(16, centralStart, true);
    edv.setUint16(20, 0, true);
    var all = chunks.concat(centralChunks).concat([end]);
    var totalLen = all.reduce(function (a, c) { return a + c.length; }, 0);
    var out = new Uint8Array(totalLen);
    var pos = 0;
    all.forEach(function (c) { out.set(c, pos); pos += c.length; });
    return out;
  };
  ZipWriter.prototype.saveAs = function (filename) {
    var bytes = this.build();
    var blob = new Blob([bytes], { type: "application/zip" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  };

  // ---- ast.parse validation harness (generic, one source string) ------
  function traceHarness_astParseOne(code) {
    return [
      "import json, base64, ast",
      b64Line("SRC", code),
      "def _run():",
      "    result = {'ok': True, 'error': None}",
      "    try:",
      "        ast.parse(SRC)",
      "    except SyntaxError as e:",
      "        result['ok'] = False",
      "        result['error'] = 'line %s: %s' % (e.lineno, e.msg)",
      "    except BaseException as e:",
      "        result['ok'] = False",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  // ---- splicing ---------------------------------------------------------
  function spliceOneMarker(text, beginMarker, endMarker, bodyText) {
    var lines = text.split("\n");
    var beginIdx = -1, endIdx = -1;
    for (var i = 0; i < lines.length; i++) {
      if (beginIdx === -1 && lines[i].indexOf(beginMarker) !== -1) { beginIdx = i; continue; }
      if (beginIdx !== -1 && endIdx === -1 && lines[i].indexOf(endMarker) !== -1) { endIdx = i; break; }
    }
    if (beginIdx === -1 || endIdx === -1) return text;
    var before = lines.slice(0, beginIdx + 1);
    var after = lines.slice(endIdx);
    var bodyLines = bodyText.split("\n");
    return before.concat(bodyLines).concat(after).join("\n");
  }

  function getBodyForMarker(m) {
    var stepId = m[0], partIndex = m[2], indent = m[3];
    var stepDef = STEP_BY_ID[stepId];
    var stepData = state.steps[stepId];
    var isDone = stepData.status === "completed";
    var raw;
    if (isDone) {
      raw = partIndex != null ? stepData.code[partIndex] : stepData.code;
    } else {
      raw = partIndex != null ? linesOf(stepDef.parts[partIndex].starter) : linesOf(stepDef.starter);
    }
    return reindentPython(raw, indent);
  }

  // How many parts a step has, for labelling a marker. Only TODO 5 is
  // still multi-part; this used to be hardcoded "/2" for exactly that
  // reason, which would have started lying the moment anything else
  // gained parts.
  function markerPartCount(stepId) {
    var step = STEP_BY_ID[stepId];
    return step && step.parts ? step.parts.length : 1;
  }

  function exportMarkersForFile(fileName) {
    return EXPORT_DATA.EXPORT_MARKERS.filter(function (m) { return m[1] === fileName; });
  }

  // ---- C2: "View full file" read-only viewer -----------------------------
  //
  // Unlike getBodyForMarker (used by the REAL project export above, which
  // only splices in a step's code once it's graded "completed" - everything
  // else stays the starter body), this always splices in the student's
  // CURRENT in-progress code for every TODO in the file, finished or not -
  // the whole point is "show me my own file exactly as it stands right
  // now", not a preview of the exported project.
  function getBodyForMarkerLive(m) {
    var stepId = m[0], partIndex = m[2], indent = m[3];
    var stepData = state.steps[stepId];
    var raw = partIndex != null ? stepData.code[partIndex] : stepData.code;
    return reindentPython(raw, indent);
  }

  // Splices every TODO belonging to `fileName` into the real starter file,
  // using each step's live (possibly unfinished) code - the same
  // splice-by-marker-text mechanism the project export uses (spliceOneMarker
  // finds each BEGIN/END marker by searching line text, never by counting
  // lines - see B2's comment-indentation bug fix note on reindentPython for
  // why naive line-counting is exactly what NOT to do here).
  function buildFullFileLive(fileName) {
    var original = EXPORT_DATA.EXPORT_FILES[fileName];
    if (original == null) return null;
    var markers = exportMarkersForFile(fileName);
    var text = original;
    markers.forEach(function (m) {
      var body = getBodyForMarkerLive(m);
      text = spliceOneMarker(text, m[4], m[5], body);
    });
    return text;
  }

  function openFullFileViewer(fileName) {
    var fullText = buildFullFileLive(fileName);
    var overlay = el("div", { class: "modal-overlay", role: "dialog", "aria-modal": "true", "aria-label": "Full file: " + fileName });
    var box = el("div", { class: "modal-box fileview-modal" });
    var closeBtn = el("button", { class: "icon-btn fileview-close", type: "button", "aria-label": "Close" }, [
      svgIcon('<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
    ]);
    box.appendChild(el("div", { class: "fileview-header" }, [
      el("div", {}, [
        el("div", { class: "fileview-title", text: fileName }),
        el("div", { class: "small muted", text: "Read-only — the complete real file, with your own in-progress code for every TODO spliced into place. Editing still happens in the step editor above." }),
      ]),
      closeBtn,
    ]));
    var body = el("div", { class: "fileview-body" });
    if (fullText == null) {
      body.appendChild(el("p", { class: "small muted", text: "Could not load " + fileName + " right now." }));
    } else {
      body.appendChild(buildContextBlock(fullText, 1, "fileview-code"));
    }
    box.appendChild(body);
    overlay.appendChild(box);
    function close() { overlay.remove(); document.removeEventListener("keydown", onEsc); }
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    function onEsc(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onEsc);
    $("#modalRoot").appendChild(overlay);
    closeBtn.focus();
  }

  // Returns an array of {text, label} stages: stage[0] is the untouched
  // original file (guaranteed valid, since it's the real starter file);
  // each later stage cumulatively applies one more TODO's splice, so
  // whichever stage FIRST fails to parse pinpoints the culprit TODO.
  function buildFileStages(fileName) {
    var original = EXPORT_DATA.EXPORT_FILES[fileName];
    var markers = exportMarkersForFile(fileName);
    var text = original;
    var stages = [{ text: text, label: null }];
    markers.forEach(function (m) {
      var body = getBodyForMarker(m);
      text = spliceOneMarker(text, m[4], m[5], body);
      var label = "TODO " + m[0] + (m[2] != null ? " (part " + (m[2] + 1) + "/" + markerPartCount(m[0]) + ")" : "");
      stages.push({ text: text, label: label });
    });
    return stages;
  }

  function validateStages(py, stages) {
    var idx = 0;
    function step() {
      if (idx >= stages.length) return Promise.resolve({ ok: true, finalText: stages[stages.length - 1].text, brokenBy: null, error: null });
      var stage = stages[idx];
      return py.runPythonAsync(traceHarness_astParseOne(stage.text)).then(function (json) {
        var res = JSON.parse(json);
        if (!res.ok) {
          return { ok: false, finalText: stages[stages.length - 1].text, brokenBy: stage.label, error: res.error };
        }
        idx++;
        return step();
      });
    }
    return step();
  }

  var EXPORT_TODO_FILES = ["settings.py", "game.py", "player.py", "maze.py", "pathfinding.py"];

  function validateAllFiles(py) {
    var results = {};
    var chain = Promise.resolve();
    EXPORT_TODO_FILES.forEach(function (fname) {
      chain = chain.then(function () {
        return validateStages(py, buildFileStages(fname)).then(function (r) { results[fname] = r; });
      });
    });
    return chain.then(function () { return results; });
  }

  function computeCompletionSummary() {
    var reqDone = REQUIRED_ORDER.filter(function (id) { return state.steps[id].status === "completed"; }).length;
    var reqSkipped = REQUIRED_ORDER.filter(function (id) { return state.steps[id].status === "skipped"; }).length;
    var bonusDone = BONUS_ORDER.filter(function (id) { return state.steps[id].status === "completed"; }).length;
    var unfinished = [];
    REQUIRED_ORDER.concat(BONUS_ORDER).forEach(function (id) {
      var st = state.steps[id].status;
      if (st !== "completed") unfinished.push({ id: id, file: stepFiles(STEP_BY_ID[id]).join(", "), status: st === "skipped" ? "skipped" : "not attempted yet" });
    });
    return {
      reqDone: reqDone, reqTotal: REQUIRED_ORDER.length, reqSkipped: reqSkipped,
      bonusDone: bonusDone, bonusTotal: BONUS_ORDER.length, unfinished: unfinished,
      summaryText: reqDone + " of " + REQUIRED_ORDER.length + " Required complete · " + reqSkipped + " skipped · Bonus " + bonusDone + " of " + BONUS_ORDER.length,
    };
  }

  function buildExportedFiles() {
    return ensurePyodide().then(function (py) {
      return validateAllFiles(py);
    }).then(function (validation) {
      var files = {};
      Object.keys(EXPORT_DATA.EXPORT_FILES).forEach(function (fname) {
        var markers = exportMarkersForFile(fname);
        if (!markers.length) { files[fname] = EXPORT_DATA.EXPORT_FILES[fname]; return; }
        var v = validation[fname];
        var content = v.ok ? v.finalText : EXPORT_DATA.EXPORT_FILES[fname];
        var header = "";
        if (!v.ok) {
          header += "# NOTE: this file could not be safely exported with your latest code\n";
          header += "# (" + v.brokenBy + " introduced a syntax error: " + v.error + ").\n";
          header += "# Showing the ORIGINAL starter version instead so the game still runs.\n";
          header += "# Go back to that step on the website, fix it, and download again.\n#\n";
        }
        var unfinishedForFile = [];
        markers.forEach(function (m) {
          var st = state.steps[m[0]].status;
          if (st !== "completed") {
            unfinishedForFile.push("TODO " + m[0] + (m[2] != null ? " (part " + (m[2] + 1) + "/" + markerPartCount(m[0]) + ")" : "") + " - " + (st === "skipped" ? "skipped" : "not attempted yet"));
          }
        });
        if (unfinishedForFile.length) {
          header += "# ============================================================\n";
          header += "# The following TODOs in this file are not finished yet.\n";
          header += "# The starter code has been left in place for them below:\n";
          unfinishedForFile.forEach(function (u) { header += "#   - " + u + "\n"; });
          header += "# ============================================================\n\n";
        }
        files[fname] = header + content;
      });
      return { files: files, validation: validation, summary: computeCompletionSummary() };
    });
  }

  function buildHowToRunText(summary) {
    return [
      "Dijkstra Maze - How to run your project",
      "========================================",
      "",
      "This folder is the COMPLETE game, not just the parts you filled in on",
      "the website. Every source file is here and every line of it is yours",
      "to change - open the folder in VS Code and edit whatever you like.",
      "You are not limited to the TODO regions any more.",
      "",
      "1. Install Python 3.9+ if you don't have it: https://www.python.org/downloads/",
      "   (check \"Add python.exe to PATH\" during install)",
      "2. Open a terminal / command prompt in this folder.",
      "3. Install the one dependency:",
      "     pip install -r requirements.txt",
      "4. Run the game:",
      "     python main.py",
      "",
      "Your progress when this was exported: " + summary.summaryText,
      "",
      "Custom images/sounds (TODO 9):",
      "  Bundled assets are already included in assets/images/ and",
      "  assets/sounds/. If you uploaded your OWN images/sounds on the",
      "  website, copy those same files into THIS project's assets/images/",
      "  or assets/sounds/ folder too - they are not automatically included",
      "  in this download, since they live on your computer, not on the site.",
      "",
      "If a file couldn't be exported with your latest code, it was replaced",
      "with the original starter version (with a comment at the top",
      "explaining why) so the game still runs - go back to the website, fix",
      "that TODO, and download again.",
      "",
    ].join("\n");
  }

  function buildProjectZip() {
    return buildExportedFiles().then(function (built) {
      var zip = new ZipWriter();
      Object.keys(built.files).forEach(function (fname) { zip.addFile(fname, built.files[fname]); });
      zip.addFile("HOW_TO_RUN.txt", buildHowToRunText(built.summary));
      var assetPromises = [];
      (KNOWN_ASSETS.images || []).forEach(function (name) {
        assetPromises.push(
          fetch("assets/images/" + name).then(function (r) { return r.arrayBuffer(); })
            .then(function (buf) { zip.addFile("assets/images/" + name, new Uint8Array(buf)); })
            .catch(function () {})
        );
      });
      (KNOWN_ASSETS.sounds || []).forEach(function (name) {
        assetPromises.push(
          fetch("assets/sounds/" + name).then(function (r) { return r.arrayBuffer(); })
            .then(function (buf) { zip.addFile("assets/sounds/" + name, new Uint8Array(buf)); })
            .catch(function () {})
        );
      });
      return Promise.all(assetPromises).then(function () { return { zip: zip, built: built }; });
    });
  }

  function getConnectedDirHandle() {
    return idbGet(IDB_DIR_KEY).then(function (handle) {
      if (!handle) return null;
      return handle.queryPermission({ mode: "readwrite" }).then(function (perm) {
        return perm === "granted" ? handle : null;
      }).catch(function () { return null; });
    }).catch(function () { return null; });
  }

  function writeExportedFilesToFolder(handle, names, files) {
    return Promise.all(names.map(function (name) {
      return handle.getFileHandle(name).then(function (fh) {
        return fh.getFile().then(function (file) { return file.text(); });
      }).then(function (originalText) {
        return handle.getFileHandle(name + ".bak", { create: true }).then(function (bak) {
          return bak.createWritable().then(function (w) { return w.write(originalText).then(function () { return w.close(); }); });
        });
      }).then(function () {
        return handle.getFileHandle(name, { create: true }).then(function (fh2) {
          return fh2.createWritable().then(function (w2) { return w2.write(files[name]).then(function () { return w2.close(); }); });
        });
      }).then(function () { return { name: name, ok: true }; })
        .catch(function (err) { return { name: name, ok: false, error: err && err.message ? err.message : String(err) }; });
    }));
  }

  function renderExportActions(container, built) {
    container.innerHTML = "";
    container.appendChild(el("button", {
      class: "btn btn-primary", type: "button", text: "Download ZIP (whole project)",
      onclick: function () {
        var btn = this;
        btn.disabled = true; btn.textContent = "Building zip…";
        buildProjectZip().then(function (r) {
          r.zip.saveAs("dijkstra_maze_project.zip");
          btn.disabled = false; btn.textContent = "Download ZIP (whole project)";
        }).catch(function (err) {
          btn.disabled = false; btn.textContent = "Download ZIP (whole project)";
          showConfirm("Could not build zip", String(err && err.message ? err.message : err), { confirmLabel: "OK", cancelLabel: "Close" });
        });
      },
    }));

    var pySelect = el("select", { class: "map-size-input", style: "width:auto" },
      EXPORT_TODO_FILES.map(function (n) { return el("option", { value: n, text: n }); })
    );
    var singleRow = el("div", { class: "viz-controlbar" }, [
      pySelect,
      el("button", {
        class: "btn btn-secondary", type: "button", text: "Download this file", onclick: function () {
          var name = pySelect.value;
          var blob = new Blob([built.files[name]], { type: "text/x-python" });
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a"); a.href = url; a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        },
      }),
    ]);
    container.appendChild(el("div", { class: "small muted", text: "Unzip it anywhere, open the folder in VS Code, then: pip install -r requirements.txt and python main.py (HOW_TO_RUN.txt inside repeats this)." }));
    container.appendChild(el("div", { class: "small muted mt-8", text: "Or just one file, if you already have the folder:" }));
    container.appendChild(singleRow);

    getConnectedDirHandle().then(function (handle) {
      if (!handle) {
        container.appendChild(el("p", { class: "small muted mt-8", text: "Connect your project folder from TODO 9 to write your answers directly into your files instead (with automatic .bak backups)." }));
        return;
      }
      var willChange = EXPORT_TODO_FILES.slice();
      var writeBox = el("div", { class: "asset-upload-box mt-8" });
      writeBox.appendChild(el("div", { class: "sidebar-group-title", text: "Write my answers into my connected project folder" }));
      writeBox.appendChild(el("p", { class: "small", text: "This will back up and overwrite: " + willChange.join(", ") + ". Each original is saved as <name>.py.bak first." }));
      var writeBtn = el("button", { class: "btn btn-primary", type: "button", text: "Write into my folder" });
      writeBox.appendChild(writeBtn);
      var resultBox = el("div", { class: "small mt-8" });
      writeBox.appendChild(resultBox);
      writeBtn.addEventListener("click", function () {
        showConfirm(
          "Write into your project folder?",
          "This overwrites " + willChange.join(", ") + " in your connected folder (originals saved as .py.bak first). Continue?",
          { confirmLabel: "Write files", dangerConfirm: true }
        ).then(function (ok) {
          if (!ok) return;
          writeBtn.disabled = true;
          writeExportedFilesToFolder(handle, willChange, built.files).then(function (results) {
            writeBtn.disabled = false;
            resultBox.innerHTML = "";
            results.forEach(function (r) {
              resultBox.appendChild(el("div", { class: r.ok ? "verdict-good-text" : "verdict-bad-text", text: (r.ok ? "✓ " : "✗ ") + r.name + (r.ok ? " written (backup saved as " + r.name + ".bak)" : " failed: " + r.error) }));
            });
          });
        });
      });
      container.appendChild(writeBox);
    });
  }

  function openExportModal() {
    var root = document.getElementById("modalRoot");
    var summary = computeCompletionSummary();
    var box = el("div", { class: "modal-box export-modal" });
    var overlay = el("div", { class: "modal-overlay", role: "dialog", "aria-modal": "true", "aria-label": "Download my project" }, [box]);
    box.appendChild(el("div", { class: "modal-title", text: "Download my project" }));
    // What this actually IS, said first. The modal used to open straight
    // into a progress tally, which reads like a report card rather than
    // "here is your whole game" - and the students most likely to want
    // this are the fast ones looking for room to move.
    box.appendChild(el("div", { class: "modal-message rich-text", html: richTextToHtml(
      "**The complete game, as real Python files** — `main.py`, `game.py`, `maze.py`, "
      + "`pathfinding.py`, `settings.py`, `cell.py`, `goal.py`, `items.py`, `player.py`, "
      + "`requirements.txt`, and every picture and sound.\n\n"
      + "Your answers are already spliced in. Open the folder in **VS Code** and run "
      + "`python main.py`. **Every line is yours to change** — you are not limited to the "
      + "TODO boxes any more."
    ) }));
    box.appendChild(el("div", { class: "small muted", text: summary.summaryText }));
    if (summary.unfinished.length) {
      box.appendChild(el("div", { class: "small muted", text: "Still unfinished (starter code will be kept for these):" }));
      var list = el("ul", { class: "export-unfinished-list" });
      summary.unfinished.forEach(function (u) {
        list.appendChild(el("li", { text: "TODO " + u.id + " (" + u.file + ") — " + u.status }));
      });
      box.appendChild(list);
    }
    var statusLine = el("div", { class: "small mt-8", text: "Loading Python engine and validating your code…" });
    box.appendChild(statusLine);
    var actionsBox = el("div", { class: "export-actions", hidden: "hidden" });
    box.appendChild(actionsBox);
    var closeBtn = el("button", { class: "btn btn-small mt-8", type: "button", text: "Close", onclick: function () { root.innerHTML = ""; } });
    box.appendChild(closeBtn);

    root.innerHTML = "";
    root.appendChild(overlay);
    closeBtn.focus();

    function onKey(e) { if (e.key === "Escape") { root.innerHTML = ""; document.removeEventListener("keydown", onKey); } }
    document.addEventListener("keydown", onKey);

    buildExportedFiles().then(function (built) {
      var brokenFiles = Object.keys(built.validation).filter(function (f) { return !built.validation[f].ok; });
      if (brokenFiles.length) {
        statusLine.className = "small mt-8 verdict-bad-text";
        statusLine.textContent = "⚠ " + brokenFiles.map(function (f) {
          return f + ": " + built.validation[f].brokenBy + " broke it (" + built.validation[f].error + ") — using the starter version for this file instead.";
        }).join(" ");
      } else {
        statusLine.className = "small mt-8 verdict-good-text";
        statusLine.textContent = "✓ All files parsed successfully.";
      }
      actionsBox.hidden = false;
      renderExportActions(actionsBox, built);
    }).catch(function (err) {
      statusLine.className = "small mt-8 verdict-bad-text";
      statusLine.textContent = "Could not validate: " + (err && err.message ? err.message : err);
    });
  }

  // ------------------------------------------------------- 13. bootstrap

  function initTopbar() {
    $("#saveProgressBtn").addEventListener("click", exportProgress);
    var loadBtn = $("#loadProgressBtn");
    var loadInput = $("#loadProgressInput");
    loadBtn.addEventListener("click", function () { loadInput.click(); });
    loadInput.addEventListener("change", function () {
      if (loadInput.files && loadInput.files[0]) importProgressFile(loadInput.files[0]);
      loadInput.value = "";
    });
    $("#resetAllBtn").addEventListener("click", resetAll);
    $("#downloadProjectBtn").addEventListener("click", openExportModal);
    initProgressMenu();
  }

  // Save/Load/Reset are grouped behind a native <details> dropdown (see
  // index.html #progressMenu) - <details> doesn't close itself on an
  // item click, an outside click, or Escape, so add just those three
  // small conveniences. The IDs it wraps (#saveProgressBtn etc.) are
  // wired above exactly as before; this only manages the menu's open/
  // closed state.
  function initProgressMenu() {
    var menu = $("#progressMenu");
    if (!menu) return;
    function closeMenu() { menu.open = false; }
    var items = menu.querySelectorAll(".topbar-menu-panel button");
    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener("click", closeMenu);
    }
    document.addEventListener("click", function (e) {
      if (menu.open && !menu.contains(e.target)) closeMenu();
    });
    menu.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.open) {
        closeMenu();
        var summary = menu.querySelector("summary");
        if (summary) summary.focus();
      }
    });
  }

  function initFileProtocolBanner() {
    if (window.location.protocol === "file:") {
      var b = $("#fileProtocolBanner");
      if (b) b.hidden = false;
    }
  }

  // ------------------------------------------------- 14h. Play popout / kiosk mode
  //
  // The "▶ Play Game" toolbar button opens this SAME page in a small
  // separate window with ?mode=play in the URL. On load, if that flag is
  // present, we skip
  // the sidebar/editor/viz-tabs entirely and render ONLY the Play tab's
  // content, filling the window - reusing PlayEngine's existing mount/
  // refresh/unmount lifecycle completely unchanged (see #5 in the request:
  // this must not be a second implementation of Play, just a second place
  // to show the same one). State comes from the SAME localStorage under the
  // same origin, so it reflects the student's real progress automatically -
  // no special data-passing needed, verified below.

  function isKioskMode() {
    try {
      return new URLSearchParams(window.location.search).get("mode") === "play";
    } catch (e) {
      return false;
    }
  }

  // ---- showcase demo (?mode=play&showcase=1) ---------------------------
  //
  // A finished, playable version of the game for showing a class what they
  // are about to build: real sprites, real pickup sounds, three different
  // custom items, and two rounds. It runs the SAME PlayEngine students use,
  // just seeded with a completed set of settings instead of localStorage -
  // so it can never be out of step with the real thing, and it never
  // touches (or is touched by) anybody's saved progress.
  function isShowcaseMode() {
    try {
      return new URLSearchParams(window.location.search).get("showcase") === "1";
    } catch (e) {
      return false;
    }
  }

  var SHOWCASE_CODE = {
    "1": [
      'TITLE = "Crystal Vault"',
      'GAME_SUBTITLE = "Grab the crystals and reach the vault before the clock runs out"',
    ].join("\n"),
    // One entry per Bonus SUB-STEP now. A sub-step with no entry here
    // simply keeps its starter code, which is already working behaviour
    // for every game.py sub-step - that is why 8-4 … 8-6, 9-8 and
    // 10-2 … 10-6 are absent rather than listed as empty strings.
    "8-1": [
      "ROUND_CONFIGS = [",
      '    {"rows": 9, "cols": 13, "cell_size": 38, "extra_open_walls": 6,',
      '     "bomb_count": 3, "custom_item_count": 3, "time_limit_seconds": 75},',
      '    {"rows": 13, "cols": 19, "cell_size": 30, "extra_open_walls": 8,',
      '     "bomb_count": 6, "custom_item_count": 4, "time_limit_seconds": 60},',
      "]",
    ].join("\n"),
    "8-2": "PLAYER_MOVE_DELAY_MS = 90",
    "8-3": ["ALLOW_PATH_HINT = True", "MAX_HINT_COUNT = 2"].join("\n"),
    "8-7": ["SHOW_DFS_GENERATION = True", "DFS_STEPS_PER_FRAME = 4"].join("\n"),
    "8-8": ["STUDENT_NORMAL_WEIGHT = 0", "STUDENT_BOMB_WEIGHT = 1000"].join("\n"),
    "9-1": [
      'PLAYER_IMAGE_PATH = "assets/images/player_ninja.png"',
      'GOAL_IMAGE_PATH = "assets/images/goal_chest.png"',
    ].join("\n"),
    "9-2": [
      'BOMB_IMAGE_PATH = "assets/images/bomb_2.png"',
      'FLOOR_TILE_IMAGE_PATH = "assets/images/floor_tile_1.png"',
    ].join("\n"),
    "9-3": [
      "PLAYER_IMAGE_SCALE = 1.1",
      "GOAL_IMAGE_SCALE = 1.0",
      "BOMB_IMAGE_SCALE = 0.9",
    ].join("\n"),
    "9-4": [
      "WALL_COLOR = (30, 41, 59)",
      "PLAYER_COLOR = (37, 99, 235)",
      "GOAL_COLOR = (250, 204, 21)",
    ].join("\n"),
    "9-5": [
      "BOMB_COLOR = (15, 23, 42)",
      "BOMB_EXPLOSION_COLOR = (239, 68, 68)",
    ].join("\n"),
    "9-6": [
      'BOMB_SOUND_PATH = "assets/sounds/explosion_1.wav"',
      'BACKGROUND_MUSIC_PATH = "assets/sounds/bgm_1.wav"',
    ].join("\n"),
    "9-7": [
      "BOMB_EXPLOSION_DURATION_MS = 500",
      "BACKGROUND_MUSIC_VOLUME = 0.25",
    ].join("\n"),
    "9-9": 'BOMB_EXPLOSION_IMAGE_PATH = "assets/images/explode.png"',
    "9-10": [
      "VISITED_COLOR = (30, 64, 90)",
      "CURRENT_CELL_COLOR = (251, 191, 36)",
      "PATH_COLOR = (34, 255, 136)",
    ].join("\n"),
    "9-11": [
      "BACKGROUND_COLOR = (12, 18, 32)",
      "PANEL_COLOR = (24, 34, 56)",
      "PANEL_BORDER = (60, 78, 112)",
    ].join("\n"),
    "9-12": [
      "ACCENT = (56, 189, 248)",
      "SUCCESS = (34, 197, 94)",
      "WARNING = (250, 204, 21)",
      "DANGER = (248, 113, 113)",
    ].join("\n"),
    "10-1": [
      [
        "CUSTOM_ITEMS = [",
        "    {",
        '        "name": "Time Crystal",',
        '        "color": (14, 165, 233),',
        '        "image": "assets/images/item_gem_1.png",',
        '        "sound": "assets/sounds/pickup_1.wav",',
        '        "size": 1.2,',
        '        "effect": "add_time",',
        '        "amount": 12,',
        "    },",
        "    {",
        '        "name": "Hint Scroll",',
        '        "color": (250, 204, 21),',
        '        "image": "assets/images/item_star.png",',
        '        "sound": "assets/sounds/pickup_3.wav",',
        '        "size": 0.9,',
        '        "effect": "add_hint",',
        '        "amount": 1,',
        "    },",
        "    {",
        '        "name": "Lucky Coin",',
        '        "color": (245, 158, 11),',
        '        "image": "assets/images/item_coin.png",',
        '        "sound": "assets/sounds/pickup_2.wav",',
        '        "size": 0.7,',
        '        "effect": "add_time",',
        '        "amount": 4,',
        "    },",
        "]",
      ].join("\n"),
    ].join("\n"),
    "11-1": [
      "MISSION_RULES = [",
      '    "Reach the vault before time runs out.",',
      '    "Grab crystals along the way for extra seconds.",',
      "]",
    ].join("\n"),
    "11-2": [
      "HOW_TO_PLAY_RULES = [",
      '    "Move with the Arrow Keys (or E/F/C/D on a controller).",',
      '    "One key press moves you one cell.",',
      '    "Bombs send you back to the start - avoid them.",',
      '    "Time Crystals add time; Hint Scrolls add a hint use.",',
      "]",
    ].join("\n"),
  };

  function showcaseState() {
    var s = freshState();
    STEPS.forEach(function (step) {
      var d = s.steps[step.id];
      var preset = SHOWCASE_CODE[step.id] || REFERENCE_CODE[step.id];
      if (preset !== undefined) {
        // A preset only supplies the parts it cares about; anything left
        // blank keeps that part's starter code (true for the game.py code
        // parts, whose defaults are already the working behaviour).
        if (step.parts && Array.isArray(preset)) {
          d.code = step.parts.map(function (part, i) {
            return preset[i] ? preset[i] : linesOf(part.starter);
          });
        } else if (!step.parts && typeof preset === "string") {
          d.code = preset;
        }
      }
      d.status = "completed";
    });
    return s;
  }

  function showPopupBlockedNotice(anchorEl) {
    var existing = document.getElementById("popupBlockedNotice");
    if (existing) existing.remove();
    var notice = el("div", { id: "popupBlockedNotice", class: "popup-blocked-notice", role: "alert" }, [
      el("span", {}, ["Your browser blocked the popup — allow popups for this site, or right-click the button to open in a new tab."]),
      el("button", { type: "button", "aria-label": "Dismiss", onclick: function () { notice.remove(); } }, ["×"]),
    ]);
    var host = (anchorEl && anchorEl.parentElement) || $("#playPopoutBtn").parentElement;
    host.appendChild(notice);
    setTimeout(function () { if (notice.parentElement) notice.remove(); }, 8000);
  }

  function initPlayPopoutButton() {
    var btn = $("#playPopoutBtn");
    if (!btn) return;
    // `btn` is a real <a href="?mode=play" target="_blank"> on purpose:
    // right-click -> "Open link in new tab" works via native browser
    // behaviour with zero JS involved, even if the popup below is blocked.
    // The click handler just upgrades a plain left-click into a nicely-
    // sized fixed window instead of a full tab.
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var url = window.location.origin + window.location.pathname + "?mode=play";
      var win = null;
      try {
        win = window.open(url, "dijkstraMazePlayPopout", "noopener,width=900,height=720,menubar=no,toolbar=no,location=no,status=no");
      } catch (err) { win = null; }
      if (!win) showPopupBlockedNotice(btn);
    });
  }

  // Refreshes the kiosk header's title/subtitle from the student's OWN TODO
  // 1 code - reusing the exact same traceHarness_titleCard harness (and the
  // exact same isDoneExact-style completion gate) PlayEngine's own title
  // card already uses, so this is never a second, divergent title concept.
  // Falls back to a neutral placeholder (never the site's own branding)
  // until TODO 1 is genuinely completed.
  function refreshKioskTitle() {
    var titleEl = $("#kioskTitle"), subtitleEl = $("#kioskSubtitle");
    if (!titleEl) return;
    var todo1Done = !!(state.steps["1"] && state.steps["1"].status === "completed");
    if (!todo1Done) {
      document.title = "Your Game";
      titleEl.textContent = "Your Game";
      subtitleEl.hidden = true;
      subtitleEl.textContent = "";
      return;
    }
    ensurePyodide().then(function (py) {
      return py.runPythonAsync(traceHarness_titleCard(state.steps["1"].code));
    }).then(function (json) {
      var data = JSON.parse(json);
      var title = data.ok && data.title ? data.title : "Your Game";
      var subtitle = data.ok ? data.subtitle : "";
      document.title = title;
      titleEl.textContent = title;
      if (subtitle) { subtitleEl.hidden = false; subtitleEl.textContent = subtitle; }
      else { subtitleEl.hidden = true; subtitleEl.textContent = ""; }
    }).catch(function () {
      document.title = "Your Game";
      titleEl.textContent = "Your Game";
      subtitleEl.hidden = true;
    });
  }

  // E2: title/rules gate shown BEFORE gameplay starts in the kiosk popout.
  // Reuses traceHarness_titleCard exactly as the in-page TitleCardViz does
  // (see 14b) - once with TODO 1's own code (for TITLE/GAME_SUBTITLE; its
  // mission/howto fields come back empty since TODO 1 doesn't define those,
  // which is fine, they're ignored here) and once with TODO 11's own code
  // (for MISSION_RULES/HOW_TO_PLAY_RULES; its title/subtitle fields come
  // back as fallback placeholders, likewise ignored) - the gate needs both
  // halves showing at once, regardless of which step a student happens to
  // be editing in the main tab right now.
  function refreshKioskGate() {
    var refs = kioskGateRefs;
    if (!refs) return;
    var todo1Done = !!(state.steps["1"] && state.steps["1"].status === "completed");
    ensurePyodide().then(function (py) {
      return py.runPythonAsync(traceHarness_titleCard(state.steps["1"].code));
    }).then(function (json) {
      var data = JSON.parse(json);
      refs.title.textContent = todo1Done && data.ok && data.title ? data.title : "Your Game";
      var subtitle = todo1Done && data.ok ? data.subtitle : "";
      if (subtitle) { refs.subtitle.hidden = false; refs.subtitle.textContent = subtitle; }
      else { refs.subtitle.hidden = true; refs.subtitle.textContent = ""; }
    }).catch(function () {
      refs.title.textContent = "Your Game";
      refs.subtitle.hidden = true;
    });

    // The rules TEXT lives in TODO 11-1 (the mission) and 11-2 (how to
    // play) - the two settings.py halves of the TODO 11 group, which is
    // still not a locked "capstone". This is the ONE narrow, explicitly
    // authorized exception to "never show TODO-numbered language in kiosk
    // mode" (see teachingNote() in PlayEngine) - everywhere else in this
    // window stays silent about unfinished work; this single placeholder
    // is allowed because there is no non-TODO-referencing way to explain
    // why the rules section is empty.
    var RULES_STEP_IDS = ["11-1", "11-2"];
    var rulesDone = RULES_STEP_IDS.every(function (rid) {
      return !!(state.steps[rid] && state.steps[rid].status === "completed");
    });
    if (!rulesDone) {
      refs.missionHead.hidden = true; refs.missionList.innerHTML = "";
      refs.howtoHead.hidden = true; refs.howtoList.innerHTML = "";
      refs.placeholder.hidden = false;
      refs.placeholder.textContent = "Finish TODO " + RULES_STEP_IDS.join(" and ") + " to see your own game's rules here!";
      return;
    }
    refs.placeholder.hidden = true;
    ensurePyodide().then(function (py) {
      return py.runPythonAsync(traceHarness_titleCard(RULES_STEP_IDS.map(bonusCode).join("\n")));
    }).then(function (json) {
      var data = JSON.parse(json);
      var mission = data.ok ? data.mission : [];
      var howto = data.ok ? data.howto : [];
      refs.missionHead.hidden = mission.length === 0;
      refs.missionList.innerHTML = "";
      mission.forEach(function (line) { refs.missionList.appendChild(el("li", { text: line })); });
      refs.howtoHead.hidden = howto.length === 0;
      refs.howtoList.innerHTML = "";
      howto.forEach(function (line) { refs.howtoList.appendChild(el("li", { text: line })); });
    }).catch(function () {});
  }

  var kioskGateRefs = null;

  function buildKioskGate(onStart) {
    var container = $("#kioskGate");
    if (!container) return;
    container.innerHTML = "";
    var box = el("div", { class: "titlecard-frame" });
    var titleEl = el("div", { class: "titlecard-title", text: "Your Game" });
    var subtitleEl = el("div", { class: "titlecard-subtitle", hidden: "hidden" });
    var missionHead = el("div", { class: "titlecard-section-head", text: "Mission" });
    var missionList = el("ul", { class: "titlecard-list" });
    var howtoHead = el("div", { class: "titlecard-section-head", text: "How to play" });
    var howtoList = el("ul", { class: "titlecard-list" });
    var placeholder = el("p", { class: "small", style: "color:#d8cba4;" });
    var startBtn = el("button", { class: "btn btn-primary kiosk-start-btn", type: "button" }, ["▶ Start Playing"]);
    box.appendChild(titleEl); box.appendChild(subtitleEl);
    box.appendChild(missionHead); box.appendChild(missionList);
    box.appendChild(howtoHead); box.appendChild(howtoList);
    box.appendChild(placeholder);
    box.appendChild(startBtn);
    container.appendChild(box);
    startBtn.addEventListener("click", onStart);
    kioskGateRefs = {
      title: titleEl, subtitle: subtitleEl,
      missionHead: missionHead, missionList: missionList,
      howtoHead: howtoHead, howtoList: howtoList,
      placeholder: placeholder,
    };
  }

  // NOTE (this session): the kiosk popout no longer has a "homework
  // checklist steps back once complete" state - the Capabilities checklist,
  // its heading, and the "YOUR GAME IS LIVE" banner are hidden
  // UNCONDITIONALLY in kiosk mode now (see styles.css), regardless of
  // completion, so this window never shows a teaching/debug artifact to
  // another student. refreshKioskChrome() is left as a thin wrapper (rather
  // than inlining refreshKioskTitle() at both call sites) so a future
  // per-refresh kiosk-only concern has one obvious place to go.
  function refreshKioskChrome() {
    refreshKioskTitle();
    refreshKioskGate();
  }

  // Generic Fullscreen API toggle, shared by the kiosk popout's board
  // fullscreen button (#kioskFullscreenBtn / #kioskRoot) and the normal
  // editor's Step View panel fullscreen button (#stepViewFullscreenBtn /
  // #vizPanel, see C1). `btn` must already contain the "enter fullscreen"
  // icon markup (read once as ENTER_ICON) before this runs; each button
  // tracks fullscreen state for its OWN root independently, so having the
  // Step View panel fullscreen doesn't affect the kiosk button's icon
  // and vice versa - both listen to the same document-level
  // fullscreenchange event but each only reacts to whether ITS root is
  // the current fullscreen element.
  function initFullscreenToggle(btnSelector, rootSelector) {
    var btn = $(btnSelector);
    var root = $(rootSelector);
    if (!btn || !root) return;
    var ENTER_ICON = btn.innerHTML;
    var EXIT_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v4a1 1 0 0 1-1 1H4M15 3v4a1 1 0 0 0 1 1h4M9 21v-4a1 1 0 0 0-1-1H4M15 21v-4a1 1 0 0 1 1-1h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    function currentFsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
    function isThisFs() { return currentFsElement() === root; }
    function updateIcon() {
      var fs = isThisFs();
      btn.innerHTML = fs ? EXIT_ICON : ENTER_ICON;
      var label = fs ? "Exit fullscreen" : "Enter fullscreen";
      btn.title = label;
      btn.setAttribute("aria-label", label);
    }
    btn.addEventListener("click", function () {
      if (!isThisFs()) {
        var req = root.requestFullscreen || root.webkitRequestFullscreen;
        if (req) req.call(root).catch(function () {});
      } else {
        var exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document).catch(function () {});
      }
    });
    document.addEventListener("fullscreenchange", updateIcon);
    document.addEventListener("webkitfullscreenchange", updateIcon);
  }

  function initKioskMode() {
    document.body.classList.add("kiosk-mode");
    var root = $("#kioskRoot");
    root.hidden = false;
    var playView = $("#kioskPlayView");
    var gate = $("#kioskGate");
    // E2: the gate (title/rules) shows first; PlayEngine isn't even mounted
    // until "Start Playing" is pressed - the round timer/maze generation
    // shouldn't start ticking while a student is still reading the rules.
    buildKioskGate(function () {
      gate.hidden = true;
      playView.hidden = false;
      PlayEngine.mount(playView);
      // No code editor exists in this window to compete for focus, so
      // (unlike the normal Play tab) there's no reason to require an extra
      // click before arrow keys work - focus the board immediately.
      var canvas = playView.querySelector(".viz-canvas");
      if (canvas) canvas.focus();
    });
    refreshKioskChrome();
    initFullscreenToggle("#kioskFullscreenBtn", "#kioskRoot");
    // Nice-to-have live sync: if the student keeps this window open and
    // then finishes a TODO / repaints a map / changes custom settings in
    // the main tab, `storage` fires here (it does NOT fire in the tab that
    // made the change, only in other same-origin tabs/windows - exactly
    // what we want). Reload state fresh from localStorage and refresh the
    // board/HUD (PlayEngine.refresh()) and this window's own title (the
    // checklist/banner are unconditionally hidden now, nothing to chrome).
    window.addEventListener("storage", function (e) {
      // The showcase window is deliberately frozen on its seeded state.
      if (isShowcaseMode()) return;
      if (e.key && e.key !== LS_PROGRESS_KEY) return;
      state = loadState();
      if (computeStatus(state.currentStepId) === "locked") state.currentStepId = STEPS[0].id;
      PlayEngine.refresh();
      refreshKioskChrome();
    });
  }

  // Narrow, read-only test seam. tests/test_app_load.js drives the REAL
  // lock rules through this instead of re-implementing them, which is the
  // only way a test can catch "sequential within a Bonus group, free
  // between groups" actually regressing. Nothing in the UI reads it, and
  // it exposes no capability a student could not already reach from the
  // dev-tools console on this plain client-side page.
  window.__courseTestHooks = {
    setState: function (s) { state = s; },
    freshState: freshState,
    computeStatus: computeStatus,
    nextStepAfter: nextStepAfter,
    bonusGroupComplete: bonusGroupComplete,
    // tests/test_project_export.js splices a full answer set through this
    // and then RUNS the result with a real Python, which is the only way
    // to prove the downloaded project is still runnable after a marker
    // renumbering.
    buildFullFileLive: buildFullFileLive,
    exportFileNames: function () { return Object.keys(EXPORT_DATA.EXPORT_FILES); },
    // Required 1-5 now START at the reference answer rather than a blank.
    // That makes "does a save still win over the default?" a question with
    // real consequences: if the default ever beat the save, a student who
    // wrote their own different-but-correct answer would come back to find
    // it replaced by ours. tests/test_app_load.js drives the actual load
    // path through this rather than trusting the code to be obviously right.
    normalizeLoadedState: normalizeLoadedState,
    migrateSavedCode: migrateSavedCode,
  };

  document.addEventListener("DOMContentLoaded", function () {
    if (isShowcaseMode()) {
      // Seeded in memory only: saveState() is disabled for this window, so
      // opening the demo can never overwrite a student's real progress.
      state = showcaseState();
      initKioskMode();
      return;
    }
    state = loadState();
    if (computeStatus(state.currentStepId) === "locked") state.currentStepId = STEPS[0].id;
    if (isKioskMode()) {
      initKioskMode();
      return;
    }
    initTopbar();
    initVizTabs();
    initFileProtocolBanner();
    initPlayPopoutButton();
    initFullscreenToggle("#stepViewFullscreenBtn", "#vizPanel");
    renderAll();
  });
})();
