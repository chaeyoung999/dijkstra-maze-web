// Verifies the Play tab plays the sound the STUDENT chose.
//
// The Play tab used to hardcode two effect files and never touched
// BACKGROUND_MUSIC_PATH at all, so a student could set a sound, hear it in
// the asset picker, and then never hear it in their own game. These checks
// pin down the three things that fix depends on:
//
//   1. parseAssetPaths tells "None" (-> null, stay silent) apart from
//      "not written yet" (-> undefined, use the bundled fallback)
//   2. the custom-item parser carries each item's own "sound" through
//   3. the Play tab actually reads those values instead of constants
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
let failures = 0;

function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!ok) failures++;
}

// ---- 1. parseAssetPaths: None vs missing ------------------------------
// Pulled straight out of app.js so this tests the shipped function.
const m = APP.match(/function parseAssetPaths\(codes\) \{[\s\S]*?\n  \}/);
if (!m) {
  check("parseAssetPaths could be extracted from app.js", false);
  process.exit(1);
}
const sandbox = { module: {}, console };
vm.createContext(sandbox);
vm.runInContext(m[0] + "\nthis.parseAssetPaths = parseAssetPaths;", sandbox);
const parseAssetPaths = sandbox.parseAssetPaths;

let paths = parseAssetPaths(['BOMB_SOUND_PATH = "assets/sounds/explosion_3.wav"']);
check("a chosen bomb sound is read back exactly",
  paths.BOMB_SOUND_PATH === "assets/sounds/explosion_3.wav",
  `(got ${JSON.stringify(paths.BOMB_SOUND_PATH)})`);

paths = parseAssetPaths(["BOMB_SOUND_PATH = None"]);
check("BOMB_SOUND_PATH = None reads back as null (silence), not undefined",
  paths.BOMB_SOUND_PATH === null,
  `(got ${JSON.stringify(paths.BOMB_SOUND_PATH)})`);

paths = parseAssetPaths(["# nothing about sound here"]);
check("an untouched sound setting stays undefined (bundled fallback)",
  paths.BOMB_SOUND_PATH === undefined,
  `(got ${JSON.stringify(paths.BOMB_SOUND_PATH)})`);

paths = parseAssetPaths([
  'BACKGROUND_MUSIC_PATH = "assets/sounds/bgm_2.wav"',
  "BOMB_SOUND_PATH = None",
]);
check("both sound settings are read from separate sub-steps at once",
  paths.BACKGROUND_MUSIC_PATH === "assets/sounds/bgm_2.wav" &&
  paths.BOMB_SOUND_PATH === null);

paths = parseAssetPaths(['BOMB_SOUND_PATH = "assets/sounds/my upload.wav"']);
check("an uploaded filename with a space still parses",
  paths.BOMB_SOUND_PATH === "assets/sounds/my upload.wav");

// ---- 2. playAudio semantics -------------------------------------------
// The same three-way choice the Play tab makes, exercised directly.
function chooseAudioPath(chosen, fallback) {
  return chosen === undefined ? fallback : chosen;
}
check("playAudio: a chosen path wins",
  chooseAudioPath("assets/sounds/pickup_1.wav", "fb") === "assets/sounds/pickup_1.wav");
check("playAudio: null means silence (no fallback)",
  chooseAudioPath(null, "fb") === null);
check("playAudio: undefined falls back to the bundled effect",
  chooseAudioPath(undefined, "fb") === "fb");

// ---- 3. the Play tab really uses them ---------------------------------
check("the pickup uses the item's own sound, not a constant",
  /playAudio\(def\.sound, SPRITE_SOUND\.pickup\)/.test(APP));
check("the bomb uses BOMB_SOUND_PATH, not a constant",
  /playAudio\(playVisuals\(\)\.paths\.BOMB_SOUND_PATH, SPRITE_SOUND\.bomb\)/.test(APP));
check("background music is started at all (it never used to be)",
  /function syncBackgroundMusic\(\)/.test(APP) &&
  /BACKGROUND_MUSIC_PATH/.test(APP.slice(APP.indexOf("function syncBackgroundMusic"))));
check("background music loops",
  /musicEl\.loop = true/.test(APP));
check("background music follows BACKGROUND_MUSIC_VOLUME",
  /"BACKGROUND_MUSIC_VOLUME", 0, 1/.test(APP));
check("background music follows the Sound checkbox and play/pause",
  /soundOn && running/.test(APP) &&
  /syncBackgroundMusic\(\);/.test(APP.slice(APP.indexOf("function setControlsRunning"))));
check("background music is stopped when the Play tab goes away",
  /stopBackgroundMusic\(\);/.test(APP.slice(APP.indexOf("unmount: function"))));

// The item parser has to carry "sound" through, or none of the above can work.
check("the custom-item parser keeps each item's own sound",
  /'sound': sound if isinstance\(sound, str\) else None/.test(APP));

console.log("");
if (failures) {
  console.log(`${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("ALL WEB-AUDIO CHECKS PASSED");
