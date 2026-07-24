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
 */
"use strict";

/** Required TODOs, in the order students must complete (or skip) them. */
const REQUIRED_ORDER = ["1", "2-1", "2-2", "2-3", "4", "5-1", "5-2"];

/** Bonus TODOs. These all unlock together once Required is finished, any order. */
const BONUS_ORDER = ["6-1", "6-2", "7", "8", "9", "10"];

/**
 * Files students already have in assets/images and assets/sounds (see
 * student/assets/). Used only to give a friendly warning (never a hard
 * failure) in TODO 8 if a path doesn't match a file we know about — students
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
  // ---------------------------------------------------------------- TODO 1
  {
    id: "1", step: 1, kind: "Required", required: true, file: "settings.py",
    title: "Rewrite the game title and rules to match your game.",
    lead: "Every game needs an identity. Four variables in this file control what players see before they even move:\n\n- **`TITLE`** and **`GAME_SUBTITLE`** — single strings shown in the window and on the title screen.\n- **`MISSION_RULES`** and **`HOW_TO_PLAY_RULES`** — lists of strings shown on the mission and how-to-play screens.\n\nYou've built a list of strings like this before — Game AI Lab's `behaviors = [\"PATROL\", \"CHASE\", \"ATTACK\"]` is the same shape, just describing ghost AI states instead of game text. This is a design task, not an algorithm: rewrite the text so it describes **your** game, not the example maze. There's no single correct answer — just valid Python that keeps the same shape.",
    codeReference: [
      ["TITLE", "The string shown in the window title bar and on the title screen."],
      ["GAME_SUBTITLE", "A one-line description shown under the title."],
      ["MISSION_RULES", "A list of short strings describing the win condition(s), shown on the mission screen."],
      ["HOW_TO_PLAY_RULES", "A list of short strings explaining controls and scoring, shown on the how-to-play screen."],
    ],
    contextBefore: [],
    contextAfter: [
      "MAZE_OFFSET_X = 32",
      "MAZE_OFFSET_Y = 126",
    ],
    starter: [
      'TITLE = "Maze Runner"  # Modify this title to match your game.',
      'GAME_SUBTITLE = "Collect treasures, avoid hazards, and reach the goal"',
      "MISSION_RULES = [",
      '    "Reach the goal before time runs out.",',
      '    "Your final score must be above 0.",',
      "]",
      "HOW_TO_PLAY_RULES = [",
      '    "Reach the goal to clear each round.",',
      '    "Move with the Arrow Keys or WASD.",',
      '    "Terrain and items can change your score.",',
      '    "Finish each round with a score above 0.",',
      "]",
    ],
    hints: [
      "You're editing four existing lines — don't add new variables or remove the brackets/quotes already there. Start with `TITLE` and `GAME_SUBTITLE`, then edit the two rule lists.",
      "`TITLE` and `GAME_SUBTITLE` are single strings. `MISSION_RULES` and `HOW_TO_PLAY_RULES` are lists of strings — give each item its own quotes and comma.",
      'TITLE = "your title"   /   MISSION_RULES = ["rule one.", "rule two."] — keep the variable names exactly as they are, change only the text inside the quotes.',
    ],
    visualizer: "titleCard",
    grading: {
      mode: "syntax",
      mustDefine: ["TITLE", "GAME_SUBTITLE", "MISSION_RULES", "HOW_TO_PLAY_RULES"],
      notes: "Open-ended: passes once the code runs with no Python error and all four names are defined. Type/shape issues surface as non-blocking warnings, not failures.",
    },
  },

  // -------------------------------------------------------------- TODO 2-1
  {
    id: "2-1", step: 2, kind: "Required", required: true, file: "game.py",
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
      'The line is nearly identical in all four branches — only the direction string changes: "left", "right", "top", "bottom". Replace each `pass` with one assignment.',
      'Assign the result of the `try_move` call to `moved`. The direction string must exactly match the branch you\'re in — note the vertical directions are "top"/"bottom", not "up"/"down".',
      'moved = self.player.try_move("left", self.maze)  — this exact shape goes in the first branch. Repeat it in the other three with the matching direction string.',
    ],
    visualizer: "playerMove",
    grading: {
      mode: "behaviour",
      harness: "playerMove_2_1",
      casesDescription: "For each of the four key constants, assert moved reflects try_move's return value and the correct direction string was passed. Also assert only one branch runs per call.",
    },
  },

  // -------------------------------------------------------------- TODO 2-2
  {
    id: "2-2", step: 3, kind: "Required", required: true, file: "player.py",
    title: "Stop movement when there is no cell or a wall blocks the direction.",
    lead: "`try_move` first looks up the cell the player is standing on, then must decide whether the move is even possible before touching any coordinates. Two things can block it: there's no cell in that direction (**`current is None`**), or a wall stands in the way (**`current.walls[direction]`** is `True`). Join both checks with `or` and `return False` inside the `if` — this is a classic guard clause, the same shape as Game AI Lab's `get_tile_cost` (`if tile == WALL: return None`): handle the bad cases first and bail out early, so the rest of the function can assume the move is legal.",
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
      "Write one `if` line with both conditions joined by `or`, and a `return False` indented under it. Use `is None` for the first check, not `== None`.",
      "The `if` line goes above the `dr, dc = {...}` line shown below. Both conditions live on that same line — don't split them into two separate `if` statements.",
      "if current is None or current.walls[???]:  →  return False on the next line, indented once more.",
    ],
    visualizer: "playerMove",
    grading: {
      mode: "behaviour",
      harness: "playerMove_2_2",
      casesDescription: "current=None -> returns False; a wall present in direction -> returns False; an open direction -> does not return early.",
    },
  },

  // -------------------------------------------------------------- TODO 2-3
  {
    id: "2-3", step: 4, kind: "Required", required: true, file: "player.py",
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
      "Two separate lines: one updates the row, one updates the column. Both use `+=`.",
      "`self.row` takes `dr`; `self.col` takes `dc` — don't mix them up, and don't reassign the whole position at once.",
      "self.row += ???   and on the next line   self.col += ???",
    ],
    visualizer: "playerMove",
    grading: {
      mode: "behaviour",
      harness: "playerMove_2_3",
      casesDescription: "All four directions from a mid-grid cell; assert the final (row, col) matches applying dr/dc to the starting position.",
    },
  },

  // ----------------------------------------------------------------- TODO 4
  {
    id: "4", step: 5, kind: "Required", required: true, file: "pathfinding.py",
    title: "Record where this neighbor came from.",
    lead: "Breadth-first search discovers the maze one ring of cells at a time, but discovering a cell isn't the same as remembering how you got there. **`parent`** is a dictionary that maps every newly-found **`neighbor`** to the **`current`** cell it was reached from, in one line. It's the same dictionary-assignment technique as Game AI Lab's `distance[node] = new_cost`, but recording where you came from instead of a cost, so you can trace the path back later — similar to how `find_path()` gave you a path list to read with `path[1]`. That breadcrumb trail is exactly what `reconstruct_path` will follow backwards from the goal to the start.",
    codeReference: [
      ["parent", "A dictionary mapping every discovered cell to the cell it was reached from. reconstruct_path (given code) walks it backwards from the goal."],
      ["neighbor", "The newly-discovered cell — the dictionary key."],
      ["current", "The cell neighbor was reached from — the dictionary value."],
    ],
    contextBefore: [],
    contextAfter: [
      "                queue.append(neighbor)  # Given: add the neighbor to the queue.",
      "    return reconstruct_path(parent, end)",
    ],
    starter: [
      "                pass  # Write your code here.",
    ],
    hints: [
      "One line. The dictionary is `parent` — the key goes in square brackets, the value goes after the `=`. Ask yourself: which cell did we arrive from?",
      "This goes right before the given `queue.append(neighbor)` line below — `neighbor` and `current` are both already in scope there.",
      "parent[???] = ???   — the key is the cell we just found, the value is the cell we came from.",
    ],
    visualizer: "bfsFlood",
    grading: {
      mode: "behaviour",
      harness: "bfsFlood_4",
      casesDescription: "Runs BFS on three fixed mazes; asserts the reconstructed path is a valid connected shortest path and its length matches the reference. Hard-capped at 5000 steps.",
    },
  },

  // -------------------------------------------------------------- TODO 5-1
  {
    id: "5-1", step: 6, kind: "Required", required: true, file: "game.py",
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
      "One line, using `+=`. Don't type a number — use the constant.",
      "The constant is defined in `settings.py` and already available here — you don't need to import or define anything new.",
      "self.score += ???",
    ],
    visualizer: "scoreBoard",
    grading: {
      mode: "behaviour",
      harness: "scoreBoard_5_1",
      casesDescription: "score starts at 0; collect n treasures; assert score == n * ITEM_SCORE.",
    },
  },

  // -------------------------------------------------------------- TODO 5-2
  {
    id: "5-2", step: 7, kind: "Required", required: true, file: "game.py",
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
      "One line, using `-=`. The constant already holds a positive amount, so subtract it rather than adding a negative one.",
      "Same pattern as TODO 5-1, just the opposite operator and the swamp constant instead of the item constant.",
      "self.score -= ???",
    ],
    visualizer: "scoreBoard",
    grading: {
      mode: "behaviour",
      harness: "scoreBoard_5_2",
      casesDescription: "score starts at a known value; step on n swamps; assert score == start - n * SWAMP_SCORE_PENALTY.",
    },
  },

  // -------------------------------------------------------------- TODO 6-1
  {
    id: "6-1", step: 8, kind: "Bonus", required: false, file: "pathfinding.py",
    title: "Calculate the cost to reach this neighbor.",
    lead: "You already did this exact calculation for the ghost AI in Game AI Lab, mission 8 — their worked example was literally `new_cost = 3 + 2`. This is Dijkstra's relaxation step, same formula and same variable name, just a different graph: to know whether a neighbour is worth visiting through the current cell, add the cost already spent reaching it (**`cost`**) to the cost of this one extra step (**`step_cost`**). Store that sum in **`new_cost`** — the comparison right below it, and TODO 6-2, both depend on that exact name.",
    codeReference: [
      ["cost", "The total cost already spent reaching current, popped from the priority queue."],
      ["step_cost", "The (already positive, already offset) cost of the one edge from current to this neighbor."],
      ["new_cost", "The name your line must create: the candidate total cost of reaching neighbor through current. TODO 6-2 depends on this exact name."],
    ],
    contextBefore: [],
    contextAfter: [
      "            if (",
      "                neighbor not in distance",
      "                or new_cost < distance[neighbor]",
    ],
    starter: [
      "            new_cost = 0  # Write your code here.",
    ],
    hints: [
      "Replace the placeholder `0` with a sum of two existing variables — total cost so far, plus the cost of one more step.",
      "Both `cost` and `step_cost` are already defined above this line — you're combining them, not computing either one from scratch.",
      "new_cost = ??? + ???",
    ],
    visualizer: "dijkstraFrontier",
    grading: {
      mode: "behaviour",
      harness: "dijkstraFrontier_6_1",
      casesDescription: "Weighted grid with a known optimum; assert new_cost == cost + step_cost at each relaxation and that the final path cost equals the reference.",
      requiredNames: ["new_cost"],
    },
  },

  // -------------------------------------------------------------- TODO 6-2
  {
    id: "6-2", step: 9, kind: "Bonus", required: false, file: "pathfinding.py",
    title: "Save the better distance and its parent.",
    lead: "Once **`new_cost`** turns out to be an improvement over anything seen before, two records need updating together: **`distance[neighbor]`** — the same `distance[node] = new_cost` assignment from Game AI Lab's mission 8, so future comparisons use the better number — and **`parent[neighbor]`**, so the final path can be reconstructed through **`current`**, the cell that produced this improvement.",
    codeReference: [
      ["distance[neighbor]", "The best known total cost to reach neighbor so far; update it when a cheaper route is found."],
      ["parent[neighbor]", "The cell neighbor should be reached from on the cheapest known route; keep this in sync with distance."],
      ["new_cost, current", "The values you just computed / already have, to store into the two dictionaries above."],
    ],
    contextBefore: [
      "            ):",
    ],
    contextAfter: [
      "                heapq.heappush(queue, (new_cost, neighbor))  # Given: push the improved route.",
      "    return reconstruct_path(parent, end)",
    ],
    starter: [
      "                pass  # Write your code here.",
    ],
    hints: [
      "Two lines, both dictionary assignments, both keyed by `neighbor` — one records the better cost, the other records how we got there.",
      "This goes right after the `if` condition above, before the given `heapq.heappush(...)` line below.",
      "distance[neighbor] = ???   then   parent[neighbor] = ???",
    ],
    visualizer: "dijkstraFrontier",
    grading: {
      mode: "behaviour",
      harness: "dijkstraFrontier_6_2",
      casesDescription: "Assert distance/parent are updated only on improvement, and that the final path is the minimum-weight path, including a negative-weight case.",
    },
  },

  // ------------------------------------------------------------------ TODO 7
  {
    id: "7", step: 10, kind: "Bonus", required: false, file: "settings.py",
    title: "Redesign the three rounds.",
    lead: "**`ROUND_CONFIGS`** is the difficulty curve of your whole game: one dictionary per round, read in order as the player advances. You can change `rows`, `cols`, object counts, `extra_open_walls`, and `time_limit_seconds` — bigger mazes and stricter timers raise the difficulty. Every key already means something to the engine, so keep all three dictionaries, keep every key, and keep every value an integer — only change the numbers. The map editor on the right lets you hand-paint a layout the same way you built Game AI Lab's N×N matrix map (with 0/1/\"P\"/\"G1\"/\"G2\" markers) — just for a maze instead of a ghost-chase board.",
    codeReference: [
      ["ROUND_CONFIGS", "A list of exactly 3 dictionaries, one per round, read in order as the player clears rounds."],
      ["rows, cols, cell_size", "Grid dimensions and pixel size of one cell; bigger rows/cols means a bigger maze."],
      ["extra_open_walls", "Extra connections punched into the perfect maze so it has loops, not just one solution path."],
      ["item_count, swamp_count, bomb_count, custom_item_count, custom_terrain_count", "How many of each object are placed on the map."],
      ["time_limit_seconds", "How long the player has to finish the round."],
    ],
    contextBefore: [],
    contextAfter: [
      "# Use the built-in shape when an image path is None.",
      "# TODO 8 [Bonus] (Part 1/2): Replace the player, goal, terrain, item, or bomb images.",
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
      '        "time_limit_seconds": 45,',
      "    },",
      "]",
    ],
    hints: [
      "Three dictionaries in a list, one per round. Deleting a key will crash the game, so change values only, and keep them plain integers.",
      "Prefer not to hand-edit the numbers? Use the map editor panel on the right instead — see the next hint.",
      "Use the map editor on the right: pick your rows and cols, paint the terrain, then press Apply to write the numbers into the code for you.",
    ],
    visualizer: "mapEditor",
    grading: {
      mode: "syntax",
      mustDefine: ["ROUND_CONFIGS"],
      notes: "Open-ended: passes once the code runs with no Python error and ROUND_CONFIGS is defined. Shape issues (wrong count, missing keys, non-int values) surface as non-blocking warnings, not failures.",
    },
  },

  // ------------------------------------------------------------------ TODO 8
  {
    id: "8", step: 11, kind: "Bonus", required: false, file: "settings.py",
    title: "Replace the player, goal, terrain, item, bomb images, and add sounds.",
    lead: "Two settings blocks decide what the player sees and hears: image paths for the player, goal, terrain and items, then sound paths for pickups, hazards, and background music. Every value is either **`None`** (use the game's built-in shape/silence) or a quoted path to a file already provided in `assets/images/` or `assets/sounds/` — there's no third option, and you can change as many or as few lines as you like.",
    codeReference: [
      ["PLAYER_IMAGE_PATH / GOAL_IMAGE_PATH / SWAMP_IMAGE_PATH / ITEM_IMAGE_PATH / BOMB_IMAGE_PATH / FLOOR_TILE_IMAGE_PATH", "Each is either None (use the built-in drawn shape) or a quoted path to a file under assets/images/."],
      ["SWAMP_SOUND_PATH / ITEM_SOUND_PATH / BOMB_SOUND_PATH / BACKGROUND_MUSIC_PATH", "Each is either None (silent) or a quoted path to a file under assets/sounds/."],
    ],
    parts: [
      {
        part: "1/2", title: "Replace the player, goal, terrain, item, or bomb images.",
        contextBefore: [],
        contextAfter: [
          'BOMB_EXPLOSION_IMAGE_PATH = None  # Example: "assets/images/explode.png" (also try explode_2.png)',
          "BOMB_EXPLOSION_DURATION_MS = 500",
          "# TODO 8 [Bonus] (Part 2/2): Add background music and sound effects.",
        ],
        starter: [
          'PLAYER_IMAGE_PATH = None  # Example: "assets/images/boy.png" (also try lion.png, duck.png, player_ninja.png, player_robot.png)',
          'GOAL_IMAGE_PATH = None  # Example: "assets/images/house.png" (also try goal_flag.png, goal_door.png, goal_chest.png)',
          'SWAMP_IMAGE_PATH = None  # Example: "assets/images/terrain_swamp_1.png" (also try terrain_swamp_2.png, terrain_ice.png, terrain_lava.png, terrain_mud.png)',
          'ITEM_IMAGE_PATH = None  # Example: "assets/images/apple.png" (also try candy.png, item_gem_1.png, item_gem_2.png, item_coin.png, item_star.png)',
          'BOMB_IMAGE_PATH = None  # Example: "assets/images/bomb.png" (also try bomb_2.png)',
          'FLOOR_TILE_IMAGE_PATH = None  # Background floor for open path cells. Example: "assets/images/floor_tile_1.png" (also try floor_tile_2.png)',
        ],
      },
      {
        part: "2/2", title: "Add background music and sound effects.",
        contextBefore: [],
        contextAfter: [
          "BACKGROUND_MUSIC_VOLUME = 0.25",
          "CUSTOM_ITEM_IMAGE_PATH = None",
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
      "Every value is either `None` or a quoted path — forgetting the quotes is the most common mistake here.",
      "Don't want to type paths by hand? Use the asset picker panel on the right — click a bundled image or sound and it fills in the line for you.",
      'PLAYER_IMAGE_PATH = "assets/images/boy.png"   — same pattern for every other line. Use the asset picker on the right to insert paths without typing them.',
    ],
    visualizer: "assetPicker",
    grading: {
      mode: "syntax",
      mustDefine: [
        "PLAYER_IMAGE_PATH", "GOAL_IMAGE_PATH", "SWAMP_IMAGE_PATH", "ITEM_IMAGE_PATH",
        "BOMB_IMAGE_PATH", "FLOOR_TILE_IMAGE_PATH",
        "SWAMP_SOUND_PATH", "ITEM_SOUND_PATH", "BOMB_SOUND_PATH", "BACKGROUND_MUSIC_PATH",
      ],
      notes: "Open-ended: passes once the code runs with no Python error and all ten names are defined. Path/type issues surface as non-blocking warnings, not failures.",
      twoParts: true,
    },
  },

  // ------------------------------------------------------------------ TODO 9
  {
    id: "9", step: 12, kind: "Bonus", required: false, file: "settings.py",
    title: "Customize the extra collectible item.",
    lead: "This is where your game gets its own signature collectible. Five constants describe it completely: **`CUSTOM_ITEM_NAME`**, an RGB **`CUSTOM_ITEM_COLOR`**, the **`CUSTOM_ITEM_SCORE`** it awards, extra **`CUSTOM_ITEM_HINT_BONUS`** uses it grants, and the **`CUSTOM_ITEM_ROUTE_WEIGHT`** Dijkstra uses when deciding whether the optimal path should pass through it — a very negative weight makes Dijkstra actively seek it out. Keep the same variable names; just change the values.",
    codeReference: [
      ["CUSTOM_ITEM_NAME", "The display name of your collectible."],
      ["CUSTOM_ITEM_COLOR", "An (R, G, B) tuple, each 0-255, used when no image is set."],
      ["CUSTOM_ITEM_SCORE", "Points added to the score when collected; can be negative to make it a trap."],
      ["CUSTOM_ITEM_HINT_BONUS", "Extra path-hint uses granted when collected."],
      ["CUSTOM_ITEM_ROUTE_WEIGHT", "The weight Dijkstra uses for this cell; smaller (more negative) values make the optimal route prefer it."],
    ],
    contextBefore: [],
    contextAfter: [
      "# =========================================================",
      "# Customize the extra terrain below.",
      "# =========================================================",
    ],
    starter: [
      'CUSTOM_ITEM_NAME = "Custom Item"',
      "CUSTOM_ITEM_COLOR = (180, 180, 180)",
      "CUSTOM_ITEM_SCORE = 0",
      "CUSTOM_ITEM_HINT_BONUS = 0",
      "CUSTOM_ITEM_ROUTE_WEIGHT = 0",
    ],
    hints: [
      "The name is a string, the color is a tuple of three numbers from 0-255, and the rest are plain integers. A negative score makes the item a trap.",
      "Smaller (more negative) route weights make Dijkstra prefer that cell; larger weights make it avoid it.",
      'CUSTOM_ITEM_NAME = "Magic Key"  /  CUSTOM_ITEM_COLOR = (255, 215, 0)  /  CUSTOM_ITEM_SCORE = 50  — keep the variable names, change the values.',
    ],
    visualizer: "scoreBoard",
    grading: {
      mode: "syntax",
      mustDefine: ["CUSTOM_ITEM_NAME", "CUSTOM_ITEM_COLOR", "CUSTOM_ITEM_SCORE", "CUSTOM_ITEM_HINT_BONUS", "CUSTOM_ITEM_ROUTE_WEIGHT"],
      notes: "Open-ended: passes once the code runs with no Python error and all five names are defined. Type/shape issues surface as non-blocking warnings, not failures.",
    },
  },

  // ----------------------------------------------------------------- TODO 10
  {
    id: "10", step: 13, kind: "Bonus", required: false, file: "settings.py",
    title: "Customize the extra terrain.",
    lead: "Symmetrically to TODO 9, this terrain type is entirely defined by five constants: **`CUSTOM_TERRAIN_NAME`**, **`CUSTOM_TERRAIN_COLOR`**, the **`CUSTOM_TERRAIN_SCORE_CHANGE`** stepping on it causes (positive or negative), the **`CUSTOM_TERRAIN_ROUTE_WEIGHT`** Dijkstra uses, and **`CUSTOM_TERRAIN_DISAPPEARS`** — whether it reverts to normal after one use. Together they let you invent a hazard or shortcut that's entirely your own.",
    codeReference: [
      ["CUSTOM_TERRAIN_NAME", "The display name of your terrain."],
      ["CUSTOM_TERRAIN_COLOR", "An (R, G, B) tuple, each 0-255, used when no image is set."],
      ["CUSTOM_TERRAIN_SCORE_CHANGE", "Score change (positive or negative) applied when the player steps on it."],
      ["CUSTOM_TERRAIN_ROUTE_WEIGHT", "The weight Dijkstra uses for this cell; larger values make the route avoid it."],
      ["CUSTOM_TERRAIN_DISAPPEARS", "True/False: whether this terrain reverts to normal after one use."],
    ],
    contextBefore: [],
    contextAfter: [],
    starter: [
      'CUSTOM_TERRAIN_NAME = "Custom Terrain"',
      "CUSTOM_TERRAIN_COLOR = (180, 180, 180)",
      "CUSTOM_TERRAIN_SCORE_CHANGE = 0",
      "CUSTOM_TERRAIN_ROUTE_WEIGHT = 0",
      "CUSTOM_TERRAIN_DISAPPEARS = False",
    ],
    hints: [
      "The name is a string, the color is a tuple of three numbers, the score change may be negative, and `DISAPPEARS` must be exactly `True` or `False` (capital letter, no quotes).",
      "Larger route weights make Dijkstra avoid this terrain; smaller (more negative) weights make it prefer this terrain — the opposite framing from TODO 9's item weight, but the same mechanism.",
      'CUSTOM_TERRAIN_NAME = "Ice"  /  CUSTOM_TERRAIN_COLOR = (150, 220, 255)  /  CUSTOM_TERRAIN_SCORE_CHANGE = -5  /  CUSTOM_TERRAIN_DISAPPEARS = False',
    ],
    visualizer: "scoreBoard",
    grading: {
      mode: "syntax",
      mustDefine: ["CUSTOM_TERRAIN_NAME", "CUSTOM_TERRAIN_COLOR", "CUSTOM_TERRAIN_SCORE_CHANGE", "CUSTOM_TERRAIN_ROUTE_WEIGHT", "CUSTOM_TERRAIN_DISAPPEARS"],
      notes: "Open-ended: passes once the code runs with no Python error and all five names are defined. Type/shape issues surface as non-blocking warnings, not failures.",
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
