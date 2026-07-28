import json, base64, traceback

CODE1 = base64.b64decode("Q1VTVE9NX0lURU1TID0gW3sibmFtZSI6ICJUaW1lIENyeXN0YWwiLCAiY29sb3IiOiAoMTQsIDE2NSwgMjMzKSwgImltYWdlIjogImFzc2V0cy9pbWFnZXMvaXRlbV9nZW1fMS5wbmciLCAic291bmQiOiAiYXNzZXRzL3NvdW5kcy9waWNrdXBfMS53YXYiLCAiZWZmZWN0IjogImFkZF90aW1lIiwgImFtb3VudCI6IDE1fV0=").decode("utf-8")
FN2_SRC = base64.b64decode("ZGVmIF9mbihzZWxmLCBlZmZlY3QsIGFtb3VudCk6CiAgICBpZiBlZmZlY3QgPT0gImFkZF90aW1lIjoKICAgICAgICBzZWxmLmJvbnVzX3RpbWVfc2Vjb25kcyArPSBhbW91bnQKICAgIGVsaWYgZWZmZWN0ID09ICJhZGRfaGludCI6CiAgICAgICAgc2VsZi5oaW50c19yZW1haW5pbmcgKz0gYW1vdW50CiAgICByZXR1cm4gbG9jYWxzKCkK").decode("utf-8")
ITEM_KEYS = ['name','color','effect','amount']
KNOWN_EFFECTS = ['add_time', 'add_hint']
KNOWN_IMAGES = ['apple.png','bomb.png','bomb_2.png','boy.png','candy.png','duck.png','explode.png','explode_2.png','floor_tile_1.png','floor_tile_2.png','goal_chest.png','goal_door.png','goal_flag.png','house.png','item_coin.png','item_gem_1.png','item_gem_2.png','item_star.png','lion.png','monster_shadow.png','player_ninja.png','player_robot.png','terrain_ice.png','terrain_lava.png','terrain_mud.png','terrain_swamp_1.png','terrain_swamp_2.png']
KNOWN_SOUNDS = ['bgm_1.wav','bgm_2.wav','explosion_1.wav','explosion_2.wav','explosion_3.wav','pickup_1.wav','pickup_2.wav','pickup_3.wav','squish_1.wav','squish_2.wav']
IMAGE_EXT = ('.png', '.jpg', '.jpeg', '.gif', '.bmp')
SOUND_EXT = ('.wav', '.mp3', '.ogg')
def _short_repr(v):
    try:
        r = repr(v)
    except Exception:
        r = '<value of type %s>' % type(v).__name__
    return r if len(r) <= 70 else r[:67] + '...'
def _run():
    result = {'ok': False, 'passed': [], 'failed': [], 'warnings': [], 'error': None, 'traceback': None}
    try:
        compile(CODE1, '<student-part1>', 'exec')
    except SyntaxError as e:
        result['error'] = 'Part 1: Python syntax error on line %s: %s.' % (e.lineno, e.msg)
        return json.dumps(result)
    try:
        ns1 = {}
        exec(compile(CODE1, '<student-part1>', 'exec'), {}, ns1)
        if 'CUSTOM_ITEMS' not in ns1:
            result['failed'].append('Part 1: Missing definition: CUSTOM_ITEMS.')
        else:
            items_list = ns1['CUSTOM_ITEMS']
            if not isinstance(items_list, list) or len(items_list) == 0:
                result['warnings'].append('Heads up: CUSTOM_ITEMS is usually a non-empty list of item dictionaries — this still counts as complete, but double-check it in the Play tab.')
                result['passed'].append('Part 1: CUSTOM_ITEMS is defined.')
            else:
                result['passed'].append('Part 1: CUSTOM_ITEMS is defined with %d item(s).' % len(items_list))
                for i, item_def in enumerate(items_list):
                    label = 'item %d' % (i + 1)
                    if not isinstance(item_def, dict):
                        result['warnings'].append('Heads up: %s is not a dictionary.' % label)
                        continue
                    keys = set(item_def.keys())
                    missing_keys = set(ITEM_KEYS) - keys
                    if missing_keys:
                        result['warnings'].append('Heads up: %s is missing key(s): %s.' % (label, ', '.join(sorted(missing_keys))))
                        continue
                    color = item_def.get('color')
                    if not (isinstance(color, tuple) and len(color) == 3 and all(isinstance(v, int) and 0 <= v <= 255 for v in color)):
                        result['warnings'].append('Heads up: %s color is usually a 3-tuple of ints 0-255, e.g. (255, 215, 0) — still counts as complete, but double-check it renders correctly.' % label)
                    effect = item_def.get('effect')
                    if effect not in KNOWN_EFFECTS:
                        result['warnings'].append('Heads up: %s[\'effect\'] = %s is not one of the built-in effects (%s) — this still counts as complete (an unrecognized effect is a safe no-op in the real game), but double-check it is the effect you meant.' % (label, _short_repr(effect), ', '.join(KNOWN_EFFECTS)))
                    if type(item_def.get('amount')) is not int:
                        result['warnings'].append('Heads up: %s[\'amount\'] is usually a plain integer — this still counts as complete, but double-check it behaves as expected.' % label)
                    def _check_asset_field(field, folder, exts, known):
                        val = item_def.get(field)
                        if val is None:
                            return
                        if not isinstance(val, str):
                            result['warnings'].append("Heads up: %s['%s'] should be None or a string path — this still counts as complete, but the real game will likely error when it tries to load this." % (label, field))
                            return
                        norm = val.replace(chr(92), '/')
                        if not norm.startswith(folder) or not norm.lower().endswith(exts):
                            result['warnings'].append("Heads up: %s['%s'] = %s doesn't look like a path under %s with a valid extension — double-check it, though this still counts as complete." % (label, field, _short_repr(val), folder))
                            return
                        base = norm.rsplit('/', 1)[-1]
                        if base not in known:
                            result['warnings'].append("%s['%s'] = %s — this isn't one of the bundled files, but it will work once you add your own file at that path." % (label, field, _short_repr(val)))
                    _check_asset_field('image', 'assets/images/', IMAGE_EXT, KNOWN_IMAGES)
                    _check_asset_field('sound', 'assets/sounds/', SOUND_EXT, KNOWN_SOUNDS)
                    result['passed'].append('%s: %s' % (label, _short_repr(item_def)))
    except Exception as e:
        result['error'] = 'Part 1: %s: %s' % (type(e).__name__, e)
        result['traceback'] = traceback.format_exc()
        return json.dumps(result)
    try:
        exec(compile(FN2_SRC, '<student-part2>', 'exec'), {}, {})
    except SyntaxError as e:
        line = max(1, (e.lineno or 1) - 1)
        result['error'] = 'Part 2: Python syntax error on line %s: %s.' % (line, e.msg)
        return json.dumps(result)
    try:
        class SelfObj:
            def __init__(self, bonus_time_seconds, hints_remaining):
                self.bonus_time_seconds = bonus_time_seconds
                self.hints_remaining = hints_remaining
        cases = [
            ('add_time adds seconds', 'add_time', 15, (0, 2), (15, 2)),
            ('add_time stacks on existing bonus time', 'add_time', 10, (30, 1), (40, 1)),
            ('add_hint adds a hint use', 'add_hint', 1, (0, 2), (0, 3)),
            ('add_hint with a larger amount', 'add_hint', 2, (5, 0), (5, 2)),
            ('an unrecognized effect is a safe no-op', 'shrink_maze', 999, (3, 1), (3, 1)),
        ]
        for label, effect, amount, start, expect in cases:
            ns2 = {}
            exec(compile(FN2_SRC, '<student-part2>', 'exec'), {}, ns2)
            self_ = SelfObj(start[0], start[1])
            try:
                ns2['_fn'](self_, effect, amount)
            except Exception as e:
                result['failed'].append('Part 2 (%s): raised %s: %s - an unrecognized effect must be a safe no-op, never an error.' % (label, type(e).__name__, e))
                continue
            if self_.bonus_time_seconds == expect[0] and self_.hints_remaining == expect[1]:
                result['passed'].append('Part 2 (%s): OK' % label)
            else:
                result['failed'].append('Part 2 (%s): expected (bonus_time_seconds, hints_remaining) == %r, got %r.' % (label, expect, (self_.bonus_time_seconds, self_.hints_remaining)))
    except Exception as e:
        result['error'] = 'Part 2: %s: %s' % (type(e).__name__, e)
        result['traceback'] = traceback.format_exc()
    result['ok'] = result['error'] is None and len(result['failed']) == 0
    return json.dumps(result)
print(_run())