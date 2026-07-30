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


def case(step, label, harness_fn, code_args, expect_ok=True, expect_warning=None):
    """expect_warning: a substring that must appear in result['warnings'].
    Used for the cases where the point is the ADVICE, not the pass/fail -
    open-ended grading means a setting that quietly breaks the game still
    passes, so the warning text is the only thing standing between a
    student and a game they cannot play."""
    CASES.append((step, label, harness_fn, code_args, expect_ok, expect_warning))


# ---------------------------------------------------------------- TODO 2
# One grid step per key press: the arrow keys plus the classroom bluetooth
# controller's E/F/C/D. No acceleration, no friction, no WASD.
CANONICAL_2 = (
    'if keys[pygame.K_LEFT] or keys[pygame.K_e]:\n'
    '    moved = self.player.try_move("left", self.maze)\n'
    'elif keys[pygame.K_RIGHT] or keys[pygame.K_f]:\n'
    '    moved = self.player.try_move("right", self.maze)\n'
    'elif keys[pygame.K_UP] or keys[pygame.K_c]:\n'
    '    moved = self.player.try_move("top", self.maze)\n'
    'elif keys[pygame.K_DOWN] or keys[pygame.K_d]:\n'
    '    moved = self.player.try_move("bottom", self.maze)\n'
)
# Alt A: loop+break over a lookup table instead of an if/elif chain (still
# calls try_move) - a genuinely different control-flow shape.
ALT_2_LOOP = (
    'key_direction_pairs = [\n'
    '    (pygame.K_LEFT, "left"), (pygame.K_e, "left"),\n'
    '    (pygame.K_RIGHT, "right"), (pygame.K_f, "right"),\n'
    '    (pygame.K_UP, "top"), (pygame.K_c, "top"),\n'
    '    (pygame.K_DOWN, "bottom"), (pygame.K_d, "bottom"),\n'
    ']\n'
    'moved = False\n'
    'for key_const, direction in key_direction_pairs:\n'
    '    if keys[key_const]:\n'
    '        moved = self.player.try_move(direction, self.maze)\n'
    '        break\n'
)
# Alt B: bypasses try_move ENTIRELY - inlines its own row/col math AND its
# own wall check, with different variable names throughout.
ALT_2_BYPASS = (
    'chosen = None\n'
    'if keys[pygame.K_LEFT] or keys[pygame.K_e]:\n'
    '    chosen = ("left", 0, -1)\n'
    'elif keys[pygame.K_RIGHT] or keys[pygame.K_f]:\n'
    '    chosen = ("right", 0, 1)\n'
    'elif keys[pygame.K_UP] or keys[pygame.K_c]:\n'
    '    chosen = ("top", -1, 0)\n'
    'elif keys[pygame.K_DOWN] or keys[pygame.K_d]:\n'
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

# Negative controls: a genuinely wrong implementation must still be caught.
BAD_2_SWAPPED = (
    'if keys[pygame.K_LEFT] or keys[pygame.K_e]:\n'
    '    moved = self.player.try_move("right", self.maze)\n'
    'elif keys[pygame.K_RIGHT] or keys[pygame.K_f]:\n'
    '    moved = self.player.try_move("left", self.maze)\n'
    'elif keys[pygame.K_UP] or keys[pygame.K_c]:\n'
    '    moved = self.player.try_move("top", self.maze)\n'
    'elif keys[pygame.K_DOWN] or keys[pygame.K_d]:\n'
    '    moved = self.player.try_move("bottom", self.maze)\n'
)
case("2", "BAD: left/right swapped (negative control)", "harness_movement_2", (BAD_2_SWAPPED,), expect_ok=False)
BAD_2_NOTHING = 'pass\n'
case("2", "BAD: does nothing (negative control)", "harness_movement_2", (BAD_2_NOTHING,), expect_ok=False)
BAD_2_NO_MOVED = CANONICAL_2.replace("moved = self.player.try_move", "self.player.try_move")
case("2", "BAD: never stores the try_move result in moved (negative control)", "harness_movement_2", (BAD_2_NO_MOVED,), expect_ok=False)


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

# ---------------------------------------------------------------- TODO 6
# check_bombs' loop body: find a live bomb on the player's cell, set it off
# once, send the player home. These are REAL fill-in-the-blank exercises (6
# and 7 were added when Required 1-5 became pre-filled), so unlike Bonus the
# grading is strict - the negative controls below must actually fail.
CANONICAL_6 = (
    'if bomb.state == "ACTIVE" and bomb.get_position() == player_position:\n'
    '    if bomb.trigger(now):\n'
    '        self.player.reset_position()\n'
    '        self.maze.clear_path_display()\n'
    '        if self.bomb_sound:\n'
    '            self.bomb_sound.play()\n'
    '    break\n'
)
# Alt A: a continue-style guard instead of one big if, and no break at all
# (harmless - the remaining bombs simply are not on the player's cell).
ALT_6_CONTINUE = (
    'if bomb.state != "ACTIVE":\n'
    '    continue\n'
    'if bomb.get_position() != player_position:\n'
    '    continue\n'
    'if bomb.trigger(now):\n'
    '    self.player.reset_position()\n'
    '    self.maze.clear_path_display()\n'
)
# Alt B: unpacks the position itself and compares row/col separately, and
# uses a try/except instead of a truthiness check for the sound.
ALT_6_UNPACKED = (
    'bomb_row, bomb_col = bomb.get_position()\n'
    'player_row, player_col = player_position\n'
    'same_cell = bomb_row == player_row and bomb_col == player_col\n'
    'if same_cell and bomb.state == "ACTIVE" and bomb.trigger(now):\n'
    '    self.player.reset_position()\n'
    '    self.maze.clear_path_display()\n'
    '    try:\n'
    '        self.bomb_sound.play()\n'
    '    except AttributeError:\n'
    '        pass\n'
)
# Alt C: sets the player coordinates directly rather than calling
# reset_position() - bypasses the suggested method entirely, still correct.
ALT_6_INLINE_RESET = (
    'if bomb.state == "ACTIVE" and bomb.get_position() == player_position:\n'
    '    if bomb.trigger(now):\n'
    '        self.player.row = 0\n'
    '        self.player.col = 0\n'
    '        self.maze.clear_path_display()\n'
    '    break\n'
)
# Correct, but never clears the hint route: passes with a warning, because a
# stale route on screen is bad advice, not a broken game.
ALT_6_NO_CLEAR = (
    'if bomb.state == "ACTIVE" and bomb.get_position() == player_position:\n'
    '    if bomb.trigger(now):\n'
    '        self.player.reset_position()\n'
    '    break\n'
)
# Alt D: drops the `if` around trigger(). Written as a negative control
# first - and running it proved the expectation wrong, so it is documented
# here rather than quietly deleted.
#
# It is genuinely CORRECT. bomb.trigger() only returns False when the state is
# not "ACTIVE", and the outer condition has already excluded that, so the
# inner `if` can never be the thing that stops a second punishment - the state
# check is. (In the real game the bomb is EXPLODING by the next frame, so the
# outer condition stops matching anyway.) The reference implementation keeps
# the inner `if` as belt-and-braces, not because it is load-bearing here.
#
# What the harness therefore requires is: at least ONE of the two guards. An
# implementation with neither DOES punish an already-spent bomb again, and
# BAD_6_NO_GUARD_AT_ALL below is the case that proves it is caught.
ALT_6_NO_TRIGGER_GUARD = (
    'if bomb.state == "ACTIVE" and bomb.get_position() == player_position:\n'
    '    bomb.trigger(now)\n'
    '    self.player.reset_position()\n'
    '    self.maze.clear_path_display()\n'
    '    break\n'
)
# Alt E: the mirror image - no state check, but the trigger guard does the
# work instead. Also correct, and the reason the harness must not insist on
# either guard specifically.
ALT_6_TRIGGER_GUARD_ONLY = (
    'if bomb.get_position() == player_position:\n'
    '    if bomb.trigger(now):\n'
    '        self.player.reset_position()\n'
    '        self.maze.clear_path_display()\n'
    '    break\n'
)
# BAD: NEITHER guard. An already-exploded bomb sitting on the player's cell
# sends them back to the start on every single frame - the symptom is "I can't
# move at all", which hides the cause completely.
BAD_6_NO_GUARD_AT_ALL = (
    'if bomb.get_position() == player_position:\n'
    '    bomb.trigger(now)\n'
    '    self.player.reset_position()\n'
    '    self.maze.clear_path_display()\n'
    '    break\n'
)
# BAD: never checks the position, so ANY live bomb anywhere punishes.
BAD_6_NO_POSITION_CHECK = (
    'if bomb.state == "ACTIVE":\n'
    '    if bomb.trigger(now):\n'
    '        self.player.reset_position()\n'
    '    break\n'
)
# BAD: detects the bomb but never moves the player - nothing happens.
BAD_6_NO_RESET = (
    'if bomb.state == "ACTIVE" and bomb.get_position() == player_position:\n'
    '    bomb.trigger(now)\n'
    '    break\n'
)
# BAD: unguarded .play() on self.bomb_sound, which is None when no sound file
# loaded - crashes the real game mid-round.
BAD_6_UNGUARDED_SOUND = (
    'if bomb.state == "ACTIVE" and bomb.get_position() == player_position:\n'
    '    if bomb.trigger(now):\n'
    '        self.player.reset_position()\n'
    '        self.bomb_sound.play()\n'
    '    break\n'
)
BAD_6_INFINITE = (
    'while True:\n'
    '    pass\n'
)
STARTER_6 = 'pass  # Write your code here.\n'

case("6", "canonical (and-condition, trigger guard, break)", "harness_bombCollision_6", (CANONICAL_6,))
case("6", "alt: continue-style guards, no break", "harness_bombCollision_6", (ALT_6_CONTINUE,))
case("6", "alt: unpacked row/col compare + try/except sound", "harness_bombCollision_6", (ALT_6_UNPACKED,))
case("6", "alt: sets player.row/col directly (no reset_position)", "harness_bombCollision_6", (ALT_6_INLINE_RESET,))
case("6", "alt: forgets clear_path_display (warns, still passes)", "harness_bombCollision_6", (ALT_6_NO_CLEAR,),
     expect_warning="hint route was not cleared")
case("6", "alt: no trigger guard (state check already covers it)", "harness_bombCollision_6", (ALT_6_NO_TRIGGER_GUARD,))
# This exact shape is what app.js's SHOWCASE_CODE["6"] ships, so this case is
# what lets that comment claim it is "verified against the real harness".
case("6", "alt: trigger guard only, no state check (= SHOWCASE_CODE)", "harness_bombCollision_6", (ALT_6_TRIGGER_GUARD_ONLY,))
case("6", "BAD: neither guard, so a spent bomb punishes every frame", "harness_bombCollision_6", (BAD_6_NO_GUARD_AT_ALL,), expect_ok=False)
case("6", "BAD: never compares the bomb position (negative control)", "harness_bombCollision_6", (BAD_6_NO_POSITION_CHECK,), expect_ok=False)
case("6", "BAD: detects the bomb but never moves the player", "harness_bombCollision_6", (BAD_6_NO_RESET,), expect_ok=False)
case("6", "BAD: unguarded bomb_sound.play() crashes with no sound file", "harness_bombCollision_6", (BAD_6_UNGUARDED_SOUND,), expect_ok=False)
case("6", "BAD: infinite loop (must be stopped, not hang)", "harness_bombCollision_6", (BAD_6_INFINITE,), expect_ok=False)
case("6", "BAD: untouched starter (negative control)", "harness_bombCollision_6", (STARTER_6,), expect_ok=False)

# ---------------------------------------------------------------- TODO 7
# check_time_limit's body: fail the round once the clock reaches zero. The
# failure MESSAGE is the student's own wording, so nothing here checks its
# text - only that it is a non-empty string.
CANONICAL_7R = (
    'if self.get_remaining_time() <= 0:\n'
    '    self.round_failed = True\n'
    '    self.failure_reason = "ROUND FAILED: Time limit exceeded."\n'
)
# Alt A: stores the time first, and writes the student's own message.
ALT_7R_NAMED = (
    'seconds_left = self.get_remaining_time()\n'
    'if seconds_left < 1:\n'
    '    self.round_failed = True\n'
    '    self.failure_reason = "Out of time! Try a faster route."\n'
)
# Alt B: `not` on a positive test rather than a <= comparison.
ALT_7R_NOT_POSITIVE = (
    'if not self.get_remaining_time() > 0:\n'
    '    self.round_failed = True\n'
    '    self.failure_reason = "\\uc2dc\\uac04 \\ucd08\\uacfc!"\n'
)
# BAD: `== 0` misses a negative clock, the exact bug the lead warns about.
BAD_7R_EQUALS_ZERO = (
    'if self.get_remaining_time() == 0:\n'
    '    self.round_failed = True\n'
    '    self.failure_reason = "Time up."\n'
)
# BAD: fails the round unconditionally - the student can never win.
BAD_7R_ALWAYS_FAILS = (
    'self.round_failed = True\n'
    'self.failure_reason = "Time up."\n'
)
# BAD: inverted comparison - fails while there IS time, passes when there is none.
BAD_7R_INVERTED = (
    'if self.get_remaining_time() > 0:\n'
    '    self.round_failed = True\n'
    '    self.failure_reason = "Time up."\n'
)
# BAD: sets the flag but leaves no message, so the failure screen says nothing.
BAD_7R_NO_REASON = (
    'if self.get_remaining_time() <= 0:\n'
    '    self.round_failed = True\n'
)
BAD_7R_INFINITE = (
    'while True:\n'
    '    pass\n'
)
STARTER_7 = 'pass  # Write your code here.\n'

case("7", "canonical (<= 0, flag + reason)", "harness_timeLimit_7", (CANONICAL_7R,))
# Same shape app.js's SHOWCASE_CODE["7"] ships - see the note on case 6.
case("7", "alt: named variable and `< 1`, own wording (= SHOWCASE_CODE)", "harness_timeLimit_7", (ALT_7R_NAMED,))
case("7", "alt: `not ... > 0`, Korean message", "harness_timeLimit_7", (ALT_7R_NOT_POSITIVE,))
case("7", "BAD: `== 0` misses a negative clock", "harness_timeLimit_7", (BAD_7R_EQUALS_ZERO,), expect_ok=False)
case("7", "BAD: fails the round unconditionally", "harness_timeLimit_7", (BAD_7R_ALWAYS_FAILS,), expect_ok=False)
case("7", "BAD: inverted comparison (fails while time remains)", "harness_timeLimit_7", (BAD_7R_INVERTED,), expect_ok=False)
case("7", "BAD: no failure_reason, so the player is told nothing", "harness_timeLimit_7", (BAD_7R_NO_REASON,), expect_ok=False)
case("7", "BAD: infinite loop (must be stopped, not hang)", "harness_timeLimit_7", (BAD_7R_INFINITE,), expect_ok=False)
case("7", "BAD: untouched starter (negative control)", "harness_timeLimit_7", (STARTER_7,), expect_ok=False)

# ---------------------------------------------------------------- TODO 10 Part 2/2
# apply_custom_item_effect(self, effect, amount): must branch on "add_time"
# (self.bonus_time_seconds += amount) and "add_hint" (self.hints_remaining
# += amount); any other effect string must be a safe no-op, never a crash
# (the whole point of TODO 10 Part 1's "invent your own effect name"
# promise). Part 1's code1 argument is intentionally a minimal but valid
# CUSTOM_ITEMS list in every case below - these cases are only exercising
# Part 2 grading.
ITEM1_MINIMAL = 'CUSTOM_ITEMS = [{"name": "Custom Item", "color": (180, 180, 180), "image": None, "sound": None, "effect": "add_time", "amount": 0}]'

# TODO 10 is six parts now: 1 CUSTOM_ITEMS, 2 the add_time branch, 3 the
# add_hint branch, 4/5/6 the three statement groups of the pickup. The
# harness joins 2+3 into apply_custom_item_effect's body and 4+5+6 into
# check_items' body, so args8() can either hand over the real per-part split
# (the way the starter is laid out) or drop a whole body into the first part
# of its group - both are states a real student can end up in.
CANONICAL_8B = (
    'if effect == "add_time":\n'
    '    self.bonus_time_seconds += amount\n'
    'elif effect == "add_hint":\n'
    '    self.hints_remaining += amount\n'
)
CANON_8_ADD_TIME = 'if effect == "add_time":\n    self.bonus_time_seconds += amount\n'
CANON_8_ADD_HINT = 'if effect == "add_hint":\n    self.hints_remaining += amount\n'
# TODO 10 Part 3/3 (the pickup itself). Every Part 1/Part 2 case below pairs
# with this known-good body so a Part 2 result is never masked by a Part 3
# problem; the Part 3 variants get their own cases further down.
CANONICAL_8C = (
    'for item in self.items:\n'
    '    if item.active and item.get_position() == player_position:\n'
    '        item.active = False\n'
    '        self.apply_custom_item_effect(item.item_def)\n'
    '        item_sound = self.get_custom_item_sound(item.item_def.get("sound"))\n'
    '        if item_sound:\n'
    '            item_sound.play()\n'
)
# The starter's own Part 4/5/6 split of that same body. Parts 5 and 6 sit
# INSIDE the `if` Part 4 opens, so they carry the deeper indentation.
CANON_8_SPOT = (
    'for item in self.items:\n'
    '    if item.active and item.get_position() == player_position:\n'
    '        item.active = False\n'
)
CANON_8_APPLY = '        self.apply_custom_item_effect(item.item_def)\n'
CANON_8_SOUND = (
    '        item_sound = self.get_custom_item_sound(item.item_def.get("sound"))\n'
    '        if item_sound:\n'
    '            item_sound.play()\n'
)


def args8(items, effect, pickup, effect_split=None, pickup_split=None):
    """Builds TODO 10's six part arguments."""
    eff = tuple(effect_split) if effect_split is not None else (effect, '')
    pick = tuple(pickup_split) if pickup_split is not None else (pickup, '', '')
    return (items,) + eff + pick
# Alt A: reversed branch order (add_hint checked first) - still correct.
ALT_8B_REVERSED = (
    'if effect == "add_hint":\n'
    '    self.hints_remaining += amount\n'
    'elif effect == "add_time":\n'
    '    self.bonus_time_seconds += amount\n'
)
# Alt B: a dict-dispatch table instead of if/elif - genuinely different
# control-flow shape, still correct behaviour.
ALT_8B_DICT_DISPATCH = (
    'def _add_time(amt):\n'
    '    self.bonus_time_seconds += amt\n'
    'def _add_hint(amt):\n'
    '    self.hints_remaining += amt\n'
    'handlers = {"add_time": _add_time, "add_hint": _add_hint}\n'
    'handler = handlers.get(effect)\n'
    'if handler is not None:\n'
    '    handler(amount)\n'
)
# Alt C: separate independent if statements (no elif) - still correct
# since effect can only ever equal one string at a time.
ALT_8B_SEPARATE_IFS = (
    'if effect == "add_time":\n'
    '    self.bonus_time_seconds += amount\n'
    'if effect == "add_hint":\n'
    '    self.hints_remaining += amount\n'
)
# The starter's own layout: one effect per part, and the pickup split across
# Parts 4/5/6 (5 and 6 nested inside the `if` Part 4 opens). This is the case
# that proves buildFnSourceParts preserves the relative indentation - joining
# the parts must NOT flatten 5/6 out of the if-block.
case("10", "canonical (starter split: one effect per part, pickup across 4/5/6)", "harness_customItems_10",
     args8(ITEM1_MINIMAL, None, None,
           effect_split=(CANON_8_ADD_TIME, CANON_8_ADD_HINT),
           pickup_split=(CANON_8_SPOT, CANON_8_APPLY, CANON_8_SOUND)))
case("10 Part3/6", "BAD: add_hint part left empty (negative control)", "harness_customItems_10",
     args8(ITEM1_MINIMAL, None, None, effect_split=(CANON_8_ADD_TIME, ''),
           pickup_split=(CANON_8_SPOT, CANON_8_APPLY, CANON_8_SOUND)), expect_ok=False)
case("10 Part5/6", "BAD: effect part left empty, so the pickup never applies it (negative control)", "harness_customItems_10",
     args8(ITEM1_MINIMAL, None, None,
           effect_split=(CANON_8_ADD_TIME, CANON_8_ADD_HINT),
           pickup_split=(CANON_8_SPOT, '', CANON_8_SOUND)), expect_ok=False)
case("10 Part2/2", "canonical (if/elif, add_time then add_hint)", "harness_customItems_10", args8(ITEM1_MINIMAL, CANONICAL_8B, CANONICAL_8C))
case("10 Part2/2", "alt: reversed branch order", "harness_customItems_10", args8(ITEM1_MINIMAL, ALT_8B_REVERSED, CANONICAL_8C))
case("10 Part2/2", "alt: dict-dispatch table instead of if/elif", "harness_customItems_10", args8(ITEM1_MINIMAL, ALT_8B_DICT_DISPATCH, CANONICAL_8C))
case("10 Part2/2", "alt: two separate if statements (no elif)", "harness_customItems_10", args8(ITEM1_MINIMAL, ALT_8B_SEPARATE_IFS, CANONICAL_8C))

# ---------------------------------------------- negative controls (must FAIL)
# Proves the harnesses aren't just trivially permissive - a genuinely wrong
# implementation must still be correctly rejected.
# (TODO 2's negative controls live with its three parts further up, since
# they need one snippet per part.)
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

BAD_8B_SWAPPED = (
    'if effect == "add_time":\n'
    '    self.hints_remaining += amount\n'  # wrong attribute
    'elif effect == "add_hint":\n'
    '    self.bonus_time_seconds += amount\n'  # wrong attribute
)
case("10 Part2/2", "BAD: add_time/add_hint effects swapped (negative control)", "harness_customItems_10", args8(ITEM1_MINIMAL, BAD_8B_SWAPPED, CANONICAL_8C), expect_ok=False)

BAD_8B_CRASHES_ON_UNKNOWN = (
    'if effect == "add_time":\n'
    '    self.bonus_time_seconds += amount\n'
    'elif effect == "add_hint":\n'
    '    self.hints_remaining += amount\n'
    'else:\n'
    '    raise ValueError("unknown effect: " + effect)\n'  # must be a safe no-op instead
)
case("10 Part2/2", "BAD: raises on an unrecognized effect instead of a safe no-op (negative control)", "harness_customItems_10", args8(ITEM1_MINIMAL, BAD_8B_CRASHES_ON_UNKNOWN, CANONICAL_8C), expect_ok=False)

BAD_8B_ONLY_ADD_TIME = 'if effect == "add_time":\n    self.bonus_time_seconds += amount\n'  # forgets add_hint entirely
case("10 Part2/2", "BAD: forgets the add_hint branch entirely (negative control)", "harness_customItems_10", args8(ITEM1_MINIMAL, BAD_8B_ONLY_ADD_TIME, CANONICAL_8C), expect_ok=False)


# ================================================================ TODO 8
# Part 1/3 ROUND_CONFIGS, Part 2/3 pacing, Part 3/3 the placement code.
ROUNDS_3 = (
    'ROUND_CONFIGS = [\n'
    '    {"rows": 11, "cols": 15, "cell_size": 38, "extra_open_walls": 5,\n'
    '     "bomb_count": 2, "custom_item_count": 2, "time_limit_seconds": 70},\n'
    '    {"rows": 15, "cols": 21, "cell_size": 30, "extra_open_walls": 6,\n'
    '     "bomb_count": 4, "custom_item_count": 3, "time_limit_seconds": 55},\n'
    '    {"rows": 17, "cols": 25, "cell_size": 25, "extra_open_walls": 8,\n'
    '     "bomb_count": 6, "custom_item_count": 4, "time_limit_seconds": 45},\n'
    ']\n'
)
# Students are explicitly invited to add or remove rounds now.
ROUNDS_5 = (
    'ROUND_CONFIGS = [\n'
    + ''.join(
        '    {"rows": %d, "cols": %d, "cell_size": 30, "extra_open_walls": 4,\n'
        '     "bomb_count": %d, "custom_item_count": %d, "time_limit_seconds": %d},\n'
        % (7 + i * 2, 9 + i * 2, i, i + 1, 90 - i * 10) for i in range(5))
    + ']\n'
)
ROUNDS_1 = (
    'ROUND_CONFIGS = [\n'
    '    {"rows": 5, "cols": 5, "cell_size": 30, "extra_open_walls": 1,\n'
    '     "bomb_count": 1, "custom_item_count": 1, "time_limit_seconds": 40},\n'
    ']\n'
)
# Since the Bonus split, TODO 8's pacing is TWO parts: the walking speed on
# its own (Part 2/6) and the two hint settings (Part 3/6).
#
# NOTE (this session): the old PACING_6_BROKEN_FRICTION / PACING_6_UNPLAYABLE
# cases tested warnings about PLAYER_ACCELERATION / PLAYER_FRICTION /
# PLAYER_MOVE_THRESHOLD. Those settings do not exist anywhere in this course
# any more - they belonged to the acceleration/friction movement design that
# was reverted (see HANDOFF.md), and TODO 2 has been one-cell-per-keypress
# ever since; the "friction so low the player cannot move" case was the known
# permanently-failing case in this suite. They are replaced below by
# equivalent-in-spirit out-of-range cases for settings that DO exist, so the
# "an unplayable value warns but still passes" rule stays covered.
DELAY_6 = 'PLAYER_MOVE_DELAY_MS = 100\n'
HINTS_6 = 'ALLOW_PATH_HINT = True\nMAX_HINT_COUNT = 2\n'
DELAY_6_FAST = 'PLAYER_MOVE_DELAY_MS = 60\n'
HINTS_6_OFF = 'ALLOW_PATH_HINT = False\nMAX_HINT_COUNT = 0\n'
# Out of the usual range: open-ended grading must warn and still pass.
DELAY_6_ABSURD = 'PLAYER_MOVE_DELAY_MS = 5000\n'
HINTS_6_ABSURD = 'ALLOW_PATH_HINT = True\nMAX_HINT_COUNT = 500\n'

# The placement code is now Parts 4/6, 5/6 and 6/6 - three consecutive
# statement groups that the harness compiles individually and then joins back
# into the single method body the real game runs. The canonical case splits
# them exactly as the starter does; the alt cases below hand the whole body to
# Part 4 and leave 5/6 empty, which is just as valid an end state for a
# student and worth covering too.
CANON_6_POS = (
    'custom_positions = create_random_positions(\n'
    '    self.config["rows"], self.config["cols"],\n'
    '    self.config.get("custom_item_count", 0), forbidden,\n'
    ')\n'
)
CANON_6_ITEMS = (
    'self.items = [\n'
    '    CustomItem(row, col, self.config["cell_size"], random.choice(CUSTOM_ITEMS))\n'
    '    for row, col in custom_positions\n'
    ']\n'
    'forbidden.update(custom_positions)\n'
)
CANON_6_BOMBS = (
    'bomb_positions = create_random_positions(\n'
    '    self.config["rows"], self.config["cols"],\n'
    '    self.config["bomb_count"], forbidden,\n'
    ')\n'
    'self.bombs = [\n'
    '    Bomb(row, col, self.config["cell_size"])\n'
    '    for row, col in bomb_positions\n'
    ']\n'
    'forbidden.update(bomb_positions)\n'
)
CANONICAL_6C = CANON_6_POS + CANON_6_ITEMS + '\n' + CANON_6_BOMBS


# The two sub-steps added after the split (8-7 maze-build animation, 8-8
# hint route weights) default to their starters, so an existing case only
# has to name what it is actually varying.
DFS_6 = 'SHOW_DFS_GENERATION = True\nDFS_STEPS_PER_FRAME = 8\n'
WEIGHTS_6 = 'STUDENT_NORMAL_WEIGHT = 0\nSTUDENT_BOMB_WEIGHT = 1000\n'


def args6(rounds, delay, hints, place, split=None, dfs=None, weights=None):
    """Builds TODO 8's eight sub-step arguments. `split` supplies the three
    placement sub-steps individually; otherwise the whole placement body
    goes in 8-4 and 8-5/8-6 are left empty."""
    tail = (
        dfs if dfs is not None else DFS_6,
        weights if weights is not None else WEIGHTS_6,
    )
    if split is not None:
        return (rounds, delay, hints) + tuple(split) + tail
    return (rounds, delay, hints, place, '', '') + tail
# Alt A: a real rule change - bombs kept away from the start corner, and
# every CUSTOM_ITEMS entry guaranteed to appear in turn instead of at random.
ALT_6C_RULES = (
    'spots = create_random_positions(\n'
    '    self.config["rows"], self.config["cols"],\n'
    '    self.config.get("custom_item_count", 0), forbidden,\n'
    ')\n'
    'self.items = []\n'
    'for index, (row, col) in enumerate(spots):\n'
    '    definition = CUSTOM_ITEMS[index % len(CUSTOM_ITEMS)]\n'
    '    self.items.append(CustomItem(row, col, self.config["cell_size"], definition))\n'
    'forbidden.update(spots)\n'
    '\n'
    'candidates = create_random_positions(\n'
    '    self.config["rows"], self.config["cols"],\n'
    '    self.config["bomb_count"] * 3, forbidden,\n'
    ')\n'
    'safe = [(r, c) for r, c in candidates if r + c >= 4]\n'
    'chosen = safe[: self.config["bomb_count"]]\n'
    'self.bombs = [Bomb(r, c, self.config["cell_size"]) for r, c in chosen]\n'
    'forbidden.update(chosen)\n'
)
# Alt B: places nothing at all - empty lists are a legal (if dull) design.
ALT_6C_EMPTY = 'self.items = []\nself.bombs = []\n'
# Alt C: a while loop - legal, and proves the step-budget guard does not
# trip on ordinary loop-based code.
ALT_6C_WHILE = (
    'self.items = []\n'
    'self.bombs = []\n'
    'wanted = self.config.get("custom_item_count", 0)\n'
    'tries = 0\n'
    'while len(self.items) < wanted and tries < 500:\n'
    '    tries += 1\n'
    '    spot = create_random_positions(self.config["rows"], self.config["cols"], 1, forbidden)\n'
    '    if not spot:\n'
    '        break\n'
    '    row, col = spot[0]\n'
    '    self.items.append(CustomItem(row, col, self.config["cell_size"], CUSTOM_ITEMS[0]))\n'
    '    forbidden.add((row, col))\n'
)
case("8", "canonical (starter split across Parts 4/5/6)", "harness_roundDesign_8", args6(ROUNDS_3, DELAY_6, HINTS_6, None, split=(CANON_6_POS, CANON_6_ITEMS, CANON_6_BOMBS)))
case("8", "canonical (whole placement written in Part 4/6)", "harness_roundDesign_8", args6(ROUNDS_3, DELAY_6, HINTS_6, CANONICAL_6C))
case("8", "alt: 5 rounds instead of 3", "harness_roundDesign_8", args6(ROUNDS_5, DELAY_6, HINTS_6, CANONICAL_6C))
case("8", "alt: a single round", "harness_roundDesign_8", args6(ROUNDS_1, DELAY_6, HINTS_6, CANONICAL_6C))
case("8", "alt: hints off, faster steps", "harness_roundDesign_8", args6(ROUNDS_3, DELAY_6_FAST, HINTS_6_OFF, CANONICAL_6C))
case("8", "alt: absurd move delay (warns, still passes)", "harness_roundDesign_8", args6(ROUNDS_3, DELAY_6_ABSURD, HINTS_6, CANONICAL_6C), expect_warning="PLAYER_MOVE_DELAY_MS")
case("8", "alt: absurd MAX_HINT_COUNT (warns, still passes)", "harness_roundDesign_8", args6(ROUNDS_3, DELAY_6, HINTS_6_ABSURD, CANONICAL_6C), expect_warning="MAX_HINT_COUNT")
case("8", "alt: own placement rules (no bombs near start, items in turn)", "harness_roundDesign_8", args6(ROUNDS_3, DELAY_6, HINTS_6, ALT_6C_RULES))
case("8", "alt: places nothing at all (empty lists)", "harness_roundDesign_8", args6(ROUNDS_3, DELAY_6, HINTS_6, ALT_6C_EMPTY))
case("8", "alt: while loop placement (budget guard must not trip)", "harness_roundDesign_8", args6(ROUNDS_3, DELAY_6, HINTS_6, ALT_6C_WHILE))

BAD_6C_NOT_A_LIST = 'self.items = None\nself.bombs = None\n'
case("8 Part4-6", "BAD: leaves self.items/self.bombs as None (negative control)", "harness_roundDesign_8", args6(ROUNDS_3, DELAY_6, HINTS_6, BAD_6C_NOT_A_LIST), expect_ok=False)
BAD_6C_INFINITE = 'self.items = []\nself.bombs = []\nwhile True:\n    pass\n'
case("8 Part4-6", "BAD: infinite loop (must be stopped, not hang)", "harness_roundDesign_8", args6(ROUNDS_3, DELAY_6, HINTS_6, BAD_6C_INFINITE), expect_ok=False)
# Each settings part is now checked for its OWN names, so a missing name is
# attributed to the exact part that owns it.
case("8 Part2/6", "BAD: missing PLAYER_MOVE_DELAY_MS (negative control)", "harness_roundDesign_8", args6(ROUNDS_3, '', HINTS_6, CANONICAL_6C), expect_ok=False)
case("8 Part3/6", "BAD: missing ALLOW_PATH_HINT/MAX_HINT_COUNT (negative control)", "harness_roundDesign_8", args6(ROUNDS_3, DELAY_6, '', CANONICAL_6C), expect_ok=False)
# Splitting the placement across parts must not let an indent slip through.
BAD_6_INDENT = '  self.items = []\n'
case("8 Part5/6", "BAD: a broken indent in one placement part (negative control)", "harness_roundDesign_8", args6(ROUNDS_3, DELAY_6, HINTS_6, None, split=(CANON_6_POS, BAD_6_INDENT + CANON_6_ITEMS, CANON_6_BOMBS)), expect_ok=False)


# ================================================================ TODO 9
# TODO 9 is eight parts now: 1 player+goal images, 2 bomb+floor images,
# 3 the three size multipliers, 4 wall/player/goal colors, 5 bomb/explosion
# colors, 6 the two sound paths, 7 explosion length + volume, 8 the music
# playback code in game.py. args7() keeps every case below readable.
IMG_7_AB = ('PLAYER_IMAGE_PATH = None\nGOAL_IMAGE_PATH = None\n',
            'BOMB_IMAGE_PATH = None\nFLOOR_TILE_IMAGE_PATH = None\n')
IMG_7_AB_FILLED = ('PLAYER_IMAGE_PATH = "assets/images/player_ninja.png"\n'
                   'GOAL_IMAGE_PATH = "assets/images/goal_chest.png"\n',
                   'BOMB_IMAGE_PATH = "assets/images/bomb_2.png"\n'
                   'FLOOR_TILE_IMAGE_PATH = "assets/images/floor_tile_1.png"\n')
SCALES_7 = 'PLAYER_IMAGE_SCALE = 1.0\nGOAL_IMAGE_SCALE = 1.0\nBOMB_IMAGE_SCALE = 1.0\n'
SCALES_7_CUSTOM = 'PLAYER_IMAGE_SCALE = 1.4\nGOAL_IMAGE_SCALE = 0.8\nBOMB_IMAGE_SCALE = 1.1\n'
COLORS_7_A = 'WALL_COLOR = (30, 41, 59)\nPLAYER_COLOR = (37, 99, 235)\nGOAL_COLOR = (250, 204, 21)\n'
COLORS_7_B = 'BOMB_COLOR = (15, 23, 42)\nBOMB_EXPLOSION_COLOR = (239, 68, 68)\n'
SOUNDS_7 = ('BOMB_SOUND_PATH = "assets/sounds/explosion_1.wav"\n'
            'BACKGROUND_MUSIC_PATH = "assets/sounds/bgm_1.wav"\n')
SOUNDS_7_SILENT = 'BOMB_SOUND_PATH = None\nBACKGROUND_MUSIC_PATH = None\n'
TUNING_7 = 'BOMB_EXPLOSION_DURATION_MS = 500\nBACKGROUND_MUSIC_VOLUME = 0.25\n'
TUNING_7_SILENT = 'BOMB_EXPLOSION_DURATION_MS = 500\nBACKGROUND_MUSIC_VOLUME = 0.0\n'


# The four sub-steps added after the split (9-9 explosion picture, 9-10 …
# 9-12 the three palettes), at their starter values.
EXPLOSION_7 = 'BOMB_EXPLOSION_IMAGE_PATH = "assets/images/explode_2.png"\n'
MAZE_COLORS_7 = (
    'VISITED_COLOR = (186, 230, 253)\n'
    'CURRENT_CELL_COLOR = (251, 191, 36)\n'
    'PATH_COLOR = (139, 92, 246)\n'
)
PANEL_COLORS_7 = (
    'BACKGROUND_COLOR = (241, 245, 249)\n'
    'PANEL_COLOR = (255, 255, 255)\n'
    'PANEL_BORDER = (226, 232, 240)\n'
)
STATUS_COLORS_7 = (
    'ACCENT = (79, 70, 229)\n'
    'SUCCESS = (22, 163, 74)\n'
    'WARNING = (245, 158, 11)\n'
    'DANGER = (220, 38, 38)\n'
)


def args7(music, images=None, scales=None, sounds=None, tuning=None,
          colors_a=None, colors_b=None, explosion=None, maze_colors=None,
          panel_colors=None, status_colors=None):
    """Builds TODO 9's twelve sub-step arguments, defaulting every settings
    sub-step to its starter so a case only has to name what it varies.
    Order matters: it is 9-1 … 9-12, with the music playback code at 9-8."""
    imgs = images if images is not None else IMG_7_AB
    return (
        imgs[0], imgs[1],
        scales if scales is not None else SCALES_7,
        colors_a if colors_a is not None else COLORS_7_A,
        colors_b if colors_b is not None else COLORS_7_B,
        sounds if sounds is not None else SOUNDS_7,
        tuning if tuning is not None else TUNING_7,
        music,
        explosion if explosion is not None else EXPLOSION_7,
        maze_colors if maze_colors is not None else MAZE_COLORS_7,
        panel_colors if panel_colors is not None else PANEL_COLORS_7,
        status_colors if status_colors is not None else STATUS_COLORS_7,
    )
CANONICAL_7C = (
    'if BACKGROUND_MUSIC_PATH is None:\n'
    '    return\n'
    'try:\n'
    '    if not pygame.mixer.get_init():\n'
    '        pygame.mixer.init()\n'
    '    pygame.mixer.music.load(BACKGROUND_MUSIC_PATH)\n'
    '    pygame.mixer.music.set_volume(BACKGROUND_MUSIC_VOLUME)\n'
    '    pygame.mixer.music.play(-1)\n'
    'except (pygame.error, FileNotFoundError, TypeError) as error:\n'
    '    print("[Info] Background music load failed:", error)\n'
)
ALT_7C_PLAY_ONCE = CANONICAL_7C.replace('play(-1)', 'play(0)')
ALT_7C_FADE_IN = CANONICAL_7C.replace('play(-1)', 'play(-1, fade_ms=3000)')
# Silence on purpose: never starting the music is a valid design choice.
ALT_7C_SILENT = 'return\n'
case("9", "canonical (loop forever)", "harness_lookAndFeel_9", args7(CANONICAL_7C))
case("9", "alt: real images and non-default sizes", "harness_lookAndFeel_9", args7(CANONICAL_7C, images=IMG_7_AB_FILLED, scales=SCALES_7_CUSTOM))
case("9", "alt: play the music exactly once", "harness_lookAndFeel_9", args7(ALT_7C_PLAY_ONCE))
case("9", "alt: fade the music in", "harness_lookAndFeel_9", args7(ALT_7C_FADE_IN))
case("9", "alt: no music at all", "harness_lookAndFeel_9", args7(ALT_7C_SILENT, sounds=SOUNDS_7_SILENT, tuning=TUNING_7_SILENT))
# No try/except is only a WARNING (open-ended grading), so this must PASS.
ALT_7C_NO_TRY = (
    'if BACKGROUND_MUSIC_PATH is None:\n'
    '    return\n'
    'pygame.mixer.init()\n'
    'pygame.mixer.music.load(BACKGROUND_MUSIC_PATH)\n'
    'pygame.mixer.music.play(-1)\n'
)
case("9", "alt: no try/except (warns, still passes)", "harness_lookAndFeel_9", args7(ALT_7C_NO_TRY))

# A missing name must now be blamed on the specific part that owns it, so
# there is one negative control per settings group.
BAD_7_MISSING_SCALE = SCALES_7.replace('GOAL_IMAGE_SCALE = 1.0\n', '')
case("9 Part3/8", "BAD: missing GOAL_IMAGE_SCALE (negative control)", "harness_lookAndFeel_9", args7(CANONICAL_7C, scales=BAD_7_MISSING_SCALE), expect_ok=False)
BAD_7_MISSING_IMAGE = ('PLAYER_IMAGE_PATH = None\n', 'BOMB_IMAGE_PATH = None\nFLOOR_TILE_IMAGE_PATH = None\n')
case("9 Part1/8", "BAD: missing GOAL_IMAGE_PATH (negative control)", "harness_lookAndFeel_9", args7(CANONICAL_7C, images=BAD_7_MISSING_IMAGE), expect_ok=False)
BAD_7_MISSING_COLOR = COLORS_7_B.replace('BOMB_EXPLOSION_COLOR = (239, 68, 68)\n', '')
case("9 Part5/8", "BAD: missing BOMB_EXPLOSION_COLOR (negative control)", "harness_lookAndFeel_9", args7(CANONICAL_7C, colors_b=BAD_7_MISSING_COLOR), expect_ok=False)
BAD_7_MISSING_TUNING = 'BOMB_EXPLOSION_DURATION_MS = 500\n'
case("9 Part7/8", "BAD: missing BACKGROUND_MUSIC_VOLUME (negative control)", "harness_lookAndFeel_9", args7(CANONICAL_7C, tuning=BAD_7_MISSING_TUNING), expect_ok=False)
BAD_7C_RAISES = 'raise RuntimeError("boom")\n'
case("9 Part8/8", "BAD: always raises (negative control)", "harness_lookAndFeel_9", args7(BAD_7C_RAISES), expect_ok=False)


# ============================================== TODO 10 Part 3/3 (the pickup)
ALT_8C_SOUND_BY_EFFECT = (
    'for item in self.items:\n'
    '    if item.active and item.get_position() == player_position:\n'
    '        item.active = False\n'
    '        self.apply_custom_item_effect(item.item_def)\n'
    '        if item.item_def.get("effect") == "add_time":\n'
    '            special = self.get_custom_item_sound(item.item_def.get("sound"))\n'
    '            if special:\n'
    '                special.play()\n'
    '        else:\n'
    '            normal = self.get_custom_item_sound(item.item_def.get("sound"))\n'
    '            if normal:\n'
    '                normal.play()\n'
)
ALT_8C_INDEX_LOOP = (
    'for index in range(len(self.items)):\n'
    '    item = self.items[index]\n'
    '    if not item.active:\n'
    '        continue\n'
    '    if item.get_position() != player_position:\n'
    '        continue\n'
    '    item.active = False\n'
    '    self.apply_custom_item_effect(item.item_def)\n'
    '    sound = self.get_custom_item_sound(item.item_def.get("sound"))\n'
    '    if sound is not None:\n'
    '        sound.play()\n'
)
# Uses self.player.get_position() instead of the player_position local.
ALT_8C_SELF_PLAYER = (
    'here = self.player.get_position()\n'
    'for item in self.items:\n'
    '    if item.active and item.get_position() == here:\n'
    '        item.active = False\n'
    '        self.apply_custom_item_effect(item.item_def)\n'
    '        sound = self.get_custom_item_sound(item.item_def.get("sound"))\n'
    '        if sound:\n'
    '            sound.play()\n'
)
case("10 Part3/3", "alt: a different sound per effect", "harness_customItems_10", args8(ITEM1_MINIMAL, CANONICAL_8B, ALT_8C_SOUND_BY_EFFECT))
case("10 Part3/3", "alt: index loop with continue guards", "harness_customItems_10", args8(ITEM1_MINIMAL, CANONICAL_8B, ALT_8C_INDEX_LOOP))
case("10 Part3/3", "alt: reads self.player.get_position() itself", "harness_customItems_10", args8(ITEM1_MINIMAL, CANONICAL_8B, ALT_8C_SELF_PLAYER))

BAD_8C_NO_DEACTIVATE = (
    'for item in self.items:\n'
    '    if item.active and item.get_position() == player_position:\n'
    '        self.apply_custom_item_effect(item.item_def)\n'
)
case("10 Part3/3", "BAD: never sets item.active = False (negative control)", "harness_customItems_10", args8(ITEM1_MINIMAL, CANONICAL_8B, BAD_8C_NO_DEACTIVATE), expect_ok=False)
BAD_8C_NO_EFFECT = (
    'for item in self.items:\n'
    '    if item.active and item.get_position() == player_position:\n'
    '        item.active = False\n'
)
case("10 Part3/3", "BAD: collects but never applies the effect (negative control)", "harness_customItems_10", args8(ITEM1_MINIMAL, CANONICAL_8B, BAD_8C_NO_EFFECT), expect_ok=False)


# ================================================================ TODO 11
# TODO 11 is four parts now: 1 MISSION_RULES, 2 HOW_TO_PLAY_RULES, 3 the
# "not won yet" guard, 4 what winning does. The two rule lists are checked
# one per part; Parts 3 and 4 are compiled separately then joined and run.
MISSION_9 = 'MISSION_RULES = [\n    "Collect every crystal, then reach the goal.",\n]\n'
HOWTO_9 = (
    'HOW_TO_PLAY_RULES = [\n'
    '    "Move with the arrow keys.",\n'
    '    "Bombs send you back to the start.",\n'
    ']\n'
)
# A 2-tuple: one rule list per part, the way the starter is laid out.
RULES_9A = (MISSION_9, HOWTO_9)


def args9(rules, goal, split=None):
    """Builds TODO 11's four part arguments. `rules` is a (Part 1, Part 2)
    pair; `goal` is the whole win condition, which goes in Part 3 with Part 4
    left empty unless `split` supplies the real two-part layout."""
    r = tuple(rules) if isinstance(rules, tuple) else (rules, '')
    g = tuple(split) if split is not None else (goal, '')
    return r + g
CANONICAL_9B = (
    'if self.player.get_position() != self.goal.get_position():\n'
    '    return\n'
    '\n'
    'if self.current_round == len(ROUND_CONFIGS) - 1:\n'
    '    self.game_clear = True\n'
    'else:\n'
    '    self.round_transition_time = pygame.time.get_ticks()\n'
)
# The headline "harder rule" the lead suggests: every item first.
ALT_9B_ALL_ITEMS = (
    'if self.player.get_position() != self.goal.get_position():\n'
    '    return\n'
    'if not all(not item.active for item in self.items):\n'
    '    return\n'
    'if self.current_round == len(ROUND_CONFIGS) - 1:\n'
    '    self.game_clear = True\n'
    'else:\n'
    '    self.round_transition_time = pygame.time.get_ticks()\n'
)
# Inverted structure: positive condition instead of an early return.
ALT_9B_POSITIVE = (
    'if self.player.get_position() == self.goal.get_position():\n'
    '    if self.current_round >= len(ROUND_CONFIGS) - 1:\n'
    '        self.game_clear = True\n'
    '    else:\n'
    '        self.round_transition_time = pygame.time.get_ticks()\n'
)
CANON_9_GUARD = 'if self.player.get_position() != self.goal.get_position():\n    return\n'
CANON_9_WIN = (
    'if self.current_round == len(ROUND_CONFIGS) - 1:\n'
    '    self.game_clear = True\n'
    'else:\n'
    '    self.round_transition_time = pygame.time.get_ticks()\n'
)
case("11", "canonical (starter split across Parts 3/4)", "harness_gameRules_11", args9(RULES_9A, None, split=(CANON_9_GUARD, CANON_9_WIN)))
case("11", "canonical (whole win condition in Part 3/4)", "harness_gameRules_11", args9(RULES_9A, CANONICAL_9B))
case("11", "alt: every item must be collected first", "harness_gameRules_11", args9(RULES_9A, ALT_9B_ALL_ITEMS))
case("11", "alt: extra guard in Part 3, starter win in Part 4", "harness_gameRules_11", args9(RULES_9A, None, split=(CANON_9_GUARD + 'if not all(not item.active for item in self.items):\n    return\n', CANON_9_WIN)))
case("11", "alt: positive condition instead of early return", "harness_gameRules_11", args9(RULES_9A, ALT_9B_POSITIVE))

BAD_9B_ALWAYS_CLEARS = 'self.game_clear = True\n'
case("11 Part3-4", "BAD: clears the round from anywhere (negative control)", "harness_gameRules_11", args9(RULES_9A, BAD_9B_ALWAYS_CLEARS), expect_ok=False)
case("11 Part2/4", "BAD: missing HOW_TO_PLAY_RULES (negative control)", "harness_gameRules_11", args9((MISSION_9, ''), CANONICAL_9B), expect_ok=False)
case("11 Part1/4", "BAD: missing MISSION_RULES (negative control)", "harness_gameRules_11", args9(('', HOWTO_9), CANONICAL_9B), expect_ok=False)
BAD_9B_RAISES = 'raise ValueError("nope")\n'
case("11 Part2/2", "BAD: raises (negative control)", "harness_gameRules_11", args9(RULES_9A, BAD_9B_RAISES), expect_ok=False)


# ------------------------------------------------- focused Bonus grading
#
# Every Bonus sub-step is its own sidebar step now, but several of them are
# consecutive statement groups of ONE Python method, so the whole group's
# code is still spliced together before it runs. The harnesses take a
# trailing `focus` argument naming the one sub-step being graded, and only
# that sub-step's checks decide pass/fail.
#
# The cases below are the ones that would silently break if `focus` were
# ever dropped: a student sitting on 10-2 has NOT written 10-3 yet, so 10-3
# still holds its bare `pass` starter. Grading the group as a whole would
# fail them for work they have not been asked to do yet. Same story for
# 8-1 vs the placement code, and for 11-1 vs 11-2.
# The real 10-2/10-3 starter, at the same base indent the other fixtures in
# this file use (buildFnSourceParts reindents the JOINED group once, so the
# two halves have to agree with each other - which they do in data.js).
STARTER_PASS = 'pass  # Write your code here.\n'

# 10-2 done, 10-3 still the untouched `pass` starter -> 10-2 must PASS.
case("10-2 focused", "add_time done while add_hint is still the starter", "harness_customItems_10",
     args8(ITEM1_MINIMAL, None, None,
           effect_split=(CANON_8_ADD_TIME, STARTER_PASS),
           pickup_split=(CANON_8_SPOT, CANON_8_APPLY, CANON_8_SOUND)) + ("2",))
# ...and the same group, focused on 10-3, must FAIL - the sub-step being
# graded really is unwritten.
case("10-3 focused", "BAD: add_hint still the starter (negative control)", "harness_customItems_10",
     args8(ITEM1_MINIMAL, None, None,
           effect_split=(CANON_8_ADD_TIME, STARTER_PASS),
           pickup_split=(CANON_8_SPOT, CANON_8_APPLY, CANON_8_SOUND)) + ("3",), expect_ok=False)
# The reverse: 10-3 written, 10-2 untouched -> focusing 10-3 passes.
case("10-3 focused", "add_hint done while add_time is still the starter", "harness_customItems_10",
     args8(ITEM1_MINIMAL, None, None,
           effect_split=(STARTER_PASS, CANON_8_ADD_HINT),
           pickup_split=(CANON_8_SPOT, CANON_8_APPLY, CANON_8_SOUND)) + ("3",))
# A settings sub-step must not be failed by a LATER sibling being missing.
case("8-1 focused", "rounds done while the hint settings are still missing", "harness_roundDesign_8",
     args6(ROUNDS_3, DELAY_6, '', CANONICAL_6C) + ("1",))
case("8-3 focused", "BAD: the focused hint settings really are missing", "harness_roundDesign_8",
     args6(ROUNDS_3, DELAY_6, '', CANONICAL_6C) + ("3",), expect_ok=False)
# TODO 9's eight sub-steps are fully independent settings blocks.
case("9-1 focused", "images done while a later color block is missing", "harness_lookAndFeel_9",
     args7(CANONICAL_7C, colors_b=BAD_7_MISSING_COLOR) + ("1",))
case("9-5 focused", "BAD: the focused color block really is missing", "harness_lookAndFeel_9",
     args7(CANONICAL_7C, colors_b=BAD_7_MISSING_COLOR) + ("5",), expect_ok=False)
# TODO 11's two text sub-steps are independent of each other.
case("11-1 focused", "mission written while how-to-play is still missing", "harness_gameRules_11",
     args9((MISSION_9, ''), CANONICAL_9B) + ("1",))
case("11-2 focused", "BAD: the focused how-to-play list really is missing", "harness_gameRules_11",
     args9((MISSION_9, ''), CANONICAL_9B) + ("2",), expect_ok=False)


# ------------------------------------------- the six new filler sub-steps
#
# 8-7, 8-8 and 9-9 … 9-12 surface settings that were previously hardcoded.
# Same open-ended contract as every other Bonus settings step: it has to
# run and define its names; everything else is advice.
case("8-7 focused", "maze-build animation on, default speed", "harness_roundDesign_8",
     args6(ROUNDS_3, DELAY_6, HINTS_6, CANONICAL_6C) + ("7",))
case("8-7 focused", "alt: animation off entirely", "harness_roundDesign_8",
     args6(ROUNDS_3, DELAY_6, HINTS_6, CANONICAL_6C,
           dfs='SHOW_DFS_GENERATION = False\nDFS_STEPS_PER_FRAME = 1\n') + ("7",))
case("8-7 focused", "alt: a speed that would stall the build (warns, still passes)", "harness_roundDesign_8",
     args6(ROUNDS_3, DELAY_6, HINTS_6, CANONICAL_6C,
           dfs='SHOW_DFS_GENERATION = True\nDFS_STEPS_PER_FRAME = 0\n') + ("7",),
     expect_warning="DFS_STEPS_PER_FRAME")
case("8-7 focused", "BAD: missing DFS_STEPS_PER_FRAME (negative control)", "harness_roundDesign_8",
     args6(ROUNDS_3, DELAY_6, HINTS_6, CANONICAL_6C,
           dfs='SHOW_DFS_GENERATION = True\n') + ("7",), expect_ok=False)

case("8-8 focused", "hint route strongly avoids bombs", "harness_roundDesign_8",
     args6(ROUNDS_3, DELAY_6, HINTS_6, CANONICAL_6C) + ("8",))
case("8-8 focused", "alt: negative weights are legal", "harness_roundDesign_8",
     args6(ROUNDS_3, DELAY_6, HINTS_6, CANONICAL_6C,
           weights='STUDENT_NORMAL_WEIGHT = -5\nSTUDENT_BOMB_WEIGHT = 40\n') + ("8",))
case("8-8 focused", "alt: bombs cost no more than floor (warns, still passes)", "harness_roundDesign_8",
     args6(ROUNDS_3, DELAY_6, HINTS_6, CANONICAL_6C,
           weights='STUDENT_NORMAL_WEIGHT = 5\nSTUDENT_BOMB_WEIGHT = 5\n') + ("8",),
     expect_warning="walk you straight over bombs")
case("8-8 focused", "BAD: missing STUDENT_BOMB_WEIGHT (negative control)", "harness_roundDesign_8",
     args6(ROUNDS_3, DELAY_6, HINTS_6, CANONICAL_6C,
           weights='STUDENT_NORMAL_WEIGHT = 0\n') + ("8",), expect_ok=False)

case("9-9 focused", "explosion picture at its default", "harness_lookAndFeel_9",
     args7(CANONICAL_7C) + ("9",))
case("9-9 focused", "alt: no explosion picture at all", "harness_lookAndFeel_9",
     args7(CANONICAL_7C, explosion='BOMB_EXPLOSION_IMAGE_PATH = None\n') + ("9",))
case("9-9 focused", "BAD: missing BOMB_EXPLOSION_IMAGE_PATH (negative control)", "harness_lookAndFeel_9",
     args7(CANONICAL_7C, explosion='') + ("9",), expect_ok=False)

case("9-10 focused", "maze animation colors", "harness_lookAndFeel_9",
     args7(CANONICAL_7C) + ("10",))
case("9-10 focused", "BAD: missing PATH_COLOR (negative control)", "harness_lookAndFeel_9",
     args7(CANONICAL_7C,
           maze_colors='VISITED_COLOR = (1, 2, 3)\nCURRENT_CELL_COLOR = (4, 5, 6)\n') + ("10",),
     expect_ok=False)
case("9-11 focused", "screen and panel colors", "harness_lookAndFeel_9",
     args7(CANONICAL_7C,
           panel_colors='BACKGROUND_COLOR = (12, 18, 32)\nPANEL_COLOR = (24, 34, 56)\nPANEL_BORDER = (60, 78, 112)\n') + ("11",))
case("9-12 focused", "status colors", "harness_lookAndFeel_9",
     args7(CANONICAL_7C) + ("12",))
case("9-12 focused", "alt: a color out of range (warns, still passes)", "harness_lookAndFeel_9",
     args7(CANONICAL_7C,
           status_colors='ACCENT = (79, 70, 229)\nSUCCESS = (0, 999, 0)\nWARNING = (245, 158, 11)\nDANGER = (220, 38, 38)\n') + ("12",),
     expect_warning="SUCCESS")
case("9-12 focused", "BAD: missing DANGER (negative control)", "harness_lookAndFeel_9",
     args7(CANONICAL_7C,
           status_colors='ACCENT = (1, 2, 3)\nSUCCESS = (4, 5, 6)\nWARNING = (7, 8, 9)\n') + ("12",),
     expect_ok=False)


def main():
    print("%-14s | %-55s | %-4s | notes" % ("Step", "Implementation", "PASS"))
    print("-" * 110)
    all_ok = True
    for step, label, harness_fn, code_args, expect_ok, expect_warning in CASES:
        py_src = generate_harness_source(harness_fn, *code_args)
        result = run_python(py_src)
        ok = result.get("ok")
        good = ok == expect_ok
        warnings = result.get("warnings") or []
        if expect_warning and not any(expect_warning in w for w in warnings):
            good = False
        status = "PASS" if good else "FAIL"
        if not good:
            all_ok = False
        note = ""
        if expect_warning:
            note = "warned" if any(expect_warning in w for w in warnings) else "MISSING WARNING %r in %s" % (expect_warning, warnings)
        elif not ok:
            note = "error=%s failed=%s" % (result.get("error"), result.get("failed"))
        print("%-14s | %-55s | %-4s | %s" % (step, label, status, note))
    print("-" * 110)
    print("ALL CASES PASSED AS EXPECTED" if all_ok else "SOME CASES DID NOT MATCH EXPECTATIONS - see above")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
