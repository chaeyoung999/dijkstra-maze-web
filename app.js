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
  var CAPSTONE_BONUS_ID = DATA.CAPSTONE_BONUS_ID;
  var KNOWN_ASSETS = DATA.KNOWN_ASSET_FILES;
  var STEP_BY_ID = {};
  STEPS.forEach(function (s) { STEP_BY_ID[s.id] = s; });

  var LS_PROGRESS_KEY = "dijkstraMaze.progress.v1";
  var LS_THEME_KEY = "dijkstraMaze.theme";
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
  // spliced into a test scaffold regardless of the absolute indentation
  // they typed. Blank lines are preserved (as indent-only) so line counts
  // stay stable for the on-screen gutter.
  function reindentPython(code, indent) {
    var raw = String(code == null ? "" : code).replace(/\r\n/g, "\n").replace(/\t/g, "    ");
    var lines = raw.split("\n");
    var minIndent = Infinity;
    lines.forEach(function (line) {
      if (line.trim().length === 0) return;
      var m = line.match(/^ */)[0].length;
      if (m < minIndent) minIndent = m;
    });
    if (!isFinite(minIndent)) minIndent = 0;
    lines = lines.map(function (line) {
      if (line.trim().length === 0) return "";
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

  // mapEditorData: { activeRound, rounds: [paintedRound|null x3] }. A painted
  // round replaces DFS generation for that round once TODO 7 is completed.
  // assetData: { uploadedFiles: [{name, kind, addedAt}] } - metadata only;
  // the actual uploaded bytes live on the student's disk, never in progress.
  function defaultMapEditorData() {
    return { activeRound: 0, rounds: [null, null, null] };
  }
  function defaultAssetData() {
    return { uploadedFiles: [] };
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
        // A step whose parts-ness changed since this save was made (e.g.
        // TODO 5 was split into two parts) leaves saved.code in the WRONG
        // shape for what this step now expects - a plain string where a
        // 2-element array is now needed, or vice versa. Restoring it
        // anyway would either silently misbehave (indexing a string with
        // [0] returns a character, not a part) or show "completed" next
        // to starter code. Leave this ONE step at its fresh default
        // instead - a clean redo of just that step, not a confusing
        // half-migrated one.
        var expectsArrayCode = !!step.parts;
        var savedCodeIsArray = Array.isArray(saved.code);
        if (saved.code !== undefined && expectsArrayCode !== savedCodeIsArray) return;
        if (saved.code !== undefined) d.code = saved.code;
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
        var rounds = parsed.mapEditorData.rounds.slice(0, 3).map(function (r) { return r || null; });
        while (rounds.length < 3) rounds.push(null);
        s.mapEditorData = {
          activeRound: (typeof parsed.mapEditorData.activeRound === "number" && parsed.mapEditorData.activeRound >= 0 && parsed.mapEditorData.activeRound < 3) ? parsed.mapEditorData.activeRound : 0,
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

  // Capstone one-off exception (TODO 15, "write your game's rules"): rules
  // only make sense once the student's actually built their custom game, so
  // this single Bonus step stays locked until every OTHER Bonus step is
  // completed or skipped - independent of the normal "all Bonus unlocks
  // together" rule the rest of Bonus follows.
  function otherBonusAllDone() {
    return BONUS_ORDER.every(function (bid) { return bid === CAPSTONE_BONUS_ID || isRequiredDone(bid); });
  }

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
    if (id === CAPSTONE_BONUS_ID) {
      return otherBonusAllDone() ? "available" : "locked";
    }
    return allRequiredDone() ? "available" : "locked";
  }

  function nextStepAfter(id) {
    var ridx = REQUIRED_ORDER.indexOf(id);
    if (ridx !== -1) {
      if (ridx + 1 < REQUIRED_ORDER.length) return REQUIRED_ORDER[ridx + 1];
      return allRequiredDone() ? BONUS_ORDER[0] : null;
    }
    var bidx = BONUS_ORDER.indexOf(id);
    if (bidx === -1) return null;
    for (var i = 1; i <= BONUS_ORDER.length; i++) {
      var cand = BONUS_ORDER[(bidx + i) % BONUS_ORDER.length];
      if (isRequiredDone(cand)) continue;
      if (cand === CAPSTONE_BONUS_ID && !otherBonusAllDone()) continue; // still locked, don't auto-jump there
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
  // order, then Bonus in order (the exact same order the sidebar renders in,
  // capstone included at the end) - independent of whether steps are
  // currently unlocked, since the button itself shows a locked/disabled
  // state rather than skipping over locked steps.
  function nextTodoIdInFullOrder(id) {
    var order = REQUIRED_ORDER.concat(BONUS_ORDER);
    var idx = order.indexOf(id);
    if (idx === -1 || idx + 1 >= order.length) return null;
    return order[idx + 1];
  }

  // ----------------------------------------------------------- 3. theme

  function getStoredTheme() {
    try { return localStorage.getItem(LS_THEME_KEY); } catch (e) { return null; }
  }
  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }
  function initTheme() {
    var stored = getStoredTheme();
    applyTheme(stored || null);
  }
  function toggleTheme() {
    var current = document.documentElement.getAttribute("data-theme");
    if (!current) {
      current = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    }
    var next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(LS_THEME_KEY, next); } catch (e) {}
  }

  // ----------------------------------------------------------- 4. modal

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
  // titleCard, playerMove, bfsFlood, scoreBoard, dijkstraFrontier,
  // mapEditor, assetPicker). Steps whose visualizer has no registered
  // implementation yet fall back to a placeholder panel.
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

  function renderSidebarGroup(title, note, ids) {
    var frag = document.createDocumentFragment();
    frag.appendChild(el("div", { class: "sidebar-group-title", text: title }));
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
        el("span", { class: "sidebar-badge", "aria-hidden": "true", html: badgeSvg(displayStatus, step.step) }),
        el("span", { class: "sidebar-label" }, [
          el("span", { class: "sidebar-label-title", text: "TODO " + id + ". " + step.title }),
          el("span", { class: "sidebar-label-file", text: step.file }),
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
    nav.appendChild(renderSidebarGroup(
      "Bonus — any order",
      (allRequiredDone() ? "Unlocked! Do these in whatever order you like." : "Unlocks once every Required step is completed or skipped.")
        + " The last one (write your rules) stays locked until every other Bonus step is done.",
      BONUS_ORDER
    ));
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
    if (nextId === CAPSTONE_BONUS_ID) {
      return "Finish every other Bonus challenge first, then come back and write the rules for the game you actually built.";
    }
    if (REQUIRED_ORDER.indexOf(nextId) !== -1) {
      return "Complete or skip this step to continue.";
    }
    return "Finish every Required step (complete or skip) first - Bonus unlocks all at once after that.";
  }

  function renderNextTodoControl(currentId) {
    var nextId = nextTodoIdInFullOrder(currentId);
    var wrap = el("div", { class: "next-todo-wrap" });
    if (!nextId) {
      wrap.appendChild(el("div", { class: "next-todo-done" }, [
        svgIcon('<path d="M4 12.5 9.5 18 20 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
        el("span", {}, ["You've reached the last step. Nice work getting all the way through."]),
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

    card.appendChild(el("div", { class: "step-kicker" }, [
      el("span", { class: "pill " + (step.required ? "pill-required" : "pill-bonus"), text: step.required ? "Required" : "Bonus" }),
      "Step " + step.step + " of " + STEPS.length,
    ]));
    card.appendChild(el("div", { class: "step-title", text: "TODO " + step.id + " — " + step.title }));
    card.appendChild(el("div", { class: "step-file-tag", text: "File: " + step.file }));
    card.appendChild(el("div", { class: "step-lead rich-text", html: richTextToHtml(step.lead) }));

    // Generic "Required steps go in order" / "Bonus unlocks together" flow
    // banners were removed here (steps 1-14) - they duplicated the
    // sidebar's own permanent group headers/notes (see renderSidebarGroup),
    // which are visible at all times regardless of which step is open.
    // TODO 15's capstone banners are NOT duplicated anywhere else, so they
    // stay exactly as they were.
    if (step.id === CAPSTONE_BONUS_ID) {
      if (status === "locked") {
        card.appendChild(el("div", { class: "flow-banner capstone-locked" }, [
          svgIcon('<rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/>'),
          el("span", {}, ["Finish every other Bonus challenge first, then come back and write the rules for the game you actually built."]),
        ]));
      } else {
        card.appendChild(el("div", { class: "flow-banner bonus" }, [
          svgIcon('<path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
          el("span", {}, ["Capstone Bonus step — every other Bonus challenge is done, so it's time to write the rules for the game you actually built."]),
        ]));
      }
    }

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
      // TODO 5's two parts are coupled (Part 2 literally uses new_cost,
      // which Part 1 defines) - unlike TODO 9's independent image/sound
      // parts. Part 2's "before" context shows the STUDENT'S OWN live
      // Part 1 code (kept in sync as they type), not the reference form -
      // showing the reference answer here would leak Part 1's graded
      // answer outright, and it wouldn't even match what the student
      // just wrote if their own style/spacing differs.
      var partShells = [];
      step.parts.forEach(function (part, i) {
        card.appendChild(el("div", { class: "editor-file-label" }, [step.file, el("span", { class: "editor-part-label", text: "Part " + part.part }), el("span", {}, [part.title || ""])]));
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

    card.appendChild(el("div", { class: "step-actions" }, [
      gradeBtn, hintBtn, skipBtn,
      el("span", { class: "spacer" }),
      el("span", { class: "attempt-count", text: stepData.attempts + " attempt" + (stepData.attempts === 1 ? "" : "s") }),
      resetBtn,
    ]));

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
      var code = step.grading.twoParts ? stepData.code.join("\n\n") : stepData.code;
      return pyodide.runPythonAsync(builder(code)).then(parseHarnessResult);
    }
    var b = BEHAVIOUR_HARNESSES[step.grading.harness];
    if (!b) return Promise.resolve(noHarnessFeedback());
    // twoParts behaviour steps (TODO 5) pass each part as its OWN argument,
    // not joined into one string like syntax mode does - the harness needs
    // to splice/grade each part separately so a mistake in one part can be
    // attributed specifically to that part (see harness_dijkstra_5).
    var src = step.grading.twoParts ? b(stepData.code[0], stepData.code[1]) : b(stepData.code);
    return pyodide.runPythonAsync(src).then(parseHarnessResult);
  }

  function noHarnessFeedback() {
    return { ok: false, passed: [], failed: ["No grading harness is registered for this step yet."], warnings: [], error: null, traceback: null };
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

  function harness_movement_2(code) {
    var fnSrc = buildFnSource("self, pygame, keys, moved", code, "    ");
    return [
      PY_PRELUDE,
      b64Line("FN_SRC", fnSrc),
      "def _run():",
      "    result = {'ok': False, 'passed': [], 'failed': [], 'error': None, 'traceback': None}",
      "    class FakePlayer:",
      "        def __init__(self):",
      "            self.calls = []",
      "            self.return_value = True",
      "        def try_move(self, direction, maze):",
      "            self.calls.append(direction)",
      "            return self.return_value",
      "    class Pygame:",
      "        K_LEFT = 1; K_a = 2; K_RIGHT = 3; K_d = 4; K_UP = 5; K_w = 6; K_DOWN = 7; K_s = 8",
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
      "    def run_case(pressed, return_value=True):",
      "        pygame = Pygame()",
      "        player = FakePlayer()",
      "        player.return_value = return_value",
      "        self = SelfObj()",
      "        self.player = player",
      "        self.maze = object()",
      "        key_names = ['K_LEFT', 'K_a', 'K_RIGHT', 'K_d', 'K_UP', 'K_w', 'K_DOWN', 'K_s']",
      "        keys = {}",
      "        for name in key_names:",
      "            keys[getattr(pygame, name)] = name in pressed",
      "        out = _fn(self, pygame, keys, False)",
      "        if not isinstance(out, dict):",
      "            return 'RETURNED_EARLY', player.calls",
      "        return out.get('moved', False), player.calls",
      "    try:",
      "        cases = [",
      "            ('no keys pressed', [], True, False, []),",
      "            ('LEFT calls try_move(\"left\", ...)', ['K_LEFT'], True, True, ['left']),",
      "            ('A (alt left) calls try_move(\"left\", ...)', ['K_a'], True, True, ['left']),",
      "            ('RIGHT calls try_move(\"right\", ...)', ['K_RIGHT'], True, True, ['right']),",
      "            ('D (alt right) calls try_move(\"right\", ...)', ['K_d'], True, True, ['right']),",
      "            ('UP calls try_move(\"top\", ...)', ['K_UP'], True, True, ['top']),",
      "            ('W (alt up) calls try_move(\"top\", ...)', ['K_w'], True, True, ['top']),",
      "            ('DOWN calls try_move(\"bottom\", ...)', ['K_DOWN'], True, True, ['bottom']),",
      "            ('S (alt down) calls try_move(\"bottom\", ...)', ['K_s'], True, True, ['bottom']),",
      "            ('moved reflects a blocked try_move', ['K_LEFT'], False, False, ['left']),",
      "        ]",
      "        for label, pressed, retval, expect_moved, expect_calls in cases:",
      "            moved, calls = run_case(pressed, retval)",
      "            if moved == 'RETURNED_EARLY':",
      "                result['failed'].append('%s: your code used return and exited update_player early. Remove any stray return statement.' % label)",
      "            elif calls != expect_calls:",
      "                result['failed'].append('%s: expected try_move to be called with %s, got %s. Check the direction string and which key branch you wrote it in.' % (label, expect_calls, calls))",
      "            elif moved != expect_moved:",
      "                result['failed'].append('%s: moved should be %r (the return value of try_move), got %r. Assign moved = self.player.try_move(...), not a hardcoded value.' % (label, expect_moved, moved))",
      "            else:",
      "                result['passed'].append(label)",
      "        moved, calls = run_case(['K_LEFT', 'K_RIGHT'])",
      "        if len(calls) != 1:",
      "            result['failed'].append('Pressing LEFT and RIGHT together should still call try_move exactly once (use if/elif, not separate if statements); it was called %d time(s).' % len(calls))",
      "        else:",
      "            result['passed'].append('Only one branch runs when multiple keys are pressed together.')",
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
      b64Line("FN_SRC", fnSrc),
      "def _run():",
      "    result = {'ok': False, 'passed': [], 'failed': [], 'error': None, 'traceback': None}",
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
      "    _fn = ns['_fn']",
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
      "    except Exception as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  function harness_positionDelta_4(code) {
    var fnSrc = buildFnSource("self, dr, dc", code, "    ");
    return [
      PY_PRELUDE,
      b64Line("FN_SRC", fnSrc),
      "def _run():",
      "    result = {'ok': False, 'passed': [], 'failed': [], 'error': None, 'traceback': None}",
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
      "    _fn = ns['_fn']",
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
      "    except Exception as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  function harness_score_6(code) {
    var fnSrc = buildFnSource("self, ITEM_SCORE", code, "    ");
    return [
      PY_PRELUDE,
      b64Line("FN_SRC", fnSrc),
      "def _run():",
      "    result = {'ok': False, 'passed': [], 'failed': [], 'error': None, 'traceback': None}",
      "    ns = {}",
      "    try:",
      "        exec(compile(FN_SRC, '<student>', 'exec'), {}, ns)",
      "    except SyntaxError as e:",
      "        line = max(1, (e.lineno or 1) - 1)",
      "        result['error'] = 'Python syntax error on line %s: %s.' % (line, e.msg)",
      "        return json.dumps(result)",
      "    _fn = ns['_fn']",
      "    ITEM_SCORE = 100",
      "    class SelfObj:",
      "        def __init__(self, score):",
      "            self.score = score",
      "    try:",
      "        for n in (0, 1, 3, 7):",
      "            self = SelfObj(0)",
      "            for i in range(n):",
      "                _fn(self, ITEM_SCORE)",
      "            expected = n * ITEM_SCORE",
      "            if self.score == expected:",
      "                result['passed'].append('after collecting %d treasure(s), score=%d' % (n, expected))",
      "            else:",
      "                result['failed'].append('after collecting %d treasure(s), expected score=%d, got %d.' % (n, expected, self.score))",
      "    except Exception as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  function harness_score_7(code) {
    var fnSrc = buildFnSource("self, SWAMP_SCORE_PENALTY", code, "    ");
    return [
      PY_PRELUDE,
      b64Line("FN_SRC", fnSrc),
      "def _run():",
      "    result = {'ok': False, 'passed': [], 'failed': [], 'error': None, 'traceback': None}",
      "    ns = {}",
      "    try:",
      "        exec(compile(FN_SRC, '<student>', 'exec'), {}, ns)",
      "    except SyntaxError as e:",
      "        line = max(1, (e.lineno or 1) - 1)",
      "        result['error'] = 'Python syntax error on line %s: %s.' % (line, e.msg)",
      "        return json.dumps(result)",
      "    _fn = ns['_fn']",
      "    PENALTY = 100",
      "    START = 500",
      "    class SelfObj:",
      "        def __init__(self, score):",
      "            self.score = score",
      "    try:",
      "        for n in (0, 1, 2, 4):",
      "            self = SelfObj(START)",
      "            for i in range(n):",
      "                _fn(self, PENALTY)",
      "            expected = START - n * PENALTY",
      "            if self.score == expected:",
      "                result['passed'].append('after stepping on %d swamp(s), score=%d' % (n, expected))",
      "            else:",
      "                result['failed'].append('after stepping on %d swamp(s), expected score=%d, got %d.' % (n, expected, self.score))",
      "    except Exception as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
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
      b64Line("FN1_SRC", fn1Src),
      b64Line("FN2_SRC", fn2Src),
      "def _run():",
      "    result = {'ok': False, 'passed': [], 'failed': [], 'error': None, 'traceback': None}",
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
      "    _fn1 = ns1['_fn']",
      "    _fn2 = ns2['_fn']",
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
      "    except Exception as e:",
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
      "    except Exception as e:",
      "        result['error'] = 'Part 2: %s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  // Bonus monster FSM (TODO 13): isolates just update_state's dispatch -
  // distance in, self.state out. Boundary cases are exact-equality tests
  // (Game AI Lab mission 3's "check the closer range first" idea): the
  // ATTACK/CHASE boundary itself must land in CHASE, not ATTACK, since the
  // real code uses strict `<` comparisons.
  function harness_monsterFsm_13(code) {
    var fnSrc = buildFnSource("self, distance", code, "    ");
    return [
      PY_PRELUDE,
      "MONSTER_ATTACK_DISTANCE = 50",
      "MONSTER_CHASE_DISTANCE = 200",
      b64Line("FN_SRC", fnSrc),
      "def _run():",
      "    result = {'ok': False, 'passed': [], 'failed': [], 'error': None, 'traceback': None}",
      "    class SelfObj:",
      "        def __init__(self):",
      "            self.state = None",
      "    ns = {}",
      "    try:",
      "        exec(compile(FN_SRC, '<student>', 'exec'), {'MONSTER_ATTACK_DISTANCE': MONSTER_ATTACK_DISTANCE, 'MONSTER_CHASE_DISTANCE': MONSTER_CHASE_DISTANCE}, ns)",
      "    except SyntaxError as e:",
      "        line = max(1, (e.lineno or 1) - 1)",
      "        result['error'] = 'Python syntax error on line %s: %s.' % (line, e.msg)",
      "        return json.dumps(result)",
      "    _fn = ns['_fn']",
      "    cases = [",
      "        ('well inside ATTACK range', 10, 'ATTACK'),",
      "        ('just under the ATTACK edge', 49, 'ATTACK'),",
      "        ('exactly at the ATTACK/CHASE boundary', 50, 'CHASE'),",
      "        ('well inside CHASE range', 120, 'CHASE'),",
      "        ('just under the CHASE edge', 199, 'CHASE'),",
      "        ('exactly at the CHASE/PATROL boundary', 200, 'PATROL'),",
      "        ('far away', 500, 'PATROL'),",
      "    ]",
      "    try:",
      "        for label, distance, expected in cases:",
      "            self = SelfObj()",
      "            _fn(self, distance)",
      "            if self.state == expected:",
      "                result['passed'].append('%s (distance=%d): state=%s' % (label, distance, expected))",
      "            else:",
      "                result['failed'].append('%s (distance=%d): expected state=%r, got %r.' % (label, distance, expected, self.state))",
      "    except Exception as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  // Bonus monster chase movement (TODO 14): a small open FakeMaze + a
  // from-scratch (BFS-shaped) find_path_dijkstra ground truth, so this
  // harness isolates "did you call find_path_dijkstra and move to path[1]"
  // without depending on the student's OWN Required TODO 5 code at all.
  function harness_monsterChase_14(code) {
    var fnSrc = buildFnSource("self, maze, player_position", code, "    ");
    return [
      PY_PRELUDE + "from collections import deque",
      b64Line("FN_SRC", fnSrc),
      "def find_path_dijkstra(map_data, start, end, get_weight=None, all_weights=None):",
      "    queue = deque([start])",
      "    parent = {start: None}",
      "    visited = {start}",
      "    while queue:",
      "        current = queue.popleft()",
      "        if current == end:",
      "            break",
      "        for neighbor in map_data.get_open_neighbors(current):",
      "            if neighbor not in visited:",
      "                visited.add(neighbor)",
      "                parent[neighbor] = current",
      "                queue.append(neighbor)",
      "    if end not in parent:",
      "        return []",
      "    path = [end]",
      "    cur = end",
      "    while cur != start:",
      "        cur = parent[cur]",
      "        path.append(cur)",
      "    path.reverse()",
      "    return path",
      "class FakeMaze:",
      "    def __init__(self, rows, cols):",
      "        self.rows = rows",
      "        self.cols = cols",
      "    def get_open_neighbors(self, position):",
      "        r, c = position",
      "        out = []",
      "        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):",
      "            nr, nc = r + dr, c + dc",
      "            if 0 <= nr < self.rows and 0 <= nc < self.cols:",
      "                out.append((nr, nc))",
      "        return out",
      "class SelfObj:",
      "    def __init__(self, row, col):",
      "        self.row = row",
      "        self.col = col",
      "    def get_position(self):",
      "        return (self.row, self.col)",
      "def _run():",
      "    result = {'ok': False, 'passed': [], 'failed': [], 'error': None, 'traceback': None}",
      "    ns = {}",
      "    try:",
      "        exec(compile(FN_SRC, '<student>', 'exec'), {'find_path_dijkstra': find_path_dijkstra}, ns)",
      "    except SyntaxError as e:",
      "        line = max(1, (e.lineno or 1) - 1)",
      "        result['error'] = 'Python syntax error on line %s: %s.' % (line, e.msg)",
      "        return json.dumps(result)",
      "    _fn = ns['_fn']",
      "    maze = FakeMaze(6, 6)",
      "    cases = [",
      "        ('several tiles away', (0, 0), (0, 4)),",
      "        ('across the grid', (5, 5), (0, 0)),",
      "        ('already adjacent', (2, 2), (2, 3)),",
      "    ]",
      "    try:",
      "        for label, start, target in cases:",
      "            self = SelfObj(*start)",
      "            before = self.get_position()",
      "            _fn(self, maze, target)",
      "            after = self.get_position()",
      "            if after == before:",
      "                result['failed'].append('%s: the monster did not move at all - did you call find_path_dijkstra and check len(path) > 1?' % label)",
      "                continue",
      "            manhattan_before = abs(before[0] - target[0]) + abs(before[1] - target[1])",
      "            manhattan_after = abs(after[0] - target[0]) + abs(after[1] - target[1])",
      "            is_neighbor = abs(after[0] - before[0]) + abs(after[1] - before[1]) == 1",
      "            if not is_neighbor:",
      "                result['failed'].append('%s: moved from %r to %r, which is not exactly one tile away - move to path[1], not further.' % (label, before, after))",
      "            elif manhattan_after >= manhattan_before:",
      "                result['failed'].append('%s: moved from %r to %r, which is not closer to the player at %r.' % (label, before, after, target))",
      "            else:",
      "                result['passed'].append('%s: moved one tile closer, from %r to %r' % (label, before, after))",
      "    except Exception as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  var BEHAVIOUR_HARNESSES = {
    movement_2: harness_movement_2,
    guardClause_3: harness_guardClause_3,
    positionDelta_4: harness_positionDelta_4,
    dijkstra_5: harness_dijkstra_5,
    score_6: harness_score_6,
    score_7: harness_score_7,
    monsterFsm_13: harness_monsterFsm_13,
    monsterChase_14: harness_monsterChase_14,
  };

  // ------------------------------------------------- 11. syntax harnesses
  //
  // These are the open-ended TODOs (1, 8, 9, 10, 11, 12, 15): there is no single
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
      "    except Exception as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  function harness_syntax_8(code) {
    var starter = linesOf(STEP_BY_ID["8"].starter);
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
      "        starter_ns = {}",
      "        exec(compile(STARTER, '<starter>', 'exec'), {}, starter_ns)",
      "        if 'ROUND_CONFIGS' not in ns:",
      "            result['failed'].append('Missing definition: ROUND_CONFIGS.')",
      "            result['ok'] = False",
      "            return json.dumps(result)",
      "        result['passed'].append('ROUND_CONFIGS is defined.')",
      "        rc = ns['ROUND_CONFIGS']",
      "        ref_keys = set(starter_ns['ROUND_CONFIGS'][0].keys())",
      "        if not isinstance(rc, list) or len(rc) != 3:",
      "            result['warnings'].append('Heads up: ROUND_CONFIGS is usually a list of exactly 3 round dictionaries — this still counts as complete, but the real game may not run correctly with this shape. Try it in the Play tab or your local pygame window to check.')",
      "        else:",
      "            for i, round_dict in enumerate(rc):",
      "                label = 'round %d' % (i + 1)",
      "                if not isinstance(round_dict, dict):",
      "                    result['warnings'].append('Heads up: %s is not a dictionary.' % label)",
      "                    continue",
      "                keys = set(round_dict.keys())",
      "                if keys != ref_keys:",
      "                    missing = ref_keys - keys",
      "                    extra = keys - ref_keys",
      "                    msg = 'Heads up: %s has different keys than the starter.' % label",
      "                    if missing:",
      "                        msg += ' Missing: %s.' % ', '.join(sorted(missing))",
      "                    if extra:",
      "                        msg += ' Extra: %s.' % ', '.join(sorted(extra))",
      "                    result['warnings'].append(msg + ' Removing a key the engine expects can crash the game — double-check this is intentional.')",
      "                    continue",
      "                bad_types = [k for k, v in round_dict.items() if type(v) is not int]",
      "                if bad_types:",
      "                    result['warnings'].append('Heads up: %s has non-integer value(s) for %s — the engine expects plain integers here.' % (label, ', '.join(bad_types)))",
      "                    continue",
      "                result['passed'].append('%s: %s' % (label, _short_repr(round_dict)))",
      "    except Exception as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  function harness_syntax_9(code) {
    var imageVars = ["PLAYER_IMAGE_PATH", "GOAL_IMAGE_PATH", "SWAMP_IMAGE_PATH", "ITEM_IMAGE_PATH", "BOMB_IMAGE_PATH", "FLOOR_TILE_IMAGE_PATH", "MONSTER_IMAGE_PATH"];
    var soundVars = ["SWAMP_SOUND_PATH", "ITEM_SOUND_PATH", "BOMB_SOUND_PATH", "BACKGROUND_MUSIC_PATH"];
    return [
      pySyntaxPrelude(code, ""),
      "IMAGE_VARS = " + JSON.stringify(imageVars).replace(/"/g, "'"),
      "SOUND_VARS = " + JSON.stringify(soundVars).replace(/"/g, "'"),
      "KNOWN_IMAGES = " + JSON.stringify(KNOWN_ASSETS.images).replace(/"/g, "'"),
      "KNOWN_SOUNDS = " + JSON.stringify(KNOWN_ASSETS.sounds).replace(/"/g, "'"),
      "IMAGE_EXT = ('.png', '.jpg', '.jpeg', '.gif', '.bmp')",
      "SOUND_EXT = ('.wav', '.mp3', '.ogg')",
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
      "        all_vars = IMAGE_VARS + SOUND_VARS",
      "        missing = [n for n in all_vars if n not in ns]",
      "        if missing:",
      "            result['failed'].append('Missing definition(s): %s.' % ', '.join(missing))",
      "            result['ok'] = False",
      "            return json.dumps(result)",
      "        result['passed'].append('All %d asset variables are defined.' % len(all_vars))",
      "        def check(name, folder, exts, known):",
      "            val = ns[name]",
      "            if val is None:",
      "                return",
      "            if not isinstance(val, str):",
      "                result['warnings'].append('Heads up: %s should be None or a string path, got %s — this still counts as complete, but the real game will likely error when it tries to load this.' % (name, type(val).__name__))",
      "                return",
      "            norm = val.replace(chr(92), '/')",
      "            if not norm.startswith(folder) or not norm.lower().endswith(exts):",
      "                result['warnings'].append('Heads up: %s = %s doesn\\'t look like a path under %s with a valid extension — double-check it, though this still counts as complete.' % (name, _short_repr(val), folder))",
      "                return",
      "            base = norm.rsplit('/', 1)[-1]",
      "            if base not in known:",
      "                result['warnings'].append('%s = %s — this isn\\'t one of the bundled files, but it will work once you add your own file at that path.' % (name, _short_repr(val)))",
      "        for n in IMAGE_VARS:",
      "            check(n, 'assets/images/', IMAGE_EXT, KNOWN_IMAGES)",
      "        for n in SOUND_VARS:",
      "            check(n, 'assets/sounds/', SOUND_EXT, KNOWN_SOUNDS)",
      "    except Exception as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  function harness_syntax_10(code) {
    var starter = linesOf(STEP_BY_ID["10"].starter);
    var itemKeys = ["name", "color", "score", "hint_bonus", "route_weight"];
    return [
      pySyntaxPrelude(code, starter),
      "ITEM_KEYS = " + JSON.stringify(itemKeys).replace(/"/g, "'"),
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
      "        if 'CUSTOM_ITEMS' not in ns:",
      "            result['failed'].append('Missing definition: CUSTOM_ITEMS.')",
      "            result['ok'] = False",
      "            return json.dumps(result)",
      "        items_list = ns['CUSTOM_ITEMS']",
      "        if not isinstance(items_list, list) or len(items_list) == 0:",
      "            result['warnings'].append('Heads up: CUSTOM_ITEMS is usually a non-empty list of item dictionaries — this still counts as complete, but double-check it in the Play tab.')",
      "            result['passed'].append('CUSTOM_ITEMS is defined.')",
      "        else:",
      "            result['passed'].append('CUSTOM_ITEMS is defined with %d item(s).' % len(items_list))",
      "            for i, item_def in enumerate(items_list):",
      "                label = 'item %d' % (i + 1)",
      "                if not isinstance(item_def, dict):",
      "                    result['warnings'].append('Heads up: %s is not a dictionary.' % label)",
      "                    continue",
      "                keys = set(item_def.keys())",
      "                missing_keys = set(ITEM_KEYS) - keys",
      "                if missing_keys:",
      "                    result['warnings'].append('Heads up: %s is missing key(s): %s.' % (label, ', '.join(sorted(missing_keys))))",
      "                    continue",
      "                color = item_def.get('color')",
      "                if not (isinstance(color, tuple) and len(color) == 3 and all(isinstance(v, int) and 0 <= v <= 255 for v in color)):",
      "                    result['warnings'].append('Heads up: %s color is usually a 3-tuple of ints 0-255, e.g. (255, 215, 0) — still counts as complete, but double-check it renders correctly.' % label)",
      "                for n in ('score', 'hint_bonus', 'route_weight'):",
      "                    if type(item_def.get(n)) is not int:",
      "                        result['warnings'].append('Heads up: %s[\\'%s\\'] is usually a plain integer — this still counts as complete, but double-check it behaves as expected.' % (label, n))",
      "                result['passed'].append('%s: %s' % (label, _short_repr(item_def)))",
      "    except Exception as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  function harness_syntax_11(code) {
    var starter = linesOf(STEP_BY_ID["11"].starter);
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
      "        names = ['CUSTOM_TERRAIN_NAME', 'CUSTOM_TERRAIN_COLOR', 'CUSTOM_TERRAIN_SCORE_CHANGE', 'CUSTOM_TERRAIN_ROUTE_WEIGHT', 'CUSTOM_TERRAIN_DISAPPEARS']",
      "        missing = [n for n in names if n not in ns]",
      "        if missing:",
      "            result['failed'].append('Missing definition(s): %s.' % ', '.join(missing))",
      "        else:",
      "            result['passed'].append('All five are defined: NAME=%s, COLOR=%s, SCORE_CHANGE=%s, ROUTE_WEIGHT=%s, DISAPPEARS=%s.' % tuple(_short_repr(ns[n]) for n in names))",
      "            color = ns['CUSTOM_TERRAIN_COLOR']",
      "            if not (isinstance(color, tuple) and len(color) == 3 and all(isinstance(v, int) and 0 <= v <= 255 for v in color)):",
      "                result['warnings'].append('Heads up: CUSTOM_TERRAIN_COLOR is usually a 3-tuple of ints 0-255 — this still counts as complete, but double-check it renders correctly.')",
      "            for n in ('CUSTOM_TERRAIN_SCORE_CHANGE', 'CUSTOM_TERRAIN_ROUTE_WEIGHT'):",
      "                if type(ns[n]) is not int:",
      "                    result['warnings'].append('Heads up: %s is usually a plain integer — this still counts as complete, but double-check it behaves as expected.' % n)",
      "            if type(ns['CUSTOM_TERRAIN_DISAPPEARS']) is not bool:",
      "                result['warnings'].append('Heads up: CUSTOM_TERRAIN_DISAPPEARS is usually exactly True or False — this still counts as complete, but double-check it behaves as expected.')",
      "    except Exception as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  function harness_syntax_12(code) {
    var starter = linesOf(STEP_BY_ID["12"].starter);
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
      "        names = ['MONSTER_ATTACK_DISTANCE', 'MONSTER_CHASE_DISTANCE', 'MONSTER_SPEED_NORMAL', 'MONSTER_SPEED_SWAMP', 'MONSTER_SPEED_CUSTOM', 'MONSTER_COUNT']",
      "        missing = [n for n in names if n not in ns]",
      "        if missing:",
      "            result['failed'].append('Missing definition(s): %s.' % ', '.join(missing))",
      "        else:",
      "            result['passed'].append('All six are defined: %s.' % ', '.join('%s=%s' % (n, _short_repr(ns[n])) for n in names))",
      "            for n in names:",
      "                if type(ns[n]) is not int:",
      "                    result['warnings'].append('Heads up: %s is usually a plain integer — this still counts as complete, but double-check it behaves as expected.' % n)",
      "            attack = ns.get('MONSTER_ATTACK_DISTANCE')",
      "            chase = ns.get('MONSTER_CHASE_DISTANCE')",
      "            if isinstance(attack, int) and isinstance(chase, int) and not (chase > attack):",
      "                result['warnings'].append('Heads up: MONSTER_CHASE_DISTANCE is usually greater than MONSTER_ATTACK_DISTANCE, or the monster will never notice you coming — this still counts as complete, but double-check it in the Play tab.')",
      "            count = ns.get('MONSTER_COUNT')",
      "            if isinstance(count, int) and count < 0:",
      "                result['warnings'].append('Heads up: MONSTER_COUNT is usually 0 or more.')",
      "    except Exception as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  function harness_syntax_15(code) {
    var starter = linesOf(STEP_BY_ID["15"].starter);
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
      "        names = ['MISSION_RULES', 'HOW_TO_PLAY_RULES']",
      "        missing = [n for n in names if n not in ns]",
      "        if missing:",
      "            result['failed'].append('Missing definition(s): %s. Keep the variable names exactly as given.' % ', '.join(missing))",
      "        else:",
      "            result['passed'].append('Both are defined: MISSION_RULES (%s item(s)), HOW_TO_PLAY_RULES (%s item(s)).' % (",
      "                len(ns['MISSION_RULES']) if isinstance(ns['MISSION_RULES'], (list, tuple)) else '?',",
      "                len(ns['HOW_TO_PLAY_RULES']) if isinstance(ns['HOW_TO_PLAY_RULES'], (list, tuple)) else '?',",
      "            ))",
      "            for rn in ('MISSION_RULES', 'HOW_TO_PLAY_RULES'):",
      "                if not isinstance(ns[rn], list) or len(ns[rn]) == 0:",
      "                    result['warnings'].append('Heads up: %s is usually a non-empty list of strings — this still counts as complete, but double-check it looks right in the preview.' % rn)",
      "    except Exception as e:",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    result['ok'] = result['error'] is None and len(result['failed']) == 0",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  var SYNTAX_HARNESSES = {
    "1": harness_syntax_1,
    "8": harness_syntax_8,
    "9": harness_syntax_9,
    "10": harness_syntax_10,
    "11": harness_syntax_11,
    "12": harness_syntax_12,
    "15": harness_syntax_15,
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
  //   {type:"carve", from:[r,c], to:[r,c], direction, stackDepth}   (DFS)
  //   {type:"backtrack", to:[r,c], stackDepth}                     (DFS)
  //   {type:"visit", cell:[r,c], cost:n, from:[r,c], queue:[...]}  (BFS/Dijkstra)
  //   {type:"path", cells:[[r,c],...]}                             (BFS/Dijkstra)
  //   {type:"score", kind, label, delta, total}                    (scoreboard)
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
  var SPRITE = {
    player: "assets/images/player_ninja.png",
    goal: "assets/images/goal_chest.png",
    swamp: "assets/images/terrain_swamp_1.png",
    item: "assets/images/item_gem_1.png",
    bomb: "assets/images/bomb.png",
    floor: "assets/images/floor_tile_1.png",
  };

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
      "    except Exception as e:",
      "        result['ok'] = False",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  function traceHarness_playerMove(code21, code22, code23, mazeGrid, pressed, startRow, startCol) {
    var fn21 = buildFnSource("self, pygame, keys, moved", code21, "    ");
    var fn22 = buildFnSource("current, direction", code22, "    ");
    var fn23 = buildFnSource("self, dr, dc", code23, "    ");
    return [
      "import json, base64, traceback",
      b64Line("FN21_SRC", fn21),
      b64Line("FN22_SRC", fn22),
      b64Line("FN23_SRC", fn23),
      "GRID = " + JSON.stringify(JSON.stringify(mazeGrid)),
      "PRESSED = " + JSON.stringify(pressed || ""),
      "START_ROW = " + Number(startRow),
      "START_COL = " + Number(startCol),
      "def _run():",
      "    result = {'ok': True, 'error': None, 'traceback': None, 'moved': None, 'calls': [], 'row': START_ROW, 'col': START_COL, 'wall_violation': False, 'unexpected_delta': False, 'direction_requested': None, 'try_move_returned': None}",
      "    grid = json.loads(GRID)",
      "    rows = len(grid); cols = len(grid[0]) if rows else 0",
      "    ns21 = {}",
      "    try:",
      "        exec(compile(FN21_SRC, '<t21>', 'exec'), {}, ns21)",
      "        exec(compile(FN22_SRC, '<t22>', 'exec'), {}, {})",
      "        exec(compile(FN23_SRC, '<t23>', 'exec'), {}, {})",
      "    except SyntaxError as e:",
      "        result['ok'] = False",
      "        result['error'] = 'Python syntax error on line %s: %s.' % (e.lineno, e.msg)",
      "        return json.dumps(result)",
      "    fn21 = ns21['_fn']",
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
      "        K_LEFT = 1; K_a = 2; K_RIGHT = 3; K_d = 4; K_UP = 5; K_w = 6; K_DOWN = 7; K_s = 8",
      "    pygame = Pygame()",
      "    key_map = {'K_LEFT': pygame.K_LEFT, 'K_a': pygame.K_a, 'K_RIGHT': pygame.K_RIGHT, 'K_d': pygame.K_d, 'K_UP': pygame.K_UP, 'K_w': pygame.K_w, 'K_DOWN': pygame.K_DOWN, 'K_s': pygame.K_s}",
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
      "            ns22 = {'current': current, 'direction': direction}",
      "            exec(compile(FN22_SRC, '<t22>', 'exec'), {}, ns22)",
      "            out22 = ns22['_fn'](current, direction)",
      "            if out22 is False:",
      "                result['try_move_returned'] = False",
      "                return False",
      "            dr, dc = DR_DC[direction]",
      "            ns23 = {}",
      "            exec(compile(FN23_SRC, '<t23>', 'exec'), {}, ns23)",
      "            ns23['_fn'](self, dr, dc)",
      "            result['try_move_returned'] = True",
      "            return True",
      "    player = Player(START_ROW, START_COL)",
      "    class SelfObj:",
      "        pass",
      "    self_ = SelfObj()",
      "    self_.player = player",
      "    self_.maze = maze",
      "    try:",
      "        out21 = fn21(self_, pygame, keys, False)",
      "        moved = out21.get('moved', False) if isinstance(out21, dict) else out21",
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
      "    except Exception as e:",
      "        result['ok'] = False",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  // Play tab swamp placement: the student's merged Required TODO 5 code,
  // called with UNIFORM weights - the same "no weights passed" call maze.py
  // itself makes in create_swamps(), which is exactly what makes Dijkstra
  // degenerate into BFS (see TODO 5's lead / pathfinding.py's docstring).
  function traceHarness_swampPlacement(code5a, code5b, mazeGrid, start, end, swampCount) {
    var fn5 = buildFnSourceTwoParts("cost, step_cost, neighbor, current, distance, parent, queue", code5a, code5b, "    ");
    return [
      "import json, base64, random, heapq, traceback",
      b64Line("FN5_SRC", fn5),
      "GRID = " + JSON.stringify(JSON.stringify(mazeGrid)),
      "START = " + JSON.stringify(start),
      "END = " + JSON.stringify(end),
      "SWAMP_COUNT = " + Number(swampCount),
      "BUDGET = " + FLOOD_BUDGET,
      "TRACE_CAP = " + TRACE_CAP,
      "def _run():",
      "    result = {'ok': True, 'error': None, 'traceback': None, 'trace': [], 'stopped_reason': None, 'path': [], 'path_len': 0, 'optimal_len': None, 'swamp_cells': [], 'swamp_on_path': None}",
      "    grid = json.loads(GRID)",
      "    rows = len(grid); cols = len(grid[0]) if rows else 0",
      "    start = tuple(START); end = tuple(END)",
      "    def get_open_neighbors(pos):",
      "        r, c = pos",
      "        cell = grid[r][c]",
      "        out = []",
      "        for direction, dr, dc in (('top', -1, 0), ('right', 0, 1), ('bottom', 1, 0), ('left', 0, -1)):",
      "            if not cell.get(direction, True):",
      "                nr, nc = r + dr, c + dc",
      "                if 0 <= nr < rows and 0 <= nc < cols:",
      "                    out.append((nr, nc))",
      "        return out",
      "    try:",
      "        exec(compile(FN5_SRC, '<t5>', 'exec'), {'heapq': heapq}, {})",
      "    except SyntaxError as e:",
      "        result['ok'] = False",
      "        result['error'] = 'Python syntax error on line %s: %s.' % (e.lineno, e.msg)",
      "        return json.dumps(result)",
      "    def find_path_uniform(start, end):",
      "        queue = [(0, start)]",
      "        distance = {start: 0}",
      "        parent = {start: None}",
      "        visited = set()",
      "        steps = 0",
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
      "                step_cost = 1",
      "                ns5 = {}",
      "                exec(compile(FN5_SRC, '<t5>', 'exec'), {'heapq': heapq}, ns5)",
      "                ns5['_fn'](cost, step_cost, neighbor, current, distance, parent, queue)",
      "                if neighbor in distance and len(result['trace']) < TRACE_CAP:",
      "                    result['trace'].append({'type': 'visit', 'cell': list(neighbor), 'from': list(current)})",
      "        if end not in parent:",
      "            return []",
      "        path = [end]; cur = end; seen_back = {end}",
      "        while cur != start:",
      "            nxt = parent.get(cur)",
      "            if nxt is None or nxt in seen_back:",
      "                return []",
      "            path.append(nxt); seen_back.add(nxt); cur = nxt",
      "        path.reverse()",
      "        return path",
      "    try:",
      "        path = find_path_uniform(start, end)",
      "        result['path'] = [list(p) for p in path]",
      "        result['path_len'] = len(path)",
      "        if len(result['trace']) < TRACE_CAP and path:",
      "            result['trace'].append({'type': 'path', 'cells': [list(p) for p in path]})",
      "        # This fixed test maze has no interior walls, so the optimal path",
      "        # length is just the Manhattan distance + 1 - plain arithmetic, not",
      "        # a graph search, so this cannot resemble the TODO itself.",
      "        result['optimal_len'] = abs(end[0] - start[0]) + abs(end[1] - start[1]) + 1",
      "        candidates = path[2:-2] if len(path) > 4 else []",
      "        rng = random.Random(7)",
      "        rng.shuffle(candidates)",
      "        selected = candidates[:SWAMP_COUNT]",
      "        used_fallback = False",
      "        if len(selected) < SWAMP_COUNT:",
      "            used_fallback = True",
      "            forbidden = {start, end, *[tuple(x) for x in selected]}",
      "            others = [(r, c) for r in range(rows) for c in range(cols) if (r, c) not in forbidden]",
      "            rng.shuffle(others)",
      "            selected = selected + others[:SWAMP_COUNT - len(selected)]",
      "        result['swamp_cells'] = [list(s) for s in selected]",
      "        result['swamp_on_path'] = (not used_fallback)",
      "    except Exception as e:",
      "        result['ok'] = False",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  // NOTE: each tile kind below is independently branched (treasure only
  // touches code6, swamp only code7, custom_item/custom_terrain only read
  // CODE10/CODE11 as plain data) - unlike playerMove's strict AND-chain,
  // there is no inherent cross-dependency here. The one real issue found on
  // review was structural, not conceptual: a blanket up-front syntax check
  // used to abort the ENTIRE trace (all tile kinds) if EITHER code6 or code7
  // had a syntax error, even for tile kinds that don't use that function at
  // all. Each branch below now catches its own errors independently, so a
  // broken TODO 7 (say) can never block seeing TODO 6's own effect on
  // treasure tiles, or vice versa - same isolation principle as playerMove.
  function traceHarness_scoreBoard(code6, code7, code10, code11, tiles, startingScore) {
    var fn6 = buildFnSource("self, ITEM_SCORE", code6, "    ");
    var fn7 = buildFnSource("self, SWAMP_SCORE_PENALTY", code7, "    ");
    return [
      "import json, base64, traceback",
      b64Line("FN6_SRC", fn6),
      b64Line("FN7_SRC", fn7),
      b64Line("CODE10", code10),
      b64Line("CODE11", code11),
      "TILES = " + JSON.stringify(JSON.stringify(tiles)),
      "START_SCORE = " + Number(startingScore),
      "ITEM_SCORE = 100",
      "SWAMP_SCORE_PENALTY = 100",
      "def _run():",
      "    result = {'ok': True, 'error': None, 'traceback': None, 'trace': [], 'custom_item': None, 'custom_terrain': None}",
      "    class SelfObj:",
      "        def __init__(self, score):",
      "            self.score = score",
      "    self_ = SelfObj(START_SCORE)",
      "    def try_call(fn_src, args):",
      "        try:",
      "            ns = {}",
      "            exec(compile(fn_src, '<tile>', 'exec'), {}, ns)",
      "            ns['_fn'](*args)",
      "        except Exception:",
      "            pass  # this tile kind's TODO isn't finished/valid yet - no effect, but other tiles still run",
      "    def safe_read_dict(code, filename):",
      "        try:",
      "            ns = {}",
      "            exec(compile(code, filename, 'exec'), {}, ns)",
      "            return ns",
      "        except Exception:",
      "            return {}",
      "    ns10 = safe_read_dict(CODE10, '<t10>')",
      "    custom_items = ns10.get('CUSTOM_ITEMS') or [{'name': 'Custom Item', 'color': (180, 180, 180), 'score': 0, 'hint_bonus': 0, 'route_weight': 0}]",
      "    first_item = custom_items[0] if custom_items else {'name': 'Custom Item', 'color': (180, 180, 180), 'score': 0, 'hint_bonus': 0, 'route_weight': 0}",
      "    try:",
      "        for tile in json.loads(TILES):",
      "            kind = tile['kind']",
      "            before = self_.score",
      "            if kind == 'treasure':",
      "                try_call(FN6_SRC, (self_, ITEM_SCORE))",
      "                label = 'Treasure'",
      "            elif kind == 'swamp':",
      "                try_call(FN7_SRC, (self_, SWAMP_SCORE_PENALTY))",
      "                label = 'Swamp'",
      "            elif kind == 'custom_item':",
      "                self_.score += first_item.get('score', 0)",
      "                label = str(first_item.get('name', 'Custom Item'))",
      "            elif kind == 'custom_terrain':",
      "                ns11 = safe_read_dict(CODE11, '<t11>')",
      "                self_.score += ns11.get('CUSTOM_TERRAIN_SCORE_CHANGE', 0)",
      "                label = str(ns11.get('CUSTOM_TERRAIN_NAME', 'Custom Terrain'))",
      "            else:",
      "                label = kind",
      "            result['trace'].append({'type': 'score', 'kind': kind, 'label': label, 'delta': self_.score - before, 'total': self_.score})",
      "        result['custom_item'] = {'name': str(first_item.get('name', 'Custom Item')), 'color': list(first_item.get('color', (180, 180, 180))), 'score': first_item.get('score', 0), 'weight': first_item.get('route_weight', 0)}",
      "        ns11b = safe_read_dict(CODE11, '<t11>')",
      "        result['custom_terrain'] = {'name': str(ns11b.get('CUSTOM_TERRAIN_NAME', 'Custom Terrain')), 'color': list(ns11b.get('CUSTOM_TERRAIN_COLOR', (180, 180, 180))), 'change': ns11b.get('CUSTOM_TERRAIN_SCORE_CHANGE', 0)}",
      "    except Exception as e:",
      "        result['ok'] = False",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
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
      "    except Exception as e:",
      "        result['ok'] = False",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "        result['traceback'] = traceback.format_exc()",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  // Extracts CUSTOM_ITEM_*/CUSTOM_TERRAIN_* values without grading anything -
  // used by the Play tab to show the student's own custom item/terrain.
  // NOTE: CUSTOM_ITEMS (TODO 10) is a LIST - the real pygame game spawns
  // every entry randomly per-instance (see items.py's CustomItem.item_def),
  // but this Play-tab mini-preview simplifies to showing just the FIRST
  // entry's stats/color (a deliberate, disclosed scope simplification -
  // the full multi-item behaviour is only in the real exported game).
  function traceHarness_customValues(code10, code11) {
    return [
      "import json, base64, traceback",
      b64Line("CODE10", code10),
      b64Line("CODE11", code11),
      "def _run():",
      "    result = {'ok': True, 'error': None, 'item': None, 'terrain': None}",
      "    try:",
      "        ns10 = {}",
      "        exec(compile(CODE10, '<t10>', 'exec'), {}, ns10)",
      "        items = ns10.get('CUSTOM_ITEMS') or [{'name': 'Custom Item', 'color': (180, 180, 180), 'score': 0, 'hint_bonus': 0, 'route_weight': 0}]",
      "        first_item = items[0]",
      "        result['item'] = {'name': str(first_item.get('name', 'Custom Item')), 'color': list(first_item.get('color', (180, 180, 180))), 'score': first_item.get('score', 0), 'weight': first_item.get('route_weight', 0)}",
      "        ns11 = {}",
      "        exec(compile(CODE11, '<t11>', 'exec'), {}, ns11)",
      "        result['terrain'] = {'name': str(ns11.get('CUSTOM_TERRAIN_NAME', 'Custom Terrain')), 'color': list(ns11.get('CUSTOM_TERRAIN_COLOR', (180, 180, 180))), 'change': ns11.get('CUSTOM_TERRAIN_SCORE_CHANGE', 0), 'weight': ns11.get('CUSTOM_TERRAIN_ROUTE_WEIGHT', 0)}",
      "    except Exception as e:",
      "        result['ok'] = False",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  // One real scoring step (treasure via TODO 6 / swamp via TODO 7) for
  // the Play tab, applied to the CURRENT running score.
  function traceHarness_scoreDelta(code, paramName, constValue, currentScore) {
    var fn = buildFnSource("self, " + paramName, code, "    ");
    return [
      "import json, base64, traceback",
      b64Line("FN_SRC", fn),
      paramName + " = " + Number(constValue),
      "START_SCORE = " + Number(currentScore),
      "def _run():",
      "    result = {'ok': True, 'error': None, 'score': START_SCORE}",
      "    class SelfObj:",
      "        def __init__(self, score):",
      "            self.score = score",
      "    ns = {}",
      "    try:",
      "        exec(compile(FN_SRC, '<student>', 'exec'), {}, ns)",
      "    except SyntaxError as e:",
      "        result['ok'] = False",
      "        result['error'] = 'Python syntax error on line %s: %s.' % (e.lineno, e.msg)",
      "        return json.dumps(result)",
      "    try:",
      "        self_ = SelfObj(START_SCORE)",
      "        ns['_fn'](self_, " + paramName + ")",
      "        result['score'] = self_.score",
      "    except Exception as e:",
      "        result['ok'] = False",
      "        result['error'] = '%s: %s' % (type(e).__name__, e)",
      "    return json.dumps(result)",
      "_run()",
    ].join("\n");
  }

  // Dijkstra's hint route drawn on the REAL round maze (walls + terrain),
  // using the student's Required TODO 5 code (both parts, reassembled) and
  // terrain-based route weights.
  function traceHarness_dijkstraOnMaze(code5a, code5b, mazeGrid, weightsByTerrain, terrainGrid, start, end) {
    var fn5 = buildFnSourceTwoParts("cost, step_cost, neighbor, current, distance, parent, queue", code5a, code5b, "    ");
    return [
      "import json, heapq, base64, traceback",
      b64Line("FN5_SRC", fn5),
      "GRID = " + JSON.stringify(JSON.stringify(mazeGrid)),
      "TERRAIN = " + JSON.stringify(JSON.stringify(terrainGrid)),
      "WEIGHTS_BY_TERRAIN = " + JSON.stringify(JSON.stringify(weightsByTerrain)),
      "START = " + JSON.stringify(start),
      "END = " + JSON.stringify(end),
      "BUDGET = " + FLOOD_BUDGET,
      "def _run():",
      "    result = {'ok': True, 'error': None, 'traceback': None, 'path': [], 'total_cost': None}",
      "    grid = json.loads(GRID); terrain = json.loads(TERRAIN); wbt = json.loads(WEIGHTS_BY_TERRAIN)",
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
      "        return wbt.get(terrain[pos[0]][pos[1]], 0)",
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
      "    except Exception as e:",
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
      var code = state.stepData.code;
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
  // equivalent stand-in, the same principle already used by
  // harness_monsterChase_14's from-scratch ground-truth find_path_dijkstra
  // (computes the same result via a different code shape, without
  // reproducing the exact expected snippet a student is graded on). Verified
  // against the REAL grading harnesses (harness_movement_2/guardClause_3/
  // positionDelta_4) to confirm they are behaviourally correct substitutes.
  var REFERENCE_CODE = {
    "2": [
      'key_to_direction = [',
      '    (pygame.K_LEFT, "left"), (pygame.K_a, "left"),',
      '    (pygame.K_RIGHT, "right"), (pygame.K_d, "right"),',
      '    (pygame.K_UP, "top"), (pygame.K_w, "top"),',
      '    (pygame.K_DOWN, "bottom"), (pygame.K_s, "bottom"),',
      ']',
      'moved = False',
      'for key_const, direction in key_to_direction:',
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
        code21: codeFor("2"),
        code22: codeFor("3"),
        code23: codeFor("4"),
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
        var src = traceHarness_playerMove(codes.code21, codes.code22, codes.code23, NAV_MAZE, pressedName, pos.row, pos.col);
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

    var KEY_TO_KEYNAME = {
      ArrowLeft: "K_LEFT", a: "K_a", A: "K_a",
      ArrowRight: "K_RIGHT", d: "K_d", D: "K_d",
      ArrowUp: "K_UP", w: "K_w", W: "K_w",
      ArrowDown: "K_DOWN", s: "K_s", S: "K_s",
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
        container.appendChild(el("p", { class: "small muted", text: "Use Arrow keys or WASD anywhere on this page (no need to click the board first)." }));
        var boardWrap = el("div", { class: "viz-board-wrap" });
        var width = fitWidth(container, 340);
        CELL = Math.max(20, Math.floor(width / NAV_COLS));
        var made = makeCanvas(CELL * NAV_COLS, CELL * NAV_ROWS);
        made.canvas.tabIndex = 0;
        made.canvas.className = "viz-canvas viz-canvas-focusable";
        made.canvas.setAttribute("aria-label", "Maze board — use arrow keys or WASD to move, anywhere on this page");
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

  // -------------------------------------------------- 14f. scoreBoard viz

  var ScoreBoardViz = (function () {
    var refs = null;
    var TILES = [
      { kind: "treasure" }, { kind: "swamp" }, { kind: "treasure" }, { kind: "custom_item" },
      { kind: "swamp" }, { kind: "custom_terrain" }, { kind: "treasure" },
    ];
    var idx = 0;
    var total = 0;

    function tileLabel(kind) { return { treasure: "Treasure", swamp: "Swamp", custom_item: "Custom item", custom_terrain: "Custom terrain" }[kind] || kind; }
    function tileColor(kind, data) {
      if (kind === "custom_item" && data && data.custom_item) return "rgb(" + data.custom_item.color.join(",") + ")";
      if (kind === "custom_terrain" && data && data.custom_terrain) return "rgb(" + data.custom_terrain.color.join(",") + ")";
      if (kind === "treasure") return "#22c55e";
      if (kind === "swamp") return "#867d38";
      return "#888";
    }

    function renderStrip(data) {
      if (!refs) return;
      refs.strip.innerHTML = "";
      TILES.forEach(function (t, i) {
        var tile = el("div", { class: "score-tile" + (i === idx ? " is-current" : "") + (i < idx ? " is-done" : ""), style: "background:" + tileColor(t.kind, data) });
        var label = t.kind === "custom_item" && data && data.custom_item ? data.custom_item.name : (t.kind === "custom_terrain" && data && data.custom_terrain ? data.custom_terrain.name : tileLabel(t.kind));
        tile.title = label;
        refs.strip.appendChild(tile);
      });
    }

    function runFresh() {
      var c6 = state.steps["6"].code, c7 = state.steps["7"].code;
      var c10 = state.steps["10"].code, c11 = state.steps["11"].code;
      if (refs) refs.verdict.info("Running your code…");
      ensurePyodide().then(function (py) {
        return py.runPythonAsync(traceHarness_scoreBoard(c6, c7, c10, c11, TILES, 0));
      }).then(function (json) {
        var data = JSON.parse(json);
        idx = 0; total = 0;
        renderStrip(data);
        if (refs) refs.readout.set("score", "0");
        if (!data.ok) { if (refs) refs.verdict.set(false, data.error || "Your code raised an error."); return; }
        refs._data = data;
        if (refs) refs.verdict.info("Press Step to play through the tiles, or Run to play them all.");
      }).catch(function (err) { if (refs) refs.verdict.set(false, "Could not run: " + (err && err.message ? err.message : err)); });
    }

    function stepOnce() {
      if (!refs || !refs._data) return;
      var trace = refs._data.trace;
      if (idx >= trace.length) return;
      var evt = trace[idx];
      total = evt.total;
      idx++;
      renderStrip(refs._data);
      refs.readout.set("score", String(total));
      if (idx >= trace.length) {
        if (total > 0) refs.verdict.set(true, "Final score " + total + " — above 0, round would be won.");
        else refs.verdict.set(false, "Final score " + total + " — not above 0, round would be lost.");
      }
    }

    function runAll() {
      if (!refs || !refs._data) return;
      var trace = refs._data.trace;
      var timer = setInterval(function () {
        if (idx >= trace.length) { clearInterval(timer); return; }
        stepOnce();
      }, prefersReducedMotion() ? 0 : 260);
    }

    return {
      mount: function (container) {
        container.innerHTML = "";
        var strip = el("div", { class: "score-strip" });
        container.appendChild(strip);
        var actions = el("div", { class: "viz-controlbar" }, [
          el("button", { class: "btn btn-small", type: "button", text: "Step", onclick: stepOnce }),
          el("button", { class: "btn btn-small btn-primary", type: "button", text: "Run", onclick: runAll }),
          el("button", { class: "btn btn-small btn-secondary", type: "button", text: "↻ Replay animation", onclick: runFresh }),
        ]);
        container.appendChild(actions);
        container.appendChild(el("p", { class: "small muted", text: "\"Replay animation\" re-plays your last-saved code here without submitting an attempt — press \"Run my code\" above (in the editor) to check your answer." }));
        var readout = buildReadout([{ key: "score", label: "Running score" }]);
        container.appendChild(readout.node);
        var verdict = buildVerdict();
        container.appendChild(verdict.node);
        refs = { strip: strip, readout: readout, verdict: verdict, _data: null };
        runFresh();
      },
      show: function () { if (refs && refs._data) renderStrip(refs._data); },
      update: function () { runFresh(); },
      unmount: function () { refs = null; },
    };
  })();
  Visualizer.register("scoreBoard", ScoreBoardViz);

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
  // movement; every other tile is open floor with a terrain effect
  // (NORMAL/SWAMP/CUSTOM) and may additionally carry a TREASURE or BOMB
  // marker. This reads naturally as "click to paint a square" for a
  // student - deliberately simpler than the edge-wall maze DFS generation
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
  var ROUND_CONFIG_KEY_ORDER = ["rows", "cols", "cell_size", "extra_open_walls", "item_count", "swamp_count", "bomb_count", "custom_item_count", "custom_terrain_count", "monster_count", "time_limit_seconds"];

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
    var treasureCells = [];
    for (var r = 0; r < grid.length; r++) for (var c = 0; c < grid[r].length; c++) if (grid[r][c] === "TREASURE") treasureCells.push([r, c]);
    var treasuresReachable = treasureCells.filter(function (p) { return !!reach[p[0] + "," + p[1]]; }).length;
    return { goalReachable: goalReachable, treasuresTotal: treasureCells.length, treasuresReachable: treasuresReachable, reach: reach };
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
  function paintedTerrainGrid(grid) {
    return grid.map(function (row) { return row.map(function (t) { return (t === "SWAMP" || t === "CUSTOM") ? t : "NORMAL"; }); });
  }
  function paintedItemsAndBombs(grid) {
    var items = [], bombs = [], monsters = [];
    for (var r = 0; r < grid.length; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        if (grid[r][c] === "TREASURE") items.push([r, c]);
        else if (grid[r][c] === "BOMB") bombs.push([r, c]);
        else if (grid[r][c] === "MONSTER") monsters.push([r, c]);
      }
    }
    return { items: items, bombs: bombs, monsters: monsters };
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

    var swampBudget = opts.swampCount != null ? opts.swampCount : Math.round(area * 0.08);
    var swampClusterCells = Math.max(2, Math.round(clusterSize * clusterSize * 0.7));
    var numSwampSeeds = Math.max(1, Math.round(swampBudget / swampClusterCells));
    for (var s = 0; s < numSwampSeeds; s++) {
      var sc = pickEligibleSeed(grid, rng, function (v) { return v === "NORMAL"; }, protectedCells);
      if (!sc) break;
      growCluster(grid, "SWAMP", sc, swampClusterCells, rng, function (v) { return v === "NORMAL"; });
    }

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
    scatterSmallClusters("TREASURE", opts.itemCount != null ? opts.itemCount : Math.max(3, Math.round(area * 0.03)));
    scatterSmallClusters("BOMB", opts.bombCount != null ? opts.bombCount : Math.max(2, Math.round(area * 0.015)));
    scatterSmallClusters("MONSTER", opts.monsterCount != null ? opts.monsterCount : 1);

    return { grid: grid, start: start, goal: goal };
  }

  function derivedCountsFromGrid(grid, existingDict, timeLimitSeconds) {
    var rows = grid.length, cols = grid[0].length;
    var swamp = 0, treasure = 0, bomb = 0, custom = 0, monster = 0;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var t = grid[r][c];
        if (t === "SWAMP") swamp++;
        else if (t === "TREASURE") treasure++;
        else if (t === "BOMB") bomb++;
        else if (t === "CUSTOM") custom++;
        else if (t === "MONSTER") monster++;
      }
    }
    var out = {};
    ROUND_CONFIG_KEY_ORDER.forEach(function (k) { out[k] = existingDict && existingDict[k] != null ? existingDict[k] : 0; });
    out.rows = rows; out.cols = cols;
    out.swamp_count = swamp; out.item_count = treasure; out.bomb_count = bomb; out.custom_terrain_count = custom; out.monster_count = monster;
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
  // raw source text. Returns an array of 3 plain dicts, or null if it can't
  // find exactly 3. This is a convenience for live UI sync ONLY - the real
  // grading in Prompt 1's syntax harness is still the authority.
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
      return dicts.length === 3 ? dicts : null;
    } catch (e) { return null; }
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
    return ["rows", "cols", "swamp_count", "item_count", "bomb_count"].every(function (k) { return a[k] === b[k]; });
  }

  var MapEditorViz = (function () {
    var refs = null;
    var tool = "WALL";
    var brushSize = 1;
    var painting = false;
    var eraseMode = false;
    var cursor = { r: 0, c: 0 };
    var undoStack = [], redoStack = [];
    var CELL = 0;
    var syncConflict = null; // {codeDict} when a hand-edit conflicts with the painted round
    var boundTextarea = null, onInputHandler = null, debouncedTextSync = null;
    var windowMouseupAttached = false;

    var TILE_META = {
      WALL: { label: "Wall", color: "#3a3327", desc: "Blocks movement." },
      NORMAL: { label: "Floor (eraser)", color: "#12100c", desc: "Open, no effect." },
      SWAMP: { label: "Swamp", color: "rgba(134,180,146,0.65)", desc: "Route weight 100 · score penalty." },
      TREASURE: { label: "Treasure", color: "#22c55e", desc: "Normal treasure score." },
      BOMB: { label: "Bomb", color: "#e0685f", desc: "Hazard." },
      MONSTER: { label: "Monster", color: "#be1e3c", desc: "Chasing enemy start position (Bonus)." },
      GOAL: { label: "Goal", color: "#f0c04a", desc: "Round exit (exactly one)." },
      START: { label: "Start", color: "#4fa3e3", desc: "Player start (exactly one)." },
    };

    function activeRoundData() {
      var idx = state.mapEditorData.activeRound;
      return { idx: idx, round: state.mapEditorData.rounds[idx] };
    }

    function customTerrainAvailable() {
      return state.steps["11"] && state.steps["11"].status === "completed";
    }

    function paletteTypes() {
      var types = ["WALL", "NORMAL", "SWAMP", "TREASURE", "BOMB", "MONSTER", "GOAL", "START"];
      if (customTerrainAvailable()) types.splice(3, 0, "CUSTOM");
      return types;
    }

    function ensureRound(idx, rows, cols) {
      var existing = state.mapEditorData.rounds[idx];
      if (existing && existing.rows === rows && existing.cols === cols) return existing;
      var gen = generatePaintedGrid(rows, cols, Math.floor(Math.random() * 1000000), 3, {});
      var fresh = { rows: rows, cols: cols, seed: 1, clusterSize: 3, grid: gen.grid, start: gen.start, goal: gen.goal, lastSyncedDict: null };
      state.mapEditorData.rounds[idx] = fresh;
      return fresh;
    }

    function pushUndo() {
      var d = activeRoundData().round;
      if (!d) return;
      undoStack.push({ grid: cloneGrid(d.grid), start: d.start.slice(), goal: d.goal.slice() });
      if (undoStack.length > 20) undoStack.shift();
      redoStack = [];
    }

    function paintCell(r, c, typeOverride) {
      var d = activeRoundData().round;
      if (!d) return;
      var rows = d.rows, cols = d.cols;
      var half = Math.floor(brushSize / 2);
      var t = typeOverride || (eraseMode ? "NORMAL" : tool);
      for (var dr = -half; dr <= half; dr++) {
        for (var dc = -half; dc <= half; dc++) {
          var rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
          if (t === "GOAL") { d.goal = [rr, cc]; if (d.grid[rr][cc] === "WALL") d.grid[rr][cc] = "NORMAL"; }
          else if (t === "START") { d.start = [rr, cc]; if (d.grid[rr][cc] === "WALL") d.grid[rr][cc] = "NORMAL"; }
          else { d.grid[rr][cc] = t; }
        }
      }
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
          ctx.fillStyle = t === "CUSTOM" && customValuesCache && customValuesCache.terrain ? "rgb(" + customValuesCache.terrain.color.join(",") + ")" : meta.color;
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
        verdict.treasuresReachable + "/" + verdict.treasuresTotal + " treasures reachable" +
        (verdict.treasuresReachable < verdict.treasuresTotal ? " ✗" : (verdict.treasuresTotal > 0 ? " ✓" : ""));
      refs.verdictLine.className = "small " + (verdict.goalReachable && verdict.treasuresReachable === verdict.treasuresTotal ? "verdict-good-text" : "verdict-bad-text");
    }

    var customValuesCache = null;
    function loadCustomTerrainColor() {
      if (!customTerrainAvailable()) { customValuesCache = null; return; }
      ensurePyodide().then(function (py) {
        return py.runPythonAsync(traceHarness_customValues(state.steps["10"].code, state.steps["11"].code));
      }).then(function (json) {
        var data = JSON.parse(json);
        if (data.ok) { customValuesCache = data; draw(); renderPalette(); }
      }).catch(function () {});
    }

    function renderPalette() {
      if (!refs) return;
      refs.palette.innerHTML = "";
      paletteTypes().forEach(function (t) {
        var meta = TILE_META[t] || TILE_META.NORMAL;
        var color = t === "CUSTOM" && customValuesCache && customValuesCache.terrain ? "rgb(" + customValuesCache.terrain.color.join(",") + ")" : meta.color;
        var label = t === "CUSTOM" && customValuesCache && customValuesCache.terrain ? customValuesCache.terrain.name : meta.label;
        var swatch = el("button", {
          class: "map-palette-item" + (tool === t && !eraseMode ? " is-active" : ""),
          type: "button",
          title: label + " — " + (t === "CUSTOM" ? "route weight " + (customValuesCache && customValuesCache.terrain ? customValuesCache.terrain.weight : 0) : meta.desc),
          onclick: function () { tool = t; eraseMode = false; renderPalette(); },
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
      var code = ta ? ta.value : (state.steps["8"].code || "");
      var parsed = parseRoundConfigsSource(code);
      var derived = derivedCountsFromGrid(d.grid, parsed ? parsed[ad.idx] : null, parsed ? parsed[ad.idx] && parsed[ad.idx].time_limit_seconds : null);
      if (!force && parsed && d.lastSyncedDict && !dictsRoughlyEqual(parsed[ad.idx], d.lastSyncedDict)) {
        syncConflict = { parsed: parsed, idx: ad.idx };
        renderConflict();
        return;
      }
      syncConflict = null;
      renderConflict();
      var rounds3 = parsed ? parsed.slice() : [derived, derived, derived];
      rounds3[ad.idx] = derived;
      var newCode = buildRoundConfigsSource(rounds3);
      d.lastSyncedDict = derived;
      writeStep8Code(newCode);
      persist();
    }

    function writeStep8Code(newCode) {
      var ta = document.querySelector("#mainPanel .code-textarea");
      if (ta) {
        ta.value = newCode;
        ta.dispatchEvent(new Event("input"));
      } else {
        state.steps["8"].code = newCode;
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
          var gen = generatePaintedGrid(rows, cols, 1, 3, { swampCount: dict.swamp_count, itemCount: dict.item_count, bombCount: dict.bomb_count });
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

    function refreshSizeInputs() {
      if (!refs) return;
      var d = activeRoundData().round;
      if (!d) return;
      refs.rowsInput.value = d.rows;
      refs.colsInput.value = d.cols;
      refs.seedInput.value = d.seed;
      refs.clusterInput.value = d.clusterSize;
      checkSizeWarning(d.rows, d.cols);
    }

    function checkSizeWarning(rows, cols) {
      if (!refs) return;
      var cellSize = Math.floor(Math.min(MAP_WINDOW_PIXEL_W / cols, MAP_WINDOW_PIXEL_H / rows));
      if (rows < MAP_MIN_SIZE || cols < MAP_MIN_SIZE) {
        refs.sizeWarning.textContent = "Rows and cols must each be at least " + MAP_MIN_SIZE + ".";
        refs.sizeWarning.hidden = false;
      } else if (rows > MAP_MAX_SIZE || cols > MAP_MAX_SIZE) {
        refs.sizeWarning.textContent = "Rows and cols must each be at most " + MAP_MAX_SIZE + " (the fixed game window can't fit more).";
        refs.sizeWarning.hidden = false;
      } else if (cellSize < MAP_MIN_COMFY_CELL) {
        refs.sizeWarning.textContent = "At " + rows + "×" + cols + ", each tile would render at only ~" + cellSize + "px in the game window — quite cramped. Consider a smaller grid.";
        refs.sizeWarning.hidden = false;
      } else {
        refs.sizeWarning.hidden = true;
      }
    }

    function regenerate() {
      var d = activeRoundData().round;
      if (!d) return;
      pushUndo();
      var gen = generatePaintedGrid(d.rows, d.cols, d.seed, d.clusterSize, {});
      d.grid = gen.grid; d.start = gen.start; d.goal = gen.goal;
      draw();
      syncCodeFromPaint(false);
      persist();
    }

    function refreshForRound() {
      var ad = activeRoundData();
      if (!ad.round) {
        var cfg = PLAY_ROUND_CONFIGS[ad.idx];
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
      refreshSizeInputs();
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
      redoStack.push({ grid: cloneGrid(ad.round.grid), start: ad.round.start.slice(), goal: ad.round.goal.slice() });
      ad.round.grid = snap.grid; ad.round.start = snap.start; ad.round.goal = snap.goal;
      draw(); syncCodeFromPaint(false); persist();
    }
    function doRedo() {
      var ad = activeRoundData();
      if (!redoStack.length || !ad.round) return;
      var snap = redoStack.pop();
      undoStack.push({ grid: cloneGrid(ad.round.grid), start: ad.round.start.slice(), goal: ad.round.goal.slice() });
      ad.round.grid = snap.grid; ad.round.start = snap.start; ad.round.goal = snap.goal;
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
      var ad = activeRoundData();
      if (!parsed) { if (refs) refs.parseNotice.textContent = "Couldn't read your ROUND_CONFIGS code right now — showing your last painted map."; return; }
      if (refs) refs.parseNotice.textContent = "";
      if (!ad.round) {
        // not painted yet - let a hand size edit update the size inputs (no conflict possible)
        var dict = parsed[ad.idx];
        if (dict && dict.rows && dict.cols && refs) {
          refs.rowsInput.value = dict.rows; refs.colsInput.value = dict.cols;
          checkSizeWarning(dict.rows, dict.cols);
        }
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
        var tabs = el("div", { class: "viz-controlbar" });
        for (var i = 0; i < 3; i++) {
          (function (idx) {
            tabs.appendChild(el("button", {
              class: "btn btn-small" + (state.mapEditorData.activeRound === idx ? " btn-primary" : ""),
              type: "button", text: "Round " + (idx + 1),
              onclick: function () { state.mapEditorData.activeRound = idx; persist(); refreshForRound(); renderTabsActive(); },
            }));
          })(i);
        }
        container.appendChild(tabs);

        var sizeRow = el("div", { class: "viz-controlbar" }, [
          el("label", { class: "small" }, ["Rows ", el("input", { type: "number", class: "map-size-input", min: String(MAP_MIN_SIZE), max: String(MAP_MAX_SIZE) })]),
          el("label", { class: "small" }, ["Cols ", el("input", { type: "number", class: "map-size-input", min: String(MAP_MIN_SIZE), max: String(MAP_MAX_SIZE) })]),
          el("button", { class: "btn btn-small btn-secondary", type: "button", text: "Apply size" }),
        ]);
        container.appendChild(sizeRow);
        var rowsInput = sizeRow.querySelectorAll(".map-size-input")[0];
        var colsInput = sizeRow.querySelectorAll(".map-size-input")[1];
        var sizeWarning = el("div", { class: "small verdict-bad-text", hidden: "hidden" });
        container.appendChild(sizeWarning);

        var genRow = el("div", { class: "viz-controlbar" }, [
          el("label", { class: "small" }, ["Cluster size ", el("input", { type: "range", min: "1", max: "6", class: "map-cluster-input" })]),
          el("label", { class: "small" }, ["Seed ", el("input", { type: "number", class: "map-seed-input", style: "width:80px" })]),
          el("button", { class: "btn btn-small btn-primary", type: "button", text: "Generate" }),
        ]);
        container.appendChild(genRow);
        var clusterInput = genRow.querySelector(".map-cluster-input");
        var seedInput = genRow.querySelector(".map-seed-input");
        var generateBtn = genRow.querySelectorAll("button")[0];

        var palette = el("div", { class: "map-palette" });
        container.appendChild(el("div", { class: "sidebar-group-title", text: "Palette (click to select, then paint the board)" }));
        container.appendChild(palette);

        var brushRow = el("div", { class: "viz-controlbar" });
        [1, 2, 3].forEach(function (n) {
          brushRow.appendChild(el("button", { class: "btn btn-small", type: "button", text: "Brush " + n, onclick: function () { brushSize = n; renderBrushActive(); } }));
        });
        var undoBtn = el("button", { class: "btn btn-small", type: "button", text: "Undo", onclick: doUndo });
        var redoBtn = el("button", { class: "btn btn-small", type: "button", text: "Redo", onclick: doRedo });
        brushRow.appendChild(undoBtn); brushRow.appendChild(redoBtn);
        container.appendChild(brushRow);

        container.appendChild(el("p", { class: "small muted", text: "Keyboard: click the board, then Arrow keys + Enter to paint. Right-click (or the Eraser tool) reverts a tile to floor." }));
        var boardWrap = el("div", { class: "viz-board-wrap" });
        container.appendChild(boardWrap);
        var verdictLine = el("div", { class: "small mt-8" });
        container.appendChild(verdictLine);
        var parseNotice = el("div", { class: "small muted mt-8" });
        container.appendChild(parseNotice);
        var conflictBox = el("div", { class: "viz-verdict verdict-info", hidden: "hidden" });
        container.appendChild(conflictBox);
        container.appendChild(el("p", { class: "small muted mt-8", text: "Once TODO 8 is complete, this round uses your painted map in the Play tab instead of a randomly-generated one." }));

        refs = {
          container: container, boardWrap: boardWrap, palette: palette,
          rowsInput: rowsInput, colsInput: colsInput, sizeWarning: sizeWarning,
          clusterInput: clusterInput, seedInput: seedInput, verdictLine: verdictLine,
          parseNotice: parseNotice, conflictBox: conflictBox, canvas: null, ctx: null,
        };

        function applySize() {
          var d = activeRoundData().round;
          var rows = clampInt(rowsInput.value, MAP_MIN_SIZE, MAP_MAX_SIZE, d ? d.rows : 11);
          var cols = clampInt(colsInput.value, MAP_MIN_SIZE, MAP_MAX_SIZE, d ? d.cols : 15);
          pushUndo();
          var gen = generatePaintedGrid(rows, cols, d ? d.seed : 1, d ? d.clusterSize : 3, {});
          state.mapEditorData.rounds[activeRoundData().idx] = { rows: rows, cols: cols, seed: d ? d.seed : 1, clusterSize: d ? d.clusterSize : 3, grid: gen.grid, start: gen.start, goal: gen.goal, lastSyncedDict: null };
          persist();
          refreshForRound();
        }
        sizeRow.querySelector("button").addEventListener("click", applySize);
        clusterInput.addEventListener("change", function () {
          var d = activeRoundData().round;
          if (d) { d.clusterSize = Number(clusterInput.value); persist(); }
        });
        seedInput.addEventListener("change", function () {
          var d = activeRoundData().round;
          if (d) { d.seed = Number(seedInput.value) || 1; persist(); }
        });
        generateBtn.addEventListener("click", regenerate);

        function renderTabsActive() {
          Array.prototype.forEach.call(tabs.querySelectorAll("button"), function (btn, idx) {
            btn.className = "btn btn-small" + (state.mapEditorData.activeRound === idx ? " btn-primary" : "");
          });
        }
        function renderBrushActive() {
          Array.prototype.forEach.call(brushRow.querySelectorAll("button"), function (btn) {
            btn.classList.toggle("btn-primary", btn.textContent === "Brush " + brushSize);
          });
        }
        renderBrushActive();

        debouncedTextSync = debounce(onHandEdit, 500);
        attachTextSync();
        loadCustomTerrainColor();
        refreshForRound();
      },
      show: function () { attachTextSync(); refreshForRound(); },
      update: function () { attachTextSync(); refreshForRound(); },
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

  var ASSET_SLOTS = [
    { key: "PLAYER_IMAGE_PATH", kind: "image", partIndex: 0, label: "Player sprite" },
    { key: "GOAL_IMAGE_PATH", kind: "image", partIndex: 0, label: "Goal sprite" },
    { key: "SWAMP_IMAGE_PATH", kind: "image", partIndex: 0, label: "Swamp terrain" },
    { key: "ITEM_IMAGE_PATH", kind: "image", partIndex: 0, label: "Treasure item" },
    { key: "BOMB_IMAGE_PATH", kind: "image", partIndex: 0, label: "Bomb" },
    { key: "FLOOR_TILE_IMAGE_PATH", kind: "image", partIndex: 0, label: "Floor tile" },
    { key: "MONSTER_IMAGE_PATH", kind: "image", partIndex: 0, label: "Monster" },
    { key: "SWAMP_SOUND_PATH", kind: "sound", partIndex: 1, label: "Swamp step sound" },
    { key: "ITEM_SOUND_PATH", kind: "sound", partIndex: 1, label: "Item pickup sound" },
    { key: "BOMB_SOUND_PATH", kind: "sound", partIndex: 1, label: "Bomb explosion sound" },
    { key: "BACKGROUND_MUSIC_PATH", kind: "sound", partIndex: 1, label: "Background music" },
  ];
  var IMAGE_EXT_OK = ["png", "jpg", "jpeg", "gif", "webp"];
  var SOUND_EXT_OK = ["wav", "mp3", "ogg"];
  var IDB_NAME = "dijkstraMazeAssets", IDB_STORE = "handles", IDB_DIR_KEY = "projectDir";

  function parseAssetPaths(code0, code1) {
    var out = {};
    var re = /([A-Z_]+)\s*=\s*(None|"[^"]*"|'[^']*')/g;
    [code0 || "", code1 || ""].forEach(function (text) {
      var m;
      while ((m = re.exec(text))) {
        var raw = m[2];
        out[m[1]] = raw === "None" ? null : raw.slice(1, -1);
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
      var code = state.steps["9"].code;
      return parseAssetPaths(code[0], code[1]);
    }

    function writeAssetSlot(slot, valueLiteral) {
      var textareas = document.querySelectorAll("#mainPanel .code-textarea");
      var ta = textareas[slot.partIndex];
      var code = ta ? ta.value : state.steps["9"].code[slot.partIndex];
      var re = new RegExp("(" + slot.key + "\\s*=\\s*)(None|\"[^\"]*\"|'[^']*')");
      var newCode = re.test(code) ? code.replace(re, "$1" + valueLiteral) : (code + "\n" + slot.key + " = " + valueLiteral);
      if (ta) { ta.value = newCode; ta.dispatchEvent(new Event("input")); }
      else { state.steps["9"].code[slot.partIndex] = newCode; persist(); }
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
  // touches game logic (movement, maze generation, swamp placement,
  // scoring, the Dijkstra hint) runs the student's ACTUAL current code
  // through Pyodide, exactly like the Step-view visualizers above - nothing
  // here is faked either.

  var PLAY_ROUND_CONFIGS = [
    { rows: 11, cols: 15, cellSize: 30, extraOpenWalls: 5, itemCount: 8, swampCount: 3, bombCount: 2, customItemCount: 2, customTerrainCount: 2, monsterCount: 1, timeLimitSeconds: 70 },
    { rows: 15, cols: 21, cellSize: 24, extraOpenWalls: 6, itemCount: 10, swampCount: 5, bombCount: 4, customItemCount: 3, customTerrainCount: 3, monsterCount: 1, timeLimitSeconds: 55 },
    { rows: 17, cols: 25, cellSize: 20, extraOpenWalls: 8, itemCount: 12, swampCount: 7, bombCount: 6, customItemCount: 4, customTerrainCount: 4, monsterCount: 2, timeLimitSeconds: 45 },
  ];
  var PLAY_ITEM_SCORE = 100;
  var PLAY_SWAMP_PENALTY = 100;
  var PLAY_BOMB_PENALTY = 150;
  var PLAY_MONSTER_PENALTY = 60;
  var PLAY_MOVE_DELAY_MS = 100;

  var PlayEngine = (function () {
    var refs = null;
    var roundIndex = 0;
    var maze = null, terrain = null, rows = 0, cols = 0, cellSize = 0;
    var player = { row: 0, col: 0 };
    var playerStart = { row: 0, col: 0 };
    var goal = { row: 0, col: 0 };
    var items = [], bombs = [], monsters = [];
    var score = 0, timeLeft = 0, timerId = null;
    var running = false;
    var soundOn = false;
    var customValues = null;
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
        swampPlacement: isDoneExact("5"),
        scoring: isDoneExact("6") && isDoneExact("7"),
        hint: isDoneExact("5"),
        mapEditor: isDoneExact("8"),
        assets: isDoneExact("9"),
        customItem: isDoneExact("10"),
        customTerrain: isDoneExact("11"),
        monsterTuning: isDoneExact("12"),
        monsterFsm: isDoneExact("13"),
        monsterChase: isDoneExact("13") && isDoneExact("14"),
        rules: isDoneExact("15"),
      };
    }
    function allRequiredCompleteExact() { return REQUIRED_ORDER.every(isDoneExact); }

    function emptyWalledGrid(r, c) {
      var g = [];
      for (var i = 0; i < r; i++) {
        var row = [];
        for (var j = 0; j < c; j++) row.push({ top: true, right: true, bottom: true, left: true });
        g.push(row);
      }
      return g;
    }
    function blankTerrain(r, c) {
      var g = [];
      for (var i = 0; i < r; i++) { var row = []; for (var j = 0; j < c; j++) row.push("NORMAL"); g.push(row); }
      return g;
    }

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

    // Monster wander/catch (Bonus feature, simplified for the browser
    // preview): this is a plain JS random-walk each tick, standing in for
    // monster.py's given patrol_step - the real, graded FSM/CHASE-toward-
    // player behaviour (TODO 13/14) only runs inside the actual pygame
    // project, not in this in-browser mini preview. Disclosed scope cut.
    function openNeighborsFor(r, c) {
      var cell = maze[r][c];
      var out = [];
      if (!cell.top && r - 1 >= 0) out.push([r - 1, c]);
      if (!cell.right && c + 1 < cols) out.push([r, c + 1]);
      if (!cell.bottom && r + 1 < rows) out.push([r + 1, c]);
      if (!cell.left && c - 1 >= 0) out.push([r, c - 1]);
      return out;
    }

    function wanderMonsters() {
      monsters.forEach(function (m) {
        var nbrs = openNeighborsFor(m.row, m.col);
        if (nbrs.length) {
          var pick = nbrs[Math.floor(Math.random() * nbrs.length)];
          m.row = pick[0]; m.col = pick[1];
        }
      });
    }

    function checkMonsterCatch() {
      var caught = monsters.some(function (m) { return m.row === player.row && m.col === player.col; });
      if (caught) {
        player.row = playerStart.row; player.col = playerStart.col;
        score -= PLAY_MONSTER_PENALTY;
        statusLine("The monster caught you! -" + PLAY_MONSTER_PENALTY + ", back to start.", true);
        updateStatusGrid();
        draw();
      }
      return caught;
    }

    function statusLine(text, isError) {
      if (!refs) return;
      refs.notice.hidden = !text;
      refs.notice.textContent = text || "";
      refs.notice.className = "play-broken-notice" + (isError ? " status-bad" : "");
    }

    function refreshChecklist() {
      if (!refs) return;
      var caps = capabilities();
      var items2 = [
        ["title", "Title screen shows your title (TODO 1)"],
        ["movement", "Player moves & respects walls (TODO 2/3/4)"],
        ["swampPlacement", "Swamps placed along shortest path (TODO 5)"],
        ["scoring", "Treasure/swamp scoring (TODO 6/7)"],
        ["hint", "Dijkstra hint route (unlocks with TODO 5)"],
        ["mapEditor", "Your painted rounds are used instead of random generation (TODO 8)"],
        ["assets", "Your chosen images/sounds are used (TODO 9)"],
        ["customItem", "Custom item(s) (TODO 10)"],
        ["customTerrain", "Custom terrain (TODO 11)"],
        ["monsterTuning", "Monster constants tuned (TODO 12)"],
        ["monsterFsm", "Monster FSM (PATROL/CHASE/ATTACK) (TODO 13)"],
        ["monsterChase", "Monster chases the player (TODO 13+14)"],
        ["rules", "Your game's rules (TODO 15, capstone)"],
      ];
      refs.checklist.innerHTML = "";
      items2.forEach(function (pair) {
        var on = caps[pair[0]];
        refs.checklist.appendChild(el("li", { class: on ? "on" : "" }, [el("span", { class: "dot" }), pair[1]]));
      });
      refs.liveBanner.hidden = !allRequiredCompleteExact();
    }

    function startRound(index) {
      roundIndex = index;
      var cfg = PLAY_ROUND_CONFIGS[roundIndex];
      var caps = capabilities();
      score = 0;
      hintPath = [];
      running = false;

      // A completed TODO 7 with a painted layout for this round REPLACES
      // procedural DFS generation entirely - no Pyodide maze-gen call at
      // all, the student's own hand-painted map is the round.
      if (caps.mapEditor && state.mapEditorData.rounds[index]) {
        var painted = state.mapEditorData.rounds[index];
        rows = painted.rows; cols = painted.cols;
        var pw = fitWidth(refs ? refs.container : document.body, 380);
        cellSize = Math.max(6, Math.floor(pw / cols));
        maze = paintedGridToWallGrid(painted.grid);
        terrain = paintedTerrainGrid(painted.grid);
        var extracted = paintedItemsAndBombs(painted.grid);
        items = extracted.items.map(function (p) { return { row: p[0], col: p[1], active: true, kind: "treasure" }; });
        bombs = extracted.bombs.map(function (p) { return { row: p[0], col: p[1], active: true }; });
        monsters = extracted.monsters.map(function (p) { return { row: p[0], col: p[1] }; });
        player = { row: painted.start[0], col: painted.start[1] };
        playerStart = { row: painted.start[0], col: painted.start[1] };
        goal = { row: painted.goal[0], col: painted.goal[1] };
        timeLeft = cfg.timeLimitSeconds;
        statusLine("Using your hand-painted map for this round (TODO 8).");
        renderAll();
        return;
      }

      rows = cfg.rows; cols = cfg.cols;
      var width = fitWidth(refs ? refs.container : document.body, 380);
      cellSize = Math.max(8, Math.min(cfg.cellSize, Math.floor(width / cols)));
      player = { row: 0, col: 0 };
      playerStart = { row: 0, col: 0 };
      goal = { row: rows - 1, col: cols - 1 };
      items = []; bombs = []; monsters = [];
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
      terrain = blankTerrain(rows, cols);

      var forbidden = {}; forbidden[player.row + "," + player.col] = true; forbidden[goal.row + "," + goal.col] = true;

      function placeSwamps() {
        if (!caps.swampPlacement) {
          placeRandom(rng, forbidden, cfg.swampCount).forEach(function (p) { terrain[p[0]][p[1]] = "SWAMP"; });
          statusLine("Swamps placed randomly — finish TODO 5 to place them along the shortest path instead.");
          afterSwamps();
          return;
        }
        var c5 = state.steps["5"].code;
        ensurePyodide().then(function (py) {
          return py.runPythonAsync(traceHarness_swampPlacement(c5[0], c5[1], maze, [player.row, player.col], [goal.row, goal.col], cfg.swampCount));
        }).then(function (json2) {
          var d2 = JSON.parse(json2);
          if (d2.ok && d2.swamp_on_path) {
            d2.swamp_cells.forEach(function (p) { var key = p[0] + "," + p[1]; if (!forbidden[key]) { terrain[p[0]][p[1]] = "SWAMP"; forbidden[key] = true; } });
            statusLine("");
          } else {
            placeRandom(rng, forbidden, cfg.swampCount).forEach(function (p) { terrain[p[0]][p[1]] = "SWAMP"; });
            statusLine("TODO 5 isn't reconstructing a route yet, so swamps were placed randomly this round.");
          }
          afterSwamps();
        }).catch(function (err) {
          placeRandom(rng, forbidden, cfg.swampCount).forEach(function (p) { terrain[p[0]][p[1]] = "SWAMP"; });
          statusLine("Could not run TODO 5: " + (err && err.message ? err.message : err), true);
          afterSwamps();
        });
      }

      function afterSwamps() {
        if (caps.customTerrain) {
          placeRandom(rng, forbidden, cfg.customTerrainCount).forEach(function (p) { terrain[p[0]][p[1]] = "CUSTOM"; });
        }
        var treasureSpots = placeRandom(rng, forbidden, cfg.itemCount);
        items = treasureSpots.map(function (p) { return { row: p[0], col: p[1], active: true, kind: "treasure" }; });
        if (caps.customItem) {
          placeRandom(rng, forbidden, cfg.customItemCount).forEach(function (p) { items.push({ row: p[0], col: p[1], active: true, kind: "custom" }); });
        }
        bombs = placeRandom(rng, forbidden, cfg.bombCount).map(function (p) { return { row: p[0], col: p[1], active: true }; });
        // Monsters always spawn (same as bombs) - this mirrors game.py, where
        // Monster objects exist every round regardless of TODO completion;
        // an unfinished FSM/chase TODO just leaves them wandering forever.
        monsters = placeRandom(rng, forbidden, cfg.monsterCount).map(function (p) { return { row: p[0], col: p[1] }; });
        renderAll();
      }

      placeSwamps();
    }

    function terrainColorFor(r, c) {
      var t = terrain[r][c];
      if (t === "SWAMP") return "rgba(134,180,146,0.45)";
      if (t === "CUSTOM" && customValues && customValues.terrain) return "rgba(" + customValues.terrain.color.join(",") + ",0.45)";
      return null;
    }

    function draw() {
      if (!refs || !maze) return;
      var ctx = refs.ctx;
      ctx.clearRect(0, 0, refs.canvas.width, refs.canvas.height);
      ctx.fillStyle = "#12100c";
      ctx.fillRect(0, 0, refs.canvas.width, refs.canvas.height);
      var hintSet = {};
      hintPath.forEach(function (p) { hintSet[p[0] + "," + p[1]] = true; });
      drawMazeGrid(ctx, maze, cellSize, function (r, c) {
        var key = r + "," + c;
        if (hintSet[key]) return "rgba(139,92,246,0.35)";
        return terrainColorFor(r, c);
      }, { wallColor: "#e8dcc4" });
      // bombs
      ctx.fillStyle = "#1c1a17";
      bombs.forEach(function (b) {
        if (!b.active) return;
        ctx.beginPath(); ctx.arc((b.col + 0.5) * cellSize, (b.row + 0.5) * cellSize, cellSize * 0.24, 0, Math.PI * 2); ctx.fill();
      });
      // items
      items.forEach(function (it) {
        if (!it.active) return;
        if (it.kind === "custom" && customValues && customValues.item) ctx.fillStyle = "rgb(" + customValues.item.color.join(",") + ")";
        else ctx.fillStyle = "#22c55e";
        ctx.beginPath(); ctx.arc((it.col + 0.5) * cellSize, (it.row + 0.5) * cellSize, cellSize * 0.18, 0, Math.PI * 2); ctx.fill();
      });
      // monsters (Bonus) - simple triangle marker, same shape as monster.py's fallback draw
      ctx.fillStyle = "#be1e3c";
      monsters.forEach(function (m) {
        var cx = (m.col + 0.5) * cellSize, top = m.row * cellSize + cellSize * 0.2, bottom = m.row * cellSize + cellSize * 0.8;
        ctx.beginPath();
        ctx.moveTo(cx, top);
        ctx.lineTo(cx + cellSize * 0.28, bottom);
        ctx.lineTo(cx - cellSize * 0.28, bottom);
        ctx.closePath();
        ctx.fill();
      });
      // goal
      ctx.fillStyle = "#f0c04a";
      ctx.beginPath(); ctx.arc((goal.col + 0.5) * cellSize, (goal.row + 0.5) * cellSize, cellSize * 0.26, 0, Math.PI * 2); ctx.fill();
      // player
      ctx.fillStyle = "#4fa3e3";
      ctx.beginPath(); ctx.arc((player.col + 0.5) * cellSize, (player.row + 0.5) * cellSize, cellSize * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#0e0d0a"; ctx.lineWidth = 2; ctx.stroke();
    }

    function updateStatusGrid() {
      if (!refs) return;
      refs.scoreEl.textContent = String(score);
      refs.timeEl.textContent = String(timeLeft) + "s";
      refs.roundEl.textContent = (roundIndex + 1) + " / " + PLAY_ROUND_CONFIGS.length;
      var t = terrain ? terrain[player.row][player.col] : "NORMAL";
      refs.terrainEl.textContent = t;
    }

    function renderAll() { draw(); updateStatusGrid(); refreshChecklist(); }

    function tickTimer() {
      if (!running) return;
      timeLeft--;
      wanderMonsters();
      draw();
      if (!checkMonsterCatch()) updateStatusGrid();
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
      pickup: "assets/sounds/pickup_1.wav",
      swamp: "assets/sounds/squish_1.wav",
      bomb: "assets/sounds/explosion_1.wav",
    };

    function checkTileEffects() {
      if (checkMonsterCatch()) return;
      var caps = capabilities();
      var here = terrain[player.row][player.col];
      var landedItemIdx = -1;
      for (var i = 0; i < items.length; i++) {
        if (items[i].active && items[i].row === player.row && items[i].col === player.col) { landedItemIdx = i; break; }
      }
      if (landedItemIdx !== -1) {
        var it = items[landedItemIdx];
        it.active = false;
        if (it.kind === "custom") {
          if (caps.customItem && customValues && customValues.item) {
            score += customValues.item.score;
            statusLine("Collected " + customValues.item.name + "! +" + customValues.item.score);
          }
          playAudio("pickup");
          updateStatusGrid();
        } else if (caps.scoring) {
          ensurePyodide().then(function (py) {
            return py.runPythonAsync(traceHarness_scoreDelta(state.steps["6"].code, "ITEM_SCORE", PLAY_ITEM_SCORE, score));
          }).then(function (json) {
            var d = JSON.parse(json);
            if (d.ok) score = d.score;
            playAudio("pickup");
            updateStatusGrid();
          });
        } else {
          statusLine("Collected a treasure, but TODO 6 isn't finished yet, so it's worth nothing.");
        }
      }
      bombs.forEach(function (b) {
        if (b.active && b.row === player.row && b.col === player.col) {
          b.active = false;
          score -= PLAY_BOMB_PENALTY;
          playAudio("bomb");
          statusLine("Boom! -" + PLAY_BOMB_PENALTY);
          updateStatusGrid();
        }
      });
      if (here === "SWAMP") {
        terrain[player.row][player.col] = "NORMAL";
        if (caps.scoring) {
          ensurePyodide().then(function (py) {
            return py.runPythonAsync(traceHarness_scoreDelta(state.steps["7"].code, "SWAMP_SCORE_PENALTY", PLAY_SWAMP_PENALTY, score));
          }).then(function (json) {
            var d = JSON.parse(json);
            if (d.ok) score = d.score;
            playAudio("swamp");
            updateStatusGrid();
          });
        } else {
          statusLine("Stepped in a swamp, but TODO 7 isn't finished yet, so no penalty applied.");
        }
      } else if (here === "CUSTOM" && caps.customTerrain && customValues && customValues.terrain) {
        terrain[player.row][player.col] = "NORMAL";
        score += customValues.terrain.change;
        statusLine("Stepped on " + customValues.terrain.name + " (" + (customValues.terrain.change >= 0 ? "+" : "") + customValues.terrain.change + ")");
        updateStatusGrid();
      }
      if (player.row === goal.row && player.col === goal.col) {
        running = false;
        clearInterval(timerId); timerId = null;
        setControlsRunning(false);
        if (!capabilities().scoring || score > 0) {
          if (roundIndex + 1 < PLAY_ROUND_CONFIGS.length) {
            statusLine("Round " + (roundIndex + 1) + " clear! Starting round " + (roundIndex + 2) + "…");
            setTimeout(function () { startRound(roundIndex + 1); }, prefersReducedMotion() ? 0 : 900);
          } else {
            statusLine("You reached the goal in the final round with a winning score — nice work!");
          }
        } else {
          statusLine("You reached the goal, but your score (" + score + ") isn't above 0 — press Restart to try again.", true);
        }
      }
    }

    var KEY_TO_KEYNAME = {
      ArrowLeft: "K_LEFT", a: "K_a", A: "K_a",
      ArrowRight: "K_RIGHT", d: "K_d", D: "K_d",
      ArrowUp: "K_UP", w: "K_w", W: "K_w",
      ArrowDown: "K_DOWN", s: "K_s", S: "K_s",
    };

    function onKeydown(e) {
      var keyname = KEY_TO_KEYNAME[e.key];
      if (!keyname) return;
      e.preventDefault();
      if (!running) return;
      var caps = capabilities();
      if (!caps.movement) { statusLine("Finish TODO 2, 3 and 4 to make the player move."); return; }
      var now = performance.now();
      if (busyMove || now - lastMoveAt < PLAY_MOVE_DELAY_MS) return;
      busyMove = true;
      var codes = { c21: state.steps["2"].code, c22: state.steps["3"].code, c23: state.steps["4"].code };
      ensurePyodide().then(function (py) {
        var src = traceHarness_playerMove(codes.c21, codes.c22, codes.c23, maze, keyname, player.row, player.col);
        return py.runPythonAsync(src);
      }).then(function (json) {
        busyMove = false;
        lastMoveAt = performance.now();
        var data = JSON.parse(json);
        if (!data.ok) { statusLine("Your movement code raised an error: " + data.error, true); return; }
        player.row = data.row; player.col = data.col;
        draw();
        checkTileEffects();
      }).catch(function () { busyMove = false; });
    }

    function onHint() {
      var caps = capabilities();
      if (!caps.hint) return;
      var weightsByTerrain = { NORMAL: 0, SWAMP: 100, CUSTOM: (customValues && customValues.terrain ? customValues.terrain.weight : 0) };
      ensurePyodide().then(function (py) {
        var c5 = state.steps["5"].code;
        return py.runPythonAsync(traceHarness_dijkstraOnMaze(c5[0], c5[1], maze, weightsByTerrain, terrain, [player.row, player.col], [goal.row, goal.col]));
      }).then(function (json) {
        var d = JSON.parse(json);
        if (d.ok && d.path && d.path.length) {
          hintPath = d.path;
          draw();
          if (hintTimeout) clearTimeout(hintTimeout);
          hintTimeout = setTimeout(function () { hintPath = []; draw(); }, 4000);
        } else {
          statusLine("Could not compute a hint route right now.", true);
        }
      });
    }

    function loadCustomValues() {
      ensurePyodide().then(function (py) {
        return py.runPythonAsync(traceHarness_customValues(state.steps["10"].code, state.steps["11"].code));
      }).then(function (json) {
        var d = JSON.parse(json);
        if (d.ok) { customValues = { item: d.item, terrain: d.terrain }; draw(); }
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
        var made = makeCanvas(360, 260);
        made.canvas.tabIndex = 0;
        made.canvas.className = "viz-canvas viz-canvas-focusable";
        made.canvas.setAttribute("aria-label", "Maze game board — click then use arrow keys or WASD");
        boardWrap.appendChild(made.canvas);
        frame.appendChild(boardWrap);
        var notice = el("div", { class: "play-broken-notice", hidden: "hidden" });
        frame.appendChild(notice);
        var statusGrid = el("div", { class: "play-status-grid" });
        var scoreItem = el("div", { class: "play-status-item" }, [el("span", { class: "value", text: "0" }), el("span", { class: "label", text: "Score" })]);
        var timeItem = el("div", { class: "play-status-item" }, [el("span", { class: "value", text: "0s" }), el("span", { class: "label", text: "Time" })]);
        var roundItem = el("div", { class: "play-status-item" }, [el("span", { class: "value", text: "1/3" }), el("span", { class: "label", text: "Round" })]);
        var terrainItem = el("div", { class: "play-status-item" }, [el("span", { class: "value", text: "NORMAL" }), el("span", { class: "label", text: "Terrain" })]);
        statusGrid.appendChild(scoreItem); statusGrid.appendChild(timeItem); statusGrid.appendChild(roundItem); statusGrid.appendChild(terrainItem);
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
          playBtn: playBtn, pauseBtn: pauseBtn, notice: notice,
          scoreEl: scoreItem.querySelector(".value"), timeEl: timeItem.querySelector(".value"),
          roundEl: roundItem.querySelector(".value"), terrainEl: terrainItem.querySelector(".value"),
          checklist: checklist, liveBanner: liveBanner, titleBox: titleBox, hintBtn: hintBtn,
        };

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
        loadCustomValues();
        startRound(0);
      },
      refresh: function () {
        if (!mounted) return;
        refreshTitleCard();
        loadCustomValues();
        refreshChecklist();
      },
      unmount: function () {
        if (timerId) clearInterval(timerId);
        if (hintTimeout) clearTimeout(hintTimeout);
        if (refs && refs.canvas) refs.canvas.removeEventListener("keydown", onKeydown);
        mounted = false; refs = null;
      },
      // Exposed read-only, purely for display purposes outside PlayEngine
      // (the kiosk header uses this to decide when to de-emphasize the
      // capability checklist) - the exact same completion test the
      // "YOUR GAME IS LIVE" banner already uses, not a new one.
      allRequiredCompleteExact: function () { return allRequiredCompleteExact(); },
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
      "    except Exception as e:",
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

  function exportMarkersForFile(fileName) {
    return EXPORT_DATA.EXPORT_MARKERS.filter(function (m) { return m[1] === fileName; });
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
      var label = "TODO " + m[0] + (m[2] != null ? " (part " + (m[2] + 1) + "/2)" : "");
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

  var EXPORT_TODO_FILES = ["settings.py", "game.py", "player.py", "maze.py", "pathfinding.py", "monster.py"];

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
      if (st !== "completed") unfinished.push({ id: id, file: STEP_BY_ID[id].file, status: st === "skipped" ? "skipped" : "not attempted yet" });
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
            unfinishedForFile.push("TODO " + m[0] + (m[2] != null ? " (part " + (m[2] + 1) + "/2)" : "") + " - " + (st === "skipped" ? "skipped" : "not attempted yet"));
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
    box.appendChild(el("div", { class: "modal-message", text: summary.summaryText }));
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
    $("#themeToggle").addEventListener("click", toggleTheme);
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
  // "Play in new window" opens this SAME page in a small separate window
  // with ?mode=play in the URL. On load, if that flag is present, we skip
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

  // Once the game is actually fully playable, a homework checklist
  // shouldn't be the first thing another student sees - de-emphasize it in
  // favor of leading with the title screen and the game itself. Reuses
  // PlayEngine's own "YOUR GAME IS LIVE" completion test (exposed above)
  // rather than inventing a second definition of "done". Purely a kiosk-
  // view CSS toggle - the normal in-page Play tab's checklist is untouched.
  function refreshKioskCompletionChrome() {
    var complete = typeof PlayEngine.allRequiredCompleteExact === "function" && PlayEngine.allRequiredCompleteExact();
    document.body.classList.toggle("kiosk-required-complete", !!complete);
  }

  function refreshKioskChrome() {
    refreshKioskTitle();
    refreshKioskCompletionChrome();
  }

  function initKioskFullscreenButton() {
    var btn = $("#kioskFullscreenBtn");
    var root = $("#kioskRoot");
    if (!btn || !root) return;
    var ENTER_ICON = btn.innerHTML;
    var EXIT_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v4a1 1 0 0 1-1 1H4M15 3v4a1 1 0 0 0 1 1h4M9 21v-4a1 1 0 0 0-1-1H4M15 21v-4a1 1 0 0 1 1-1h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    function isFs() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
    function updateIcon() {
      var fs = isFs();
      btn.innerHTML = fs ? EXIT_ICON : ENTER_ICON;
      var label = fs ? "Exit fullscreen" : "Enter fullscreen";
      btn.title = label;
      btn.setAttribute("aria-label", label);
    }
    btn.addEventListener("click", function () {
      if (!isFs()) {
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
    PlayEngine.mount(playView);
    refreshKioskChrome();
    initKioskFullscreenButton();
    // No code editor exists in this window to compete for focus, so (unlike
    // the normal Play tab) there's no reason to require an extra click
    // before arrow keys work - focus the board immediately.
    var canvas = playView.querySelector(".viz-canvas");
    if (canvas) canvas.focus();
    // Nice-to-have live sync: if the student keeps this window open and
    // then finishes a TODO / repaints a map / changes custom settings in
    // the main tab, `storage` fires here (it does NOT fire in the tab that
    // made the change, only in other same-origin tabs/windows - exactly
    // what we want). Reload state fresh from localStorage and refresh the
    // capabilities/HUD (and this window's own title/checklist chrome).
    window.addEventListener("storage", function (e) {
      if (e.key && e.key !== LS_PROGRESS_KEY) return;
      state = loadState();
      if (computeStatus(state.currentStepId) === "locked") state.currentStepId = STEPS[0].id;
      PlayEngine.refresh();
      refreshKioskChrome();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
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
    renderAll();
  });
})();
