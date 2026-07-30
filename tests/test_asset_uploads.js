// Verifies the in-browser uploaded-asset store: the thing that makes
// "attach an image" work on the DEPLOYED site, where there is no local
// Python project folder to write into.
//
// Before this store existed, an upload only wrote a path string into the
// student's code while the bytes went to their Downloads folder - so every
// preview and the Play tab showed "not found" for a picture they had just
// chosen. These checks pin down that:
//
//   * the bytes land in IndexedDB under the asset path the code refers to
//   * loadImageCached() loads an uploaded file from its blob: URL, while
//     bundled files keep loading straight from the server
//   * uploads survive a "reload" (a fresh load of the same database)
//   * re-uploading the same name replaces the old picture
//   * removing an upload really deletes it and revokes its URL
//   * a browser with IndexedDB blocked fails loudly, not silently
//   * a second tab holding the old DB version cannot hang the app
//
// The functions under test are extracted verbatim from app.js (the same
// approach tests/extract_harnesses.py uses for the Python harnesses), so
// this can never drift from the shipped code without failing to load.
//
// Run:  node tests/test_asset_uploads.js
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const failures = [];

function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!ok) failures.push(label + (detail ? " " + detail : ""));
}

// ---- pull the real functions out of app.js ----------------------------
function extractFunction(name) {
  const needle = `function ${name}(`;
  const start = APP.indexOf(needle);
  if (start === -1) throw new Error(`app.js no longer defines ${name}() - update this test`);
  let i = APP.indexOf("{", start);
  let depth = 0;
  let inStr = null;
  let esc = false;
  for (; i < APP.length; i++) {
    const ch = APP[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return APP.slice(start, i + 1);
    }
  }
  throw new Error(`could not find the end of ${name}() in app.js`);
}

const NAMES = [
  "idbOpen", "idbGet", "idbSet", "idbDelete", "idbAllUploads",
  "resolveAssetPath", "availableAssetNames", "loadUploadedAssets",
  "rememberUploadedAsset", "forgetUploadedAsset", "audioForPath",
  "loadImageCached",
  // progress.json round trip: uploads are folded into the downloaded file
  // as data: URLs and unpacked back into IndexedDB on load.
  "blobToDataUrl", "dataUrlToBlob", "collectUploadsForExport", "restoreUploads",
];

// The two constants the extracted functions close over. Read from app.js so
// a rename there fails here instead of silently testing the wrong store.
function extractVarString(name) {
  const m = new RegExp(`${name}\\s*=\\s*"([^"]+)"`).exec(APP);
  if (!m) throw new Error(`app.js no longer defines ${name} - update this test`);
  return m[1];
}
const IDB_NAME = extractVarString("IDB_NAME");
const IDB_STORE = extractVarString("IDB_STORE");
const IDB_UPLOADS = extractVarString("IDB_UPLOADS");

// ---- the smallest IndexedDB that can host the code under test ---------
// One shared backing store per "browser", so a fresh load sees what a
// previous load wrote - that is what makes the reload check meaningful.
function makeFakeIndexedDB(opts) {
  opts = opts || {};
  const dbs = opts.dbs || {}; // name -> { version, stores: { store -> Map } }
  return {
    _dbs: dbs,
    open(name, version) {
      const req = { onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null, result: null };
      setTimeout(() => {
        if (opts.blocked) { if (req.onblocked) req.onblocked(); return; }
        if (opts.failOpen) { req.error = new Error("open denied"); if (req.onerror) req.onerror(); return; }
        const existing = dbs[name] || { version: 0, stores: {} };
        dbs[name] = existing;
        const db = {
          get objectStoreNames() {
            const names = Object.keys(existing.stores);
            return { contains: (n) => names.includes(n) };
          },
          createObjectStore(n) { existing.stores[n] = existing.stores[n] || new Map(); return {}; },
          transaction(storeName, mode) {
            const tx = { oncomplete: null, onerror: null, error: null };
            const map = existing.stores[storeName];
            if (!map) {
              setTimeout(() => { tx.error = new Error("no such store"); if (tx.onerror) tx.onerror(); }, 0);
              return { objectStore: () => ({ get: () => ({}), put: () => {}, delete: () => {}, getAll: () => ({}), getAllKeys: () => ({}) }), ...tx };
            }
            const pending = [];
            const store = {
              get(k) { const r = {}; pending.push(() => { r.result = map.get(k); if (r.onsuccess) r.onsuccess(); }); return r; },
              put(v, k) {
                if (mode !== "readwrite") throw new Error("read-only transaction");
                if (opts.failWrite) { pending.push(() => { tx.error = new Error("quota exceeded"); }); return {}; }
                pending.push(() => map.set(k, v));
                return {};
              },
              delete(k) { pending.push(() => map.delete(k)); return {}; },
              getAll() { const r = {}; pending.push(() => { r.result = Array.from(map.values()); }); return r; },
              getAllKeys() { const r = {}; pending.push(() => { r.result = Array.from(map.keys()); }); return r; },
            };
            setTimeout(() => {
              pending.forEach((fn) => fn());
              if (tx.error) { if (tx.onerror) tx.onerror(); return; }
              if (tx.oncomplete) tx.oncomplete();
            }, 0);
            return { objectStore: () => store, get oncomplete() { return tx.oncomplete; }, set oncomplete(f) { tx.oncomplete = f; }, get onerror() { return tx.onerror; }, set onerror(f) { tx.onerror = f; }, get error() { return tx.error; } };
          },
        };
        req.result = db;
        if (existing.version < version) {
          existing.version = version;
          if (req.onupgradeneeded) req.onupgradeneeded();
        }
        if (req.onsuccess) req.onsuccess();
      }, 0);
      return req;
    },
  };
}

let urlCounter = 0;
function makeEnv(idbOpts, sharedDbs) {
  const revoked = [];
  const created = [];
  const ctx = {
    console,
    setTimeout, clearTimeout,
    Promise,
    Object, Array, Error, JSON, String,
    IDB_NAME, IDB_STORE, IDB_UPLOADS,
    IMAGE_CACHE: {},
    UPLOADED_URLS: {},
    // Stand-in for the site's bundled asset list, so availableAssetNames()
    // can be checked without pulling in all of data.js.
    KNOWN_ASSETS: { images: ["boy.png", "item_star.png"], sounds: ["pickup_3.wav"] },
    window: { indexedDB: null },
    URL: {
      createObjectURL(blob) { const u = `blob:fake/${++urlCounter}`; created.push({ u, blob }); return u; },
      revokeObjectURL(u) { revoked.push(u); },
    },
    // Records what src each Image was pointed at, and reports success only
    // for things the fake "server"/blob store actually has.
    _imageSrcs: [],
    Audio: function (src) { this.src = src; this.play = () => Promise.resolve(); },
    Uint8Array,
    decodeURIComponent,
    atob: (b64) => Buffer.from(b64, "base64").toString("binary"),
    // Enough of Blob/FileReader for the progress.json round trip: bytes in,
    // data: URL out, bytes back.
    Blob: function (parts, opts) {
      const bytes = [];
      (parts || []).forEach((p) => {
        if (typeof p === "string") { for (let i = 0; i < p.length; i++) bytes.push(p.charCodeAt(i) & 0xff); }
        else { for (const b of p) bytes.push(b); }
      });
      this._bytes = Uint8Array.from(bytes);
      this.type = (opts && opts.type) || "";
      this.size = this._bytes.length;
      this.arrayBuffer = () => Promise.resolve(this._bytes.buffer);
    },
    FileReader: function () {
      this.readAsDataURL = (blob) => {
        setTimeout(() => {
          if (!blob || !blob._bytes) {
            this.error = new Error("not a blob");
            if (this.onerror) this.onerror();
            return;
          }
          const b64 = Buffer.from(blob._bytes).toString("base64");
          this.result = "data:" + (blob.type || "application/octet-stream") + ";base64," + b64;
          if (this.onload) this.onload();
        }, 0);
      };
    },
  };
  // app.js gates on window.indexedDB but calls the bare global, exactly as a
  // browser exposes it - mirror both onto the same object.
  ctx.indexedDB = makeFakeIndexedDB(Object.assign({ dbs: sharedDbs }, idbOpts || {}));
  ctx.window.indexedDB = ctx.indexedDB;
  ctx.Image = function () {
    const img = {};
    Object.defineProperty(img, "src", {
      set(v) {
        ctx._imageSrcs.push(v);
        setTimeout(() => {
          const ok = String(v).startsWith("blob:") || String(v).startsWith("assets/");
          if (ok && img.onload) img.onload();
          else if (!ok && img.onerror) img.onerror();
        }, 0);
      },
      get() { return undefined; },
    });
    return img;
  };
  ctx._revoked = revoked;
  ctx._created = created;

  const sandbox = vm.createContext(ctx);
  vm.runInContext(NAMES.map(extractFunction).join("\n\n"), sandbox, { filename: "app.js-extract" });
  return sandbox;
}

const tick = () => new Promise((r) => setTimeout(r, 5));

(async function run() {
  // ---- 1. an upload with NO project folder still lands somewhere -------
  const browser = {}; // persists across "reloads"
  let env = makeEnv({}, browser);
  const PATH = "assets/images/my_star.png";
  const blob = { fake: "png-bytes" };

  await vm.runInContext(`rememberUploadedAsset(${JSON.stringify(PATH)}, BLOB)`, Object.assign(env, { BLOB: blob }));
  await tick();
  check("uploading stores the bytes with no project folder connected",
    !!browser[IDB_NAME] && browser[IDB_NAME].stores[IDB_UPLOADS] &&
    browser[IDB_NAME].stores[IDB_UPLOADS].get(PATH) === blob);
  check("the upload is registered under the path the student's code uses",
    typeof env.UPLOADED_URLS[PATH] === "string" && env.UPLOADED_URLS[PATH].startsWith("blob:"),
    `(${env.UPLOADED_URLS[PATH]})`);

  // ---- 2. loadImageCached uses the blob for uploads, server for bundled
  const uploadedUrl = env.UPLOADED_URLS[PATH];
  await vm.runInContext(`loadImageCached(${JSON.stringify(PATH)})`, env);
  await tick();
  check("an uploaded image loads from its in-browser blob URL, not the server",
    env._imageSrcs.includes(uploadedUrl), `(tried ${JSON.stringify(env._imageSrcs)})`);

  env._imageSrcs.length = 0;
  await vm.runInContext(`loadImageCached("assets/images/boy.png")`, env);
  await tick();
  check("a bundled image still loads straight from the server path",
    env._imageSrcs.includes("assets/images/boy.png"), `(tried ${JSON.stringify(env._imageSrcs)})`);

  check("resolveAssetPath leaves an unknown path alone",
    vm.runInContext(`resolveAssetPath("assets/images/nope.png")`, env) === "assets/images/nope.png");
  check("resolveAssetPath passes null/empty through untouched",
    vm.runInContext(`resolveAssetPath(null)`, env) === null &&
    vm.runInContext(`resolveAssetPath("")`, env) === "");

  // ---- 3. an uploaded SOUND is playable through the same resolver ------
  const sPath = "assets/sounds/mine.wav";
  Object.assign(env, { BLOB2: { fake: "wav" } });
  await vm.runInContext(`rememberUploadedAsset(${JSON.stringify(sPath)}, BLOB2)`, env);
  await tick();
  check("an uploaded sound plays from its blob URL",
    vm.runInContext(`audioForPath(${JSON.stringify(sPath)}).src`, env) === env.UPLOADED_URLS[sPath]);
  check("a bundled sound still plays from its server path",
    vm.runInContext(`audioForPath("assets/sounds/pickup_3.wav").src`, env) === "assets/sounds/pickup_3.wav");
  check("audioForPath(null) is a no-op rather than a crash",
    vm.runInContext(`audioForPath(null)`, env) === null);

  // ---- 3b. the grader stops calling an uploaded path unknown -----------
  // This is the warning the teacher hit: "PLAYER_IMAGE_PATH =
  // 'assets/images/nubzuki.png' - this isn't one of the bundled files".
  // Once the file is uploaded it really is available, so it must count as
  // known or the warning is simply wrong.
  const imgNames = vm.runInContext(`availableAssetNames("image")`, env);
  check("an uploaded image counts as an available asset for the grader",
    imgNames.includes("my_star.png"), `(${imgNames.join(", ")})`);
  check("bundled images are still listed alongside it",
    imgNames.includes("boy.png") && imgNames.includes("item_star.png"));
  const sndNames = vm.runInContext(`availableAssetNames("sound")`, env);
  check("an uploaded sound counts as an available asset for the grader",
    sndNames.includes("mine.wav"), `(${sndNames.join(", ")})`);
  check("an uploaded image does not leak into the sound list",
    !sndNames.includes("my_star.png"));
  check("a file nobody uploaded is still unknown (the warning still works)",
    !imgNames.includes("nubzuki.png"));

  // ---- 4. uploads survive a reload ------------------------------------
  const env2 = makeEnv({}, browser);
  await vm.runInContext(`loadUploadedAssets()`, env2);
  await tick();
  check("uploads are still there after a reload",
    Object.keys(env2.UPLOADED_URLS).sort().join(",") === [PATH, sPath].sort().join(","),
    `(${Object.keys(env2.UPLOADED_URLS).join(", ")})`);

  env2._imageSrcs.length = 0;
  await vm.runInContext(`loadImageCached(${JSON.stringify(PATH)})`, env2);
  await tick();
  check("and the reloaded upload still renders instead of showing 'not found'",
    env2._imageSrcs.includes(env2.UPLOADED_URLS[PATH]));

  // ---- 5. re-uploading the same name replaces the picture --------------
  const oldUrl = env.UPLOADED_URLS[PATH];
  await vm.runInContext(`IMAGE_CACHE[${JSON.stringify(PATH)}] = "stale-cached-image"`, env);
  Object.assign(env, { BLOB3: { fake: "png-v2" } });
  await vm.runInContext(`rememberUploadedAsset(${JSON.stringify(PATH)}, BLOB3)`, env);
  await tick();
  check("re-uploading the same filename stores the new bytes",
    browser[IDB_NAME].stores[IDB_UPLOADS].get(PATH).fake === "png-v2");
  check("re-uploading drops the stale cached image",
    env.IMAGE_CACHE[PATH] !== "stale-cached-image");
  check("re-uploading revokes the old blob URL (no leak)",
    env._revoked.includes(oldUrl), `(revoked ${JSON.stringify(env._revoked)})`);

  // ---- 6. removing really removes -------------------------------------
  const doomedUrl = env.UPLOADED_URLS[PATH];
  await vm.runInContext(`forgetUploadedAsset(${JSON.stringify(PATH)})`, env);
  await tick();
  check("removing an upload deletes the stored bytes",
    !browser[IDB_NAME].stores[IDB_UPLOADS].has(PATH));
  check("removing an upload unregisters it and revokes its URL",
    !env.UPLOADED_URLS[PATH] && env._revoked.includes(doomedUrl));
  check("removing one upload leaves the others alone",
    !!env.UPLOADED_URLS[sPath]);

  // ---- 6b. progress.json carries the pictures to another computer ------
  // The teacher's report: "save the json, load it on another computer, and
  // it says the image is missing". The uploads have to travel INSIDE the
  // file, because IndexedDB obviously doesn't follow it.
  const pcA = {};
  const envA = makeEnv({}, pcA);
  const PNG_BYTES = [137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3];
  const WAV_BYTES = [82, 73, 70, 70, 9, 9];
  vm.runInContext(
    `IMG_BLOB = new Blob([new Uint8Array(${JSON.stringify(PNG_BYTES)})], { type: "image/png" });` +
    `SND_BLOB = new Blob([new Uint8Array(${JSON.stringify(WAV_BYTES)})], { type: "audio/wav" });`,
    envA
  );
  await vm.runInContext(`rememberUploadedAsset("assets/images/nubzuki.png", IMG_BLOB)`, envA);
  await vm.runInContext(`rememberUploadedAsset("assets/sounds/ding.wav", SND_BLOB)`, envA);
  await tick();

  const exported = await vm.runInContext(`collectUploadsForExport()`, envA);
  check("saving collects every upload into the progress file",
    Object.keys(exported).sort().join(",") === "assets/images/nubzuki.png,assets/sounds/ding.wav",
    `(${Object.keys(exported).join(", ")})`);
  check("each upload travels as a data: URL with its real mime type",
    /^data:image\/png;base64,/.test(exported["assets/images/nubzuki.png"]) &&
    /^data:audio\/wav;base64,/.test(exported["assets/sounds/ding.wav"]));
  // The exported map must survive JSON, since that is literally the file.
  const throughJson = JSON.parse(JSON.stringify(exported));

  // A different computer: brand-new browser storage, nothing uploaded.
  const pcB = {};
  const envB = makeEnv({}, pcB);
  await vm.runInContext(`loadUploadedAssets()`, envB);
  await tick();
  check("the second computer starts with no uploads at all",
    Object.keys(envB.UPLOADED_URLS).length === 0);

  envB.INCOMING = throughJson;
  await vm.runInContext(`restoreUploads(INCOMING)`, envB);
  await tick();
  check("loading the progress file restores the uploads on the new computer",
    Object.keys(envB.UPLOADED_URLS).sort().join(",") === "assets/images/nubzuki.png,assets/sounds/ding.wav",
    `(${Object.keys(envB.UPLOADED_URLS).join(", ")})`);

  const restoredBytes = Array.from(pcB[IDB_NAME].stores[IDB_UPLOADS].get("assets/images/nubzuki.png")._bytes);
  check("the restored picture is byte-for-byte the original",
    restoredBytes.join(",") === PNG_BYTES.join(","), `(${restoredBytes.join(",")})`);
  check("the restored picture's mime type survived",
    pcB[IDB_NAME].stores[IDB_UPLOADS].get("assets/images/nubzuki.png").type === "image/png");

  envB._imageSrcs.length = 0;
  await vm.runInContext(`loadImageCached("assets/images/nubzuki.png")`, envB);
  await tick();
  check("and it renders on the new computer instead of 'not found'",
    envB._imageSrcs.includes(envB.UPLOADED_URLS["assets/images/nubzuki.png"]));
  const namesB = vm.runInContext(`availableAssetNames("image")`, envB);
  check("the grader on the new computer accepts the restored path too",
    namesB.includes("nubzuki.png"), `(${namesB.join(", ")})`);

  // Loading a file that no longer lists an upload must not leave the old
  // one behind, or it would be silently bundled into the next zip.
  envB.INCOMING2 = { "assets/images/nubzuki.png": throughJson["assets/images/nubzuki.png"] };
  await vm.runInContext(`restoreUploads(INCOMING2)`, envB);
  await tick();
  check("loading a file without an old upload clears that upload",
    !envB.UPLOADED_URLS["assets/sounds/ding.wav"] &&
    !pcB[IDB_NAME].stores[IDB_UPLOADS].has("assets/sounds/ding.wav"));
  check("uploads the new file still lists are kept",
    !!envB.UPLOADED_URLS["assets/images/nubzuki.png"]);

  check("a malformed data: URL is skipped rather than crashing the load",
    vm.runInContext(`dataUrlToBlob("not-a-data-url")`, envB) === null);

  // ---- 7. a browser that refuses storage fails LOUDLY -----------------
  // finishUpload must not claim success when nothing was stored, or the
  // student is told their picture is saved and then sees "not found".
  const envNoIdb = makeEnv({ failOpen: true }, {});
  let rejected = false;
  try {
    Object.assign(envNoIdb, { BLOB4: { fake: "x" } });
    await vm.runInContext(`rememberUploadedAsset("assets/images/x.png", BLOB4)`, envNoIdb);
  } catch (e) { rejected = true; }
  check("a browser that blocks IndexedDB makes the upload reject, not silently pass", rejected);

  // ---- 8. a second tab on the old DB version cannot hang the app -------
  const envBlocked = makeEnv({ blocked: true }, {});
  let settled = false;
  vm.runInContext(`loadUploadedAssets()`, envBlocked).then(() => { settled = true; }, () => { settled = true; });
  await tick();
  check("an IndexedDB upgrade blocked by another tab settles instead of hanging forever", settled);

  console.log();
  if (failures.length) {
    console.log(`${failures.length} CHECK(S) FAILED:`);
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
  console.log("ALL ASSET-UPLOAD CHECKS PASSED");
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
