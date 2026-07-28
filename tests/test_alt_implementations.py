# -*- coding: utf-8 -*-
"""2a: for each behaviour-graded step (TODO 2, 3, 4, 5 Part1/2, 5 Part2/2),
run a genuinely different-but-equivalent implementation through the REAL,
extracted app.js harness generator (see extract_harnesses.py) and execute
the resulting Python source with a real interpreter, confirming `ok` is
True. Kept as a permanent regression suite (see main() at the bottom -
safe to re-run any time app.js's harnesses change).
"""
import json
import subprocess
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_harnesses import generate_harness_source  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


def run_python(py_source):
    """Executes py_source (which ends with a bare `_run()` call) and
    returns the parsed JSON result by wrapping the trailing call in print()."""
    assert py_source.rstrip().endswith("_run()")
    wrapped = py_source.rstrip()[: -len("_run()")] + "print(_run())"
    path = os.path.join(HERE, "_alt_test_case.py")
    with open(path, "w", encoding="utf-8") as f:
        f.write(wrapped)
    result = subprocess.run([sys.executable, path], capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit("Python execution failed:\n%s\n%s" % (result.stdout, result.stderr))
    return json.loads(result.stdout.strip().splitlines()[-1])


CASES = []


def case(step, label, harness_fn, code_args, expect_ok=True):
    CASES.append((step, label, harness_fn, code_args, expect_ok))


# ---------------------------------------------------------------- TODO 2
CANONICAL_2 = (
    'if keys[pygame.K_LEFT] or keys[pygame.K_a]:\n'
    '    moved = self.player.try_move("left", self.maze)\n'
    'elif keys[pygame.K_RIGHT] or keys[pygame.K_d]:\n'
    '    moved = self.player.try_move("right", self.maze)\n'
    'elif keys[pygame.K_UP] or keys[pygame.K_w]:\n'
    '    moved = self.player.try_move("top", self.maze)\n'
    'elif keys[pygame.K_DOWN] or keys[pygame.K_s]:\n'
    '    moved = self.player.try_move("bottom", self.maze)\n'
)
# Alt A: loop+break over a lookup table instead of if/elif chain (still
# calls try_move) - genuinely different control-flow shape.
ALT_2_LOOP = (
    'key_direction_pairs = [\n'
    '    (pygame.K_LEFT, "left"), (pygame.K_a, "left"),\n'
    '    (pygame.K_RIGHT, "right"), (pygame.K_d, "right"),\n'
    '    (pygame.K_UP, "top"), (pygame.K_w, "top"),\n'
    '    (pygame.K_DOWN, "bottom"), (pygame.K_s, "bottom"),\n'
    ']\n'
    'moved = False\n'
    'for key_const, direction in key_direction_pairs:\n'
    '    if keys[key_const]:\n'
    '        moved = self.player.try_move(direction, self.maze)\n'
    '        break\n'
)
# Alt B: bypasses try_move ENTIRELY - inlines its own row/col math AND its
# own wall check, using different variable names throughout.
ALT_2_BYPASS = (
    'chosen = None\n'
    'if keys[pygame.K_LEFT] or keys[pygame.K_a]:\n'
    '    chosen = ("left", 0, -1)\n'
    'elif keys[pygame.K_RIGHT] or keys[pygame.K_d]:\n'
    '    chosen = ("right", 0, 1)\n'
    'elif keys[pygame.K_UP] or keys[pygame.K_w]:\n'
    '    chosen = ("top", -1, 0)\n'
    'elif keys[pygame.K_DOWN] or keys[pygame.K_s]:\n'
    '    chosen = ("bottom", 1, 0)\n'
    'if chosen is None:\n'
    '    moved = False\n'
    'else:\n'
    '    want_dir, delta_r, delta_c = chosen\n'
    '    target_cell = self.maze.get_cell(self.player.row, self.player.col)\n'
    '    if target_cell is not None and not target_cell.walls[want_dir]:\n'
    '        self.player.row += delta_r\n'
    '        self.player.col += delta_c\n'
    '        moved = True\n'
    '    else:\n'
    '        moved = False\n'
)
case("2", "canonical (try_move, if/elif)", "harness_movement_2", (CANONICAL_2,))
case("2", "alt: loop+break lookup table", "harness_movement_2", (ALT_2_LOOP,))
case("2", "alt: bypasses try_move, inlines own move+wall check", "harness_movement_2", (ALT_2_BYPASS,))

# ---------------------------------------------------------------- TODO 3
CANONICAL_3 = 'if current is None or current.walls[direction]:\n    return False\n'
ALT_3_SPLIT = 'if current is None:\n    return False\nif current.walls[direction]:\n    return False\n'
ALT_3_DEMORGAN = 'if not (current is not None and not current.walls[direction]):\n    return False\n'
case("3", "canonical (or, one if)", "harness_guardClause_3", (CANONICAL_3,))
case("3", "alt: two separate if statements", "harness_guardClause_3", (ALT_3_SPLIT,))
case("3", "alt: De Morgan negated form (not (... and ...))", "harness_guardClause_3", (ALT_3_DEMORGAN,))

# ---------------------------------------------------------------- TODO 4
CANONICAL_4 = 'self.row += dr\nself.col += dc\n'
ALT_4_EXPANDED = 'self.row = self.row + dr\nself.col = self.col + dc\n'
ALT_4_TUPLE = 'self.row, self.col = self.row + dr, self.col + dc\n'
case("4", "canonical (+=)", "harness_positionDelta_4", (CANONICAL_4,))
case("4", "alt: expanded self.row = self.row + dr", "harness_positionDelta_4", (ALT_4_EXPANDED,))
case("4", "alt: single tuple assignment", "harness_positionDelta_4", (ALT_4_TUPLE,))

# ---------------------------------------------------------------- TODO 5
CANONICAL_5A = 'new_cost = cost + step_cost\n'
ALT_5A_SUM = 'new_cost = sum([cost, step_cost])\n'
ALT_5A_ACCUM = 'total = cost\ntotal += step_cost\nnew_cost = total\n'
CANONICAL_5B = (
    'if neighbor not in distance or new_cost < distance[neighbor]:\n'
    '    distance[neighbor] = new_cost\n'
    '    parent[neighbor] = current\n'
    '    heapq.heappush(queue, (new_cost, neighbor))\n'
)
ALT_5B_NAMED = (
    'is_improvement = neighbor not in distance or new_cost < distance[neighbor]\n'
    'if is_improvement:\n'
    '    distance[neighbor] = new_cost\n'
    '    parent[neighbor] = current\n'
    '    heapq.heappush(queue, (new_cost, neighbor))\n'
)
case("5 Part1/2", "canonical (cost + step_cost)", "harness_dijkstra_5", (CANONICAL_5A, CANONICAL_5B))
case("5 Part1/2", "alt: sum([cost, step_cost])", "harness_dijkstra_5", (ALT_5A_SUM, CANONICAL_5B))
case("5 Part1/2", "alt: accumulator variable", "harness_dijkstra_5", (ALT_5A_ACCUM, CANONICAL_5B))
case("5 Part2/2", "canonical (if/or, 3 updates)", "harness_dijkstra_5", (CANONICAL_5A, CANONICAL_5B))
case("5 Part2/2", "alt: named boolean condition variable", "harness_dijkstra_5", (CANONICAL_5A, ALT_5B_NAMED))

# ---------------------------------------------- negative controls (must FAIL)
# Proves the harnesses aren't just trivially permissive - a genuinely wrong
# implementation must still be correctly rejected.
BAD_2_SWAPPED = (
    'if keys[pygame.K_LEFT] or keys[pygame.K_a]:\n'
    '    moved = self.player.try_move("right", self.maze)\n'  # wrong direction
    'elif keys[pygame.K_RIGHT] or keys[pygame.K_d]:\n'
    '    moved = self.player.try_move("left", self.maze)\n'
    'elif keys[pygame.K_UP] or keys[pygame.K_w]:\n'
    '    moved = self.player.try_move("top", self.maze)\n'
    'elif keys[pygame.K_DOWN] or keys[pygame.K_s]:\n'
    '    moved = self.player.try_move("bottom", self.maze)\n'
)
case("2", "BAD: left/right swapped (negative control)", "harness_movement_2", (BAD_2_SWAPPED,), expect_ok=False)

BAD_3_NO_WALL_CHECK = 'if current is None:\n    return False\n'  # forgets the wall check entirely
case("3", "BAD: forgets the wall check (negative control)", "harness_guardClause_3", (BAD_3_NO_WALL_CHECK,), expect_ok=False)

BAD_4_ROW_ONLY = 'self.row += dr\n'  # forgets self.col
case("4", "BAD: forgets to update self.col (negative control)", "harness_positionDelta_4", (BAD_4_ROW_ONLY,), expect_ok=False)

BAD_5A_SUBTRACT = 'new_cost = cost - step_cost\n'  # wrong operator
case("5 Part1/2", "BAD: subtracts instead of adds (negative control)", "harness_dijkstra_5", (BAD_5A_SUBTRACT, CANONICAL_5B), expect_ok=False)

BAD_5B_NO_PUSH = (
    'if neighbor not in distance or new_cost < distance[neighbor]:\n'
    '    distance[neighbor] = new_cost\n'
    '    parent[neighbor] = current\n'
)  # forgets heapq.heappush entirely
case("5 Part2/2", "BAD: forgets heapq.heappush (negative control)", "harness_dijkstra_5", (CANONICAL_5A, BAD_5B_NO_PUSH), expect_ok=False)


def main():
    print("%-14s | %-55s | %-4s | notes" % ("Step", "Implementation", "PASS"))
    print("-" * 110)
    all_ok = True
    for step, label, harness_fn, code_args, expect_ok in CASES:
        py_src = generate_harness_source(harness_fn, *code_args)
        result = run_python(py_src)
        ok = result.get("ok")
        status = "PASS" if ok == expect_ok else "FAIL"
        if ok != expect_ok:
            all_ok = False
        note = ""
        if not ok:
            note = "error=%s failed=%s" % (result.get("error"), result.get("failed"))
        print("%-14s | %-55s | %-4s | %s" % (step, label, status, note))
    print("-" * 110)
    print("ALL CASES PASSED AS EXPECTED" if all_ok else "SOME CASES DID NOT MATCH EXPECTATIONS - see above")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
