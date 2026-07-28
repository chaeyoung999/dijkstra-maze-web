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

# ---------------------------------------------------------------- TODO 8 Part 2/2
# apply_custom_item_effect(self, effect, amount): must branch on "add_time"
# (self.bonus_time_seconds += amount) and "add_hint" (self.hints_remaining
# += amount); any other effect string must be a safe no-op, never a crash
# (the whole point of TODO 8 Part 1's "invent your own effect name"
# promise). Part 1's code1 argument is intentionally a minimal but valid
# CUSTOM_ITEMS list in every case below - these cases are only exercising
# Part 2 grading.
ITEM1_MINIMAL = 'CUSTOM_ITEMS = [{"name": "Custom Item", "color": (180, 180, 180), "image": None, "sound": None, "effect": "add_time", "amount": 0}]'

CANONICAL_8B = (
    'if effect == "add_time":\n'
    '    self.bonus_time_seconds += amount\n'
    'elif effect == "add_hint":\n'
    '    self.hints_remaining += amount\n'
)
# TODO 8 Part 3/3 (the pickup itself). Every Part 1/Part 2 case below pairs
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
case("8 Part2/2", "canonical (if/elif, add_time then add_hint)", "harness_customItems_8", (ITEM1_MINIMAL, CANONICAL_8B, CANONICAL_8C))
case("8 Part2/2", "alt: reversed branch order", "harness_customItems_8", (ITEM1_MINIMAL, ALT_8B_REVERSED, CANONICAL_8C))
case("8 Part2/2", "alt: dict-dispatch table instead of if/elif", "harness_customItems_8", (ITEM1_MINIMAL, ALT_8B_DICT_DISPATCH, CANONICAL_8C))
case("8 Part2/2", "alt: two separate if statements (no elif)", "harness_customItems_8", (ITEM1_MINIMAL, ALT_8B_SEPARATE_IFS, CANONICAL_8C))

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

BAD_8B_SWAPPED = (
    'if effect == "add_time":\n'
    '    self.hints_remaining += amount\n'  # wrong attribute
    'elif effect == "add_hint":\n'
    '    self.bonus_time_seconds += amount\n'  # wrong attribute
)
case("8 Part2/2", "BAD: add_time/add_hint effects swapped (negative control)", "harness_customItems_8", (ITEM1_MINIMAL, BAD_8B_SWAPPED, CANONICAL_8C), expect_ok=False)

BAD_8B_CRASHES_ON_UNKNOWN = (
    'if effect == "add_time":\n'
    '    self.bonus_time_seconds += amount\n'
    'elif effect == "add_hint":\n'
    '    self.hints_remaining += amount\n'
    'else:\n'
    '    raise ValueError("unknown effect: " + effect)\n'  # must be a safe no-op instead
)
case("8 Part2/2", "BAD: raises on an unrecognized effect instead of a safe no-op (negative control)", "harness_customItems_8", (ITEM1_MINIMAL, BAD_8B_CRASHES_ON_UNKNOWN, CANONICAL_8C), expect_ok=False)

BAD_8B_ONLY_ADD_TIME = 'if effect == "add_time":\n    self.bonus_time_seconds += amount\n'  # forgets add_hint entirely
case("8 Part2/2", "BAD: forgets the add_hint branch entirely (negative control)", "harness_customItems_8", (ITEM1_MINIMAL, BAD_8B_ONLY_ADD_TIME, CANONICAL_8C), expect_ok=False)


# ================================================================ TODO 6
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
PACING_6 = 'PLAYER_MOVE_DELAY_MS = 100\nALLOW_PATH_HINT = True\nMAX_HINT_COUNT = 2\n'
PACING_6_NO_HINT = 'PLAYER_MOVE_DELAY_MS = 60\nALLOW_PATH_HINT = False\nMAX_HINT_COUNT = 0\n'

CANONICAL_6C = (
    'custom_positions = create_random_positions(\n'
    '    self.config["rows"], self.config["cols"],\n'
    '    self.config.get("custom_item_count", 0), forbidden,\n'
    ')\n'
    'self.items = [\n'
    '    CustomItem(row, col, self.config["cell_size"], random.choice(CUSTOM_ITEMS))\n'
    '    for row, col in custom_positions\n'
    ']\n'
    'forbidden.update(custom_positions)\n'
    '\n'
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
case("6", "canonical (random placement, 3 rounds)", "harness_roundDesign_6", (ROUNDS_3, PACING_6, CANONICAL_6C))
case("6", "alt: 5 rounds instead of 3", "harness_roundDesign_6", (ROUNDS_5, PACING_6, CANONICAL_6C))
case("6", "alt: a single round", "harness_roundDesign_6", (ROUNDS_1, PACING_6, CANONICAL_6C))
case("6", "alt: hints turned off entirely", "harness_roundDesign_6", (ROUNDS_3, PACING_6_NO_HINT, CANONICAL_6C))
case("6", "alt: own placement rules (no bombs near start, items in turn)", "harness_roundDesign_6", (ROUNDS_3, PACING_6, ALT_6C_RULES))
case("6", "alt: places nothing at all (empty lists)", "harness_roundDesign_6", (ROUNDS_3, PACING_6, ALT_6C_EMPTY))
case("6", "alt: while loop placement (budget guard must not trip)", "harness_roundDesign_6", (ROUNDS_3, PACING_6, ALT_6C_WHILE))

BAD_6C_NOT_A_LIST = 'self.items = None\nself.bombs = None\n'
case("6 Part3/3", "BAD: leaves self.items/self.bombs as None (negative control)", "harness_roundDesign_6", (ROUNDS_3, PACING_6, BAD_6C_NOT_A_LIST), expect_ok=False)
BAD_6C_INFINITE = 'self.items = []\nself.bombs = []\nwhile True:\n    pass\n'
case("6 Part3/3", "BAD: infinite loop (must be stopped, not hang)", "harness_roundDesign_6", (ROUNDS_3, PACING_6, BAD_6C_INFINITE), expect_ok=False)
BAD_6_MISSING_PACING = 'PLAYER_MOVE_DELAY_MS = 100\n'
case("6 Part2/3", "BAD: missing ALLOW_PATH_HINT/MAX_HINT_COUNT (negative control)", "harness_roundDesign_6", (ROUNDS_3, BAD_6_MISSING_PACING, CANONICAL_6C), expect_ok=False)


# ================================================================ TODO 7
ASSETS_7A = (
    'PLAYER_IMAGE_PATH = None\n'
    'GOAL_IMAGE_PATH = None\n'
    'BOMB_IMAGE_PATH = None\n'
    'FLOOR_TILE_IMAGE_PATH = None\n'
    'PLAYER_IMAGE_SCALE = 1.0\n'
    'GOAL_IMAGE_SCALE = 1.0\n'
    'BOMB_IMAGE_SCALE = 1.0\n'
    'WALL_COLOR = (30, 41, 59)\n'
    'PLAYER_COLOR = (37, 99, 235)\n'
    'GOAL_COLOR = (250, 204, 21)\n'
    'BOMB_COLOR = (15, 23, 42)\n'
    'BOMB_EXPLOSION_COLOR = (239, 68, 68)\n'
)
ASSETS_7A_FILLED = (
    'PLAYER_IMAGE_PATH = "assets/images/player_ninja.png"\n'
    'GOAL_IMAGE_PATH = "assets/images/goal_chest.png"\n'
    'BOMB_IMAGE_PATH = "assets/images/bomb_2.png"\n'
    'FLOOR_TILE_IMAGE_PATH = "assets/images/floor_tile_1.png"\n'
    'PLAYER_IMAGE_SCALE = 1.4\n'
    'GOAL_IMAGE_SCALE = 0.8\n'
    'BOMB_IMAGE_SCALE = 1.1\n'
    'WALL_COLOR = (30, 41, 59)\n'
    'PLAYER_COLOR = (37, 99, 235)\n'
    'GOAL_COLOR = (250, 204, 21)\n'
    'BOMB_COLOR = (15, 23, 42)\n'
    'BOMB_EXPLOSION_COLOR = (239, 68, 68)\n'
)
SOUND_7B = (
    'BOMB_SOUND_PATH = "assets/sounds/explosion_1.wav"\n'
    'BACKGROUND_MUSIC_PATH = "assets/sounds/bgm_1.wav"\n'
    'BOMB_EXPLOSION_DURATION_MS = 500\n'
    'BACKGROUND_MUSIC_VOLUME = 0.25\n'
)
SOUND_7B_SILENT = (
    'BOMB_SOUND_PATH = None\n'
    'BACKGROUND_MUSIC_PATH = None\n'
    'BOMB_EXPLOSION_DURATION_MS = 500\n'
    'BACKGROUND_MUSIC_VOLUME = 0.0\n'
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
case("7", "canonical (loop forever)", "harness_lookAndFeel_7", (ASSETS_7A, SOUND_7B, CANONICAL_7C))
case("7", "alt: real images and non-default sizes", "harness_lookAndFeel_7", (ASSETS_7A_FILLED, SOUND_7B, CANONICAL_7C))
case("7", "alt: play the music exactly once", "harness_lookAndFeel_7", (ASSETS_7A, SOUND_7B, ALT_7C_PLAY_ONCE))
case("7", "alt: fade the music in", "harness_lookAndFeel_7", (ASSETS_7A, SOUND_7B, ALT_7C_FADE_IN))
case("7", "alt: no music at all", "harness_lookAndFeel_7", (ASSETS_7A, SOUND_7B_SILENT, ALT_7C_SILENT))
# No try/except is only a WARNING (open-ended grading), so this must PASS.
ALT_7C_NO_TRY = (
    'if BACKGROUND_MUSIC_PATH is None:\n'
    '    return\n'
    'pygame.mixer.init()\n'
    'pygame.mixer.music.load(BACKGROUND_MUSIC_PATH)\n'
    'pygame.mixer.music.play(-1)\n'
)
case("7", "alt: no try/except (warns, still passes)", "harness_lookAndFeel_7", (ASSETS_7A, SOUND_7B, ALT_7C_NO_TRY))

BAD_7A_MISSING_SCALE = ASSETS_7A.replace('GOAL_IMAGE_SCALE = 1.0\n', '')
case("7 Part1/3", "BAD: missing GOAL_IMAGE_SCALE (negative control)", "harness_lookAndFeel_7", (BAD_7A_MISSING_SCALE, SOUND_7B, CANONICAL_7C), expect_ok=False)
BAD_7C_RAISES = 'raise RuntimeError("boom")\n'
case("7 Part3/3", "BAD: always raises (negative control)", "harness_lookAndFeel_7", (ASSETS_7A, SOUND_7B, BAD_7C_RAISES), expect_ok=False)


# ============================================== TODO 8 Part 3/3 (the pickup)
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
case("8 Part3/3", "alt: a different sound per effect", "harness_customItems_8", (ITEM1_MINIMAL, CANONICAL_8B, ALT_8C_SOUND_BY_EFFECT))
case("8 Part3/3", "alt: index loop with continue guards", "harness_customItems_8", (ITEM1_MINIMAL, CANONICAL_8B, ALT_8C_INDEX_LOOP))
case("8 Part3/3", "alt: reads self.player.get_position() itself", "harness_customItems_8", (ITEM1_MINIMAL, CANONICAL_8B, ALT_8C_SELF_PLAYER))

BAD_8C_NO_DEACTIVATE = (
    'for item in self.items:\n'
    '    if item.active and item.get_position() == player_position:\n'
    '        self.apply_custom_item_effect(item.item_def)\n'
)
case("8 Part3/3", "BAD: never sets item.active = False (negative control)", "harness_customItems_8", (ITEM1_MINIMAL, CANONICAL_8B, BAD_8C_NO_DEACTIVATE), expect_ok=False)
BAD_8C_NO_EFFECT = (
    'for item in self.items:\n'
    '    if item.active and item.get_position() == player_position:\n'
    '        item.active = False\n'
)
case("8 Part3/3", "BAD: collects but never applies the effect (negative control)", "harness_customItems_8", (ITEM1_MINIMAL, CANONICAL_8B, BAD_8C_NO_EFFECT), expect_ok=False)


# ================================================================ TODO 9
RULES_9A = (
    'MISSION_RULES = [\n'
    '    "Collect every crystal, then reach the goal.",\n'
    ']\n'
    'HOW_TO_PLAY_RULES = [\n'
    '    "Move with the arrow keys.",\n'
    '    "Bombs send you back to the start.",\n'
    ']\n'
)
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
case("9", "canonical (reach the goal)", "harness_gameRules_9", (RULES_9A, CANONICAL_9B))
case("9", "alt: every item must be collected first", "harness_gameRules_9", (RULES_9A, ALT_9B_ALL_ITEMS))
case("9", "alt: positive condition instead of early return", "harness_gameRules_9", (RULES_9A, ALT_9B_POSITIVE))

BAD_9B_ALWAYS_CLEARS = 'self.game_clear = True\n'
case("9 Part2/2", "BAD: clears the round from anywhere (negative control)", "harness_gameRules_9", (RULES_9A, BAD_9B_ALWAYS_CLEARS), expect_ok=False)
BAD_9A_MISSING = 'MISSION_RULES = ["Reach the goal."]\n'
case("9 Part1/2", "BAD: missing HOW_TO_PLAY_RULES (negative control)", "harness_gameRules_9", (BAD_9A_MISSING, CANONICAL_9B), expect_ok=False)
BAD_9B_RAISES = 'raise ValueError("nope")\n'
case("9 Part2/2", "BAD: raises (negative control)", "harness_gameRules_9", (RULES_9A, BAD_9B_RAISES), expect_ok=False)


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
