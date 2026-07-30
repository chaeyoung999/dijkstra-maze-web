# -*- coding: utf-8 -*-
"""Extracts the REAL grading-harness generator functions straight out of
../app.js (regex, not retyped) and runs them for real under cscript (ES3
JScript) with a given student "code" string, producing the exact Python
source text app.js would send to Pyodide for it. That Python source can
then be executed with a real Python interpreter to check the grading
result - this proves the real, shipped harness logic (not a hand
re-typed stand-in) behaves as expected for a given implementation.

Requires: Windows with cscript (part of every Windows install).

Importable as a module: exposes generate_harness_source(fn_name, *args)
which returns the real Python source string app.js would produce for
harness function `fn_name` called with the given student-code string
argument(s).

See test_alt_implementations.py in this same directory for the permanent
regression suite built on top of this (verifies alternate-but-equivalent
implementations are accepted, and genuinely wrong ones are rejected, for
every behaviour-graded TODO).
"""
import re
import subprocess
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP_JS = os.path.join(HERE, "..", "app.js")
with open(APP_JS, encoding="utf-8") as f:
    SRC = f.read()
DATA_JS = os.path.join(HERE, "..", "data.js")
with open(DATA_JS, encoding="utf-8") as f:
    DATA_SRC = f.read()


def extract_const_object(src, name):
    """Extracts `const NAME = { ... };` (a balanced-brace object literal)
    from src, string/comment-aware, reusing the same scanning approach as
    extract_function below."""
    m = re.search(r"const\s+%s\s*=\s*" % re.escape(name), src)
    if not m:
        raise SystemExit("const object not found: %s" % name)
    open_brace = src.index("{", m.end())
    depth = 0
    i = open_brace
    in_s = in_d = in_lc = in_bc = False
    n = len(src)
    while i < n:
        c = src[i]
        nx = src[i + 1] if i + 1 < n else ""
        if in_lc:
            if c == "\n":
                in_lc = False
            i += 1
            continue
        if in_bc:
            if c == "*" and nx == "/":
                in_bc = False
                i += 2
                continue
            i += 1
            continue
        if in_s:
            if c == "\\":
                i += 2
                continue
            if c == "'":
                in_s = False
            i += 1
            continue
        if in_d:
            if c == "\\":
                i += 2
                continue
            if c == '"':
                in_d = False
            i += 1
            continue
        if c == "/" and nx == "/":
            in_lc = True
            i += 2
            continue
        if c == "/" and nx == "*":
            in_bc = True
            i += 2
            continue
        if c == "'":
            in_s = True
            i += 1
            continue
        if c == '"':
            in_d = True
            i += 1
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return src[open_brace:i + 1]
        i += 1
    raise SystemExit("unterminated const object: %s" % name)


def extract_function(name):
    m = re.search(r"function %s\s*\(" % re.escape(name), SRC)
    if not m:
        raise SystemExit("function not found: %s" % name)
    start = m.start()
    open_brace = SRC.index("{", m.end())
    depth = 0
    i = open_brace
    in_s = in_d = in_lc = in_bc = False
    n = len(SRC)
    while i < n:
        c = SRC[i]
        nx = SRC[i + 1] if i + 1 < n else ""
        if in_lc:
            if c == "\n":
                in_lc = False
            i += 1
            continue
        if in_bc:
            if c == "*" and nx == "/":
                in_bc = False
                i += 2
                continue
            i += 1
            continue
        if in_s:
            if c == "\\":
                i += 2
                continue
            if c == "'":
                in_s = False
            i += 1
            continue
        if in_d:
            if c == "\\":
                i += 2
                continue
            if c == '"':
                in_d = False
            i += 1
            continue
        if c == "/" and nx == "/":
            in_lc = True
            i += 2
            continue
        if c == "/" and nx == "*":
            in_bc = True
            i += 2
            continue
        if c == "/":
            j = len(SRC[:i].rstrip())
            prev = SRC[j - 1] if j > 0 else ""
            if prev in "(,=:[!&|?;{" or prev == "":
                k = i + 1
                found_close = False
                while k < n:
                    if SRC[k] == "\\":
                        k += 2
                        continue
                    if SRC[k] == "\n":
                        break
                    if SRC[k] == "/":
                        found_close = True
                        k += 1
                        break
                    k += 1
                if found_close:
                    while k < n and SRC[k].isalpha():
                        k += 1
                    i = k
                    continue
            i += 1
            continue
        if c == "'":
            in_s = True
            i += 1
            continue
        if c == '"':
            in_d = True
            i += 1
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return SRC[start:i + 1]
        i += 1
    raise SystemExit("unterminated function: %s" % name)


def extract_var_line(name):
    """Extracts `var NAME = ...;`, single-line or spanning many lines.

    The multi-line case matters for PY_BONUS_HELPERS / PY_FAKE_PYGAME, which
    are long `[ "...", "..." ].join("\\n");` array literals - so this scans
    for the terminating semicolon at bracket depth 0, string- and
    comment-aware, rather than relying on a single-line regex.
    """
    m = re.search(r"^[ \t]*var %s\s*=" % re.escape(name), SRC, re.M)
    if not m:
        raise SystemExit("var not found: %s" % name)
    start = m.start()
    i = m.end()
    depth = 0
    in_s = in_d = in_lc = in_bc = False
    n = len(SRC)
    while i < n:
        c = SRC[i]
        nx = SRC[i + 1] if i + 1 < n else ""
        if in_lc:
            if c == "\n":
                in_lc = False
            i += 1
            continue
        if in_bc:
            if c == "*" and nx == "/":
                in_bc = False
                i += 2
                continue
            i += 1
            continue
        if in_s:
            if c == "\\":
                i += 2
                continue
            if c == "'":
                in_s = False
            i += 1
            continue
        if in_d:
            if c == "\\":
                i += 2
                continue
            if c == '"':
                in_d = False
            i += 1
            continue
        if c == "/" and nx == "/":
            in_lc = True
            i += 2
            continue
        if c == "/" and nx == "*":
            in_bc = True
            i += 2
            continue
        if c == "'":
            in_s = True
            i += 1
            continue
        if c == '"':
            in_d = True
            i += 1
            continue
        if c in "[({":
            depth += 1
        elif c in "])}":
            depth -= 1
        elif c == ";" and depth == 0:
            return SRC[start:i + 1]
        i += 1
    raise SystemExit("unterminated var: %s" % name)


FUNCS = [
    "toBase64Utf8", "isCommentOnlyLine", "reindentPython", "buildFnSource",
    "buildFnSourceTwoParts", "buildFnSourceParts", "b64Line",
    "harness_movement_2", "harness_guardClause_3", "harness_positionDelta_4",
    "harness_dijkstra_5",
    # The two NEW Required steps. bombCollision_6 needs its own body builder
    # (buildFnSourceBombLoop) because the student's snippet is the body of a
    # `for` loop and contains a `break`, so the loop has to be generated too.
    "buildFnSourceBombLoop",
    "harness_bombCollision_6", "harness_timeLimit_7",
    # Turns KNOWN_ASSETS plus the student's uploads into the list of asset
    # filenames the harnesses treat as "available" (an uploaded picture must
    # not be reported as "not one of the bundled files").
    "availableAssetNames",
    # The four multi-part Bonus harnesses: each mixes settings-block parts
    # with real method-body parts (see app.js section 10).
    "harness_roundDesign_8", "harness_lookAndFeel_9", "harness_customItems_10",
    "harness_gameRules_11",
    # Not a grading harness: the Play tab / step visualiser preview, which
    # runs the student's own movement code for real. Covered by
    # test_trace_harnesses.py.
    "traceHarness_playerMove",
]
# PY_BONUS_HELPERS / PY_FAKE_PYGAME are the shared Python fragments those
# four harnesses splice in (the step budget guard, the settings/body
# runners, and the fake pygame used for sound and timing).
VARS = [
    "PY_PRELUDE", "PY_BONUS_HELPERS", "PY_FAKE_PYGAME",
    "ROUND_CONFIG_KEY_ORDER", "MAX_DESIGNABLE_ROUNDS",
]

# harness_customItems_10 references the module-level KNOWN_ASSETS var (used
# for its lenient optional image/sound path checks) - extracted straight
# from data.js's KNOWN_ASSET_FILES so the regression suite exercises the
# exact real asset list, not a hand-typed stand-in.
_known_assets_obj = extract_const_object(DATA_SRC, "KNOWN_ASSET_FILES")
_known_assets_var_line = "var KNOWN_ASSETS = %s;" % _known_assets_obj

# availableAssetNames() also merges in the student's uploaded files. There are
# no uploads in a grading regression run, so an empty registry is the right
# stand-in - and it pins the behaviour the negative controls depend on: with
# nothing uploaded, only the bundled files count as known.
_uploaded_urls_var_line = "var UPLOADED_URLS = {};"

_pieces = (
    [extract_var_line(v) for v in VARS]
    + [_known_assets_var_line, _uploaded_urls_var_line]
    + [extract_function(f) for f in FUNCS]
)
COMBINED_ES3 = "\n\n".join(_pieces)
COMBINED_ES3 = COMBINED_ES3.replace("const ", "var ")
COMBINED_ES3 = re.sub(r",(\s*\n\s*[}\]])", r"\1", COMBINED_ES3)

_hm2 = [p for p in _pieces if p.startswith("function harness_movement_2")][0]
assert "FakeMaze" in _hm2 and "FakePlayer" in _hm2, "extracted harness_movement_2 doesn't look like the current B1 (outcome-based) rewrite - has app.js changed shape?"

POLYFILLS = r"""
if (!Array.prototype.forEach) { Array.prototype.forEach = function (fn) { for (var i = 0; i < this.length; i++) fn(this[i], i, this); }; }
if (!Array.prototype.map) { Array.prototype.map = function (fn) { var out = []; for (var i = 0; i < this.length; i++) out.push(fn(this[i], i, this)); return out; }; }
if (!String.prototype.trim) { String.prototype.trim = function () { return this.replace(/^\s+|\s+$/g, ""); }; }

function btoa(str) {
  var b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var out = "";
  var i = 0;
  while (i < str.length) {
    var c1 = str.charCodeAt(i++) & 0xff;
    var haveC2 = i < str.length;
    var c2 = haveC2 ? (str.charCodeAt(i++) & 0xff) : 0;
    var haveC3 = i < str.length;
    var c3 = haveC3 ? (str.charCodeAt(i++) & 0xff) : 0;
    var e1 = c1 >> 2;
    var e2 = ((c1 & 3) << 4) | (c2 >> 4);
    var e3 = ((c2 & 15) << 2) | (c3 >> 6);
    var e4 = c3 & 63;
    out += b64chars.charAt(e1) + b64chars.charAt(e2);
    out += haveC2 ? b64chars.charAt(e3) : "=";
    out += haveC3 ? b64chars.charAt(e4) : "=";
  }
  return out;
}
// Full UTF-8 percent-encoder. The browser has this natively; cscript's ES3
// engine does not, and a two-byte-only version silently mangles anything
// above U+07FF - which is every Korean character and every emoji a student
// might type into a string. Handles 1-4 byte sequences and surrogate pairs.
function encodeURIComponent(str) {
  var unreserved = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()";
  function pct(byteVal) {
    var hex = byteVal.toString(16).toUpperCase();
    if (hex.length < 2) hex = "0" + hex;
    return "%" + hex;
  }
  var out = "";
  for (var i = 0; i < str.length; i++) {
    var ch = str.charAt(i);
    var code = str.charCodeAt(i);
    if (unreserved.indexOf(ch) !== -1) {
      out += ch;
      continue;
    }
    // Combine a surrogate pair into one code point before encoding.
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
      var low = str.charCodeAt(i + 1);
      if (low >= 0xDC00 && low <= 0xDFFF) {
        code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
        i++;
      }
    }
    if (code < 0x80) {
      out += pct(code);
    } else if (code < 0x800) {
      out += pct(0xC0 | (code >> 6)) + pct(0x80 | (code & 0x3F));
    } else if (code < 0x10000) {
      out += pct(0xE0 | (code >> 12)) +
             pct(0x80 | ((code >> 6) & 0x3F)) +
             pct(0x80 | (code & 0x3F));
    } else {
      out += pct(0xF0 | (code >> 18)) +
             pct(0x80 | ((code >> 12) & 0x3F)) +
             pct(0x80 | ((code >> 6) & 0x3F)) +
             pct(0x80 | (code & 0x3F));
    }
  }
  return out;
}
// cscript's JScript engine has no built-in JSON object - minimal
// stringify covering what the extracted harnesses actually need
// (strings, numbers, booleans, null, arrays, and plain objects).
var JSON = {
  stringify: function (value) {
    if (value === null || typeof value === "undefined") return "null";
    var t = typeof value;
    if (t === "string") {
      return "\"" + value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n") + "\"";
    }
    if (t === "number" || t === "boolean") return "" + value;
    if (value instanceof Array) {
      var itemsArr = [];
      for (var i = 0; i < value.length; i++) itemsArr.push(JSON.stringify(value[i]));
      return "[" + itemsArr.join(",") + "]";
    }
    if (t === "object") {
      var itemsObj = [];
      for (var key in value) {
        if (value.hasOwnProperty(key)) {
          itemsObj.push(JSON.stringify(key) + ":" + JSON.stringify(value[key]));
        }
      }
      return "{" + itemsObj.join(",") + "}";
    }
    return "null";
  }
};
function unescape(str) {
  var out = "";
  var i = 0;
  while (i < str.length) {
    if (str.charAt(i) === "%" && i + 2 < str.length) {
      out += String.fromCharCode(parseInt(str.substr(i + 1, 2), 16));
      i += 3;
    } else {
      out += str.charAt(i);
      i++;
    }
  }
  return out;
}
"""

SCRIPT_TEMPLATE = r"""
var window = this;
__POLYFILLS__

__COMBINED__

var fso = new ActiveXObject("Scripting.FileSystemObject");
var f = fso.CreateTextFile("__OUTFILE__", true, true);
f.WriteLine(__CALL__);
f.Close();
"""


def _js_string_literal(s):
    """JScript-safe double-quoted string literal for a Python source blob."""
    out = s.replace("\\", "\\\\").replace('"', '\\"')
    out = out.replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "\\n")
    return '"' + out + '"'


def generate_harness_source(fn_name, *code_args):
    """Calls the REAL, extracted app.js harness generator fn_name with the
    given student-code string argument(s) and returns the exact Python
    source text app.js would hand to Pyodide."""
    args_js = ", ".join(_js_string_literal(a) for a in code_args)
    return generate_call_source(fn_name, args_js)


def generate_call_source(fn_name, args_js):
    """Same, but the caller supplies the argument list as raw JS source -
    needed for the trace harnesses, whose arguments include maze grids,
    numbers and option objects rather than only code strings."""
    call = "%s(%s)" % (fn_name, args_js)
    # Scratch names are per-process so two suites (or a fuzz run and a
    # regression run) can never fight over the same temp file.
    tag = "_%d" % os.getpid()
    out_name = "_harness_out%s.py" % tag
    out_file = os.path.join(HERE, out_name)
    if os.path.exists(out_file):
        os.remove(out_file)
    script = (SCRIPT_TEMPLATE
              .replace("__POLYFILLS__", POLYFILLS)
              .replace("__COMBINED__", COMBINED_ES3)
              .replace("__OUTFILE__", out_name)
              .replace("__CALL__", call))
    js_name = "_harness_call%s.js" % tag
    js_path = os.path.join(HERE, js_name)
    with open(js_path, "w", encoding="utf-16") as f:
        f.write(script)
    result = subprocess.run(
        ["cscript", "//nologo", "//E:jscript", js_name],
        cwd=HERE, capture_output=True, text=True,
        encoding="utf-8", errors="replace",
    )
    if result.returncode != 0 or (result.stderr or "").strip():
        raise SystemExit("cscript failed for %s:\nSTDOUT: %s\nSTDERR: %s" % (fn_name, result.stdout, result.stderr))
    with open(out_file, encoding="utf-16") as f:
        text = f.read()
    return text


if __name__ == "__main__":
    src = generate_harness_source("harness_movement_2", 'moved = self.player.try_move("left", self.maze)')
    print(src[:400])
    print("... (%d chars total)" % len(src))
