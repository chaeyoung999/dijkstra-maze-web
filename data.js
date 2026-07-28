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
 * order — EXCEPT "9" (write your game's rules), which is a capstone: it
 * stays locked until every OTHER Bonus id is completed or skipped, since
 * writing honest rules only makes sense once the student's own game
 * (custom item(s), map) actually exists. See app.js computeStatus()
 * for the one-off exception this requires.
 */
const BONUS_ORDER = ["6", "7", "8", "9"];

/** The capstone id that stays locked until every other Bonus id is done. */
const CAPSTONE_BONUS_ID = "9";

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
    title: "Connect the arrow keys or WASD keys to maze movement.",
    lead: "Right now your maze ignores the keyboard entirely. Each frame, `update_player()` checks which key is currently held down and needs to move the player one cell in that direction. Inside the branch for each key, call **`self.player.try_move(direction, self.maze)`** — `direction` is one of the strings `\"left\"`/`\"right\"`/`\"top\"`/`\"bottom\"` (note: `\"top\"`/`\"bottom\"`, not `\"up\"`/`\"down\"`) — and store what it returns in **`moved`**. Use `if` for the first key check and `elif` for the rest (not four separate `if`s), so only one direction can win when two keys are pressed together.",
    codeReference: [
      ["self.player.try_move(direction, self.maze)", "Attempts to move the player one cell in direction. Returns True if the move succeeded, False if it was blocked."],
      ["moved", "A boolean you set to the result of try_move. The code right after your TODO reads it to decide whether to reset the movement timer."],
      ["pygame.K_LEFT / K_a, K_RIGHT / K_d, K_UP / K_w, K_DOWN / K_s", "The key constants for arrow keys and WASD. keys[...] is True while that key is held down."],
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
      "        if keys[pygame.K_LEFT] or keys[pygame.K_a]:",
      '            pass  # Write your code here. Hint: the direction string is "left"',
      "        elif keys[pygame.K_RIGHT] or keys[pygame.K_d]:",
      '            pass  # Write your code here. Hint: the direction string is "right"',
      "        elif keys[pygame.K_UP] or keys[pygame.K_w]:",
      '            pass  # Write your code here. Hint: the direction string is "top"',
      "        elif keys[pygame.K_DOWN] or keys[pygame.K_s]:",
      '            pass  # Write your code here. Hint: the direction string is "bottom"',
    ],
    hints: [
      'moved = self.player.try_move("???", self.maze) — this exact line goes in all four branches; just swap in the matching direction string each time: "left", "right", "top", "bottom".',
    ],
    visualizer: "playerMove",
    grading: {
      mode: "behaviour",
      harness: "movement_2",
      casesDescription: "Given a starting position and a key press (in a maze with known walls), asserts the player's final position matches the correct neighboring cell for that direction, or stays put when a wall blocks it. Also checks moved correctly reflects whether the position actually changed, and that pressing two opposite keys together moves at most one cell. Implementation-agnostic: doesn't check for any specific function call, only the resulting position/moved values.",
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
    title: "Redesign the three rounds.",
    lead: "**`ROUND_CONFIGS`** is the difficulty curve of your whole game: one dictionary per round, read in order as the player advances. You can change `rows`, `cols`, `cell_size`, `extra_open_walls`, `bomb_count`, `custom_item_count`, and `time_limit_seconds` — bigger mazes, more bombs, and stricter timers raise the difficulty. Keep all three dictionaries, keep every key, and keep every value a plain integer — only change the numbers.\n\nPrefer not to hand-edit the numbers? The map editor on the right lets you paint a layout directly, tile by tile — pick a piece from the palette, then click or drag on the board, including exactly where the player starts and where the goal is.",
    codeReference: [
      ["ROUND_CONFIGS", "A list of exactly 3 dictionaries, one per round, read in order as the player clears rounds."],
      ["rows, cols, cell_size", "Grid dimensions and pixel size of one cell; bigger rows/cols means a bigger maze."],
      ["extra_open_walls", "Extra connections punched into the perfect maze so it has loops, not just one solution path."],
      ["bomb_count, custom_item_count", "How many of each object are placed on the map."],
      ["time_limit_seconds", "How long the player has to finish the round."],
    ],
    contextBefore: [],
    contextAfter: [
      "# Use the built-in shape when an image path is None.",
      "# TODO 7 [Bonus] (Part 1/2): Replace the player, goal, item, or bomb images.",
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
    hints: [
      "Three dictionaries in a list, one per round. Every key already means something to the engine (deleting one will crash the game), so only change the numeric values, and keep them plain integers. Don't want to hand-edit the numbers? Use the map editor panel on the right: pick your rows and cols, paint the layout (plus the player/goal start tiles), then press Apply to write these numbers into the code for you automatically.",
    ],
    visualizer: "mapEditor",
    grading: {
      mode: "syntax",
      mustDefine: ["ROUND_CONFIGS"],
      notes: "Open-ended: passes once the code runs with no Python error and ROUND_CONFIGS is defined. Shape issues (wrong count, missing keys, non-int values) surface as non-blocking warnings, not failures.",
    },
  },

  // ------------------------------------------------------------------ TODO 7
  {
    id: "7", step: 7, kind: "Bonus", required: false, file: "settings.py",
    title: "Replace the player, goal, item, bomb images, and add sounds.",
    lead: "Two settings blocks decide what the player sees and hears: image paths for the player, goal, floor tile, and bomb, then sound paths for the bomb and background music. Every value is either **`None`** (use the game's built-in shape/silence) or a quoted path to a file already provided in `assets/images/` or `assets/sounds/` — there's no third option, and you can change as many or as few lines as you like.",
    codeReference: [
      ["PLAYER_IMAGE_PATH / GOAL_IMAGE_PATH / BOMB_IMAGE_PATH / FLOOR_TILE_IMAGE_PATH", "Each is either None (use the built-in drawn shape) or a quoted path to a file under assets/images/."],
      ["BOMB_SOUND_PATH / BACKGROUND_MUSIC_PATH", "Each is either None (silent) or a quoted path to a file under assets/sounds/."],
    ],
    parts: [
      {
        part: "1/2", title: "Replace the player, goal, floor tile, or bomb images.",
        contextBefore: [],
        contextAfter: [
          'BOMB_EXPLOSION_IMAGE_PATH = "assets/images/explode_2.png"  # also try explode.png',
          "BOMB_EXPLOSION_DURATION_MS = 500",
        ],
        starter: [
          "PLAYER_IMAGE_PATH = None",
          "GOAL_IMAGE_PATH = None",
          "BOMB_IMAGE_PATH = None",
          "FLOOR_TILE_IMAGE_PATH = None  # Background floor for open path cells.",
        ],
      },
      {
        part: "2/2", title: "Add background music and a bomb sound effect.",
        contextBefore: [],
        contextAfter: [
          "BACKGROUND_MUSIC_VOLUME = 0.25",
          "CUSTOM_ITEM_IMAGE_PATH = \"assets/images/item_star.png\"  # used for every entry in CUSTOM_ITEMS below",
          "CUSTOM_ITEM_SOUND_PATH = \"assets/sounds/pickup_3.wav\"",
        ],
        starter: [
          "BOMB_SOUND_PATH = None",
          "BACKGROUND_MUSIC_PATH = None",
        ],
      },
    ],
    hints: [
      'Every value here is either `None` (silent / built-in shape) or a quoted path under `assets/images/` or `assets/sounds/` — forgetting the quotes is the most common mistake when typing paths by hand, e.g. `PLAYER_IMAGE_PATH = "assets/images/boy.png"`. The asset picker panel on the right fills in the correct line for you with one click, so you don\'t have to type paths at all if you\'d rather not.',
    ],
    visualizer: "assetPicker",
    grading: {
      mode: "syntax",
      mustDefine: [
        "PLAYER_IMAGE_PATH", "GOAL_IMAGE_PATH", "BOMB_IMAGE_PATH", "FLOOR_TILE_IMAGE_PATH",
        "BOMB_SOUND_PATH", "BACKGROUND_MUSIC_PATH",
      ],
      notes: "Open-ended: passes once the code runs with no Python error and all six names are defined. Path/type issues surface as non-blocking warnings, not failures.",
      twoParts: true,
    },
  },

  // ------------------------------------------------------------------ TODO 8
  {
    id: "8", step: 8, kind: "Bonus", required: false, file: "settings.py",
    title: "Design your own collectible item(s).",
    lead: "This is where your game gets its own signature collectibles. **`CUSTOM_ITEMS`** is a list — add as many dictionaries as you like, each with its own:\n\n- **`name`** — the display name.\n- **`color`** — an RGB tuple, used when no image is set.\n- **`effect`** — what happens when it's collected. Two effects are already wired up: `\"add_time\"` (adds seconds to the round's clock) and `\"add_hint\"` (adds extra Hint-button uses).\n- **`amount`** — how much of that effect: seconds for `add_time`, hint uses for `add_hint`.\n\nEvery round spawns several custom items total, each randomly drawn from this list, so two or three genuinely different items can appear side by side. Feel free to invent your own effect name too (e.g. `\"shrink_maze\"`) — the game safely does nothing extra for an effect it doesn't recognize, so an experimental idea never crashes anything.",
    codeReference: [
      ["CUSTOM_ITEMS", "A list of dictionaries — add as many as you like, each describing one distinct custom item."],
      ["name", "The display name of this collectible."],
      ["color", "An (R, G, B) tuple, each 0-255, used when no image is set."],
      ["effect", 'A string describing what happens on pickup. "add_time" and "add_hint" are built in; any other string is a safe no-op until wired up in game.py.'],
      ["amount", "How much of the effect: extra seconds for add_time, extra hint uses for add_hint."],
    ],
    contextBefore: [],
    contextAfter: [
      "# =========================================================",
      "# Write your game's rules below (Bonus capstone - unlocks once every other",
      "# Bonus challenge is completed or skipped, since the rules only make sense",
    ],
    starter: [
      "CUSTOM_ITEMS = [",
      "    {",
      '        "name": "Custom Item",',
      '        "color": (180, 180, 180),',
      '        "effect": "add_time",',
      '        "amount": 0,',
      "    },",
      "]",
    ],
    hints: [
      '`CUSTOM_ITEMS` is a list of dictionaries, and you can add as many as you like. Each one needs a `name` (string), a `color` (a tuple of three 0-255 numbers), an `effect` (the string `"add_time"` or `"add_hint"`, or your own invented string), and an `amount` (a plain integer). Example:\n```\nCUSTOM_ITEMS = [\n    {"name": "Time Crystal", "color": (14, 165, 233), "effect": "add_time", "amount": 15},\n    {"name": "Hint Scroll", "color": (250, 204, 21), "effect": "add_hint", "amount": 1},\n]\n```',
    ],
    visualizer: "customItemLab",
    grading: {
      mode: "syntax",
      mustDefine: ["CUSTOM_ITEMS"],
      notes: "Open-ended: passes once the code runs with no Python error and CUSTOM_ITEMS is defined. Shape issues (not a list, missing keys, wrong types) surface as non-blocking warnings, not failures.",
    },
  },

  // ------------------------------------------------------------------ TODO 9
  {
    id: "9", step: 9, kind: "Bonus", required: false, file: "settings.py",
    title: "Write your game's rules.",
    lead: "Now that your game actually exists — your custom item(s), your map — write the rules that describe it. **`MISSION_RULES`** and **`HOW_TO_PLAY_RULES`** are lists of short strings shown on the mission and how-to-play screens. This step is locked until every other Bonus challenge is completed or skipped, on purpose: rules written before the game exists are usually wrong, so write these last.",
    codeReference: [
      ["MISSION_RULES", "A list of short strings describing the win condition(s), shown on the mission screen."],
      ["HOW_TO_PLAY_RULES", "A list of short strings explaining controls, shown on the how-to-play screen."],
    ],
    contextBefore: [],
    contextAfter: [],
    starter: [
      "MISSION_RULES = [",
      '    "Reach the goal before time runs out.",',
      "]",
      "HOW_TO_PLAY_RULES = [",
      '    "Reach the goal to clear each round.",',
      '    "Move with the Arrow Keys or WASD.",',
      '    "Bombs send you back to the start - avoid them.",',
      '    "Collect items for a helpful bonus effect.",',
      "]",
    ],
    hints: [
      "`MISSION_RULES` and `HOW_TO_PLAY_RULES` are both lists of strings (every item needs its own quotes and comma) — describe the game you actually built: mention your custom item(s) by name and what they do, rather than leaving the generic example text in place.",
    ],
    visualizer: "titleCard",
    grading: {
      mode: "syntax",
      mustDefine: ["MISSION_RULES", "HOW_TO_PLAY_RULES"],
      notes: "Open-ended: passes once the code runs with no Python error and both names are defined as non-empty lists. This step is additionally gated by the capstone lock (see CAPSTONE_BONUS_ID) regardless of grading result.",
    },
  },
];

// Expose on window for app.js (no ES module system, plain scripts).
window.COURSE_DATA = {
  REQUIRED_ORDER,
  BONUS_ORDER,
  CAPSTONE_BONUS_ID,
  KNOWN_ASSET_FILES,
  COURSE_STEPS,
};
