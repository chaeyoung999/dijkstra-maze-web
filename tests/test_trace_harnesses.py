# -*- coding: utf-8 -*-
"""Regression suite for the PREVIEW harnesses (as opposed to the grading
ones in test_alt_implementations.py).

traceHarness_playerMove is what the Play tab and the playerMove step
visualiser use to move the player: it runs the student's own TODO 2
(acceleration / friction / grid step), TODO 3 (guard clause) and TODO 4
(position update) code for a short burst of simulated frames. It is not
graded, so nothing else catches a regression here - but if it breaks, the
Play tab silently stops responding to the keyboard, which is exactly the
kind of thing that must not be discovered during a lesson.

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
    path = os.path.join(HERE, "_trace_test_case.py")
    with open(path, "w", encoding="utf-8") as f:
        f.write(wrapped)
    r = subprocess.run([sys.executable, path], capture_output=True, text=True)
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


CODE_2A = (
    'if keys[pygame.K_LEFT] or keys[pygame.K_e]:\n'
    '    self.player.velocity.x -= self.player.acceleration\n'
    'if keys[pygame.K_RIGHT] or keys[pygame.K_f]:\n'
    '    self.player.velocity.x += self.player.acceleration\n'
    'if keys[pygame.K_UP] or keys[pygame.K_c]:\n'
    '    self.player.velocity.y -= self.player.acceleration\n'
    'if keys[pygame.K_DOWN] or keys[pygame.K_d]:\n'
    '    self.player.velocity.y += self.player.acceleration\n'
)
CODE_2B = (
    'self.player.velocity.x *= self.player.friction\n'
    'self.player.velocity.y *= self.player.friction\n'
)
CODE_2C = (
    'speed_x = self.player.velocity.x\n'
    'speed_y = self.player.velocity.y\n'
    'if abs(speed_x) >= abs(speed_y) and abs(speed_x) >= PLAYER_MOVE_THRESHOLD:\n'
    '    direction = "right" if speed_x > 0 else "left"\n'
    '    moved = self.player.try_move(direction, self.maze)\n'
    'elif abs(speed_y) >= PLAYER_MOVE_THRESHOLD:\n'
    '    direction = "bottom" if speed_y > 0 else "top"\n'
    '    moved = self.player.try_move(direction, self.maze)\n'
)
CODE_3 = 'if current is None or current.walls[direction]:\n    return False\n'
CODE_4 = 'self.row += dr\nself.col += dc\n'
STARTER_2A = (
    'if keys[pygame.K_LEFT] or keys[pygame.K_e]:\n'
    '    pass\n'
)
EMPTY = 'pass\n'


def trace(code2a, code2b, code2c, code3, code4, pressed,
          start=(2, 2), grid=None, opts="{}"):
    grid = grid if grid is not None else open_grid()
    args = ", ".join([
        js(code2a), js(code2b), js(code2c), js(code3), js(code4),
        json.dumps(grid), js(pressed), str(start[0]), str(start[1]), opts,
    ])
    return run_python(generate_call_source("traceHarness_playerMove", args))


def check(label, ok, detail=""):
    print("%-58s | %s %s" % (label, "PASS" if ok else "FAIL", detail))
    if not ok:
        failures.append("%s %s" % (label, detail))


print("%-58s | result" % "check")
print("-" * 92)

# Each direction key, arrows and controller alike, moves the right way.
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
    d = trace(CODE_2A, CODE_2B, CODE_2C, CODE_3, CODE_4, pressed)
    start = (2, 2)
    delta = (d["row"] - start[0]) if axis == 0 else (d["col"] - start[1])
    check("%s moves the player the right way" % name,
          d["ok"] and d["moved"] and delta * sign > 0,
          "(ended at %s,%s, path %s)" % (d["row"], d["col"], d["path"]))

# The burst has to include the glide, so friction is visible in the preview.
d = trace(CODE_2A, CODE_2B, CODE_2C, CODE_3, CODE_4, "K_RIGHT", start=(2, 0))
check("one key press produces a multi-cell path (glide visible)",
      d["ok"] and len(d["path"]) >= 2, "(path %s)" % d["path"])

# A wall still stops the player, and TODO 3's guard is what does it.
walled = open_grid(blocked={(2, 2): ["right"]})
d = trace(CODE_2A, CODE_2B, CODE_2C, CODE_3, CODE_4, "K_RIGHT", grid=walled)
check("a wall blocks the step and is reported",
      d["ok"] and d["col"] == 2 and d["blocked"] and not d["wall_violation"],
      "(col %s, blocked=%s)" % (d["col"], d["blocked"]))

# A missing guard clause (TODO 3 unfinished) must be caught, not crash.
d = trace(CODE_2A, CODE_2B, CODE_2C, EMPTY, CODE_4, "K_RIGHT", grid=walled)
check("walking through a wall is flagged, not crashed",
      d["ok"] and d["wall_violation"], "(violation=%s)" % d["wall_violation"])

# Unfinished parts must degrade quietly rather than erroring. Leaving the
# FRICTION part empty is the one case where the player still moves (speed
# only ever grows), which is exactly what the grader warns about - the
# preview just has to survive it.
for label, a, b, c, expect_still in (
    ("TODO 2 Part 1/3 still empty", EMPTY, CODE_2B, CODE_2C, True),
    ("TODO 2 Part 2/3 still empty (no friction)", CODE_2A, EMPTY, CODE_2C, False),
    ("TODO 2 Part 3/3 still empty", CODE_2A, CODE_2B, EMPTY, True),
    ("all three parts still empty", EMPTY, EMPTY, EMPTY, True),
    ("the untouched starter code", STARTER_2A, EMPTY, EMPTY, True),
):
    d = trace(a, b, c, CODE_3, CODE_4, "K_RIGHT")
    stayed = d["row"] == 2 and d["col"] == 2
    check("%s: runs without error" % label,
          d["ok"] and (stayed == expect_still),
          "(err=%s, ended %s,%s)" % (d["error"], d["row"], d["col"]))

# No friction at all must not run away: the step cap has to hold the line.
d = trace(CODE_2A, EMPTY, CODE_2C, CODE_3, CODE_4, "K_RIGHT", start=(2, 0))
check("no friction still terminates (step cap holds)",
      d["ok"] and len(d["path"]) <= 6, "(path length %d)" % len(d["path"]))

# An infinite loop in student code must be stopped, not hang the tab.
d = trace('while True:\n    pass\n', CODE_2B, CODE_2C, CODE_3, CODE_4, "K_RIGHT")
check("an infinite loop is stopped with a message",
      (not d["ok"]) and d["error"] and "never finished" in d["error"],
      "(error=%s)" % d["error"])

# Student code that raises is reported, not swallowed.
d = trace('raise ValueError("boom")\n', CODE_2B, CODE_2C, CODE_3, CODE_4, "K_RIGHT")
check("an exception is reported", (not d["ok"]) and "boom" in (d["error"] or ""),
      "(error=%s)" % d["error"])

# A syntax error reports the student's own line number (the +1 for the
# generated def line must be corrected away).
d = trace('if True\n    pass\n', CODE_2B, CODE_2C, CODE_3, CODE_4, "K_RIGHT")
check("a syntax error is reported against the student's line",
      (not d["ok"]) and "line 1" in (d["error"] or ""), "(error=%s)" % d["error"])

# The tuning values from TODO 6 Part 2/3 actually reach the preview.
d = trace(CODE_2A, CODE_2B, CODE_2C, CODE_3, CODE_4, "K_RIGHT", start=(2, 0),
          opts='{ acceleration: 0.9, friction: 0.97, threshold: 1.5 }')
icy = len(d["path"])
d = trace(CODE_2A, CODE_2B, CODE_2C, CODE_3, CODE_4, "K_RIGHT", start=(2, 0),
          opts='{ acceleration: 0.9, friction: 0.60, threshold: 1.5 }')
grippy = len(d["path"])
check("higher friction glides further than lower friction",
      icy > grippy, "(icy %d cells vs grippy %d)" % (icy, grippy))

print("-" * 92)
if failures:
    print("\n%d FAILURE(S):" % len(failures))
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("ALL TRACE-HARNESS CHECKS PASSED")
