import json, base64, traceback
import sys
class _StepBudget(Exception):
    pass
def _run_guarded(fn, args, budget=300000):
    counter = [0]
    def _tracer(frame, event, arg):
        counter[0] += 1
        if counter[0] > budget:
            raise _StepBudget()
        return _tracer
    sys.settrace(_tracer)
    try:
        return fn(*args)
    finally:
        sys.settrace(None)
def _short_repr(v):
    try:
        r = repr(v)
    except Exception:
        r = '<value of type %s>' % type(v).__name__
    return r if len(r) <= 70 else r[:67] + '...'
IMAGE_EXT = ('.png', '.jpg', '.jpeg', '.gif', '.bmp')
SOUND_EXT = ('.wav', '.mp3', '.ogg')
def _new_result():
    return {'ok': False, 'passed': [], 'failed': [], 'warnings': [], 'error': None, 'traceback': None}
def _exec_settings(result, code, label):
    try:
        compile(code, '<student>', 'exec')
    except SyntaxError as e:
        result['error'] = '%s: Python syntax error on line %s: %s.' % (label, e.lineno, e.msg)
        return None
    ns = {}
    try:
        exec(compile(code, '<student>', 'exec'), {}, ns)
    except Exception as e:
        result['error'] = '%s: %s: %s' % (label, type(e).__name__, e)
        result['traceback'] = traceback.format_exc()
        return None
    return ns
def _compile_body(result, src, label):
    ns = {}
    try:
        exec(compile(src, '<student>', 'exec'), {}, ns)
    except SyntaxError as e:
        line = max(1, (e.lineno or 1) - 1)
        result['error'] = '%s: Python syntax error on line %s: %s.' % (label, line, e.msg)
        return None
    except Exception as e:
        result['error'] = '%s: %s: %s' % (label, type(e).__name__, e)
        result['traceback'] = traceback.format_exc()
        return None
    return ns.get('_fn')
def _call_body(fn, args, label):
    try:
        _run_guarded(fn, args)
        return True, None
    except _StepBudget:
        return False, ('%s: your code was still running after a very long time, so it was stopped. '
                       'This almost always means a loop that never ends - check that every while loop '
                       'can actually reach its stopping condition.') % label
    except Exception as e:
        return False, '%s: raised %s: %s' % (label, type(e).__name__, e)
def _check_path(result, label, val, folder, known):
    exts = IMAGE_EXT if folder == 'assets/images/' else SOUND_EXT
    if val is None:
        return
    if not isinstance(val, str):
        result['warnings'].append('Heads up: %s should be None or a string path — this still counts as complete, but the real game will error when it tries to load this.' % label)
        return
    norm = val.replace(chr(92), '/')
    if not norm.startswith(folder) or not norm.lower().endswith(exts):
        result['warnings'].append("Heads up: %s = %s doesn't look like a path under %s with a valid extension — double-check it, though this still counts as complete." % (label, _short_repr(val), folder))
        return
    base = norm.rsplit('/', 1)[-1]
    if base not in known:
        result['warnings'].append("%s = %s — this isn't one of the bundled files, but it will work once you add your own file at that path." % (label, _short_repr(val)))
def _check_color(result, label, val):
    if not (isinstance(val, tuple) and len(val) == 3 and all(isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= 255 for v in val)):
        result['warnings'].append('Heads up: %s is usually a 3-tuple of ints 0-255, e.g. (37, 99, 235) — this still counts as complete, but double-check it renders correctly in the Play tab.' % label)
def _check_number(result, label, val, types, low=None, high=None):
    if isinstance(val, bool) or not isinstance(val, types):
        result['warnings'].append('Heads up: %s = %s is not the expected number type — this still counts as complete, but double-check it in the Play tab.' % (label, _short_repr(val)))
        return
    if (low is not None and val < low) or (high is not None and val > high):
        result['warnings'].append('Heads up: %s = %s is outside its usual range — this still counts as complete, but double-check it behaves as expected.' % (label, _short_repr(val)))
def _finish(result):
    result['ok'] = result['error'] is None and len(result['failed']) == 0
    return json.dumps(result)
FNA_SRC = base64.b64decode("ZGVmIF9mbihzZWxmLCBweWdhbWUsIGtleXMsIG1vdmVkKToKICAgIGlmIGtleXNbcHlnYW1lLktfTEVGVF0gb3Iga2V5c1tweWdhbWUuS19lXToKICAgICAgICBzZWxmLnBsYXllci52ZWxvY2l0eS54IC09IHNlbGYucGxheWVyLmFjY2VsZXJhdGlvbgogICAgaWYga2V5c1tweWdhbWUuS19SSUdIVF0gb3Iga2V5c1tweWdhbWUuS19mXToKICAgICAgICBzZWxmLnBsYXllci52ZWxvY2l0eS54ICs9IHNlbGYucGxheWVyLmFjY2VsZXJhdGlvbgogICAgaWYga2V5c1tweWdhbWUuS19VUF0gb3Iga2V5c1tweWdhbWUuS19jXToKICAgICAgICBzZWxmLnBsYXllci52ZWxvY2l0eS55IC09IHNlbGYucGxheWVyLmFjY2VsZXJhdGlvbgogICAgaWYga2V5c1tweWdhbWUuS19ET1dOXSBvciBrZXlzW3B5Z2FtZS5LX2RdOgogICAgICAgIHNlbGYucGxheWVyLnZlbG9jaXR5LnkgKz0gc2VsZi5wbGF5ZXIuYWNjZWxlcmF0aW9uCiAgICByZXR1cm4gbG9jYWxzKCkK").decode("utf-8")
FNB_SRC = base64.b64decode("ZGVmIF9mbihzZWxmLCBweWdhbWUsIGtleXMsIG1vdmVkKToKICAgIHNlbGYucGxheWVyLnZlbG9jaXR5LnggKj0gc2VsZi5wbGF5ZXIuZnJpY3Rpb24KICAgIHNlbGYucGxheWVyLnZlbG9jaXR5LnkgKj0gc2VsZi5wbGF5ZXIuZnJpY3Rpb24KICAgIHJldHVybiBsb2NhbHMoKQo=").decode("utf-8")
FNC_SRC = base64.b64decode("ZGVmIF9mbihzZWxmLCBweWdhbWUsIGtleXMsIG1vdmVkLCBQTEFZRVJfTU9WRV9USFJFU0hPTEQpOgogICAgc3BlZWRfeCA9IHNlbGYucGxheWVyLnZlbG9jaXR5LngKICAgIHNwZWVkX3kgPSBzZWxmLnBsYXllci52ZWxvY2l0eS55CiAgICBpZiBhYnMoc3BlZWRfeCkgPj0gYWJzKHNwZWVkX3kpIGFuZCBhYnMoc3BlZWRfeCkgPj0gUExBWUVSX01PVkVfVEhSRVNIT0xEOgogICAgICAgIGRpcmVjdGlvbiA9ICJyaWdodCIgaWYgc3BlZWRfeCA+IDAgZWxzZSAibGVmdCIKICAgICAgICBtb3ZlZCA9IHNlbGYucGxheWVyLnRyeV9tb3ZlKGRpcmVjdGlvbiwgc2VsZi5tYXplKQogICAgZWxpZiBhYnMoc3BlZWRfeSkgPj0gUExBWUVSX01PVkVfVEhSRVNIT0xEOgogICAgICAgIGRpcmVjdGlvbiA9ICJib3R0b20iIGlmIHNwZWVkX3kgPiAwIGVsc2UgInRvcCIKICAgICAgICBtb3ZlZCA9IHNlbGYucGxheWVyLnRyeV9tb3ZlKGRpcmVjdGlvbiwgc2VsZi5tYXplKQogICAgcmV0dXJuIGxvY2FscygpCg==").decode("utf-8")
FN3_SRC = base64.b64decode("ZGVmIF9mbihjdXJyZW50LCBkaXJlY3Rpb24pOgogICAgaWYgY3VycmVudCBpcyBOb25lIG9yIGN1cnJlbnQud2FsbHNbZGlyZWN0aW9uXToKICAgICAgICByZXR1cm4gRmFsc2UKICAgIHJldHVybiBsb2NhbHMoKQo=").decode("utf-8")
FN4_SRC = base64.b64decode("ZGVmIF9mbihzZWxmLCBkciwgZGMpOgogICAgc2VsZi5yb3cgKz0gZHIKICAgIHNlbGYuY29sICs9IGRjCiAgICByZXR1cm4gbG9jYWxzKCkK").decode("utf-8")
GRID = "[[{\"top\":true,\"bottom\":false,\"left\":true,\"right\":false},{\"top\":true,\"bottom\":false,\"left\":false,\"right\":false},{\"top\":true,\"bottom\":false,\"left\":false,\"right\":false},{\"top\":true,\"bottom\":false,\"left\":false,\"right\":false},{\"top\":true,\"bottom\":false,\"left\":false,\"right\":true}],[{\"top\":false,\"bottom\":false,\"left\":true,\"right\":false},{\"top\":false,\"bottom\":false,\"left\":false,\"right\":false},{\"top\":false,\"bottom\":false,\"left\":false,\"right\":false},{\"top\":false,\"bottom\":false,\"left\":false,\"right\":false},{\"top\":false,\"bottom\":false,\"left\":false,\"right\":true}],[{\"top\":false,\"bottom\":false,\"left\":true,\"right\":false},{\"top\":false,\"bottom\":false,\"left\":false,\"right\":false},{\"top\":false,\"bottom\":false,\"left\":false,\"right\":false},{\"top\":false,\"bottom\":false,\"left\":false,\"right\":false},{\"top\":false,\"bottom\":false,\"left\":false,\"right\":true}],[{\"top\":false,\"bottom\":false,\"left\":true,\"right\":false},{\"top\":false,\"bottom\":false,\"left\":false,\"right\":false},{\"top\":false,\"bottom\":false,\"left\":false,\"right\":false},{\"top\":false,\"bottom\":false,\"left\":false,\"right\":false},{\"top\":false,\"bottom\":false,\"left\":false,\"right\":true}],[{\"top\":false,\"bottom\":true,\"left\":true,\"right\":false},{\"top\":false,\"bottom\":true,\"left\":false,\"right\":false},{\"top\":false,\"bottom\":true,\"left\":false,\"right\":false},{\"top\":false,\"bottom\":true,\"left\":false,\"right\":false},{\"top\":false,\"bottom\":true,\"left\":false,\"right\":true}]]"
PRESSED = "K_RIGHT"
START_ROW = 2
START_COL = 0
ACCEL = 0.9
FRICTION = 0.6
THRESHOLD = 1.5
HOLD_FRAMES = 8
COAST_FRAMES = 26
MAX_STEPS = 6
def _run():
    result = {'ok': True, 'error': None, 'traceback': None, 'moved': None, 'calls': [],
              'row': START_ROW, 'col': START_COL, 'path': [], 'wall_violation': False,
              'unexpected_delta': False, 'direction_requested': None, 'try_move_returned': None,
              'velocity': [0.0, 0.0], 'blocked': False, 'stopped_reason': None}
    grid = json.loads(GRID)
    rows = len(grid); cols = len(grid[0]) if rows else 0
    try:
        nsA = {}; exec(compile(FNA_SRC, '<t2a>', 'exec'), {}, nsA)
        nsB = {}; exec(compile(FNB_SRC, '<t2b>', 'exec'), {}, nsB)
        nsC = {}; exec(compile(FNC_SRC, '<t2c>', 'exec'), {}, nsC)
        exec(compile(FN3_SRC, '<t3>', 'exec'), {}, {})
        exec(compile(FN4_SRC, '<t4>', 'exec'), {}, {})
    except SyntaxError as e:
        result['ok'] = False
        result['error'] = 'Python syntax error on line %s: %s.' % (max(1, (e.lineno or 1) - 1), e.msg)
        return json.dumps(result)
    fnA = nsA['_fn']; fnB = nsB['_fn']; fnC = nsC['_fn']
    class Cell(object):
        def __init__(self, r, c):
            self.row = r; self.col = c
            self.walls = dict(grid[r][c])
    cells = [[Cell(r, c) for c in range(cols)] for r in range(rows)]
    class Maze(object):
        def get_cell(self, r, c):
            if 0 <= r < rows and 0 <= c < cols:
                return cells[r][c]
            return None
    maze = Maze()
    DR_DC = {'top': (-1, 0), 'right': (0, 1), 'bottom': (1, 0), 'left': (0, -1)}
    class Vec(object):
        def __init__(self):
            self.x = 0.0; self.y = 0.0
        def update(self, x=0, y=0):
            self.x = float(x); self.y = float(y)
    class Pygame(object):
        K_LEFT = 1; K_RIGHT = 2; K_UP = 3; K_DOWN = 4
        K_e = 5; K_f = 6; K_c = 7; K_d = 8
    pygame = Pygame()
    key_map = {'K_LEFT': pygame.K_LEFT, 'K_RIGHT': pygame.K_RIGHT, 'K_UP': pygame.K_UP,
               'K_DOWN': pygame.K_DOWN, 'K_e': pygame.K_e, 'K_f': pygame.K_f,
               'K_c': pygame.K_c, 'K_d': pygame.K_d}
    held = dict((v, False) for v in key_map.values())
    released = dict((v, False) for v in key_map.values())
    if PRESSED in key_map:
        held[key_map[PRESSED]] = True
    class Player(object):
        def __init__(self, row, col):
            self.row = row; self.col = col
            self.velocity = Vec()
            self.acceleration = ACCEL
            self.friction = FRICTION
        def try_move(self, direction, maze_arg):
            if direction not in DR_DC:
                return False
            result['calls'].append(direction)
            result['direction_requested'] = direction
            before = (self.row, self.col)
            current = maze_arg.get_cell(self.row, self.col)
            ns3 = {}
            exec(compile(FN3_SRC, '<t3>', 'exec'), {}, ns3)
            out3 = ns3['_fn'](current, direction)
            if out3 is False:
                result['try_move_returned'] = False
                result['blocked'] = True
                return False
            dr, dc = DR_DC[direction]
            ns4 = {}
            exec(compile(FN4_SRC, '<t4>', 'exec'), {}, ns4)
            ns4['_fn'](self, dr, dc)
            result['try_move_returned'] = True
            wall_present = cells[before[0]][before[1]].walls.get(direction, True)
            if (self.row, self.col) != before:
                if wall_present:
                    result['wall_violation'] = True
                if (self.row, self.col) != (before[0] + dr, before[1] + dc):
                    result['unexpected_delta'] = True
                if not (0 <= self.row < rows and 0 <= self.col < cols):
                    result['wall_violation'] = True
                    self.row = max(0, min(rows - 1, self.row))
                    self.col = max(0, min(cols - 1, self.col))
                if (self.row, self.col) != before:
                    result['path'].append([self.row, self.col])
            return True
    player = Player(START_ROW, START_COL)
    class SelfObj(object):
        pass
    self_ = SelfObj()
    self_.player = player
    self_.maze = maze
    def one_frame(keys):
        fnA(self_, pygame, keys, False)
        fnB(self_, pygame, keys, False)
        out = fnC(self_, pygame, keys, False, THRESHOLD)
        if isinstance(out, dict):
            return bool(out.get('moved', False))
        return bool(out)
    try:
        moved_any = False
        def burst(keys, frames):
            got = False
            for _ in range(frames):
                if len(result['path']) >= MAX_STEPS:
                    result['stopped_reason'] = 'step cap'
                    return got
                if one_frame(keys):
                    got = True
            return got
        moved_any = _run_guarded(lambda: burst(held, HOLD_FRAMES), ()) or moved_any
        moved_any = _run_guarded(lambda: burst(released, COAST_FRAMES), ()) or moved_any
        result['moved'] = bool(moved_any)
        result['row'] = player.row
        result['col'] = player.col
        result['velocity'] = [round(player.velocity.x, 3), round(player.velocity.y, 3)]
    except _StepBudget:
        result['ok'] = False
        result['error'] = 'Your movement code never finished - check for a loop that cannot end.'
    except Exception as e:
        result['ok'] = False
        result['error'] = '%s: %s' % (type(e).__name__, e)
        result['traceback'] = traceback.format_exc()
    return json.dumps(result)
print(_run())