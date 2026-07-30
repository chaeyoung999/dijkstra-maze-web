# -*- coding: utf-8 -*-
"""Proves the promise the pre-filled Required steps make to a student:

    open the site, touch nothing, press "Run my code" -> it passes.

Required 1-5 no longer ship as fill-in-the-blank exercises. The editor opens
with the reference answer already typed in, for the student to read and
experiment with. If grading did NOT pass on that untouched default, every
student's very first interaction with the site would be a red failure on
code we wrote ourselves - the single worst possible outcome of this change.

Required 6 and 7 are deliberately NOT covered here: they were added because
1-5 stopped being exercises, so they are real blanks and are SUPPOSED to fail
until the student writes something. Their harnesses are exercised by
test_alt_implementations.py instead, canonical answers and negative controls
alike. test_app_load.js pins the fact that they stay blank.

So this does not reason about it. It takes the code app.js ACTUALLY puts in
the editor on a fresh load (via app.js's own freshState(), dumped by
_dump_fresh_code.js), feeds it to the REAL grading harnesses extracted from
app.js (see extract_harnesses.py), and executes the generated Python with a
real interpreter - the same path test_alt_implementations.py uses.

Run:  python tests/test_prefilled_required.py
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_harnesses import generate_harness_source  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
NODE = r"C:\Users\손채영\tools\node-v22.14.0-win-x64\node.exe"

RESULTS = []


def check(label, ok, detail=""):
    RESULTS.append((label, ok, detail))
    print("%s  %s%s" % ("PASS" if ok else "FAIL", label, ("  " + detail) if detail else ""))


def node_exe():
    """The repo's pinned node, or whatever is on PATH if this machine differs."""
    if os.path.exists(NODE):
        return NODE
    return "node"


def fresh_code():
    """{stepId: code}. `code` is a str, or a list of str for a multi-part step -
    byte-for-byte what app.js's freshState() puts in the editor."""
    out = subprocess.run(
        [node_exe(), os.path.join(HERE, "_dump_fresh_code.js")],
        capture_output=True, text=True, encoding="utf-8", cwd=ROOT,
    )
    if out.returncode != 0:
        raise SystemExit("could not dump fresh state:\n%s\n%s" % (out.stdout, out.stderr))
    return json.loads(out.stdout.strip().splitlines()[-1])


def run_python(py_source):
    assert py_source.rstrip().endswith("_run()")
    wrapped = py_source.rstrip()[: -len("_run()")] + "print(_run())"
    path = os.path.join(HERE, "_prefilled_case.py")
    with open(path, "w", encoding="utf-8") as f:
        f.write(wrapped)
    result = subprocess.run([sys.executable, path], capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit("Python execution failed:\n%s\n%s" % (result.stdout, result.stderr))
    return json.loads(result.stdout.strip().splitlines()[-1])


# (step id, harness function in app.js, how many code args it takes)
# TODO 5 is the one step that is still two parts, and its harness takes each
# part as its own argument so a mistake can be blamed on the right part.
#
# TODO 1 is NOT here on purpose. It is graded in "syntax" mode, and
# harness_syntax_1 reads STEP_BY_ID out of data.js - a structure the ES3
# extraction seam in extract_harnesses.py does not carry, and faking it would
# make this test lie about what it ran. TODO 1's starter is also the one
# Required starter this change did not touch (it was always a working example
# the student is asked to replace with their own game name). It is covered
# just below by check_todo_1_default(), which asserts the same two things
# harness_syntax_1 asserts, against the same fresh-load code.
GRADED = [
    ("2", "harness_movement_2", 1),
    ("3", "harness_guardClause_3", 1),
    ("4", "harness_positionDelta_4", 1),
    ("5", "harness_dijkstra_5", 2),
]


def check_todo_1_default(code):
    """Mirrors harness_syntax_1's own assertions: the code compiles, and both
    TITLE and GAME_SUBTITLE come out defined as strings."""
    try:
        ns = {}
        exec(compile(code, "<student>", "exec"), {}, ns)
    except BaseException as e:
        check("TODO 1's default code runs without error", False, "%s: %s" % (type(e).__name__, e))
        return
    check("TODO 1's default code runs without error", True)
    missing = [n for n in ("TITLE", "GAME_SUBTITLE") if n not in ns]
    check("TODO 1's default defines TITLE and GAME_SUBTITLE", not missing,
          ("missing: %s" % ", ".join(missing)) if missing else "")
    if not missing:
        check("TODO 1's default gives both of them string values",
              isinstance(ns["TITLE"], str) and isinstance(ns["GAME_SUBTITLE"], str))


def main():
    codes = fresh_code()
    print("Fresh-load code for Required steps, straight from app.js freshState():")
    print("\n--- TODO 1 (syntax mode) ---")
    for line in str(codes.get("1")).split("\n"):
        print("    |" + line)
    for step_id, harness, argc in GRADED:
        code = codes.get(step_id)
        shown = code if isinstance(code, list) else [code]
        print("\n--- TODO %s (%s) ---" % (step_id, harness))
        for part in shown:
            for line in str(part).split("\n"):
                print("    |" + line)
    print("\n" + "-" * 78 + "\n")

    check_todo_1_default(codes.get("1"))

    for step_id, harness, argc in GRADED:
        code = codes.get(step_id)
        if code is None:
            check("TODO %s: fresh state has code" % step_id, False)
            continue
        args = code if isinstance(code, list) else [code]
        if len(args) != argc:
            check("TODO %s: harness expects %d code arg(s)" % (step_id, argc), False,
                  "(got %d)" % len(args))
            continue
        result = run_python(generate_harness_source(harness, *args))
        detail = ""
        if not result.get("ok"):
            detail = "failed=%s error=%s" % (result.get("failed"), result.get("error"))
        check("TODO %s passes with the UNTOUCHED pre-filled default" % step_id,
              bool(result.get("ok")), detail)
        # A pass that reported nothing would mean the harness quietly did no
        # work; the point is that real assertions ran and were satisfied.
        check("TODO %s's harness actually ran checks (not a vacuous pass)" % step_id,
              len(result.get("passed") or []) > 0,
              "(%d check(s) reported)" % len(result.get("passed") or []))

    print("")
    bad = [r for r in RESULTS if not r[1]]
    if bad:
        print("%d FAILURE(S):" % len(bad))
        for label, _ok, detail in bad:
            print("  - %s %s" % (label, detail))
        sys.exit(1)
    print("ALL PRE-FILLED REQUIRED CHECKS PASSED")


if __name__ == "__main__":
    main()
