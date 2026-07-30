# -*- coding: utf-8 -*-
"""Adversarial suite: throws deliberately awful "student code" at every
grading harness and demands that each one still comes back with a clean,
well-formed verdict.

The rule being tested is not "is this graded correctly" - a lot of these
snippets have no correct answer - it is the weaker but far more important
one: *the grader never breaks*. For every snippet, in every slot, of every
harness, the harness must

  * finish (no hang - the line budget has to stop runaway loops),
  * exit cleanly (no traceback escaping to the browser),
  * print one JSON object with the usual keys, and
  * report ok as a real boolean.

A student mid-lesson will type all of this and worse. Anything that gets
through here shows up as "The grading engine could not run", which is the
one failure mode with no useful advice attached to it.
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_harnesses import generate_harness_source  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REQUIRED_KEYS = ("ok", "passed", "failed", "warnings", "error")

# ------------------------------------------------------------------ inputs
#
# Each entry is (label, code). They are fed into every slot of every
# harness, so they have to be things a student could plausibly leave behind
# in ANY of the code boxes.
NASTY = [
    ("empty", ""),
    ("blank lines only", "\n\n   \n\t\n"),
    ("a comment only", "# I will do this later\n"),
    ("comment with no indent", "        x = 1\n# note\n        y = 2\n"),
    ("just pass", "pass\n"),
    ("the starter left untouched", "pass  # Write your code here.\n"),
    ("a bare return", "return\n"),
    ("return a value", "return 42\n"),
    ("return None early", "return None\n"),
    ("syntax error: missing colon", "if True\n    pass\n"),
    ("syntax error: unclosed bracket", "x = [1, 2\n"),
    ("syntax error: stray quote", "name = 'oops\n"),
    ("indentation error", "x = 1\n  y = 2\n"),
    ("tabs and spaces mixed", "if True:\n\tx = 1\n        y = 2\n"),
    ("NameError", "print(this_name_does_not_exist)\n"),
    ("TypeError", "x = 1 + 'two'\n"),
    ("ZeroDivisionError", "x = 1 / 0\n"),
    ("KeyError", "d = {}\nx = d['nope']\n"),
    ("IndexError", "x = [][3]\n"),
    ("AttributeError on self", "self.does_not_exist.blah = 1\n"),
    ("RecursionError", "def f(n):\n    return f(n + 1)\nf(0)\n"),
    ("infinite while", "while True:\n    pass\n"),
    ("infinite for", "n = 0\nwhile n >= 0:\n    n += 1\n"),
    ("nested infinite loop", "while True:\n    for i in range(10):\n        pass\n"),
    ("very long but finite loop", "total = 0\nfor i in range(500000):\n    total += i\n"),
    ("assert False", "assert False, 'nope'\n"),
    ("raise a custom error", "class Boom(Exception):\n    pass\nraise Boom('bang')\n"),
    ("raise BaseException", "raise BaseException('low level')\n"),
    ("raise KeyboardInterrupt", "raise KeyboardInterrupt()\n"),
    ("sys.exit()", "import sys\nsys.exit(3)\n"),
    ("exit()", "exit()\n"),
    ("quit()", "quit()\n"),
    ("os.exit-ish", "import os\nprint(os.name)\n"),
    ("import something heavy", "import json, math, random\nx = math.pi\n"),
    ("print a lot", "for i in range(200):\n    print('noise', i)\n"),
    ("emoji and unicode", "name = '✨ 별 아이템 \U0001f31f'\n"),
    ("non-ascii identifier", "이름 = 'hi'\n"),
    ("shadow a builtin", "list = 5\nprint = 7\n"),
    ("delete a name", "x = 1\ndel x\n"),
    ("mutate the arguments", "self.__dict__.clear()\n"),
    ("reassign self", "self = None\n"),
    ("define a class", "class Thing:\n    def go(self):\n        return 1\nThing().go()\n"),
    ("lambda and comprehension", "f = lambda n: n * 2\nvals = [f(i) for i in range(5)]\n"),
    ("try/except that swallows", "try:\n    x = 1 / 0\nexcept Exception:\n    pass\n"),
    ("bare except", "try:\n    pass\nexcept:\n    pass\n"),
    ("a big string", "blob = 'x' * 200000\n"),
    ("global statement", "global counter\ncounter = 1\n"),
    ("yield (makes it a generator)", "yield 1\n"),
    ("await outside async", "await something\n"),
    ("f-string", "n = 3\nmsg = f'value {n}'\n"),
    ("walrus", "if (n := 5) > 1:\n    pass\n"),
    ("semicolons everywhere", "a = 1; b = 2; c = a + b\n"),
    ("windows line endings", "x = 1\r\ny = 2\r\n"),
    ("trailing whitespace", "x = 1   \ny = 2\t\n"),
    ("null-ish text", "x = None\ny = x.attribute\n"),
]

# ------------------------------------------------------------- harnesses
#
# arity = how many code slots the harness takes. Every slot gets fuzzed in
# turn while the others hold a known-good body, so a failure points at one
# specific slot.
GOOD = {
    "harness_movement_2": [
        'if keys[pygame.K_LEFT] or keys[pygame.K_e]:\n'
        '    self.player.velocity.x -= self.player.acceleration\n'
        'if keys[pygame.K_RIGHT] or keys[pygame.K_f]:\n'
        '    self.player.velocity.x += self.player.acceleration\n'
        'if keys[pygame.K_UP] or keys[pygame.K_c]:\n'
        '    self.player.velocity.y -= self.player.acceleration\n'
        'if keys[pygame.K_DOWN] or keys[pygame.K_d]:\n'
        '    self.player.velocity.y += self.player.acceleration\n',
        'self.player.velocity.x *= self.player.friction\n'
        'self.player.velocity.y *= self.player.friction\n',
        'speed_x = self.player.velocity.x\n'
        'speed_y = self.player.velocity.y\n'
        'if abs(speed_x) >= abs(speed_y) and abs(speed_x) >= PLAYER_MOVE_THRESHOLD:\n'
        '    direction = "right" if speed_x > 0 else "left"\n'
        '    moved = self.player.try_move(direction, self.maze)\n'
        'elif abs(speed_y) >= PLAYER_MOVE_THRESHOLD:\n'
        '    direction = "bottom" if speed_y > 0 else "top"\n'
        '    moved = self.player.try_move(direction, self.maze)\n',
    ],
    "harness_guardClause_3": [
        'if current is None or current.walls[direction]:\n    return False\n',
    ],
    "harness_positionDelta_4": [
        'self.row += dr\nself.col += dc\n',
    ],
    "harness_dijkstra_5": [
        'new_cost = cost + step_cost\n',
        'if neighbor not in distance or new_cost < distance[neighbor]:\n'
        '    distance[neighbor] = new_cost\n'
        '    parent[neighbor] = current\n'
        '    heapq.heappush(queue, (new_cost, neighbor))\n',
    ],
    "harness_roundDesign_8": [
        'ROUND_CONFIGS = [\n'
        '    {"rows": 9, "cols": 11, "cell_size": 30, "extra_open_walls": 4,\n'
        '     "bomb_count": 2, "custom_item_count": 2, "time_limit_seconds": 60},\n'
        ']\n',
        'PLAYER_MOVE_DELAY_MS = 100\nPLAYER_ACCELERATION = 0.9\nPLAYER_FRICTION = 0.88\n'
        'PLAYER_MOVE_THRESHOLD = 1.5\nALLOW_PATH_HINT = True\nMAX_HINT_COUNT = 2\n',
        'self.items = []\nself.bombs = []\n',
    ],
    "harness_lookAndFeel_9": [
        'PLAYER_IMAGE_PATH = None\nGOAL_IMAGE_PATH = None\nBOMB_IMAGE_PATH = None\n'
        'FLOOR_TILE_IMAGE_PATH = None\nPLAYER_IMAGE_SCALE = 1.0\nGOAL_IMAGE_SCALE = 1.0\n'
        'BOMB_IMAGE_SCALE = 1.0\nWALL_COLOR = (30, 41, 59)\nPLAYER_COLOR = (37, 99, 235)\n'
        'GOAL_COLOR = (250, 204, 21)\nBOMB_COLOR = (15, 23, 42)\n'
        'BOMB_EXPLOSION_COLOR = (239, 68, 68)\n',
        'BOMB_SOUND_PATH = None\nBACKGROUND_MUSIC_PATH = None\n'
        'BOMB_EXPLOSION_DURATION_MS = 500\nBACKGROUND_MUSIC_VOLUME = 0.25\n',
        'return\n',
    ],
    "harness_customItems_10": [
        'CUSTOM_ITEMS = [{"name": "x", "color": (1, 2, 3), "effect": "add_time", "amount": 5}]\n',
        'if effect == "add_time":\n    self.bonus_time_seconds += amount\n'
        'elif effect == "add_hint":\n    self.hints_remaining += amount\n',
        'for item in self.items:\n'
        '    if item.active and item.get_position() == player_position:\n'
        '        item.active = False\n'
        '        self.apply_custom_item_effect(item.item_def)\n',
    ],
    "harness_gameRules_11": [
        'MISSION_RULES = ["Reach the goal."]\nHOW_TO_PLAY_RULES = ["Move."]\n',
        'if self.player.get_position() != self.goal.get_position():\n'
        '    return\n'
        'if self.current_round == len(ROUND_CONFIGS) - 1:\n'
        '    self.game_clear = True\n'
        'else:\n'
        '    self.round_transition_time = pygame.time.get_ticks()\n',
    ],
}

TIMEOUT_SECONDS = 60
problems = []
runs = 0


def run_case(harness, slot, label, code):
    """Runs one fuzz case and returns a problem description, or None."""
    global runs
    args = list(GOOD[harness])
    args[slot] = code
    try:
        py_src = generate_harness_source(harness, *args)
    except SystemExit as e:
        return "harness generator itself failed: %s" % e
    wrapped = py_src.rstrip()[: -len("_run()")] + "print(_run())"
    path = os.path.join(HERE, "_fuzz_case_%d.py" % os.getpid())
    with open(path, "w", encoding="utf-8") as f:
        f.write(wrapped)
    # Several snippets are deliberately full of Korean text and emoji, so
    # the child's output has to be read as UTF-8 - the console default on a
    # Korean Windows box is cp949 and would blow up on its own test data.
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    try:
        r = subprocess.run([sys.executable, path], capture_output=True,
                           encoding="utf-8", errors="replace",
                           timeout=TIMEOUT_SECONDS, env=env)
    except subprocess.TimeoutExpired:
        return "HUNG (no result within %ds - the loop guard did not stop it)" % TIMEOUT_SECONDS
    runs += 1
    if r.returncode != 0:
        tail = (r.stderr or "").strip().splitlines()[-1:] or ["(no stderr)"]
        return "process exited %d: %s" % (r.returncode, tail[0])
    out = (r.stdout or "").strip().splitlines()
    if not out:
        return "printed nothing"
    try:
        data = json.loads(out[-1])
    except Exception as e:
        return "last line was not JSON (%s): %r" % (e, out[-1][:120])
    missing = [k for k in REQUIRED_KEYS if k not in data]
    if missing:
        return "result is missing key(s): %s" % ", ".join(missing)
    if not isinstance(data["ok"], bool):
        return "ok is %r, not a boolean" % (data["ok"],)
    for key in ("passed", "failed", "warnings"):
        if not isinstance(data[key], list):
            return "%s is %r, not a list" % (key, data[key])
    if data["ok"] and data["error"]:
        return "reported ok while also reporting an error: %s" % data["error"]
    return None


print("Fuzzing %d snippets across %d harnesses...\n" % (len(NASTY), len(GOOD)))
for harness in sorted(GOOD):
    arity = len(GOOD[harness])
    print("%s (%d slot%s)" % (harness, arity, "" if arity == 1 else "s"))
    for slot in range(arity):
        bad_here = 0
        for label, code in NASTY:
            problem = run_case(harness, slot, label, code)
            if problem:
                bad_here += 1
                problems.append("%s slot %d / %s: %s" % (harness, slot + 1, label, problem))
        mark = "ok" if bad_here == 0 else "%d PROBLEM(S)" % bad_here
        print("   slot %d: %d snippets -> %s" % (slot + 1, len(NASTY), mark))

print("\n%d harness runs completed." % runs)
if problems:
    print("\n%d PROBLEM(S):" % len(problems))
    for p in problems:
        print("  -", p)
    sys.exit(1)
print("NO HARNESS EVER CRASHED, HUNG, OR RETURNED A MALFORMED RESULT")
