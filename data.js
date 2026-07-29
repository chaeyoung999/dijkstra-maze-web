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
    lead: "This function powers the player's Hint button: it finds the shortest route from the player to the goal, treating active bombs as very expensive so the route avoids them. Dijkstra's relaxation step here is really two separate ideas glued together: computing a candidate cost, then deciding whether to actually keep it. Each part below gets its own explanation, split the same way TODO 7 splits into Part 1/2 and Part 2/2.",
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
  {
    id: "6", step: 6, kind: "Bonus", required: false, file: "settings.py",
    title: "Redesign the rounds, tune the movement feel, and decide where things spawn.",
    lead: "This step is the shape of your whole game, and it gets more open-ended as you go:\n\n- **Part 1/3** — the rounds themselves (and how many there are).\n- **Part 2/3** — how the game *feels* to play.\n- **Part 3/3** — real code: where every item and bomb actually lands.\n\nPrefer not to hand-edit numbers? The **map editor** on the right paints a layout tile by tile — including where the player starts, where the goal is, and (once TODO 8 has an item) exactly which of your own items goes where.",
    codeReference: [
      ["ROUND_CONFIGS", "(settings.py) A list of dictionaries, one per round, read in order as the player clears rounds. It ships with 3 — add a fourth to make your game longer, or delete one to make it shorter."],
      ["rows, cols, cell_size", "Grid dimensions and pixel size of one cell; bigger rows/cols means a bigger maze."],
      ["extra_open_walls", "Extra connections punched into the perfect maze so it has loops, not just one solution path."],
      ["bomb_count, custom_item_count", "How many of each object are placed on the map."],
      ["time_limit_seconds", "How long the player has to finish the round."],
      ["PLAYER_MOVE_DELAY_MS", "The shortest gap between two cell steps, in milliseconds — smaller is faster."],
      ["ALLOW_PATH_HINT", "True/False — whether the Hint button exists at all."],
      ["MAX_HINT_COUNT", "How many times Hint can be used per round; interacts with TODO 8's add_hint effect."],
      ["create_game_objects(self)", "(game.py) Called once per round, right after the maze finishes generating. Your job in Part 3/3 is to fill self.items and self.bombs."],
      ["create_random_positions(rows, cols, count, forbidden)", "Helper that returns a list of count (row, col) tuples, never picking a cell that is already in forbidden."],
      ["forbidden", "A set of cells nothing may spawn on. Starts with the player's start cell and the goal; add positions to it as you use them so two objects never share a cell."],
      ["CustomItem(row, col, cell_size, item_def)", "One collectible. item_def is one dictionary out of your own CUSTOM_ITEMS list (TODO 8)."],
      ["Bomb(row, col, cell_size)", "One bomb. Stepping on it sends the player back to the start."],
    ],
    parts: [
      {
        part: "1/3", title: "Redesign the rounds (and add or remove some).",
        lead: "Each dictionary in this list is one round, played in order. Change the numbers to redraw your difficulty curve — bigger `rows`/`cols` for a longer maze, more `bomb_count`, a stricter `time_limit_seconds`.\n\n**You are not stuck with three rounds.** Copy a dictionary and paste it at the end for a fourth round; delete one for a shorter game. The map editor on the right grows or shrinks its round tabs to match.\n\nKeep every key inside each dictionary though — the engine reads all of them by name, so deleting one will crash the game.",
        contextBefore: [],
        contextAfter: [
          "# TODO 6 [Bonus] (Part 2/3): Tune movement speed and hint availability.",
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
        part: "2/3", title: "Tune movement speed and hint availability.",
        contextBefore: [],
        contextAfter: [
          "# =========================================================",
          "# Route weights for the Hint button's Dijkstra route (given, not a TODO)",
          "# =========================================================",
        ],
        lead: "Two more settings decide how your game feels to play. **`PLAYER_MOVE_DELAY_MS`** is the shortest gap between two cell steps, in milliseconds — smaller is faster (less waiting between moves). **`ALLOW_PATH_HINT`** switches the Hint button off entirely if you set it to `False`, and **`MAX_HINT_COUNT`** limits how many times it can be used per round. Note the last one interacts with Bonus TODO 8's `\"add_hint\"` item effect — a very low `MAX_HINT_COUNT` makes an add_hint item much more valuable (and vice versa), which isn't a bug, just something to keep in mind when balancing your game.",
        starter: [
          "PLAYER_MOVE_DELAY_MS = 100",
          "ALLOW_PATH_HINT = True",
          "MAX_HINT_COUNT = 2",
        ],
      },
      {
        part: "3/3", title: "Decide where the items and bombs go.", file: "game.py",
        lead: "Every round, once the maze has finished generating, `create_game_objects()` runs exactly once and has to fill two lists: **`self.items`** (your collectibles) and **`self.bombs`**. The starter below is the plain version — scatter both at random. Your job is to make the placement *mean* something.\n\n**`create_random_positions(rows, cols, count, forbidden)`** hands you a list of `(row, col)` tuples and never picks a cell that's already in **`forbidden`**. Keep adding the positions you use back into `forbidden` and nothing will ever overlap.\n\n**Different items in different rounds.** `self.current_round` is `0` for round 1, `1` for round 2, and so on — so you can hand each round its own selection out of your `CUSTOM_ITEMS`:\n\n- `choices = CUSTOM_ITEMS[:2] if self.current_round == 0 else CUSTOM_ITEMS`\n  → round 1 only ever spawns your first two items; later rounds can spawn anything.\n\nOther directions worth trying:\n\n- Guarantee variety: instead of `random.choice(CUSTOM_ITEMS)`, use `CUSTOM_ITEMS[index % len(CUSTOM_ITEMS)]` so every item you designed actually shows up.\n- Keep bombs away from the start so round 1 isn't instantly unfair — drop any position where `r + c < 4`.\n- Make the final round brutal: `self.config[\"bomb_count\"] * 2`.\n- Hand-place something at a fixed cell every single round.\n\nThe only hard rule: `self.items` and `self.bombs` must both end up as **lists** (empty is fine) — anything else and the drawing code later on crashes.",
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
          "        self.objects_created = True",
          "        self.start_time = pygame.time.get_ticks()",
        ],
        starter: [
          "        custom_positions = create_random_positions(",
          '            self.config["rows"], self.config["cols"],',
          '            self.config.get("custom_item_count", 0), forbidden,',
          "        )",
          "        self.items = [",
          '            CustomItem(row, col, self.config["cell_size"], random.choice(CUSTOM_ITEMS))',
          "            for row, col in custom_positions",
          "        ]",
          "        forbidden.update(custom_positions)",
          "",
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
          "        forbidden.update(bomb_positions)",
        ],
      },
    ],
    hints: [
      "Part 1: a list of dictionaries, one per round — three to start with, but you can copy one and paste it at the end for a fourth round, or delete one for a shorter game. Every key inside a dictionary means something to the engine (deleting one will crash the game), so only change the numeric values, and keep them plain integers. Don't want to hand-edit the numbers? Use the map editor panel on the right: paint the layout (plus the player/goal start tiles and your own custom items) and the numbers are written into the code for you.\nPart 2: `PLAYER_MOVE_DELAY_MS` is milliseconds (a smaller number moves faster); `ALLOW_PATH_HINT` is `True` or `False`; `MAX_HINT_COUNT` is a plain integer — how many times Hint can be used per round.\nPart 3: keep the starter's overall shape — ask `create_random_positions(...)` for a list of positions, build a list of objects from it, then `forbidden.update(...)` so the next thing you place can't land on top. To filter positions, wrap the call in a list comprehension: `spots = [p for p in create_random_positions(...) if p[0] + p[1] >= 4]` (ask for a few more than you need, since filtering throws some away). To choose which item spawns, replace `random.choice(CUSTOM_ITEMS)` with your own pick — `CUSTOM_ITEMS[index % len(CUSTOM_ITEMS)]` inside a `for index, (row, col) in enumerate(spots):` loop, or a per-round list built from `self.current_round`. `self.items` and `self.bombs` must both still be lists at the end.",
    ],
    visualizer: "mapEditor",
    grading: {
      mode: "behaviour",
      harness: "roundDesign_6",
      casesDescription: "Parts 1-2 keep the open-ended settings checks (compiles, ROUND_CONFIGS / PLAYER_MOVE_DELAY_MS / ALLOW_PATH_HINT / MAX_HINT_COUNT defined; shape and range problems are non-blocking warnings). Part 3 actually RUNS the placement code against a stand-in Game with a known grid, stub CustomItem/Bomb classes and the real create_random_positions, then checks the outcome: self.items and self.bombs are both lists, every position sits inside the grid, and nothing spawns on the player or the goal. Counts, filtering rules and which item goes where are all left free — they only ever produce warnings.",
      multiPart: true,
    },
  },

  // ------------------------------------------------------------------ TODO 7
  {
    id: "7", step: 7, kind: "Bonus", required: false, file: "settings.py",
    title: "Replace images/colors, resize them, add sounds, and control the music.",
    lead: "This Bonus TODO spans **two files** and decides everything the player sees and hears.\n\nPart 1/3 (`settings.py`) covers images: paths for the player, goal, floor tile and bomb, a **`_SCALE`** multiplier that resizes each one, and the **`_COLOR`** tuple each falls back to when its image path is `None`. Part 2/3 (`settings.py`) covers sound: paths for the bomb and background music, plus **`BOMB_EXPLOSION_DURATION_MS`** (how long the explosion animation shows) and **`BACKGROUND_MUSIC_VOLUME`** (0.0-1.0). Every path value is either **`None`** (use the built-in shape/silence) or a quoted path to a file under `assets/images/` or `assets/sounds/` — there's no third option, and you can change as many or as few lines as you like.\n\nPart 3/3 (`game.py`) is real code: **`load_background_music()`** is where the music is actually started, so *how* it plays — loop forever, play once, fade in — is yours to write.\n\nThe **`_SCALE`** values are the quickest way to make the game feel like yours: a 2.0 player fills its cell completely, a 0.4 bomb becomes a small hazard that's easy to miss. They resize the built-in shapes too, so they work whether or not you picked image files.",
    codeReference: [
      ["PLAYER_IMAGE_PATH / GOAL_IMAGE_PATH / BOMB_IMAGE_PATH / FLOOR_TILE_IMAGE_PATH", "(settings.py) Each is either None (use the built-in drawn shape) or a quoted path to a file under assets/images/."],
      ["PLAYER_IMAGE_SCALE / GOAL_IMAGE_SCALE / BOMB_IMAGE_SCALE", "Size multipliers: 1.0 is the normal size that fits a cell, 0.5 is half as big, 1.6 is bigger than its cell. Resizes the fallback shape as well as the image."],
      ["WALL_COLOR / PLAYER_COLOR / GOAL_COLOR / BOMB_COLOR / BOMB_EXPLOSION_COLOR", "(R, G, B) tuples, each 0-255 — what actually gets drawn whenever the matching image is None."],
      ["BOMB_SOUND_PATH / BACKGROUND_MUSIC_PATH", "Each is either None (silent) or a quoted path to a file under assets/sounds/."],
      ["BOMB_EXPLOSION_DURATION_MS", "How long (milliseconds) the explosion animation shows before the bomb disappears."],
      ["BACKGROUND_MUSIC_VOLUME", "0.0 (silent) to 1.0 (full volume)."],
      ["load_background_music(self)", "(game.py) Called once at boot. Part 3/3 is its whole body — yours to write."],
      ["pygame.mixer.music.play(loops)", "loops is how many times to REPEAT: -1 loops forever, 0 plays once, 3 plays four times. Also takes fade_ms=... to fade in."],
    ],
    parts: [
      {
        part: "1/3", title: "Replace the images, resize them, and pick their fallback colors.",
        contextBefore: [],
        contextAfter: [
          'BOMB_EXPLOSION_IMAGE_PATH = "assets/images/explode_2.png"  # also try explode.png',
          "",
          "# TODO 7 [Bonus] (Part 2/3): Add background music, a bomb sound effect, and tune their timing/volume.",
          "# Detailed hint:",
        ],
        starter: [
          "PLAYER_IMAGE_PATH = None",
          "GOAL_IMAGE_PATH = None",
          "BOMB_IMAGE_PATH = None",
          "FLOOR_TILE_IMAGE_PATH = None  # Background floor for open path cells.",
          "PLAYER_IMAGE_SCALE = 1.0",
          "GOAL_IMAGE_SCALE = 1.0",
          "BOMB_IMAGE_SCALE = 1.0",
          "WALL_COLOR = (30, 41, 59)",
          "PLAYER_COLOR = (37, 99, 235)",
          "GOAL_COLOR = (250, 204, 21)",
          "BOMB_COLOR = (15, 23, 42)",
          "BOMB_EXPLOSION_COLOR = (239, 68, 68)",
        ],
      },
      {
        part: "2/3", title: "Add background music, a bomb sound effect, and tune their timing/volume.",
        contextBefore: [],
        contextAfter: [
          "# =========================================================",
          "# Customize your collectible item(s) below.",
          "# =========================================================",
        ],
        starter: [
          "BOMB_SOUND_PATH = None",
          "BACKGROUND_MUSIC_PATH = None",
          "BOMB_EXPLOSION_DURATION_MS = 500",
          "BACKGROUND_MUSIC_VOLUME = 0.25",
        ],
      },
      {
        part: "3/3", title: "Decide how the music actually plays.", file: "game.py",
        lead: "Part 2/3 chose **which** file and how loud. This part is the playback itself — `load_background_music()` runs once, when the game boots.\n\nThe number you pass to **`pygame.mixer.music.play()`** is how many times to *repeat*: `play(-1)` loops forever, `play(0)` plays it exactly once and then silence, `play(3)` plays it four times in total. You can also fade in with `play(-1, fade_ms=3000)`, or load a different file here for any reason you like — nothing forces you to use `BACKGROUND_MUSIC_PATH`.\n\nOne rule: **keep the `try`/`except`**. A missing or broken sound file has to print a message and carry on, never crash the game — that's what lets a classmate open your project without your audio files and still play it.",
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
      'Part 1: Every image value here is either `None` (built-in shape) or a quoted path under `assets/images/` — forgetting the quotes is the most common mistake when typing paths by hand, e.g. `PLAYER_IMAGE_PATH = "assets/images/boy.png"`. Each `_SCALE` is a size multiplier: `1.0` is normal, `0.5` is half as big, `1.6` is bigger than its cell — it resizes the built-in shape too, so it works even with no image file. Each `_COLOR` is a plain `(R, G, B)` tuple, three integers 0-255. The asset picker panel on the right fills in image paths for you with one click.\nPart 2: Sound paths follow the same None-or-quoted-path rule under `assets/sounds/`. `BOMB_EXPLOSION_DURATION_MS` is milliseconds (a plain integer); `BACKGROUND_MUSIC_VOLUME` is a number from 0.0 to 1.0.\nPart 3: the smallest possible change is the number inside `pygame.mixer.music.play(...)` — try `0` (play once) or `1` (play twice). To fade in instead, `pygame.mixer.music.play(-1, fade_ms=3000)`. Leave the `try:` / `except (pygame.error, FileNotFoundError, TypeError) as error:` lines alone and write inside the `try` block.',
    ],
    visualizer: "assetPicker",
    grading: {
      mode: "behaviour",
      harness: "lookAndFeel_7",
      casesDescription: "Parts 1-2 keep the open-ended settings checks (compiles, every image/scale/color/sound/tuning name defined; path, color, range and scale problems are non-blocking warnings). Part 3 runs the playback code against a fake pygame.mixer that records what was called, and only requires two things: it does not raise, and a missing sound file (mixer raising pygame.error) is still handled without crashing. Whether the music loops, plays once or fades in is entirely free — those only produce an informational note.",
      multiPart: true,
    },
  },

  // ------------------------------------------------------------------ TODO 8
  {
    id: "8", step: 8, kind: "Bonus", required: false, file: "settings.py",
    title: "Design your own collectible item(s), wire up their effects, and control the pickup.",
    lead: "This Bonus TODO spans **two files** and three connected ideas — it's the deepest step in the course.\n\nPart 1/3 (`settings.py`) is where your game gets its own signature collectibles. **`CUSTOM_ITEMS`** is a list — add as many dictionaries as you like, each with its own:\n\n- **`name`** — the display name.\n- **`color`** — an RGB tuple, used when no `image` is set.\n- **`image`** / **`sound`** — `None`, or a quoted path under `assets/images/` / `assets/sounds/`, exactly like TODO 7's assets. Each item can have its OWN picture and pickup sound — they don't have to share one.\n- **`size`** — a size multiplier for this item alone: `1.0` normal, `0.6` small and easy to miss, `1.5` chunky and obvious.\n- **`effect`** — what happens when it's collected: `\"add_time\"` (extra seconds) or `\"add_hint\"` (extra Hint-button uses), or an effect name you invent yourself.\n- **`amount`** — how much of that effect.\n\nPart 2/3 (`game.py`, inside **`apply_custom_item_effect`**) is where you WRITE the code that reacts to `effect`/`amount`: branch on `\"add_time\"` (increase `self.bonus_time_seconds`) and `\"add_hint\"` (increase `self.hints_remaining`). Any effect string you invent that isn't one of those two must stay a safe no-op here — never raise an error — so an experimental idea never crashes the game.\n\nPart 3/3 (`game.py`, inside **`check_items`**) is the pickup itself: which item counts as collected, when, and what happens at that exact moment — including playing that item's own sound.\n\nEvery round spawns several custom items, each randomly drawn from this list (or exactly the item(s) you place by hand with the map editor in TODO 6), so two or three genuinely different items — each with their own art, size and sound — can appear side by side.",
    codeReference: [
      ["CUSTOM_ITEMS", "(settings.py) A list of dictionaries — add as many as you like, each describing one distinct custom item."],
      ["name", "The display name of this collectible."],
      ["color", "An (R, G, B) tuple, each 0-255, used when no image is set."],
      ["image / sound", "None, or a quoted path under assets/images/ or assets/sounds/ — this item's OWN picture/pickup sound."],
      ["size", "A size multiplier for this item alone. 1.0 is normal; values outside 0.1-3.0 are clamped so a typo can never make an item invisible or fill the screen."],
      ["effect", 'A string describing what happens on pickup. "add_time" and "add_hint" are built in and handled in Part 2/3; any other string must be a safe no-op there.'],
      ["amount", "How much of the effect: extra seconds for add_time, extra hint uses for add_hint."],
      ["apply_custom_item_effect(self, item_def)", "(game.py) Called once per pickup with the item's dict; effect/amount are already pulled out for you — your job is just the branching."],
      ["check_items(self)", "(game.py) Runs every frame. Part 3/3 is its body: spot the item under the player and collect it."],
      ["item.active / item.get_position() / item.item_def", "One spawned item: still on the board?, where it is, and its own dictionary out of your CUSTOM_ITEMS."],
      ["self.get_custom_item_sound(path)", "Loads (and caches) a pygame Sound for a path, or returns None. Call .play() on the result to hear it."],
    ],
    parts: [
      {
        part: "1/3", title: "Design your own collectible item(s).", file: "settings.py",
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
        part: "2/3", title: "Apply the effect (add_time / add_hint / your own).", file: "game.py",
        contextBefore: [
          "    def apply_custom_item_effect(self, item_def):",
          '        """Applies whatever "effect"/"amount" a custom item (TODO 8,',
          "        Part 2/3) declares - your job is just the branching. See the",
          '        full explanation in your own game.py."""',
          '        effect = item_def.get("effect")',
          '        amount = item_def.get("amount", 0)',
        ],
        contextAfter: [
          "",
          "    def check_bombs(self):",
          "        now = pygame.time.get_ticks()",
        ],
        starter: [
          "        pass  # Write your code here.",
        ],
      },
      {
        part: "3/3", title: "Decide when an item is collected, and play its sound.", file: "game.py",
        lead: "`check_items()` runs every single frame. **`player_position`** is already worked out for you on the line above; everything else is yours.\n\nWalk through **`self.items`**. Each one has **`.active`** (still on the board?), **`.get_position()`**, and **`.item_def`** — its own dictionary out of your `CUSTOM_ITEMS`. To collect one: set `item.active = False`, then call **`self.apply_custom_item_effect(item.item_def)`** — that runs *your own Part 2/3 code*, so the effect you invented happens from right here.\n\nFor sound, **`self.get_custom_item_sound(path)`** hands back a playable Sound (or `None` if there's no file), and `.play()` starts it. Because each item carries its own `\"sound\"`, two items collected in the same round can sound completely different.\n\nOnce the starter works, this is a good place to get inventive: play a special sound only for `\"add_time\"` items, make a rare item need two visits before it counts, or hand out a small bonus for collecting two items in a row.",
        contextBefore: [
          "    def check_items(self):",
          '        """Runs every frame: decides when an item counts as collected."""',
          "        player_position = self.player.get_position()",
        ],
        contextAfter: [
          "    def apply_custom_item_effect(self, item_def):",
          '        effect = item_def.get("effect")',
        ],
        starter: [
          "        for item in self.items:",
          "            if item.active and item.get_position() == player_position:",
          "                item.active = False",
          "                self.apply_custom_item_effect(item.item_def)",
          '                item_sound = self.get_custom_item_sound(item.item_def.get("sound"))',
          "                if item_sound:",
          "                    item_sound.play()",
        ],
      },
    ],
    hints: [
      'Part 1: `CUSTOM_ITEMS` is a list of dictionaries, and you can add as many as you like. Each one needs a `name` (string), a `color` (a tuple of three 0-255 numbers), `image`/`sound` (`None`, or a quoted path — the asset picker on the right fills these in for the item you\'re currently editing), a `size` (a number like `1.0`), an `effect` (the string `"add_time"` or `"add_hint"`, or your own invented string), and an `amount` (a plain integer). Example:\n```\nCUSTOM_ITEMS = [\n    {"name": "Time Crystal", "color": (14, 165, 233), "image": "assets/images/item_gem_1.png", "sound": "assets/sounds/pickup_1.wav", "size": 1.2, "effect": "add_time", "amount": 15},\n    {"name": "Hint Scroll", "color": (250, 204, 21), "image": None, "sound": None, "size": 0.8, "effect": "add_hint", "amount": 1},\n]\n```\nPart 2:\n```\nif effect == "add_time":\n    self.bonus_time_seconds += amount\nelif effect == "add_hint":\n    self.hints_remaining += amount\n```\nAny other `effect` string simply falls through both branches and does nothing — that\'s the safe no-op the game promises.\nPart 3: keep the starter\'s shape — loop over `self.items`, and inside the `if`, mark it inactive FIRST (`item.active = False`) so one item can never be collected twice in the same frame. To play a different sound for one effect, add a branch inside the `if`: `if item.item_def.get("effect") == "add_time": ...`.',
    ],
    visualizer: "customItemLab",
    grading: {
      mode: "behaviour",
      harness: "customItems_8",
      casesDescription: "Part 1: compiles, defines CUSTOM_ITEMS, and gives non-blocking shape warnings (color/image/sound/size/effect/amount) per item — open-ended, no fixed answer. Part 2: the student's apply_custom_item_effect body is run against real (effect, amount, starting state) cases — add_time adds seconds, add_time stacks, add_hint adds a hint use, add_hint with a larger amount, and an unrecognized effect string, which must be a safe no-op (never an error). Part 3: the pickup body runs against a stand-in Game holding stub items and a fake sound loader — the item under the player must end up inactive and its effect applied, an item elsewhere must be left alone, and an item with no sound (or a sound that fails to load) must not raise. Extra rules a student invents only produce warnings. Each part is graded independently.",
      multiPart: true,
    },
  },

  // ------------------------------------------------------------------ TODO 9
  {
    id: "9", step: 9, kind: "Bonus", required: false, file: "settings.py",
    title: "Write your game's rules — as text, then as code.",
    lead: "Now that your game actually exists — your custom item(s), your map, your placement rules — it needs rules of its own. This step spans **two files** and asks for the same rules twice, in two different languages.\n\nPart 1/2 (`settings.py`) is the rules in **English**: **`MISSION_RULES`** and **`HOW_TO_PLAY_RULES`** are lists of short strings shown on the mission and how-to-play screens.\n\nPart 2/2 (`game.py`, inside **`check_goal`**) is the same rules in **Python**: the code that actually decides when a round has been won. The starter is the plain version — stand on the goal, round over. But if you want your game to demand something more (collect everything first, finish early once you have enough items), this is the one place that decides it.\n\nThe point of doing both is that they have to **agree**. If your `MISSION_RULES` promises \"collect all the crystals, then reach the goal\", then Part 2/2 is where that promise becomes true.",
    codeReference: [
      ["MISSION_RULES", "(settings.py) A list of short strings describing the win condition(s), shown on the mission screen."],
      ["HOW_TO_PLAY_RULES", "(settings.py) A list of short strings explaining controls, shown on the how-to-play screen."],
      ["check_goal(self)", "(game.py) Runs every frame. Part 2/2 is its whole body: decide whether the round has been won."],
      ["self.player.get_position() / self.goal.get_position()", "(row, col) tuples. Comparing them is how you tell the player is standing on the goal."],
      ["self.items", "Every item spawned this round. item.active is False once it has been collected, so all(not i.active for i in self.items) means 'everything collected'."],
      ["self.current_round / len(ROUND_CONFIGS)", "Which round this is (0, 1, 2) and how many rounds exist."],
      ["self.game_clear", "Set it to True to finish the WHOLE game (the victory screen)."],
      ["self.round_transition_time", "Set it to pygame.time.get_ticks() to clear this round and move on to the next one."],
    ],
    parts: [
      {
        part: "1/2", title: "Write your rules as text.", file: "settings.py",
        contextBefore: [],
        contextAfter: [],
        starter: [
          "MISSION_RULES = [",
          '    "Reach the goal before time runs out.",',
          "]",
          "HOW_TO_PLAY_RULES = [",
          '    "Reach the goal to clear each round.",',
          '    "Move with the Arrow Keys (or E/F/C/D on a controller).",',
          '    "Bombs send you back to the start - avoid them.",',
          '    "Collect items for a helpful bonus effect.",',
          "]",
        ],
      },
      {
        part: "2/2", title: "Write the same rules as code.", file: "game.py",
        lead: "`check_goal()` runs every frame. The starter says: if the player isn't standing on the goal, do nothing; otherwise, either finish the game (last round) or start the transition to the next round.\n\nTo demand more than just reaching the goal, add your own condition before the win. For example, requiring every item first is one extra line:\n\n- `if not all(not item.active for item in self.items): return`\n\nBe careful with a round you can't actually win — if you require something impossible, the timer will simply run out. Try it in the Play tab on the right before you decide it's finished.",
        contextBefore: [
          "    def check_goal(self):",
          '        """Runs every frame: decides when the round has been won."""',
        ],
        contextAfter: [
          "    def check_time_limit(self):",
          "        if self.start_time is None:",
          "            return",
        ],
        starter: [
          "        if self.player.get_position() != self.goal.get_position():",
          "            return",
          "",
          "        if self.current_round == len(ROUND_CONFIGS) - 1:",
          "            self.game_clear = True",
          "        else:",
          "            self.round_transition_time = pygame.time.get_ticks()",
        ],
      },
    ],
    hints: [
      "Part 1: `MISSION_RULES` and `HOW_TO_PLAY_RULES` are both lists of strings (every item needs its own quotes and comma) — describe the game you actually built: mention your custom item(s) by name and what they do, rather than leaving the generic example text in place.\nPart 2: keep the starter exactly as it is and add your extra condition as a guard right at the top, in the same shape as the first two lines:\n```\nif not all(not item.active for item in self.items):\n    return\n```\nThat says \"if anything is still uncollected, this isn't a win yet\". Everything below it stays untouched.",
    ],
    visualizer: "titleCard",
    grading: {
      mode: "behaviour",
      harness: "gameRules_9",
      casesDescription: "Part 1: compiles and defines MISSION_RULES and HOW_TO_PLAY_RULES; empty lists or non-strings are non-blocking warnings. Part 2: the win-condition body runs against a stand-in Game — standing somewhere other than the goal must never clear the round, and it must not raise for any of the states tried (mid-round, last round, items left, no items at all). Whether standing on the goal is enough, or your own extra condition has to be met first, is entirely up to you: a goal that needs more than arriving produces an informational note, not a failure.",
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
