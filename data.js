/*
 * data.js — pure content for the Dijkstra Maze TODO course.
 *
 * This file holds NO behaviour and NO reference answers. Every string here is
 * either (a) already public in the student starter files (starter code,
 * surrounding context, constant names), or (b) written for this course by the
 * teacher (concept explanations, hints, code-reference notes).
 *
 * Grading LOGIC (the Python test harnesses) lives in app.js, not here. This
 * file only carries grading METADATA: which mode applies, and — for syntax
 * steps — the structural shape to check. None of that reveals a solution.
 *
 * TODO ids are plain sequential integers 1..9, no gaps, no hyphenated
 * sub-ids. This is the SECOND full renumbering (see TEACHER_TODO_GUIDE.md):
 * the monster feature (old Bonus 12/13/14) and score/treasure/swamp (old
 * Required 6/7, old Bonus 11 custom terrain) were removed entirely per a
 * teacher request to simplify the game to pure maze-solving ("reach the
 * goal before time runs out, avoid bombs") - see the changelog in
 * TEACHER_TODO_GUIDE.md for the full reasoning.
 *
 * Leads are intentionally explicit/detailed (favoring maximum
 * accessibility) and every step has exactly ONE hint, written to be
 * near-complete ("if you know Python syntax at all, you can succeed") -
 * this is a deliberate teacher choice, a reversal of an earlier
 * concept-only-leads/multi-tier-hints pass.
 */
"use strict";

/** Required TODOs, in the order students must complete (or skip) them. */
const REQUIRED_ORDER = ["1", "2", "3", "4", "5"];

/**
 * Bonus TODOs. These all unlock together once Required is finished, any
 * order - including "9" (write your game's rules), which used to be a
 * "capstone" locked until every other Bonus id was done first; that
 * one-off lock was removed per direct teacher request, so TODO 9 now
 * behaves exactly like TODO 6/7/8.
 */
const BONUS_ORDER = ["6", "7", "8", "9"];

/**
 * Files students already have in assets/images and assets/sounds (see
 * student/assets/). Used only to give a friendly warning (never a hard
 * failure) in TODO 7 if a path doesn't match a file we know about — students
 * may supply their own assets, which a later task will let them upload.
 */
const KNOWN_ASSET_FILES = {
  images: [
    "apple.png", "bomb.png", "bomb_2.png", "boy.png", "candy.png", "duck.png",
    "explode.png", "explode_2.png", "floor_tile_1.png", "floor_tile_2.png",
    "goal_chest.png", "goal_door.png", "goal_flag.png", "house.png",
    "item_coin.png", "item_gem_1.png", "item_gem_2.png", "item_star.png",
    "lion.png", "monster_shadow.png", "player_ninja.png", "player_robot.png",
    "terrain_ice.png", "terrain_lava.png", "terrain_mud.png",
    "terrain_swamp_1.png", "terrain_swamp_2.png",
  ],
  sounds: [
    "bgm_1.wav", "bgm_2.wav", "explosion_1.wav", "explosion_2.wav", "explosion_3.wav",
    "pickup_1.wav", "pickup_2.wav", "pickup_3.wav", "squish_1.wav", "squish_2.wav",
  ],
};

const COURSE_STEPS = [
  // ------------------------------------------------------------------ TODO 1
  {
    id: "1", step: 1, kind: "Required", required: true, file: "settings.py",
    title: "Name your game.",
    lead: "Every game needs an identity. Two variables in this file control what players see before they even move:\n\n- **`TITLE`** — shown in the window and on the title screen.\n- **`GAME_SUBTITLE`** — a one-line description shown under the title.\n\nBoth are just Python strings — replace the text between the quotes with your own game's name and one-line description. This is a design task, not an algorithm: there's no single correct answer, just make it describe **your** game. (Writing the game's actual *rules* is a separate Bonus step at the very end — TODO 9 — once your game is finished.)",
    codeReference: [
      ["TITLE", "The string shown in the window title bar and on the title screen."],
      ["GAME_SUBTITLE", "A one-line description shown under the title."],
    ],
    contextBefore: [],
    contextAfter: [
      "MAZE_OFFSET_X = 32",
      "MAZE_OFFSET_Y = 126",
    ],
    starter: [
      'TITLE = "Maze Runner"  # Modify this title to match your game.',
      'GAME_SUBTITLE = "Solve the maze before time runs out"',
    ],
    hints: [
      '`TITLE = "your title here"` and `GAME_SUBTITLE = "your one-line description here"` — keep the variable names, the equals sign, and the quotation marks exactly as they are; only change the text inside the quotes.',
    ],
    visualizer: "titleCard",
    grading: {
      mode: "syntax",
      mustDefine: ["TITLE", "GAME_SUBTITLE"],
      notes: "Open-ended: passes once the code runs with no Python error and both names are defined. Type issues surface as a non-blocking warning, not a failure.",
    },
  },

  // ------------------------------------------------------------------ TODO 2
  {
    id: "2", step: 2, kind: "Required", required: true, file: "game.py",
    title: "Connect the arrow keys and the controller to maze movement.",
    lead: "Right now your maze ignores the keyboard entirely. Each frame, `update_player()` checks which key is currently held down and needs to move the player one cell in that direction. Inside the branch for each key, call **`self.player.try_move(direction, self.maze)`** — `direction` is one of the strings `\"left\"`/`\"right\"`/`\"top\"`/`\"bottom\"` (note: `\"top\"`/`\"bottom\"`, not `\"up\"`/`\"down\"`) — and store what it returns in **`moved`**. Use `if` for the first key check and `elif` for the rest (not four separate `if`s), so only one direction can win when two keys are pressed together.\n\nOne press moves exactly **one cell** — this is a grid, not free movement.\n\n**Controls**: the arrow keys, or the classroom controller's **E / F / C / D** (left / right / up / down). Both sets do exactly the same thing.",
    codeReference: [
      ["self.player.try_move(direction, self.maze)", "Attempts to move the player one cell in direction. Returns True if the move succeeded, False if it was blocked."],
      ["moved", "A boolean you set to the result of try_move. The code right after your TODO reads it to decide whether to reset the movement timer."],
      ["pygame.K_LEFT / K_e, K_RIGHT / K_f, K_UP / K_c, K_DOWN / K_d", "The key constants for the arrow keys and the classroom controller. keys[...] is True while that key is held down."],
      ['"left" / "right" / "top" / "bottom"', 'The four direction strings try_move and the maze understand — note the vertical directions are "top"/"bottom", not "up"/"down".'],
    ],
    contextBefore: [
      "    def update_player(self):",
      "        now = pygame.time.get_ticks()",
      "        if now - self.last_player_move_time < PLAYER_MOVE_DELAY_MS:",
      "            return",
      "",
      "        keys = pygame.key.get_pressed()",
      "        moved = False",
    ],
    contextAfter: [
      "        if moved:",
      "            self.last_player_move_time = now",
      "            self.maze.clear_path_display()",
    ],
    starter: [
      "        if keys[pygame.K_LEFT] or keys[pygame.K_e]:",
      '            pass  # Write your code here. Hint: the direction string is "left"',
      "        elif keys[pygame.K_RIGHT] or keys[pygame.K_f]:",
      '            pass  # Write your code here. Hint: the direction string is "right"',
      "        elif keys[pygame.K_UP] or keys[pygame.K_c]:",
      '            pass  # Write your code here. Hint: the direction string is "top"',
      "        elif keys[pygame.K_DOWN] or keys[pygame.K_d]:",
      '            pass  # Write your code here. Hint: the direction string is "bottom"',
    ],
    hints: [
      'moved = self.player.try_move("???", self.maze) — this exact line goes in all four branches; just swap in the matching direction string each time: "left", "right", "top", "bottom".',
    ],
    visualizer: "playerMove",
    grading: {
      mode: "behaviour",
      harness: "movement_2",
      casesDescription: "Given a starting position and a key press (in a maze with known walls), asserts the player's final position matches the correct neighboring cell for that direction, or stays put when a wall blocks it. Also checks moved reflects whether the position actually changed, and pressing two opposite keys together moves at most one cell. Implementation-agnostic: does not check for any specific function call, only the resulting position/moved values (a student who inlines their own row/col math and their own wall check, bypassing try_move entirely, still passes).",
    },
  },

  // ------------------------------------------------------------------ TODO 3
  {
    id: "3", step: 3, kind: "Required", required: true, file: "player.py",
    title: "Stop movement when there is no cell or a wall blocks the direction.",
    lead: "`try_move()` first looks up the cell the player is standing on (**`current`**), then needs to bail out before moving in two situations: there's no cell in that direction at all (**`current is None`** — happens at the edge of the maze) or a wall blocks the way (**`current.walls[direction]`** is `True`). Combine both checks with `or` in one `if`, and `return False` immediately when either is true — this is a guard clause: handle the bad cases first so the rest of `try_move` can assume the move is legal.",
    codeReference: [
      ["current", "The Cell the player currently stands on, looked up just above. May be None if there is no cell there."],
      ["current.walls[direction]", "True when a wall blocks movement in direction from the current cell."],
      ["return False", "Signals to the caller that the move did not happen; the rest of try_move must not run."],
    ],
    contextBefore: [
      "    def try_move(self, direction, maze):",
      "        current = maze.get_cell(self.row, self.col)",
    ],
    contextAfter: [
      "        dr, dc = {",
      '            "top": (-1, 0),',
      '            "right": (0, 1),',
    ],
    starter: [
      "        pass  # Write your code here.",
    ],
    hints: [
      "if current is None or current.walls[direction]:\n    return False — one `if` line joining both conditions with `or`, then `return False` indented once more on the next line. Use `is None` (not `== None`), the normal Python way to check for None.",
    ],
    visualizer: "playerMove",
    grading: {
      mode: "behaviour",
      harness: "guardClause_3",
      casesDescription: "current=None -> returns False; a wall present in direction -> returns False; an open direction -> does not return early.",
    },
  },

  // ------------------------------------------------------------------ TODO 4
  {
    id: "4", step: 4, kind: "Required", required: true, file: "player.py",
    title: "Update the player's row and column.",
    lead: "Once `try_move()` knows the move is legal, **`dr`** and **`dc`** (already computed just above from the direction dictionary) tell you exactly how far to shift the player: `dr` is the row change, `dc` is the column change. Add each to the matching attribute on `self` using **`+=`** (`self.row += dr`, `self.col += dc`) so the position updates in place rather than being replaced.",
    codeReference: [
      ["dr, dc", "The row and column change for the chosen direction, already looked up on the line above."],
      ["self.row, self.col", "The player's current grid position; update both in place."],
      ["+=", "Compound assignment: x += y means x = x + y, updating the variable in place."],
    ],
    contextBefore: [
      "    def try_move(self, direction, maze):",
      "        current = maze.get_cell(self.row, self.col)",
      "        # Given: TODO 3's guard clause runs here (not shown).",
      "        dr, dc = {",
      '            "top": (-1, 0),',
      '            "right": (0, 1),',
      '            "bottom": (1, 0),',
      '            "left": (0, -1),',
      "        }[direction]",
    ],
    contextAfter: [
      "        return True",
      "    def get_rect(self):",
      "        return pygame.Rect(",
    ],
    starter: [
      "        pass  # Write your code here.",
    ],
    hints: [
      "self.row += dr\nself.col += dc — two lines, in that order, using `+=` (not `=`) so the existing position is adjusted rather than overwritten.",
    ],
    visualizer: "playerMove",
    grading: {
      mode: "behaviour",
      harness: "positionDelta_4",
      casesDescription: "All four directions from a mid-grid cell; assert the final (row, col) matches applying dr/dc to the starting position.",
    },
  },

  // ------------------------------------------------------------------ TODO 5
  {
    id: "5", step: 5, kind: "Required", required: true, file: "pathfinding.py",
    title: "Calculate the cost to reach this neighbor, and record the better route.",
    lead: "This function powers the player's Hint button: it finds the shortest route from the player to the goal, treating active bombs as very expensive so the route avoids them. Dijkstra's relaxation step here is really two separate ideas glued together: computing a candidate cost, then deciding whether to actually keep it. Each part below gets its own explanation, split the same way the Bonus TODOs are split into small sequential parts.",
    codeReference: [
      ["cost", "The total cost already spent reaching current, popped from the priority queue."],
      ["current", "The cell just popped from the queue this loop iteration (`cost, current = heapq.heappop(queue)`, part of the given setup shown above) — already in scope, not something you compute."],
      ["step_cost", "The (already positive, already offset) cost of the one edge from current to this neighbor."],
      ["new_cost", "The candidate total cost of reaching neighbor through current — computed in Part 1, used in Part 2."],
      ["distance[neighbor], parent[neighbor]", "The best known cost to reach neighbor, and the cell it should be reached from on that route — update both together, only on improvement (Part 2)."],
      ["queue", "The priority queue driving the whole search — a list of (cost, position) tuples, already created above and managed with Python's `heapq` module (`heapq.heappop`/`heapq.heappush`). Already in scope; you don't create it."],
    ],
    parts: [
      {
        part: "1/2", title: "Calculate the candidate cost to reach this neighbor.",
        lead: "You're computing the total cost of reaching this neighbor by going through the current cell. Add the cost already spent getting to **`current`** (the variable **`cost`**) to the cost of this one extra step (**`step_cost`**), and store the sum in **`new_cost`**. That's the entire task for this part — one line.",
        contextBefore: [
          "def find_path_dijkstra(",
          "    map_data,",
          "    start,",
          "    end,",
          "    get_weight=None,",
          "    all_weights=None,",
          "):",
          "    # Given: weight-adjustment (the nested get_positive_weight",
          "    # helper) is set up above this point (not shown).",
          "    queue = [(0, start)]",
          "    distance = {start: 0}",
          "    parent = {start: None}",
          "    visited = set()",
          "",
          "    while queue:",
          "        cost, current = heapq.heappop(queue)",
          "        # Given: stale-entry/visited bookkeeping and the",
          "        # already-reached-the-goal check happen here (not shown).",
          "",
          "        for neighbor in map_data.get_open_neighbors(current):",
          "            step_cost = get_positive_weight(neighbor)",
          "",
          "            if step_cost <= 0:",
          '                raise ValueError(',
          '                    "Adjusted Dijkstra weight must be positive."',
          "                )",
        ],
        contextAfter: [],
        starter: [
          "            new_cost = 0  # Write your code here.",
        ],
      },
      {
        part: "2/2", title: "Decide whether to keep it, and record the improved route.",
        lead: "Now decide whether **`new_cost`** is actually an improvement over what's already known for **`neighbor`**: either `neighbor` has never been reached before (`neighbor not in distance`) or `new_cost` is smaller than the distance already on record (`new_cost < distance[neighbor]`). If either is true, update **`distance[neighbor]`** and **`parent[neighbor]`** to the new cost/route, and push `(new_cost, neighbor)` onto the priority queue with **`heapq.heappush`** so the search actually explores this improved route.",
        contextBefore: [
          "def find_path_dijkstra(",
          "    map_data,",
          "    start,",
          "    end,",
          "    get_weight=None,",
          "    all_weights=None,",
          "):",
          "    # Given: weight-adjustment (the nested get_positive_weight",
          "    # helper) is set up above this point (not shown).",
          "    queue = [(0, start)]",
          "    distance = {start: 0}",
          "    parent = {start: None}",
          "    visited = set()",
          "",
          "    while queue:",
          "        cost, current = heapq.heappop(queue)",
          "        # Given: stale-entry/visited bookkeeping and the",
          "        # already-reached-the-goal check happen here (not shown).",
          "",
          "        for neighbor in map_data.get_open_neighbors(current):",
          "            step_cost = get_positive_weight(neighbor)",
          "",
          "            if step_cost <= 0:",
          '                raise ValueError(',
          '                    "Adjusted Dijkstra weight must be positive."',
          "                )",
          "            new_cost = 0  # Write your code here.",
        ],
        contextAfter: [],
        starter: [
          "            pass  # Write your code here.",
        ],
      },
    ],
    hints: [
      "Part 1: `new_cost = cost + step_cost`\nPart 2:\n```\nif neighbor not in distance or new_cost < distance[neighbor]:\n    distance[neighbor] = new_cost\n    parent[neighbor] = current\n    heapq.heappush(queue, (new_cost, neighbor))\n```",
    ],
    visualizer: "dijkstraFrontier",
    grading: {
      mode: "behaviour",
      harness: "dijkstra_5",
      casesDescription: "Part 1: several (cost, step_cost) pairs, asserts new_cost == cost + step_cost. Part 2: fresh/improving/non-improving/negative-weight neighbors with new_cost supplied directly, asserts distance/parent update only on improvement and the improved route is pushed to the queue. Each part is graded independently, so a mistake in one part is attributed specifically to that part.",
      twoParts: true,
    },
  },

  // ------------------------------------------------------------------ TODO 6
  //
  // SPLIT (this session): what used to be 3 big parts is now 6 small ones,
  // per direct teacher request - students were finishing Required in ~30
  // minutes and finding Bonus too hard to start. Nothing new was added;
  // the same settings and the same placement code are simply handed over
  // one small instruction at a time. Same lenient "안 터지면 통과" grading.
  {
    id: "6", step: 6, kind: "Bonus", required: false, file: "settings.py",
    title: "Redesign the rounds, tune the feel, and place every item and bomb.",
    lead: "This step is the shape of your whole game. **Do the six parts in order — each one is small on purpose.**\n\n- **Parts 1-3** (`settings.py`) — the rounds, the walking speed, the Hint button.\n- **Parts 4-6** (`game.py`) — real code: ask for positions, turn them into items, then do the same for bombs.\n\nPrefer not to hand-edit numbers? The **map editor** on the right paints a layout tile by tile — including where the player starts, where the goal is, and (once TODO 8 has an item) exactly which of your own items goes where.",
    codeReference: [
      ["ROUND_CONFIGS", "(settings.py) A list of dictionaries, one per round, read in order as the player clears rounds. It ships with 3 — add a fourth to make your game longer, or delete one to make it shorter."],
      ["rows, cols, cell_size", "Grid dimensions and pixel size of one cell; bigger rows/cols means a bigger maze."],
      ["extra_open_walls", "Extra connections punched into the perfect maze so it has loops, not just one solution path."],
      ["bomb_count, custom_item_count", "How many of each object are placed on the map."],
      ["time_limit_seconds", "How long the player has to finish the round."],
      ["PLAYER_MOVE_DELAY_MS", "The shortest gap between two cell steps, in milliseconds — smaller is faster."],
      ["ALLOW_PATH_HINT", "True/False — whether the Hint button exists at all."],
      ["MAX_HINT_COUNT", "How many times Hint can be used per round; interacts with TODO 8's add_hint effect."],
      ["create_game_objects(self)", "(game.py) Called once per round, right after the maze finishes generating. Parts 4-6 fill self.items and self.bombs between them."],
      ["create_random_positions(rows, cols, count, forbidden)", "Helper that returns a list of count (row, col) tuples, never picking a cell that is already in forbidden."],
      ["forbidden", "A set of cells nothing may spawn on. Starts with the player's start cell and the goal; add positions to it as you use them so two objects never share a cell."],
      ["CustomItem(row, col, cell_size, item_def)", "One collectible. item_def is one dictionary out of your own CUSTOM_ITEMS list (TODO 8)."],
      ["Bomb(row, col, cell_size)", "One bomb. Stepping on it sends the player back to the start."],
    ],
    parts: [
      {
        part: "1/6", title: "Redesign the rounds (and add or remove some).",
        lead: "Each dictionary in this list is one round, played in order.\n\n**Start with one change:** make round 1 smaller by lowering its `rows` and `cols`. Press *Run my code*, then look at the Play tab on the right — that is your maze now.\n\nThen keep going: more `bomb_count`, a stricter `time_limit_seconds`, a bigger final round. **You are not stuck with three rounds** — copy a whole dictionary and paste it at the end for a fourth; delete one for a shorter game.\n\nKeep every key inside each dictionary though — the engine reads all of them by name, so deleting one will crash the game.",
        contextBefore: [],
        contextAfter: [
          "# TODO 6 [Bonus] (Part 2/6): Change ONE number - the walking speed.",
          "# Detailed hint:",
        ],
        starter: [
          "ROUND_CONFIGS = [",
          "    {",
          '        "rows": 11,',
          '        "cols": 15,',
          '        "cell_size": 38,',
          '        "extra_open_walls": 5,',
          '        "bomb_count": 2,',
          '        "custom_item_count": 2,',
          '        "time_limit_seconds": 70,',
          "    },",
          "    {",
          '        "rows": 15,',
          '        "cols": 21,',
          '        "cell_size": 30,',
          '        "extra_open_walls": 6,',
          '        "bomb_count": 4,',
          '        "custom_item_count": 3,',
          '        "time_limit_seconds": 55,',
          "    },",
          "    {",
          '        "rows": 17,',
          '        "cols": 25,',
          '        "cell_size": 25,',
          '        "extra_open_walls": 8,',
          '        "bomb_count": 6,',
          '        "custom_item_count": 4,',
          '        "time_limit_seconds": 45,',
          "    },",
          "]",
        ],
      },
      {
        part: "2/6", title: "Change one number — how fast the player walks.",
        lead: "One line, one number. **`PLAYER_MOVE_DELAY_MS`** is the shortest gap between two cell steps, in milliseconds — **smaller is faster**.\n\nTry `60` for a quick, twitchy player, or `200` for a slow, heavy one. Run it, play it on the right, and pick the one that feels like your game. That's the whole part.",
        contextBefore: [],
        contextAfter: [
          "# TODO 6 [Bonus] (Part 3/6): Decide how generous the Hint button is.",
          "# Detailed hint:",
        ],
        starter: [
          "PLAYER_MOVE_DELAY_MS = 100",
        ],
      },
      {
        part: "3/6", title: "Decide how generous the Hint button is.",
        lead: "Two lines this time.\n\n- **`ALLOW_PATH_HINT`** is `True` or `False`. Set it to `False` and the Hint button disappears from your game completely — a much harder game.\n- **`MAX_HINT_COUNT`** is a plain whole number: how many times Hint may be used in one round.\n\nThis one interacts with Bonus TODO 8's `\"add_hint\"` item: a very low `MAX_HINT_COUNT` makes an add_hint item much more valuable. Not a bug — just something to remember when you balance your game.",
        contextBefore: [],
        contextAfter: [
          "# =========================================================",
          "# Replace images and fallback shape colors below.",
          "# =========================================================",
        ],
        starter: [
          "ALLOW_PATH_HINT = True",
          "MAX_HINT_COUNT = 2",
        ],
      },
      {
        part: "4/6", title: "Ask for the item positions.", file: "game.py",
        lead: "Now real code — but only three lines of it, and they are already written.\n\n`create_game_objects()` runs once per round, right after the maze is generated. **`create_random_positions(rows, cols, count, forbidden)`** hands back a list of `(row, col)` tuples and never picks a cell that is already in **`forbidden`** (which starts out holding the player's start and the goal).\n\n**The only thing to change here is the count.** Read the starter, then try one of these:\n\n- `self.config[\"custom_item_count\"] + 2` — two extra items in every round.\n- `3` — always exactly three, ignoring the round setting.\n\nRun it, then look at the Play tab.",
        contextBefore: [
          "    def create_game_objects(self):",
          '        """Fills self.items and self.bombs for the round that just',
          "        loaded. `forbidden` starts out holding the two cells nothing",
          "        may spawn on (the player's start and the goal); add to it as",
          '        you place things so two objects never land on the same cell."""',
          "        forbidden = {",
          "            self.player.get_position(),",
          "            self.goal.get_position(),",
          "        }",
        ],
        contextAfter: [
          "        # TODO 6 [Bonus] (Part 5/6): Turn those positions into real items.",
        ],
        starter: [
          "        custom_positions = create_random_positions(",
          '            self.config["rows"], self.config["cols"],',
          '            self.config.get("custom_item_count", 0), forbidden,',
          "        )",
        ],
      },
      {
        part: "5/6", title: "Turn those positions into real items.", file: "game.py",
        lead: "Part 4/6 produced a list of cells. This part turns each one into an actual collectible: one **`CustomItem(row, col, cell_size, item_def)`** per position.\n\nThe `item_def` is one dictionary out of your own **`CUSTOM_ITEMS`** (TODO 8), and `random.choice(CUSTOM_ITEMS)` picks it at random. **Change that one call to decide which item spawns:**\n\n- `CUSTOM_ITEMS[0]` — always your first item.\n- `CUSTOM_ITEMS[index % len(CUSTOM_ITEMS)]` inside a loop — guarantees every item you designed actually shows up.\n\nLeave **`forbidden.update(custom_positions)`** on the last line. It is what stops a bomb landing on top of an item in Part 6/6.",
        contextBefore: [
          "        # (Part 4/6 above filled custom_positions.)",
        ],
        contextAfter: [
          "        # TODO 6 [Bonus] (Part 6/6): Now do the same for the bombs.",
        ],
        starter: [
          "        self.items = [",
          '            CustomItem(row, col, self.config["cell_size"], random.choice(CUSTOM_ITEMS))',
          "            for row, col in custom_positions",
          "        ]",
          "        forbidden.update(custom_positions)",
        ],
      },
      {
        part: "6/6", title: "Now do the same for the bombs.", file: "game.py",
        lead: "Exactly the two moves you just did in Parts 4/6 and 5/6 — ask for positions, build objects — with **`Bomb(row, col, cell_size)`** this time.\n\nRead it once, then make it mean something:\n\n- Harsher last round: `self.config[\"bomb_count\"] * 2`.\n- Keep bombs away from the start so round 1 isn't instantly unfair — add a filter line after the positions come back:\n  `bomb_positions = [p for p in bomb_positions if p[0] + p[1] >= 4]`\n\nThe only hard rule for the whole step: **`self.items` and `self.bombs` must both end up as lists** (empty is fine) — anything else and the drawing code crashes.",
        contextBefore: [
          "        # (Part 5/6 above filled self.items and updated forbidden.)",
        ],
        contextAfter: [
          "        self.objects_created = True",
          "        self.start_time = pygame.time.get_ticks()",
        ],
        starter: [
          "        bomb_positions = create_random_positions(",
          '            self.config["rows"],',
          '            self.config["cols"],',
          '            self.config["bomb_count"],',
          "            forbidden,",
          "        )",
          "        self.bombs = [",
          '            Bomb(row, col, self.config["cell_size"])',
          "            for row, col in bomb_positions",
          "        ]",
        ],
      },
    ],
    hints: [
      "Part 1: a list of dictionaries, one per round. Only change the numeric values, keep them plain integers, and keep every key (deleting one crashes the game). Copy a whole `{ ... },` block and paste it at the end for a fourth round. Don't want to hand-edit numbers? Use the map editor panel on the right.\nPart 2: `PLAYER_MOVE_DELAY_MS = 60` is fast, `= 200` is slow. One number, nothing else.\nPart 3: `ALLOW_PATH_HINT = True` or `= False`; `MAX_HINT_COUNT = 3` (any plain integer).\nPart 4: change only the third argument — e.g. `self.config.get(\"custom_item_count\", 0) + 2`, or just `3`.\nPart 5: replace `random.choice(CUSTOM_ITEMS)` with `CUSTOM_ITEMS[0]` for one fixed item. To cycle through every item, switch the comprehension to a loop:\n```\nself.items = []\nfor index, (row, col) in enumerate(custom_positions):\n    self.items.append(CustomItem(row, col, self.config[\"cell_size\"], CUSTOM_ITEMS[index % len(CUSTOM_ITEMS)]))\nforbidden.update(custom_positions)\n```\nPart 6: keep the starter's shape. To double the bombs, use `self.config[\"bomb_count\"] * 2` as the count. To filter, add one line right after the positions come back: `bomb_positions = [p for p in bomb_positions if p[0] + p[1] >= 4]` (ask for a few more than you need, since filtering throws some away). `self.items` and `self.bombs` must both still be lists at the end.",
    ],
    visualizer: "mapEditor",
    grading: {
      mode: "behaviour",
      harness: "roundDesign_6",
      casesDescription: "Parts 1-3 keep the open-ended settings checks (compiles, ROUND_CONFIGS / PLAYER_MOVE_DELAY_MS / ALLOW_PATH_HINT / MAX_HINT_COUNT defined; shape and range problems are non-blocking warnings). Parts 4-6 are joined back together and actually RUN against a stand-in Game with a known grid, stub CustomItem/Bomb classes and the real create_random_positions, then the outcome is checked: self.items and self.bombs are both lists, every position sits inside the grid, and nothing spawns on the player or the goal. Part 4 is additionally checked on its own (it must leave a usable list of positions behind). Counts, filtering rules and which item goes where are all left free — they only ever produce warnings.",
      multiPart: true,
    },
  },

  // ------------------------------------------------------------------ TODO 7
  //
  // SPLIT (this session): 3 parts -> 8. Each part is now one or two lines
  // of settings, so a student can read one instruction, change one thing,
  // and immediately see it in the Play tab.
  {
    id: "7", step: 7, kind: "Bonus", required: false, file: "settings.py",
    title: "Replace the pictures, resize them, pick your colors, and add sound.",
    lead: "Everything the player sees and hears, handed over **two lines at a time**. Work down the list in order:\n\n- **Parts 1-2** — pictures for the player, goal, bombs and floor.\n- **Part 3** — how big they are.\n- **Parts 4-5** — the colors used when a picture is `None`.\n- **Parts 6-7** — sound files, explosion length and volume.\n- **Part 8** (`game.py`) — real code: how the music actually plays.\n\nUse the **asset picker** on the right for every path — it types them for you. Every path value is either **`None`** (use the built-in shape/silence) or a quoted path under `assets/images/` / `assets/sounds/`; there is no third option.",
    codeReference: [
      ["PLAYER_IMAGE_PATH / GOAL_IMAGE_PATH / BOMB_IMAGE_PATH / FLOOR_TILE_IMAGE_PATH", "(settings.py) Each is either None (use the built-in drawn shape) or a quoted path to a file under assets/images/."],
      ["PLAYER_IMAGE_SCALE / GOAL_IMAGE_SCALE / BOMB_IMAGE_SCALE", "Size multipliers: 1.0 is the normal size that fits a cell, 0.5 is half as big, 1.6 is bigger than its cell. Resizes the fallback shape as well as the image."],
      ["WALL_COLOR / PLAYER_COLOR / GOAL_COLOR / BOMB_COLOR / BOMB_EXPLOSION_COLOR", "(R, G, B) tuples, each 0-255 — what actually gets drawn whenever the matching image is None."],
      ["BOMB_SOUND_PATH / BACKGROUND_MUSIC_PATH", "Each is either None (silent) or a quoted path to a file under assets/sounds/."],
      ["BOMB_EXPLOSION_DURATION_MS", "How long (milliseconds) the explosion animation shows before the bomb disappears."],
      ["BACKGROUND_MUSIC_VOLUME", "0.0 (silent) to 1.0 (full volume)."],
      ["load_background_music(self)", "(game.py) Called once at boot. Part 8/8 is its whole body — yours to write."],
      ["pygame.mixer.music.play(loops)", "loops is how many times to REPEAT: -1 loops forever, 0 plays once, 3 plays four times. Also takes fade_ms=... to fade in."],
    ],
    parts: [
      {
        part: "1/8", title: "Give the player and the goal a picture.",
        lead: "Two lines. Click a picture in the **asset picker** on the right and it fills the path in for you — or type it yourself, quotes included:\n\n- `PLAYER_IMAGE_PATH = \"assets/images/boy.png\"`\n\nLeave a line as `None` to keep the built-in drawn shape. Run it and look at the Play tab — your character is in the maze.",
        contextBefore: [],
        contextAfter: [
          "# TODO 7 [Bonus] (Part 2/8): Give the bombs and the floor a picture.",
        ],
        starter: [
          "PLAYER_IMAGE_PATH = None",
          "GOAL_IMAGE_PATH = None",
        ],
      },
      {
        part: "2/8", title: "Give the bombs and the floor a picture.",
        lead: "Exactly the same rule as Part 1/8 — `None`, or a quoted path under `assets/images/`.\n\n**`FLOOR_TILE_IMAGE_PATH`** is the background tile drawn under every open cell, so this single line changes the look of the whole maze at once. Try `\"assets/images/floor_tile_1.png\"` and then `floor_tile_2.png`.",
        contextBefore: [],
        contextAfter: [
          "# TODO 7 [Bonus] (Part 3/8): Resize them.",
        ],
        starter: [
          "BOMB_IMAGE_PATH = None",
          "FLOOR_TILE_IMAGE_PATH = None  # Background floor for open path cells.",
        ],
      },
      {
        part: "3/8", title: "Resize them.",
        lead: "Three numbers. Each **`_SCALE`** is a size multiplier: `1.0` is the normal size that fits a cell, `0.5` is half as big, `1.6` is noticeably bigger than its cell.\n\nThis is the quickest way to make the game feel like yours: a `2.0` player fills its cell completely; a `0.4` bomb becomes a small hazard that's easy to miss. It resizes the built-in shapes too, so it works whether or not you picked image files.\n\n**Change one number, run it, look at the board. Then the next one.**",
        contextBefore: [],
        contextAfter: [
          "# TODO 7 [Bonus] (Part 4/8): Pick the wall, player and goal colors.",
        ],
        starter: [
          "PLAYER_IMAGE_SCALE = 1.0",
          "GOAL_IMAGE_SCALE = 1.0",
          "BOMB_IMAGE_SCALE = 1.0",
        ],
      },
      {
        part: "4/8", title: "Pick the wall, player and goal colors.",
        lead: "Each value is an **`(R, G, B)`** tuple — three whole numbers from 0 to 255.\n\n- `(255, 0, 0)` bright red · `(0, 0, 0)` black · `(255, 255, 255)` white\n\nThese are what actually get drawn whenever the matching image is `None`, so you can make the game visually your own with colors alone — no image files needed. **`WALL_COLOR`** changes every wall in the maze at once, so start there.",
        contextBefore: [],
        contextAfter: [
          "# TODO 7 [Bonus] (Part 5/8): Pick the bomb and explosion colors.",
        ],
        starter: [
          "WALL_COLOR = (30, 41, 59)",
          "PLAYER_COLOR = (37, 99, 235)",
          "GOAL_COLOR = (250, 204, 21)",
        ],
      },
      {
        part: "5/8", title: "Pick the bomb and explosion colors.",
        lead: "Same `(R, G, B)` rule as Part 4/8, two lines this time.\n\n**`BOMB_EXPLOSION_COLOR`** is the flash shown for a moment after a bomb goes off, so a bright color reads best here — that flash is the only warning the player gets.",
        contextBefore: [],
        contextAfter: [
          'BOMB_EXPLOSION_IMAGE_PATH = "assets/images/explode_2.png"  # also try explode.png',
        ],
        starter: [
          "BOMB_COLOR = (15, 23, 42)",
          "BOMB_EXPLOSION_COLOR = (239, 68, 68)",
        ],
      },
      {
        part: "6/8", title: "Choose two sound files.",
        lead: "Same None-or-quoted-path rule as the pictures, but under **`assets/sounds/`** — and the asset picker on the right fills these in too.\n\n- `BOMB_SOUND_PATH` plays when a bomb goes off.\n- `BACKGROUND_MUSIC_PATH` is the music for the whole game.\n\nTwo lines. **What the music then *does*** — loop, play once, fade in — is Part 8/8.",
        contextBefore: [],
        contextAfter: [
          "# TODO 7 [Bonus] (Part 7/8): Tune the explosion length and the volume.",
        ],
        starter: [
          "BOMB_SOUND_PATH = None",
          "BACKGROUND_MUSIC_PATH = None",
        ],
      },
      {
        part: "7/8", title: "Tune the explosion length and the volume.",
        lead: "Two numbers.\n\n- **`BOMB_EXPLOSION_DURATION_MS`** — how long the explosion animation shows before the bomb disappears, in milliseconds. `500` is half a second; `1500` is a long, dramatic blast.\n- **`BACKGROUND_MUSIC_VOLUME`** — `0.0` is silent, `1.0` is full volume. `0.25` is quiet background music.",
        contextBefore: [],
        contextAfter: [
          "# =========================================================",
          "# Customize your collectible item(s) below.",
          "# =========================================================",
        ],
        starter: [
          "BOMB_EXPLOSION_DURATION_MS = 500",
          "BACKGROUND_MUSIC_VOLUME = 0.25",
        ],
      },
      {
        part: "8/8", title: "Decide how the music actually plays.", file: "game.py",
        lead: "Part 6/8 chose **which** file and Part 7/8 **how loud**. This part is the playback itself — `load_background_music()` runs once, when the game boots.\n\n**The smallest possible change is one number.** What you pass to **`pygame.mixer.music.play()`** is how many times to *repeat*:\n\n- `play(-1)` — loops forever (the starter).\n- `play(0)` — plays once, then silence.\n- `play(3)` — plays four times in total.\n- `play(-1, fade_ms=3000)` — loops forever, fading in over 3 seconds.\n\nOne rule: **keep the `try`/`except`**. A missing or broken sound file has to print a message and carry on, never crash the game — that's what lets a classmate open your project without your audio files and still play it.",
        contextBefore: [
          "    def load_background_music(self):",
          '        """Starts the background music. Called once, when the game boots."""',
        ],
        contextAfter: [
          "    def load_round(self):",
          "        self.config = ROUND_CONFIGS[self.current_round]",
        ],
        starter: [
          "        if BACKGROUND_MUSIC_PATH is None:",
          "            return",
          "        try:",
          "            if not pygame.mixer.get_init():",
          "                pygame.mixer.init()",
          "            pygame.mixer.music.load(BACKGROUND_MUSIC_PATH)",
          "            pygame.mixer.music.set_volume(BACKGROUND_MUSIC_VOLUME)",
          "            pygame.mixer.music.play(-1)",
          "        except (pygame.error, FileNotFoundError, TypeError) as error:",
          '            print(f"[Info] Background music load failed: {error}")',
        ],
      },
    ],
    hints: [
      'Parts 1, 2 and 6: every path is either `None` or a QUOTED path — forgetting the quotes is the most common mistake, e.g. `PLAYER_IMAGE_PATH = "assets/images/boy.png"`, `BACKGROUND_MUSIC_PATH = "assets/sounds/bgm_1.wav"`. The asset picker panel on the right fills them in with one click.\nPart 3: each `_SCALE` is a plain number — `1.0` normal, `0.5` half size, `1.6` bigger than its cell. It resizes the built-in shape too, so it works with no image file.\nParts 4 and 5: each `_COLOR` is a tuple of three integers 0-255, e.g. `WALL_COLOR = (120, 20, 20)`. Keep the brackets and the two commas.\nPart 7: `BOMB_EXPLOSION_DURATION_MS` is a whole number of milliseconds; `BACKGROUND_MUSIC_VOLUME` is a decimal from 0.0 to 1.0.\nPart 8: the smallest possible change is the number inside `pygame.mixer.music.play(...)` — try `0` (play once) or `1` (play twice). To fade in instead, `pygame.mixer.music.play(-1, fade_ms=3000)`. Leave the `try:` / `except (pygame.error, FileNotFoundError, TypeError) as error:` lines alone and write inside the `try` block.',
    ],
    visualizer: "assetPicker",
    grading: {
      mode: "behaviour",
      harness: "lookAndFeel_7",
      casesDescription: "Parts 1-7 keep the open-ended settings checks (compiles, every image/scale/color/sound/tuning name defined; path, color, range and scale problems are non-blocking warnings), each part checked for its own two or three names so the message points at the right one. Part 8 runs the playback code against a fake pygame.mixer that records what was called, and only requires two things: it does not raise, and a missing sound file (mixer raising pygame.error) is still handled without crashing. Whether the music loops, plays once or fades in is entirely free — those only produce an informational note.",
      multiPart: true,
    },
  },

  // ------------------------------------------------------------------ TODO 8
  //
  // SPLIT (this session): 3 parts -> 6. The effect branching is now one
  // effect per part, and the pickup is split into "spot it", "run its
  // effect", "play its sound" - three lines of instruction instead of one
  // wall of them.
  {
    id: "8", step: 8, kind: "Bonus", required: false, file: "settings.py",
    title: "Design your own collectible item(s), wire up their effects, and control the pickup.",
    lead: "This is where your game gets its own signature collectible, in six small moves:\n\n- **Part 1** (`settings.py`) — design the item(s) as data.\n- **Parts 2-3** (`game.py`) — one effect each: `\"add_time\"`, then `\"add_hint\"`.\n- **Parts 4-6** (`game.py`) — the pickup itself: spot it, run its effect, play its sound.\n\nEvery round spawns several custom items, each randomly drawn from your list (or exactly the item you placed by hand with the map editor in TODO 6), so two or three genuinely different items — each with their own art, size and sound — can appear side by side.",
    codeReference: [
      ["CUSTOM_ITEMS", "(settings.py) A list of dictionaries — add as many as you like, each describing one distinct custom item."],
      ["name", "The display name of this collectible."],
      ["color", "An (R, G, B) tuple, each 0-255, used when no image is set."],
      ["image / sound", "None, or a quoted path under assets/images/ or assets/sounds/ — this item's OWN picture/pickup sound."],
      ["size", "A size multiplier for this item alone. 1.0 is normal; values outside 0.1-3.0 are clamped so a typo can never make an item invisible or fill the screen."],
      ["effect", 'A string describing what happens on pickup. "add_time" (Part 2/6) and "add_hint" (Part 3/6) are built in; any other string is a safe no-op.'],
      ["amount", "How much of the effect: extra seconds for add_time, extra hint uses for add_hint."],
      ["apply_custom_item_effect(self, item_def)", "(game.py) Called once per pickup; effect/amount are already pulled out for you — Parts 2/6 and 3/6 are just the branching."],
      ["check_items(self)", "(game.py) Runs every frame. Parts 4-6 are its body: spot the item under the player and collect it."],
      ["item.active / item.get_position() / item.item_def", "One spawned item: still on the board?, where it is, and its own dictionary out of your CUSTOM_ITEMS."],
      ["self.get_custom_item_sound(path)", "Loads (and caches) a pygame Sound for a path, or returns None. Call .play() on the result to hear it."],
    ],
    parts: [
      {
        part: "1/6", title: "Design your own collectible item(s).", file: "settings.py",
        lead: "**`CUSTOM_ITEMS`** is a list of dictionaries. Start by editing the one that's already there — give it a real `name` and a `color` — then run it and look at the Play tab.\n\nEach item carries:\n\n- **`name`** — the display name.\n- **`color`** — an RGB tuple, used when no `image` is set.\n- **`image`** / **`sound`** — `None`, or a quoted path under `assets/images/` / `assets/sounds/`. Each item can have its OWN picture and pickup sound.\n- **`size`** — a size multiplier for this item alone: `1.0` normal, `0.6` small and easy to miss, `1.5` chunky and obvious.\n- **`effect`** — `\"add_time\"`, `\"add_hint\"`, or a name you invent yourself.\n- **`amount`** — how much of that effect.\n\nOnce that works, **copy the whole `{ ... },` block and paste it underneath** for a second, completely different item. This part is only the DATA — Parts 2/6 and 3/6 are where the effects actually happen.",
        contextBefore: [],
        contextAfter: [
          "# =========================================================",
          "# Write your game's rules below.",
          "# =========================================================",
        ],
        starter: [
          "CUSTOM_ITEMS = [",
          "    {",
          '        "name": "Custom Item",',
          '        "color": (180, 180, 180),',
          '        "image": None,',
          '        "sound": None,',
          '        "size": 1.0,',
          '        "effect": "add_time",',
          '        "amount": 0,',
          "    },",
          "]",
        ],
      },
      {
        part: "2/6", title: 'Handle the "add_time" effect.', file: "game.py",
        lead: "**Two lines.** `effect` and `amount` have already been pulled out of the item's dictionary for you on the lines above — all this part does is react to one of them.\n\nWhen `effect` is the string `\"add_time\"`, add `amount` onto **`self.bonus_time_seconds`**. That's it:\n\n```\nif effect == \"add_time\":\n    self.bonus_time_seconds += amount\n```\n\nReplace the `pass` line with those two lines.",
        contextBefore: [
          "    def apply_custom_item_effect(self, item_def):",
          '        """Applies whatever "effect"/"amount" a custom item declares."""',
          '        effect = item_def.get("effect")',
          '        amount = item_def.get("amount", 0)',
        ],
        contextAfter: [
          '        # TODO 8 [Bonus] (Part 3/6): Handle the "add_hint" effect.',
        ],
        starter: [
          "        pass  # Write your code here.",
        ],
      },
      {
        part: "3/6", title: 'Handle the "add_hint" effect.', file: "game.py",
        lead: "The same two lines you just wrote, with **`\"add_hint\"`** and **`self.hints_remaining`** instead.\n\nNotice what you get for free: any other `effect` string you invent in Part 1/6 matches neither `if`, so it quietly does nothing. **That is the safe no-op the game promises** — an experimental effect name can never crash anything, and you don't have to write a single line for it.",
        contextBefore: [
          "        # (Part 2/6 above handled \"add_time\".)",
        ],
        contextAfter: [
          "    def check_bombs(self):",
          "        now = pygame.time.get_ticks()",
        ],
        starter: [
          "        pass  # Write your code here.",
        ],
      },
      {
        part: "4/6", title: "Spot the item under the player and mark it collected.", file: "game.py",
        lead: "`check_items()` runs every single frame. **`player_position`** is already worked out for you on the line above.\n\nWalk through **`self.items`**. Each one has **`.active`** (still on the board?) and **`.get_position()`**. When an active item is on the same cell as the player, set **`item.active = False`** — that alone makes it vanish from the board.\n\nMarking it inactive **first** is what stops the same item being collected twice in one frame. The starter already does exactly this; read it, run it, and watch an item disappear when you walk onto it.",
        contextBefore: [
          "    def check_items(self):",
          '        """Runs every frame: decides when an item counts as collected."""',
          "        player_position = self.player.get_position()",
        ],
        contextAfter: [
          "                # TODO 8 [Bonus] (Part 5/6): Make its effect actually happen.",
        ],
        starter: [
          "        for item in self.items:",
          "            if item.active and item.get_position() == player_position:",
          "                item.active = False",
        ],
      },
      {
        part: "5/6", title: "Make its effect actually happen.", file: "game.py",
        lead: "**One line**, sitting inside the `if` you kept in Part 4/6.\n\n**`item.item_def`** is that item's own dictionary out of your `CUSTOM_ITEMS`, and **`self.apply_custom_item_effect(...)`** runs *your own Parts 2/6 and 3/6 code* on it — so the effect you designed happens from right here.\n\nCollecting an `\"add_time\"` item should now visibly add seconds to the clock in the Play tab.",
        contextBefore: [
          "        for item in self.items:",
          "            if item.active and item.get_position() == player_position:",
          "                item.active = False",
        ],
        contextAfter: [
          "                # TODO 8 [Bonus] (Part 6/6): Play that item's own sound.",
        ],
        starter: [
          "                self.apply_custom_item_effect(item.item_def)",
        ],
      },
      {
        part: "6/6", title: "Play that item's own sound.", file: "game.py",
        lead: "Still inside the same `if`. **`self.get_custom_item_sound(path)`** hands back a playable Sound — or `None` when there is no file — so always check it before calling `.play()`.\n\nBecause each item carries its own `\"sound\"` (Part 1/6), two items picked up in the same round can sound completely different.\n\nOnce it works, this is a good place to get inventive: play a special sound only for `\"add_time\"` items by adding `if item.item_def.get(\"effect\") == \"add_time\":` around it.",
        contextBefore: [
          "                item.active = False",
          "                self.apply_custom_item_effect(item.item_def)",
        ],
        contextAfter: [
          "    def apply_custom_item_effect(self, item_def):",
          '        effect = item_def.get("effect")',
        ],
        starter: [
          '                item_sound = self.get_custom_item_sound(item.item_def.get("sound"))',
          "                if item_sound:",
          "                    item_sound.play()",
        ],
      },
    ],
    hints: [
      'Part 1: `CUSTOM_ITEMS` is a list of dictionaries — add as many as you like. Each needs a `name` (string), `color` (three 0-255 numbers), `image`/`sound` (`None` or a quoted path — the asset picker fills these in), `size` (a number like `1.0`), `effect` (`"add_time"`, `"add_hint"`, or your own string), and `amount` (a plain integer). Example:\n```\nCUSTOM_ITEMS = [\n    {"name": "Time Crystal", "color": (14, 165, 233), "image": "assets/images/item_gem_1.png", "sound": "assets/sounds/pickup_1.wav", "size": 1.2, "effect": "add_time", "amount": 15},\n    {"name": "Hint Scroll", "color": (250, 204, 21), "image": None, "sound": None, "size": 0.8, "effect": "add_hint", "amount": 1},\n]\n```\nPart 2:\n```\nif effect == "add_time":\n    self.bonus_time_seconds += amount\n```\nPart 3:\n```\nif effect == "add_hint":\n    self.hints_remaining += amount\n```\nAny other `effect` string matches neither one and does nothing — that is the safe no-op, and you write nothing for it.\nPart 4: keep the starter exactly as it is — `for` over `self.items`, an `if` on `item.active and item.get_position() == player_position`, then `item.active = False` inside it.\nPart 5: one line, indented to the same depth as `item.active = False`: `self.apply_custom_item_effect(item.item_def)`.\nPart 6: three lines at that same depth — get the sound with `self.get_custom_item_sound(item.item_def.get("sound"))`, then `if item_sound:` and `item_sound.play()` indented under it.',
    ],
    visualizer: "customItemLab",
    grading: {
      mode: "behaviour",
      harness: "customItems_8",
      casesDescription: "Part 1: compiles, defines CUSTOM_ITEMS, and gives non-blocking shape warnings (color/image/sound/size/effect/amount) per item — open-ended, no fixed answer. Parts 2 and 3 are joined and run against real (effect, amount, starting state) cases — add_time adds seconds and stacks, add_hint adds hint uses, and an unrecognized effect string must be a safe no-op (never an error); each effect is also reported separately so a student can see which of the two parts is not wired up yet. Parts 4-6 are joined into one pickup body and run against a stand-in Game holding stub items and a fake sound loader — the item under the player must end up inactive, its effect must have been applied, an item elsewhere must be left alone, and an item with no sound (or a sound that fails to load) must not raise. Extra rules a student invents only produce warnings.",
      multiPart: true,
    },
  },

  // ------------------------------------------------------------------ TODO 9
  //
  // SPLIT (this session): 2 parts -> 4. The two rule lists are now one
  // part each, and the win condition is split into "when is it NOT a win"
  // and "what does winning do".
  {
    id: "9", step: 9, kind: "Bonus", required: false, file: "settings.py",
    title: "Write your game's rules — as text, then as code.",
    lead: "Now that your game actually exists — your custom item(s), your map, your placement rules — it needs rules of its own, written twice, in two different languages:\n\n- **Parts 1-2** (`settings.py`) — the rules in **English**, shown on the mission and how-to-play screens.\n- **Parts 3-4** (`game.py`) — the same rules in **Python**: the code that decides when a round has been won.\n\nThe point of doing both is that they have to **agree**. If Part 1 promises \"collect all the crystals, then reach the goal\", then Part 3 is where that promise becomes true.",
    codeReference: [
      ["MISSION_RULES", "(settings.py) A list of short strings describing the win condition(s), shown on the mission screen."],
      ["HOW_TO_PLAY_RULES", "(settings.py) A list of short strings explaining controls, shown on the how-to-play screen."],
      ["check_goal(self)", "(game.py) Runs every frame. Parts 3/4 and 4/4 are its body: decide whether the round has been won, and what winning does."],
      ["self.player.get_position() / self.goal.get_position()", "(row, col) tuples. Comparing them is how you tell the player is standing on the goal."],
      ["self.items", "Every item spawned this round. item.active is False once it has been collected, so all(not i.active for i in self.items) means 'everything collected'."],
      ["self.current_round / len(ROUND_CONFIGS)", "Which round this is (0, 1, 2) and how many rounds exist."],
      ["self.game_clear", "Set it to True to finish the WHOLE game (the victory screen)."],
      ["self.round_transition_time", "Set it to pygame.time.get_ticks() to clear this round and move on to the next one."],
    ],
    parts: [
      {
        part: "1/4", title: "Write the mission — what the player must do.",
        lead: "**`MISSION_RULES`** is a list of short strings shown on the mission screen. Every string needs its own quotes and its own comma at the end.\n\nRewrite the one line that's there so it describes **your** game — name your own custom item and say what it does. Then add a second line if you want:\n\n```\nMISSION_RULES = [\n    \"Collect every Time Crystal, then reach the vault.\",\n    \"Bombs send you back to the start.\",\n]\n```",
        contextBefore: [],
        contextAfter: [
          "# TODO 9 [Bonus] (Part 2/4): Write the how-to-play instructions.",
        ],
        starter: [
          "MISSION_RULES = [",
          '    "Reach the goal before time runs out.",',
          "]",
        ],
      },
      {
        part: "2/4", title: "Write the how-to-play instructions.",
        lead: "Same shape as Part 1/4 — a list of short quoted strings, one per line, each ending in a comma.\n\nThese are the controls and the dangers. **Keep the arrow-key line true** (that's how your game is actually played), and mention what YOUR item does rather than leaving the generic example text in place.",
        contextBefore: [],
        contextAfter: [],
        starter: [
          "HOW_TO_PLAY_RULES = [",
          '    "Reach the goal to clear each round.",',
          '    "Move with the Arrow Keys (or E/F/C/D on a controller).",',
          '    "Bombs send you back to the start - avoid them.",',
          '    "Collect items for a helpful bonus effect.",',
          "]",
        ],
      },
      {
        part: "3/4", title: 'Decide what counts as "not won yet".', file: "game.py",
        lead: "`check_goal()` runs every frame. The starter says: if the player isn't standing on the goal, stop here — nothing is won.\n\nThat's already correct, so **the smallest version of this part is to read it and move on.**\n\nTo demand more than just arriving, add a second guard underneath in exactly the same shape. Requiring every item first is one extra pair of lines:\n\n```\nif not all(not item.active for item in self.items):\n    return\n```\n\nBe careful with a round you can't actually win — if you require something impossible, the timer just runs out. Try it in the Play tab before you decide it's finished.",
        contextBefore: [
          "    def check_goal(self):",
          '        """Runs every frame: decides when the round has been won."""',
        ],
        contextAfter: [
          '        # TODO 9 [Bonus] (Part 4/4): Decide what winning actually does.',
        ],
        starter: [
          "        if self.player.get_position() != self.goal.get_position():",
          "            return",
        ],
      },
      {
        part: "4/4", title: "Decide what winning actually does.", file: "game.py",
        lead: "Anything still running past Part 3/4's guards has **won** the round. Two outcomes:\n\n- On the last round (`self.current_round == len(ROUND_CONFIGS) - 1`) set **`self.game_clear = True`** — the whole game is finished, victory screen.\n- Otherwise set **`self.round_transition_time = pygame.time.get_ticks()`** — clear this round and move on to the next.\n\nThe starter already does exactly that, so this part is mostly about understanding it. If you want the game to end early — say, after round 2 no matter what — this is the one line that decides it.",
        contextBefore: [
          "        # (Part 3/4 above returned early if this is not a win.)",
        ],
        contextAfter: [
          "    def check_time_limit(self):",
          "        if self.start_time is None:",
          "            return",
        ],
        starter: [
          "        if self.current_round == len(ROUND_CONFIGS) - 1:",
          "            self.game_clear = True",
          "        else:",
          "            self.round_transition_time = pygame.time.get_ticks()",
        ],
      },
    ],
    hints: [
      "Part 1: `MISSION_RULES` is a list of strings — every item needs its own quotes and a comma at the end. Describe the game you actually built: mention your custom item by name and what it does.\nPart 2: `HOW_TO_PLAY_RULES` works exactly the same way. Keep the arrow-key line accurate.\nPart 3: the starter is already a correct win condition, so leaving it alone is a valid answer. To demand more, add your extra condition as a second guard right underneath, in the same shape as the first two lines:\n```\nif not all(not item.active for item in self.items):\n    return\n```\nThat says \"if anything is still uncollected, this isn't a win yet\".\nPart 4: keep the starter as it is — `if self.current_round == len(ROUND_CONFIGS) - 1:` sets `self.game_clear = True`, and the `else:` sets `self.round_transition_time = pygame.time.get_ticks()`.",
    ],
    visualizer: "titleCard",
    grading: {
      mode: "behaviour",
      harness: "gameRules_9",
      casesDescription: "Parts 1 and 2: compiles and defines MISSION_RULES / HOW_TO_PLAY_RULES, checked one per part so the message points at the right list; empty lists or non-strings are non-blocking warnings. Parts 3 and 4 are joined into one win-condition body and run against a stand-in Game — standing somewhere other than the goal must never clear the round, and it must not raise for any of the states tried (mid-round, last round, items left, no items at all). Whether standing on the goal is enough, or your own extra condition has to be met first, is entirely up to you: a goal that needs more than arriving produces an informational note, not a failure.",
      multiPart: true,
    },
  },
];

// Expose on window for app.js (no ES module system, plain scripts).
window.COURSE_DATA = {
  REQUIRED_ORDER,
  BONUS_ORDER,
  KNOWN_ASSET_FILES,
  COURSE_STEPS,
};
