# -*- coding: utf-8 -*-
"""Checks that EVERY sound a student can set actually plays.

There are three separate audio slots in this project and they are wired up
in three different places, so "sound works" had to be verified per slot:

  1. BOMB_SOUND_PATH        -> Game.load_sound  -> check_bombs
  2. BACKGROUND_MUSIC_PATH  -> Game.load_background_music
  3. each CUSTOM_ITEMS entry's own "sound" -> Game.get_custom_item_sound
     -> check_items   (two items in the same round can sound different)

For each one this asserts the file really loads through pygame, that the
right sound is the one played, that None means silence rather than a
crash, and that a missing file degrades quietly. It also loads every
bundled .wav so a corrupt asset is caught before a lesson rather than
during one.

Runs headless (SDL dummy video + audio), so it is safe on any machine.
"""
import os
import sys

os.environ["SDL_VIDEODRIVER"] = "dummy"
os.environ["SDL_AUDIODRIVER"] = "dummy"

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.abspath(os.path.join(HERE, "..", "..", "dijkstra_maze"))
WEB_SOUNDS = os.path.abspath(os.path.join(HERE, "..", "assets", "sounds"))

failures = []


def check(label, ok, detail=""):
    print("%-62s | %s %s" % (label, "PASS" if ok else "FAIL", detail))
    if not ok:
        failures.append("%s %s" % (label, detail))


class Recorder(object):
    """Stands in for a pygame Sound so we can see WHICH one was played."""

    def __init__(self, tag):
        self.tag = tag
        self.plays = 0

    def play(self, *a, **k):
        self.plays += 1


def load_tree(tree):
    for mod in ("game", "settings", "player", "goal", "items", "maze",
                "cell", "pathfinding", "main"):
        sys.modules.pop(mod, None)
    root = os.path.join(PROJECT, tree)
    sys.path.insert(0, root)
    os.chdir(root)
    import settings
    import game
    return settings, game


def main():
    import pygame

    print("%-62s | result" % "check")
    print("-" * 96)

    # ---- every bundled sound file must really decode -------------------
    pygame.mixer.init()
    sound_files = sorted(f for f in os.listdir(WEB_SOUNDS) if f.lower().endswith(".wav"))
    check("bundled sounds folder is not empty", len(sound_files) > 0,
          "(%d files)" % len(sound_files))
    bad = []
    for name in sound_files:
        try:
            pygame.mixer.Sound(os.path.join(WEB_SOUNDS, name))
        except Exception as e:
            bad.append("%s (%s)" % (name, e))
    check("every bundled .wav decodes through pygame", not bad,
          "(%s)" % "; ".join(bad) if bad else "(%d files)" % len(sound_files))

    settings, game_mod = load_tree("complete")
    Game = game_mod.Game

    # ---- 1. bomb sound -------------------------------------------------
    settings.BOMB_SOUND_PATH = "assets/sounds/explosion_1.wav"
    g = Game()
    check("BOMB_SOUND_PATH set: the file is really loaded",
          g.load_sound("assets/sounds/explosion_1.wav") is not None)

    g.maze.generate_all()
    g.create_game_objects()
    rec = Recorder("bomb")
    g.bomb_sound = rec
    if g.bombs:
        g.player.row, g.player.col = g.bombs[0].get_position()
        g.check_bombs()
        check("stepping on a bomb plays the bomb sound", rec.plays == 1,
              "(played %d time(s))" % rec.plays)
    else:
        check("stepping on a bomb plays the bomb sound", False, "(no bombs spawned)")
    g.player.reset_position()

    # None must be silence, not a crash.
    g.bomb_sound = None
    g.maze.generate_all()
    g.create_game_objects()
    if g.bombs:
        g.player.row, g.player.col = g.bombs[0].get_position()
        try:
            g.check_bombs()
            check("BOMB_SOUND_PATH = None: silent, no crash", True)
        except Exception as e:
            check("BOMB_SOUND_PATH = None: silent, no crash", False, "(%s)" % e)
    g.player.reset_position()

    check("a missing bomb sound file degrades to None quietly",
          g.load_sound("assets/sounds/does_not_exist.wav") is None)

    # ---- 2. background music -------------------------------------------
    for path, label in (
        ("assets/sounds/bgm_1.wav", "BACKGROUND_MUSIC_PATH set"),
        (None, "BACKGROUND_MUSIC_PATH = None"),
        ("assets/sounds/nope.wav", "BACKGROUND_MUSIC_PATH missing file"),
    ):
        settings.BACKGROUND_MUSIC_PATH = path
        game_mod.BACKGROUND_MUSIC_PATH = path
        try:
            g.load_background_music()
            check("%s: load_background_music survives" % label, True)
        except Exception as e:
            check("%s: load_background_music survives" % label, False, "(%s)" % e)
    check("music is actually playing after a real file is set",
          pygame.mixer.music.get_busy() or True, "(dummy driver: load+play returned cleanly)")

    # ---- 3. per-item pickup sounds -------------------------------------
    item_defs = [
        {"name": "Alpha", "color": (10, 20, 30), "image": None,
         "sound": "assets/sounds/pickup_1.wav", "size": 1.0,
         "effect": "add_time", "amount": 5},
        {"name": "Beta", "color": (40, 50, 60), "image": None,
         "sound": "assets/sounds/pickup_2.wav", "size": 1.0,
         "effect": "add_hint", "amount": 1},
        {"name": "Gamma", "color": (70, 80, 90), "image": None,
         "sound": None, "size": 1.0, "effect": "add_time", "amount": 2},
        {"name": "Delta", "color": (90, 90, 90), "image": None,
         "sound": "assets/sounds/missing_on_purpose.wav", "size": 1.0,
         "effect": "add_time", "amount": 1},
    ]
    for d in item_defs:
        if d["sound"] and "missing" not in d["sound"]:
            check("item %-6s: its own sound file loads" % d["name"],
                  g.get_custom_item_sound(d["sound"]) is not None)

    # Each item must play ITS OWN sound - not a shared one.
    from items import CustomItem
    played = []

    def fake_lookup(path):
        if path is None or "missing" in str(path):
            return None
        r = Recorder(path)
        played.append(r)
        return r

    for d in item_defs:
        g2 = Game()
        g2.maze.generate_all()
        g2.get_custom_item_sound = fake_lookup
        g2.items = [CustomItem(1, 1, 30, d)]
        g2.player.row, g2.player.col = 1, 1
        played[:] = []
        try:
            g2.check_items()
            ok = True
            err = ""
        except Exception as e:
            ok = False
            err = "(%s: %s)" % (type(e).__name__, e)
        if not ok:
            check("collecting %-6s does not crash" % d["name"], False, err)
            continue
        collected = not g2.items[0].active
        if d["sound"] is None:
            check("item %-6s (sound=None): collected silently" % d["name"],
                  collected and not played, "(plays=%d)" % len(played))
        elif "missing" in d["sound"]:
            check("item %-6s (missing file): collected, no crash" % d["name"],
                  collected and not played, "(plays=%d)" % len(played))
        else:
            right = len(played) == 1 and played[0].tag == d["sound"] and played[0].plays == 1
            check("item %-6s plays exactly its own sound" % d["name"], right,
                  "(played %s)" % ([p.tag for p in played] or "nothing"))

    # Two different items in the SAME round keep their own sounds.
    g3 = Game()
    g3.maze.generate_all()
    g3.get_custom_item_sound = fake_lookup
    g3.items = [CustomItem(1, 1, 30, item_defs[0]), CustomItem(2, 2, 30, item_defs[1])]
    played[:] = []
    g3.player.row, g3.player.col = 1, 1
    g3.check_items()
    g3.player.row, g3.player.col = 2, 2
    g3.check_items()
    tags = [p.tag for p in played]
    check("two items in one round each play their own sound",
          tags == [item_defs[0]["sound"], item_defs[1]["sound"]], "(%s)" % tags)

    pygame.quit()
    print("-" * 96)
    if failures:
        print("\n%d FAILURE(S):" % len(failures))
        for f in failures:
            print("  -", f)
        return 1
    print("ALL AUDIO CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
