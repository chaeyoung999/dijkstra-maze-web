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
 * TODO ids are plain sequential integers 1..15, no gaps, no hyphenated
 * sub-ids (a prior scheme like "2-1"/"2-2" was dropped after removing steps
 * left visible gaps in the numbering — see TEACHER_TODO_GUIDE.md).
 */
"use strict";

/** Required TODOs, in the order students must complete (or skip) them. */
const REQUIRED_ORDER = ["1", "2", "3", "4", "5", "6", "7"];

/**
 * Bonus TODOs. These all unlock together once Required is finished, any
 * order — EXCEPT "15" (write your game's rules), which is a capstone: it
 * stays locked until every OTHER Bonus id is completed or skipped, since
 * writing honest rules only makes sense once the student's own game
 * (items, terrain, monster, map) actually exists. See app.js computeStatus()
 * for the one-off exception this requires.
 */
const BONUS_ORDER = ["8", "9", "10", "11", "12", "13", "14", "15"];

/** The capstone id that stays locked until every other Bonus id is done. */
const CAPSTONE_BONUS_ID = "15";

/**
 * Files students already have in assets/images and assets/sounds (see
 * student/assets/). Used only to give a friendly warning (never a hard
 * failure) in TODO 9 if a path doesn't match a file we know about — students
 * may supply their own assets, which a later task will let them upload.
 */
const KNOWN_ASSET_FILES = {
  images: [
    "apple.png", "bomb.png", "bomb_2.png", "boy.png", "candy.png", "duck.png",
    "explode.png", "explode_2.png", "floor_tile_1.png", "floor_tile_2.png",
    "goal_chest.png", "goal_door.png", "goal_flag.png", "house.png",
    "item_coin.png", "item_gem_1.png", "item_gem_2.png", "item_star.png",
    "lion.png", "player_ninja.png", "player_robot.png", "terrain_ice.png",
    "terrain_lava.png", "terrain_mud.png", "terrain_swamp_1.png", "terrain_swamp_2.png",
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
    lead: "Every game needs an identity. Two variables in this file control what players see before they even move:\n\n- **`TITLE`** — shown in the window and on the title screen.\n- **`GAME_SUBTITLE`** — a one-line description shown under the title.\n\nYou've built a list of strings before — Game AI Lab's `behaviors = [\"PATROL\", \"CHASE\", \"ATTACK\"]` is the same idea, just describing ghost AI states instead of game text. This is a design task, not an algorithm: rewrite the text so it describes **your** game, not the example maze. There's no single correct answer. (Writing the game's actual *rules* is a separate Bonus step near the end — TODO 15 — once your game is finished.)",
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
      'GAME_SUBTITLE = "Collect treasures, avoid hazards, and reach the goal"',
    ],
    hints: [
      "`TITLE` and `GAME_SUBTITLE` are both single strings (not lists like `MISSION_RULES` later on) — you're editing two existing lines, not adding new variables. Keep the variable names and quotes exactly as they are, and just change the text inside the quotes: `TITLE = \"your title\"` / `GAME_SUBTITLE = \"your one-line description\"`.",
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
    lead: "Right now your maze ignores the keyboard entirely. Each frame, `update_player()` checks which arrow/WASD key is held down — the same `if`/`elif` dispatch pattern as Game AI Lab's ghost FSM, where a state string picked which method to call (`monster.patrol()`, `monster.chase()`, ...). Here, the key that's held down picks which direction to move. Inside that branch you need to:\n\n- call **`self.player.try_move(direction, self.maze)`** with the matching direction string, then\n- store the result in **`moved`**.\n\nBecause the branches use `if`/`elif` (not four separate `if`s), the player moves at most one cell per frame — even if two keys are pressed together.",
    codeReference: [
      ["self.player.try_move(direction, self.maze)", "Attempts to move the player one cell in direction. Returns True if the move succeeded, False if it was blocked."],
      ["moved", "A boolean you set to the result of try_move. The code right after your TODO reads it to decide whether to reset the movement timer."],
      ["pygame.K_LEFT / K_a, K_RIGHT / K_d, K_UP / K_w, K_DOWN / K_s", "The key constants for arrow keys and WASD. keys[...] is True while that key is held down."],
      ['"left" / "right" / "top" / "bottom"', 'The four direction strings try_move and the maze understand — note the vertical directions are "top"/"bottom", not "up"/"down".'],
    ],
    contextBefore: [],
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
      'All four branches call the same function, `self.player.try_move(direction, self.maze)`, and store what it returns in `moved` — only the direction string changes each time: "left", "right", "top", "bottom" (the vertical ones are "top"/"bottom", not "up"/"down"). Using `if`/`elif` (not four separate `if`s) matters too: it guarantees at most one branch runs per frame, even if two keys are held down together.',
      'moved = self.player.try_move("???", self.maze)  — this exact shape goes in every branch; just swap in the matching direction string each time.',
    ],
    visualizer: "playerMove",
    grading: {
      mode: "behaviour",
      harness: "movement_2",
      casesDescription: "For each of the four key constants, assert moved reflects try_move's return value and the correct direction string was passed. Also assert only one branch runs per call.",
    },
  },

  // ------------------------------------------------------------------ TODO 3
  {
    id: "3", step: 3, kind: "Required", required: true, file: "player.py",
    title: "Stop movement when there is no cell or a wall blocks the direction.",
    lead: "`try_move` first looks up the cell the player is standing on, then must decide whether the move is even possible before touching any coordinates. Two things can block it:\n\n- there's no cell in that direction (**`current is None`**), or\n- a wall stands in the way (**`current.walls[direction]`** is `True`).\n\nJoin both checks with `or` and `return False` inside the `if`. This is a classic guard clause, the same shape as Game AI Lab's `get_tile_cost` (`if tile == WALL: return None`): handle the bad cases first and bail out early, so the rest of the function can assume the move is legal.",
    codeReference: [
      ["current", "The Cell the player currently stands on, looked up just above. May be None if there is no cell there."],
      ["current.walls[direction]", "True when a wall blocks movement in direction from the current cell."],
      ["return False", "Signals to the caller that the move did not happen; the rest of try_move must not run."],
    ],
    contextBefore: [
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
      "This is a guard clause: handle the bad cases first and bail out immediately, so the rest of `try_move` can assume the move is legal. Two independent things can block it — no cell in that direction (`current is None`) or a wall in the way (`current.walls[direction]`) — so join them with `or` (either one alone is enough to block the move) inside a single `if`. Use `is None` rather than `== None`, the normal Python way to check for None.",
      "if current is None or current.walls[???]:  →  return False on the next line, indented once more. One `if` line with both conditions together — don't split this into two separate `if` statements.",
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
    lead: "Once `try_move` knows the move is legal, **`dr`** and **`dc`** already tell it how far to shift on each axis — the same delta idea as Game AI Lab's `directions = [(-1,0), (1,0), (0,-1), (0,1)]` and `get_distance()`. Apply that shift to the player's own position — add `dr` to **`self.row`** and `dc` to **`self.col`**, using the `+=` compound-assignment operator.",
    codeReference: [
      ["dr, dc", "The row and column change for the chosen direction, already looked up on the line above."],
      ["self.row, self.col", "The player's current grid position; update both in place."],
      ["+=", "Compound assignment: x += y means x = x + y, updating the variable in place."],
    ],
    contextBefore: [
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
      "`dr` and `dc` are already computed above — add each to the matching part of the player's own position with `+=` (not `=`, which would replace the position instead of shifting it): `self.row` takes `dr`, `self.col` takes `dc`, on two separate lines. self.row += ???   and on the next line   self.col += ???",
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
    lead: "Dijkstra's relaxation step is really two separate ideas glued together: computing a candidate cost, then deciding whether to actually keep it. Each part below gets its own short explanation, split the same way TODO 9 splits into Part 1/2 and Part 2/2.",
    codeReference: [
      ["cost", "The total cost already spent reaching current, popped from the priority queue."],
      ["step_cost", "The (already positive, already offset) cost of the one edge from current to this neighbor."],
      ["new_cost", "The candidate total cost of reaching neighbor through current — computed in Part 1, used in Part 2."],
      ["distance[neighbor], parent[neighbor]", "The best known cost to reach neighbor, and the cell it should be reached from on that route — update both together, only on improvement (Part 2)."],
    ],
    parts: [
      {
        part: "1/2", title: "Calculate the candidate cost to reach this neighbor.",
        lead: "You already did this exact arithmetic for the ghost AI in Game AI Lab, mission 8 — their worked example was literally `new_cost = 3 + 2`. Add the cost already spent reaching the current cell (**`cost`**) to the cost of this one extra step (**`step_cost`**), and store that sum in **`new_cost`**. That's the whole idea for this part — one line, same formula, different graph.",
        contextBefore: [
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
        lead: "Not every candidate cost is worth keeping. Only update the route if **`new_cost`** is actually better than anything found before — either **`neighbor`** hasn't been seen yet, or `new_cost` beats the recorded **`distance[neighbor]`**.\n\nWhen it *is* an improvement: **`distance[neighbor]`** and **`parent[neighbor]`** update together (the best cost and the route both changed), and the improved route gets pushed onto the queue so the search actually explores it — skip that push and the better route is discovered but never followed.",
        contextBefore: [
          "            new_cost = 0  # Write your code here.",
        ],
        contextAfter: [],
        starter: [
          "            pass  # Write your code here.",
        ],
      },
    ],
    hints: [
      "**Fun fact:** this one function does triple duty in the finished game — it decides where swamps go while the maze is generated, powers the player's Hint button, and (if you build the Bonus monster) drives its chase behaviour. Called with no weights at all, every step costs the same — and Dijkstra with uniform costs *is* breadth-first search, so the exact code you write across both parts here quietly doubles as a BFS too.",
      "Part 1: `new_cost = ??? + ???`\nPart 2: `if neighbor not in distance or new_cost < distance[neighbor]:` / `    distance[neighbor] = ???` / `    parent[neighbor] = ???` / `    heapq.heappush(queue, (???, neighbor))`",
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
    id: "6", step: 6, kind: "Required", required: true, file: "game.py",
    title: "Add the normal treasure score.",
    lead: "Every normal treasure the player collects should nudge the score upward by a fixed amount, stored in the constant **`ITEM_SCORE`**. Add it to **`self.score`** with `+=` — reach for the named constant, never a bare number, so the rule stays easy to tune later.",
    codeReference: [
      ["self.score", "The player's running score for the current round."],
      ["ITEM_SCORE", "A constant from settings.py: the points awarded for one normal treasure."],
      ["+=", "Adds to self.score in place."],
    ],
    contextBefore: [
      "                else:",
    ],
    contextAfter: [
      "                    if self.item_sound:",
      "                        self.item_sound.play()",
      "    def check_bombs(self):",
    ],
    starter: [
      "                    pass  # Write your code here.",
    ],
    hints: [
      "`ITEM_SCORE` is a named constant already defined in `settings.py` (not a number you type here) — using the name instead of a bare `100` means the game's balance can be retuned in one place later. Add it to `self.score` in place: self.score += ???",
    ],
    visualizer: "scoreBoard",
    grading: {
      mode: "behaviour",
      harness: "score_6",
      casesDescription: "score starts at 0; collect n treasures; assert score == n * ITEM_SCORE.",
    },
  },

  // ------------------------------------------------------------------ TODO 7
  {
    id: "7", step: 7, kind: "Required", required: true, file: "game.py",
    title: "Subtract the swamp penalty from the score.",
    lead: "Stepping into a swamp costs the player points. **`SWAMP_SCORE_PENALTY`** already holds that cost as a positive number, so subtract it from **`self.score`** with `-=` — no need to negate it yourself.",
    codeReference: [
      ["self.score", "The player's running score for the current round."],
      ["SWAMP_SCORE_PENALTY", "A constant from settings.py: a positive number representing the amount to lose."],
      ["-=", "Subtracts from self.score in place."],
    ],
    contextBefore: [
      '        self.maze.get_cell(*position).terrain = "NORMAL"',
    ],
    contextAfter: [
      "        if self.swamp_sound:",
      "            self.swamp_sound.play()",
    ],
    starter: [
      "        pass  # Write your code here.",
    ],
    hints: [
      "Same idea as TODO 6, just the opposite direction: `SWAMP_SCORE_PENALTY` already holds the amount to lose as a positive number, so subtract it rather than adding a negative one. self.score -= ???",
    ],
    visualizer: "scoreBoard",
    grading: {
      mode: "behaviour",
      harness: "score_7",
      casesDescription: "score starts at a known value; step on n swamps; assert score == start - n * SWAMP_SCORE_PENALTY.",
    },
  },

  // ------------------------------------------------------------------ TODO 8
  {
    id: "8", step: 8, kind: "Bonus", required: false, file: "settings.py",
    title: "Redesign the three rounds.",
    lead: "**`ROUND_CONFIGS`** is the difficulty curve of your whole game: one dictionary per round, read in order as the player advances. You can change `rows`, `cols`, object counts, `extra_open_walls`, `monster_count`, and `time_limit_seconds` — bigger mazes and stricter timers raise the difficulty.\n\nEvery key already means something to the engine, so keep all three dictionaries, keep every key, and keep every value an integer — only change the numbers.\n\nPrefer not to hand-edit the numbers? The map editor on the right lets you hand-paint a layout the same way you built Game AI Lab's N×N matrix map (with 0/1/\"P\"/\"G1\"/\"G2\" markers) — just for a maze instead of a ghost-chase board, now including exactly where the player starts, the goal, and (if you're doing the monster Bonus) where the monster(s) start.",
    codeReference: [
      ["ROUND_CONFIGS", "A list of exactly 3 dictionaries, one per round, read in order as the player clears rounds."],
      ["rows, cols, cell_size", "Grid dimensions and pixel size of one cell; bigger rows/cols means a bigger maze."],
      ["extra_open_walls", "Extra connections punched into the perfect maze so it has loops, not just one solution path."],
      ["item_count, swamp_count, bomb_count, custom_item_count, custom_terrain_count, monster_count", "How many of each object are placed on the map."],
      ["time_limit_seconds", "How long the player has to finish the round."],
    ],
    contextBefore: [],
    contextAfter: [
      "# Use the built-in shape when an image path is None.",
      "# TODO 9 [Bonus] (Part 1/2): Replace the player, goal, terrain, item, or bomb images.",
      "# Detailed hint:",
    ],
    starter: [
      "ROUND_CONFIGS = [",
      "    {",
      '        "rows": 11,',
      '        "cols": 15,',
      '        "cell_size": 38,',
      '        "extra_open_walls": 5,',
      '        "item_count": 8,',
      '        "swamp_count": 3,',
      '        "bomb_count": 2,',
      '        "custom_item_count": 2,',
      '        "custom_terrain_count": 2,',
      '        "monster_count": 1,',
      '        "time_limit_seconds": 70,',
      "    },",
      "    {",
      '        "rows": 15,',
      '        "cols": 21,',
      '        "cell_size": 30,',
      '        "extra_open_walls": 6,',
      '        "item_count": 10,',
      '        "swamp_count": 5,',
      '        "bomb_count": 4,',
      '        "custom_item_count": 3,',
      '        "custom_terrain_count": 3,',
      '        "monster_count": 1,',
      '        "time_limit_seconds": 55,',
      "    },",
      "    {",
      '        "rows": 17,',
      '        "cols": 25,',
      '        "cell_size": 25,',
      '        "extra_open_walls": 8,',
      '        "item_count": 12,',
      '        "swamp_count": 7,',
      '        "bomb_count": 6,',
      '        "custom_item_count": 4,',
      '        "custom_terrain_count": 4,',
      '        "monster_count": 2,',
      '        "time_limit_seconds": 45,',
      "    },",
      "]",
    ],
    hints: [
      "Three dictionaries in a list, one per round. Every key already means something to the engine (deleting one will crash the game), so only change the numeric values, and keep them plain integers — a fractional value like 11.5 rows doesn't make sense to the maze generator.",
      "Don't want to hand-edit the numbers? Use the map editor panel on the right: pick your rows and cols, paint the terrain (plus the player/goal/monster start tiles), then press Apply to write these numbers into the code for you automatically.",
    ],
    visualizer: "mapEditor",
    grading: {
      mode: "syntax",
      mustDefine: ["ROUND_CONFIGS"],
      notes: "Open-ended: passes once the code runs with no Python error and ROUND_CONFIGS is defined. Shape issues (wrong count, missing keys, non-int values) surface as non-blocking warnings, not failures.",
    },
  },

  // ------------------------------------------------------------------ TODO 9
  {
    id: "9", step: 9, kind: "Bonus", required: false, file: "settings.py",
    title: "Replace the player, goal, terrain, item, bomb, monster images, and add sounds.",
    lead: "Two settings blocks decide what the player sees and hears: image paths for the player, goal, terrain, items and monster, then sound paths for pickups, hazards, and background music.\n\nEvery value is either **`None`** (use the game's built-in shape/silence) or a quoted path to a file already provided in `assets/images/` or `assets/sounds/` — there's no third option, and you can change as many or as few lines as you like.",
    codeReference: [
      ["PLAYER_IMAGE_PATH / GOAL_IMAGE_PATH / SWAMP_IMAGE_PATH / ITEM_IMAGE_PATH / BOMB_IMAGE_PATH / FLOOR_TILE_IMAGE_PATH", "Each is either None (use the built-in drawn shape) or a quoted path to a file under assets/images/."],
      ["SWAMP_SOUND_PATH / ITEM_SOUND_PATH / BOMB_SOUND_PATH / BACKGROUND_MUSIC_PATH", "Each is either None (silent) or a quoted path to a file under assets/sounds/."],
    ],
    parts: [
      {
        part: "1/2", title: "Replace the player, goal, terrain, item, bomb, or monster images.",
        contextBefore: [],
        contextAfter: [
          'BOMB_EXPLOSION_IMAGE_PATH = "assets/images/explode_2.png"  # also try explode.png',
          "BOMB_EXPLOSION_DURATION_MS = 500",
        ],
        starter: [
          'PLAYER_IMAGE_PATH = None  # Example: "assets/images/boy.png" (also try lion.png, duck.png, player_ninja.png, player_robot.png)',
          'GOAL_IMAGE_PATH = None  # Example: "assets/images/house.png" (also try goal_flag.png, goal_door.png, goal_chest.png)',
          'SWAMP_IMAGE_PATH = None  # Example: "assets/images/terrain_swamp_1.png" (also try terrain_swamp_2.png, terrain_ice.png, terrain_lava.png, terrain_mud.png)',
          'ITEM_IMAGE_PATH = None  # Example: "assets/images/apple.png" (also try candy.png, item_gem_1.png, item_gem_2.png, item_coin.png, item_star.png)',
          'BOMB_IMAGE_PATH = None  # Example: "assets/images/bomb.png" (also try bomb_2.png)',
          'FLOOR_TILE_IMAGE_PATH = None  # Background floor for open path cells. Example: "assets/images/floor_tile_1.png" (also try floor_tile_2.png)',
          'MONSTER_IMAGE_PATH = None  # Example: "assets/images/lion.png" - None uses a built-in drawn shape.',
        ],
      },
      {
        part: "2/2", title: "Add background music and sound effects.",
        contextBefore: [],
        contextAfter: [
          "BACKGROUND_MUSIC_VOLUME = 0.25",
          "CUSTOM_ITEM_IMAGE_PATH = \"assets/images/item_star.png\"  # used for every entry in CUSTOM_ITEMS below",
          "CUSTOM_ITEM_SOUND_PATH = None",
        ],
        starter: [
          'SWAMP_SOUND_PATH = None  # Example: "assets/sounds/squish_1.wav" (also try squish_2.wav)',
          'ITEM_SOUND_PATH = None  # Example: "assets/sounds/pickup_1.wav" (also try pickup_2.wav)',
          'BOMB_SOUND_PATH = None  # Example: "assets/sounds/explosion_1.wav" (also try explosion_2.wav)',
          'BACKGROUND_MUSIC_PATH = None  # Example: "assets/sounds/bgm_1.wav" (also try bgm_2.wav)',
        ],
      },
    ],
    hints: [
      "Every value here is either `None` (silent / built-in shape) or a quoted path under `assets/images/` or `assets/sounds/` — forgetting the quotes is the most common mistake when typing paths by hand. The asset picker panel on the right fills in the correct line for you with one click, so you don't have to type paths at all if you'd rather not.",
    ],
    visualizer: "assetPicker",
    grading: {
      mode: "syntax",
      mustDefine: [
        "PLAYER_IMAGE_PATH", "GOAL_IMAGE_PATH", "SWAMP_IMAGE_PATH", "ITEM_IMAGE_PATH",
        "BOMB_IMAGE_PATH", "FLOOR_TILE_IMAGE_PATH", "MONSTER_IMAGE_PATH",
        "SWAMP_SOUND_PATH", "ITEM_SOUND_PATH", "BOMB_SOUND_PATH", "BACKGROUND_MUSIC_PATH",
      ],
      notes: "Open-ended: passes once the code runs with no Python error and all eleven names are defined. Path/type issues surface as non-blocking warnings, not failures.",
      twoParts: true,
    },
  },

  // ----------------------------------------------------------------- TODO 10
  {
    id: "10", step: 10, kind: "Bonus", required: false, file: "settings.py",
    title: "Customize your collectible item(s).",
    lead: "This is where your game gets its own signature collectibles. **`CUSTOM_ITEMS`** is a list — add as many dictionaries as you like, each with its own:\n\n- **`name`** — the display name.\n- **`color`** — an RGB tuple, used when no image is set.\n- **`score`** — points added when collected.\n- **`hint_bonus`** — extra hint uses granted.\n- **`route_weight`** — a very negative value makes Dijkstra actively seek that item out.\n\nEvery round spawns several custom items total, each randomly drawn from this list — so two or three genuinely different items can appear side by side, each with its own personality.",
    codeReference: [
      ["CUSTOM_ITEMS", "A list of dictionaries — add as many as you like, each describing one distinct custom item."],
      ["name", "The display name of this collectible."],
      ["color", "An (R, G, B) tuple, each 0-255, used when no image is set."],
      ["score", "Points added to the score when collected; can be negative to make it a trap."],
      ["hint_bonus", "Extra path-hint uses granted when collected."],
      ["route_weight", "The weight Dijkstra uses for this item; smaller (more negative) values make the optimal route prefer it."],
    ],
    contextBefore: [],
    contextAfter: [
      "# =========================================================",
      "# Customize the extra terrain below.",
      "# =========================================================",
    ],
    starter: [
      "CUSTOM_ITEMS = [",
      "    {",
      '        "name": "Custom Item",',
      '        "color": (180, 180, 180),',
      '        "score": 0,',
      '        "hint_bonus": 0,',
      '        "route_weight": 0,',
      "    },",
      "]",
    ],
    hints: [
      "`CUSTOM_ITEMS` is a list of dictionaries, and you can add as many as you like. Each one needs a `name` (string), a `color` (a tuple of three 0-255 numbers), and `score`/`hint_bonus`/`route_weight` (plain integers) — a negative score makes that item a trap, and a more negative `route_weight` makes Dijkstra actively route the hint path toward it (the opposite of a wall, which repels).",
      'CUSTOM_ITEMS = [\n    {"name": "Magic Key", "color": (255, 215, 0), "score": 50, "hint_bonus": 1, "route_weight": -180},\n    {"name": "Lucky Coin", "color": (250, 204, 21), "score": 20, "hint_bonus": 0, "route_weight": -40},\n]',
    ],
    visualizer: "scoreBoard",
    grading: {
      mode: "syntax",
      mustDefine: ["CUSTOM_ITEMS"],
      notes: "Open-ended: passes once the code runs with no Python error and CUSTOM_ITEMS is defined. Shape issues (not a list, missing keys, wrong types) surface as non-blocking warnings, not failures.",
    },
  },

  // ----------------------------------------------------------------- TODO 11
  {
    id: "11", step: 11, kind: "Bonus", required: false, file: "settings.py",
    title: "Customize the extra terrain.",
    lead: "Symmetrically to TODO 10, this terrain type is entirely defined by five constants:\n\n- **`CUSTOM_TERRAIN_NAME`** — the display name.\n- **`CUSTOM_TERRAIN_COLOR`** — an RGB tuple, used when no image is set.\n- **`CUSTOM_TERRAIN_SCORE_CHANGE`** — the score change stepping on it causes (positive or negative).\n- **`CUSTOM_TERRAIN_ROUTE_WEIGHT`** — the weight Dijkstra uses for this terrain.\n- **`CUSTOM_TERRAIN_DISAPPEARS`** — whether it reverts to normal after one use.\n\nTogether they let you invent a hazard or shortcut that's entirely your own.",
    codeReference: [
      ["CUSTOM_TERRAIN_NAME", "The display name of your terrain."],
      ["CUSTOM_TERRAIN_COLOR", "An (R, G, B) tuple, each 0-255, used when no image is set."],
      ["CUSTOM_TERRAIN_SCORE_CHANGE", "Score change (positive or negative) applied when the player steps on it."],
      ["CUSTOM_TERRAIN_ROUTE_WEIGHT", "The weight Dijkstra uses for this cell; larger values make the route avoid it."],
      ["CUSTOM_TERRAIN_DISAPPEARS", "True/False: whether this terrain reverts to normal after one use."],
    ],
    contextBefore: [],
    contextAfter: [
      "# =========================================================",
      "# Monster - a chasing enemy with a PATROL / CHASE / ATTACK state machine.",
      "# =========================================================",
    ],
    starter: [
      'CUSTOM_TERRAIN_NAME = "Custom Terrain"',
      "CUSTOM_TERRAIN_COLOR = (180, 180, 180)",
      "CUSTOM_TERRAIN_SCORE_CHANGE = 0",
      "CUSTOM_TERRAIN_ROUTE_WEIGHT = 0",
      "CUSTOM_TERRAIN_DISAPPEARS = False",
    ],
    hints: [
      "Symmetric to TODO 10, but as five separate constants instead of a list: `NAME` (string), `COLOR` (a tuple of three 0-255 numbers), `SCORE_CHANGE` (positive or negative, applied once when stepped on), `ROUTE_WEIGHT` (larger values make Dijkstra avoid this terrain — the opposite framing from TODO 10's item weight, but the same mechanism), and `DISAPPEARS` which must be exactly `True` or `False` (capital letter, no quotes — writing it as the string `\"True\"` is a common slip).",
      'CUSTOM_TERRAIN_NAME = "Ice"\nCUSTOM_TERRAIN_COLOR = (150, 220, 255)\nCUSTOM_TERRAIN_SCORE_CHANGE = -5\nCUSTOM_TERRAIN_ROUTE_WEIGHT = 120\nCUSTOM_TERRAIN_DISAPPEARS = False',
    ],
    visualizer: "scoreBoard",
    grading: {
      mode: "syntax",
      mustDefine: ["CUSTOM_TERRAIN_NAME", "CUSTOM_TERRAIN_COLOR", "CUSTOM_TERRAIN_SCORE_CHANGE", "CUSTOM_TERRAIN_ROUTE_WEIGHT", "CUSTOM_TERRAIN_DISAPPEARS"],
      notes: "Open-ended: passes once the code runs with no Python error and all five names are defined. Type/shape issues surface as non-blocking warnings, not failures.",
    },
  },

  // ----------------------------------------------------------------- TODO 12
  {
    id: "12", step: 12, kind: "Bonus", required: false, file: "settings.py",
    title: "Tune the monster's distances, speeds, and count.",
    lead: "The monster (TODO 13/14 below) needs a few numbers tuned before its behaviour makes sense.\n\n- **`MONSTER_ATTACK_DISTANCE`** and **`MONSTER_CHASE_DISTANCE`** are pixel distances — the same kind of threshold Game AI Lab's mission 3 used (check the more specific, closer range before the broader one), so `CHASE` must stay a bigger number than `ATTACK` or the monster will never notice you coming.\n- The **`MONSTER_SPEED_*`** constants are milliseconds between moves — smaller means faster, the same idea as `PLAYER_MOVE_DELAY_MS`.\n- **`MONSTER_COUNT`** is how many monsters spawn per round by default.",
    codeReference: [
      ["MONSTER_ATTACK_DISTANCE", "Pixel distance below which the monster switches to ATTACK."],
      ["MONSTER_CHASE_DISTANCE", "Pixel distance below which the monster switches to CHASE (must be greater than MONSTER_ATTACK_DISTANCE)."],
      ["MONSTER_SPEED_NORMAL / MONSTER_SPEED_SWAMP / MONSTER_SPEED_CUSTOM", "Milliseconds between monster moves on each terrain type — smaller is faster."],
      ["MONSTER_COUNT", "Default number of monsters per round, unless the map editor places a different number."],
    ],
    contextBefore: [],
    contextAfter: [
      "MONSTER_CATCH_SCORE_PENALTY = 50",
      "MONSTER_COLOR = (190, 30, 60)",
    ],
    starter: [
      "MONSTER_ATTACK_DISTANCE = 50",
      "MONSTER_CHASE_DISTANCE = 200",
      "MONSTER_SPEED_NORMAL = 350",
      "MONSTER_SPEED_SWAMP = 700",
      "MONSTER_SPEED_CUSTOM = 500",
      "MONSTER_COUNT = 1",
    ],
    hints: [
      "MONSTER_CHASE_DISTANCE must stay bigger than MONSTER_ATTACK_DISTANCE: the FSM you'll write in TODO 13 checks the ATTACK range first because it's the more specific (closer) case, so if CHASE were smaller or equal, the monster would never get a chance to notice you from farther away. All six values here are plain integers.",
      "MONSTER_SPEED_* are milliseconds of delay between moves, not a speed rate — so a SMALLER number means a FASTER monster (less waiting between steps), the same idea as PLAYER_MOVE_DELAY_MS. Example: MONSTER_ATTACK_DISTANCE = 40  /  MONSTER_CHASE_DISTANCE = 250  /  MONSTER_SPEED_NORMAL = 300 — keep the variable names, change the values.",
    ],
    visualizer: "monsterLab",
    grading: {
      mode: "syntax",
      mustDefine: ["MONSTER_ATTACK_DISTANCE", "MONSTER_CHASE_DISTANCE", "MONSTER_SPEED_NORMAL", "MONSTER_SPEED_SWAMP", "MONSTER_SPEED_CUSTOM", "MONSTER_COUNT"],
      notes: "Open-ended: passes once the code runs with no Python error and all six names are defined. Type/range issues (e.g. CHASE not greater than ATTACK) surface as non-blocking warnings, not failures.",
    },
  },

  // ----------------------------------------------------------------- TODO 13
  {
    id: "13", step: 13, kind: "Bonus", required: false, file: "monster.py",
    title: "Write the monster's PATROL / CHASE / ATTACK state dispatch.",
    lead: "This is the exact same shape as Game AI Lab missions 2+3 combined: an `if`/`elif`/`elif` chain that checks the MORE specific (closer) range **first**.\n\n`distance` is already computed for you:\n\n- under **`MONSTER_ATTACK_DISTANCE`** → `\"ATTACK\"`\n- otherwise under **`MONSTER_CHASE_DISTANCE`** → `\"CHASE\"`\n- otherwise → `\"PATROL\"`",
    codeReference: [
      ["distance", "The Manhattan pixel distance between the monster and the player, already computed above your TODO."],
      ["self.state", "One of \"ATTACK\", \"CHASE\", or \"PATROL\" — read by update() right after this to decide what the monster does next."],
      ["MONSTER_ATTACK_DISTANCE, MONSTER_CHASE_DISTANCE", "The two thresholds from TODO 12, imported at the top of this file."],
    ],
    contextBefore: [
      "        distance = get_distance(self.pixel_position(), player_pixel_position)",
    ],
    contextAfter: [],
    starter: [
      "        pass  # Write your code here.",
    ],
    hints: [
      "Check the more specific (closer) range FIRST, exactly like Game AI Lab mission 3: `if distance < MONSTER_ATTACK_DISTANCE`, `elif distance < MONSTER_CHASE_DISTANCE`, `else`. If CHASE were checked first, a monster close enough to ATTACK would incorrectly get caught by the broader CHASE branch instead. The three strings assigned to `self.state` must be exactly \"ATTACK\", \"CHASE\", \"PATROL\" (all capitals), since `update()` compares against these exact strings afterward.",
      'if distance < MONSTER_ATTACK_DISTANCE:\n    self.state = "???"\nelif distance < MONSTER_CHASE_DISTANCE:\n    self.state = "???"\nelse:\n    self.state = "???"',
    ],
    visualizer: "monsterLab",
    grading: {
      mode: "behaviour",
      harness: "monsterFsm_13",
      casesDescription: "Distances well inside/at the edges of each band; asserts self.state ends up exactly \"ATTACK\"/\"CHASE\"/\"PATROL\" per Game AI Lab's closer-range-first ordering.",
    },
  },

  // ----------------------------------------------------------------- TODO 14
  {
    id: "14", step: 14, kind: "Bonus", required: false, file: "monster.py",
    title: "Move the monster one tile toward the player while chasing.",
    lead: "Same pattern as Game AI Lab missions 10/11: recalculate the path every move, check its length, then move one step.\n\nCall **`find_path_dijkstra`** — the exact function you wrote in Required TODO 5 — with the maze, the monster's position, and the player's position. Then move the monster to **`path[1]`** (the cell right after where it currently is) whenever `len(path) > 1`.",
    codeReference: [
      ["find_path_dijkstra(maze, start, end)", "The Required TODO 5 function — reused here unchanged, called fresh every move so the monster always has an up-to-date route."],
      ["path[1]", "The first step away from the monster's current cell; path[0] is always the monster's own current position."],
      ["len(path) > 1", "Guards against an empty or single-cell path (e.g. no route exists yet) before indexing into it."],
    ],
    contextBefore: [],
    contextAfter: [],
    starter: [
      "        pass  # Write your code here.",
    ],
    hints: [
      "Same pattern as Game AI Lab missions 10/11: recompute the path fresh on every move (never reuse an old one, since the player keeps moving), using `find_path_dijkstra` — the exact function you wrote for Required TODO 5 — called with the maze, the monster's own position, and the player's position. `path[0]` is always the monster's own current cell, so the next step toward the player is `path[1]` — but only move if the path actually has more than one cell, otherwise indexing into `path[1]` would crash (no route found yet, or already adjacent).",
      "path = find_path_dijkstra(???, ???, ???)\nif len(path) > ???:\n    self.row, self.col = path[???]",
    ],
    visualizer: "monsterLab",
    grading: {
      mode: "behaviour",
      harness: "monsterChase_14",
      casesDescription: "A small weighted grid; asserts the monster moves exactly one tile per call, strictly closer to the player each time, along a real open path.",
    },
  },

  // ----------------------------------------------------------------- TODO 15
  {
    id: "15", step: 15, kind: "Bonus", required: false, file: "settings.py",
    title: "Write your game's rules.",
    lead: "Now that your game actually exists — your items, your terrain, your monster, your map — write the rules that describe it. **`MISSION_RULES`** and **`HOW_TO_PLAY_RULES`** are lists of short strings shown on the mission and how-to-play screens. This step is locked until every other Bonus challenge is completed or skipped, on purpose: rules written before the game exists are usually wrong, so write these last.",
    codeReference: [
      ["MISSION_RULES", "A list of short strings describing the win condition(s), shown on the mission screen."],
      ["HOW_TO_PLAY_RULES", "A list of short strings explaining controls and scoring, shown on the how-to-play screen."],
    ],
    contextBefore: [],
    contextAfter: [],
    starter: [
      "MISSION_RULES = [",
      '    "Reach the goal before time runs out.",',
      '    "Your final score must be above 0.",',
      "]",
      "HOW_TO_PLAY_RULES = [",
      '    "Reach the goal to clear each round.",',
      '    "Move with the Arrow Keys or WASD.",',
      '    "Terrain and items can change your score.",',
      '    "Avoid the monster - it will send you back to the start.",',
      '    "Finish each round with a score above 0.",',
      "]",
    ],
    hints: [
      "`MISSION_RULES` and `HOW_TO_PLAY_RULES` are both lists of strings (every item needs its own quotes and comma) — describe the game you actually built: mention your custom item(s) by name, your custom terrain, and the monster if you built it, rather than leaving the generic example text in place.",
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
