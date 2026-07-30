# -*- coding: utf-8 -*-
"""Regression suite for the PREVIEW harnesses (as opposed to the grading
ones in test_alt_implementations.py).

traceHarness_playerMove is what the Play tab and the playerMove step
visualiser use to move the player: it runs the student's own TODO 2 (key
dispatch), TODO 3 (guard clause) and TODO 4 (position update) code. It is
not graded, so nothing else catches a regression here - but if it breaks,
the Play tab silently stops responding to the keyboard, which is exactly
the kind of thing that must not be discovered during a lesson.

Extracted from the real app.js the same way the grading suite is.
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_harnesses import generate_call_source  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
failures = []


def run_python(py_source):
    assert py_source.rstrip().endswith("_run()")
    wrapped = py_source.rstrip()[: -len("_run()")] + "print(_run())"
    path = os.path.join(HERE, "_trace_test_case_%d.py" % os.getpid())
    with open(path, "w", encoding="utf-8") as f:
        f.write(wrapped)
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    r = subprocess.run([sys.executable, path], capture_output=True,
                       encoding="utf-8", errors="replace", env=env)
    if r.returncode != 0:
        raise SystemExit("Python execution failed:\n%s\n%s" % (r.stdout, r.stderr))
    return json.loads(r.stdout.strip().splitlines()[-1])


def js(s):
    return json.dumps(s)


def open_grid(rows=5, cols=5, blocked=None):
    """An otherwise wide-open grid, walled along the outer boundary exactly
    like a real generated maze, plus any extra walls a case asks for."""
    grid = []
    for r in range(rows):
        row = []
        for c in range(cols):
            walls = {
                "top": r == 0,
                "bottom": r == rows - 1,
                "left": c == 0,
                "right": c == cols - 1,
            }
            if blocked and (r, c) in blocked:
                for d in blocked[(r, c)]:
                    walls[d] = True
            row.append(walls)
        grid.append(row)
    return grid


# One grid step per press: arrow keys plus the controller's E/F/C/D.
CODE_2 = (
    'if keys[pygame.K_LEFT] or keys[pygame.K_e]:\n'
    '    moved = self.player.try_move("left", self.maze)\n'
    'elif keys[pygame.K_RIGHT] or keys[pygame.K_f]:\n'
    '    moved = self.player.try_move("right", self.maze)\n'
    'elif keys[pygame.K_UP] or keys[pygame.K_c]:\n'
    '    moved = self.player.try_move("top", self.maze)\n'
    'elif keys[pygame.K_DOWN] or keys[pygame.K_d]:\n'
    '    moved = self.player.try_move("bottom", self.maze)\n'
)
CODE_3 = 'if current is None or current.walls[direction]:\n    return False\n'
CODE_4 = 'self.row += dr\nself.col += dc\n'
# Required 2-5 now START at the reference answer rather than a blank, so these
# two are no longer "the student hasn't got there yet" - they are "the student
# deleted or half-edited working code", which is exactly what the site now
# invites them to do ("feel free to break it to understand it"). The preview
# still has to survive it without erroring or freezing the Play tab.
HALF_EDITED_2 = (
    'if keys[pygame.K_LEFT] or keys[pygame.K_e]:\n'
    '    pass\n'
)
EMPTY = 'pass\n'


def trace(code2, code3, code4, pressed, start=(2, 2), grid=None):
    grid = grid if grid is not None else open_grid()
    args = ", ".join([
        js(code2), js(code3), js(code4),
        json.dumps(grid), js(pressed), str(start[0]), str(start[1]),
    ])
    return run_python(generate_call_source("traceHarness_playerMove", args))


def check(label, ok, detail=""):
    print("%-58s | %s %s" % (label, "PASS" if ok else "FAIL", detail))
    if not ok:
        failures.append("%s %s" % (label, detail))


print("%-58s | result" % "check")
print("-" * 92)

# Each direction key, arrows and controller alike, moves exactly one cell.
for pressed, axis, sign, name in (
    ("K_LEFT", 1, -1, "LEFT arrow"),
    ("K_e", 1, -1, "E (controller left)"),
    ("K_RIGHT", 1, +1, "RIGHT arrow"),
    ("K_f", 1, +1, "F (controller right)"),
    ("K_UP", 0, -1, "UP arrow"),
    ("K_c", 0, -1, "C (controller up)"),
    ("K_DOWN", 0, +1, "DOWN arrow"),
    ("K_d", 0, +1, "D (controller down)"),
):
    d = trace(CODE_2, CODE_3, CODE_4, pressed)
    start = (2, 2)
    delta = (d["row"] - start[0]) if axis == 0 else (d["col"] - start[1])
    check("%s moves the player exactly one cell" % name,
          d["ok"] and d["moved"] and delta == sign,
          "(ended at %s,%s)" % (d["row"], d["col"]))

# A wall still stops the player, and TODO 3's guard is what does it.
walled = open_grid(blocked={(2, 2): ["right"]})
d = trace(CODE_2, CODE_3, CODE_4, "K_RIGHT", grid=walled)
check("a wall blocks the step",
      d["ok"] and d["col"] == 2 and not d["moved"] and not d["wall_violation"],
      "(col %s, moved=%s)" % (d["col"], d["moved"]))

# A missing guard clause (TODO 3 unfinished) must be caught, not crash.
d = trace(CODE_2, EMPTY, CODE_4, "K_RIGHT", grid=walled)
check("walking through a wall is flagged, not crashed",
      d["ok"] and d["wall_violation"], "(violation=%s)" % d["wall_violation"])

# Unfinished steps must degrade quietly rather than erroring.
for label, c2, c3, c4 in (
    ("TODO 2 emptied out by the student", EMPTY, CODE_3, CODE_4),
    ("TODO 2 half-edited (one branch left as pass)", HALF_EDITED_2, CODE_3, CODE_4),
    ("TODO 4 emptied out by the student", CODE_2, CODE_3, EMPTY),
    ("all three emptied out", EMPTY, EMPTY, EMPTY),
):
    d = trace(c2, c3, c4, "K_RIGHT")
    check("%s: runs without error, player stays put" % label,
          d["ok"] and d["row"] == 2 and d["col"] == 2,
          "(err=%s, ended %s,%s)" % (d["error"], d["row"], d["col"]))

# An infinite loop must be stopped, not hang the tab.
d = trace('while True:\n    pass\n', CODE_3, CODE_4, "K_RIGHT")
check("an infinite loop is stopped with a message",
      (not d["ok"]) and d["error"] and "never finished" in d["error"],
      "(error=%s)" % d["error"])

# Student code that raises is reported, not swallowed.
d = trace('raise ValueError("boom")\n', CODE_3, CODE_4, "K_RIGHT")
check("an exception is reported", (not d["ok"]) and "boom" in (d["error"] or ""),
      "(error=%s)" % d["error"])

# A syntax error reports the student's own line number (the +1 for the
# generated def line must be corrected away).
d = trace('if True\n    pass\n', CODE_3, CODE_4, "K_RIGHT")
check("a syntax error is reported against the student's line",
      (not d["ok"]) and "line 1" in (d["error"] or ""), "(error=%s)" % d["error"])

# Korean and emoji in a string must survive the whole round trip - these
# students will type them.
d = trace('name = "별 아이템 \U0001f31f"\n' + CODE_2, CODE_3, CODE_4, "K_RIGHT")
check("Korean text and emoji survive the round trip",
      d["ok"] and d["col"] == 3, "(err=%s, col=%s)" % (d["error"], d["col"]))

print("-" * 92)
if failures:
    print("\n%d FAILURE(S):" % len(failures))
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("ALL TRACE-HARNESS CHECKS PASSED")
