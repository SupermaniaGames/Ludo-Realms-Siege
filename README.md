# Ludo Realms: Siege

A 4-kingdom, chess-style siege game with real-perspective **3D pieces and castles**, drawn on a plain canvas.
No frameworks, no build step, no downloads: just static files. Pass & play on one device (2–4 kingdoms).

## Deploy on GitHub Pages (5 minutes)

1. On GitHub, click **New repository**. Name it e.g. `ludo-realms-siege` (public).
2. Upload **everything in this folder** (drag the files and folders into the repo page, then *Commit changes*).
   Make sure the `js`, `css`, `icons` folders, `index.html`, `manifest.json`, `sw.js` and `.nojekyll` all arrive.
   Or with git:
   ```bash
   git init && git add . && git commit -m "Ludo Realms: Siege"
   git branch -M main
   git remote add origin https://github.com/<you>/ludo-realms-siege.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch **main**, folder **/ (root)** → **Save**.
4. After about a minute the game is live at `https://<you>.github.io/ludo-realms-siege/`.

All paths are relative, so it also works from any sub-folder of an existing site.

## Install as an app (own identity)

`manifest.json` sets a unique app `id` (`ludo-realms-siege`), its own `scope` and its own cache name, so it installs
as a separate app and never collides with your other games on the same GitHub account.
Chrome/Edge: ⋮ → *Install app*. iPhone: Share → *Add to Home Screen*.

## Always the latest version (network first)

`sw.js` is network-first: when online the newest files are always fetched from the server, never from the cache.
The cache is only an offline fallback. After you push an update, reload once and the new version loads
(the page reloads itself when a new service worker takes over).

## Run locally

ES modules need a web server (double-clicking `index.html` will not work):

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

## How to play

* **Army:** Queen A1, Rook A2, Bishop B1, Knight C1, Pawns C2 C3 A3 B3 (mirrored for each corner).
  Aqua = top-left, Forest = top-right (L1), Desert = bottom-left (A12), Mountain = bottom-right (L12).
  Each King lives in the castle outside the board and only watches.
* **Dice:** 1–4 move one piece up to that many squares · **5 Breaker** blasts a wall or destroys a piece in a Haven ·
  **6 Haven** shields one piece until it moves.
* **Movement:** Queen (8 directions), Rook (straight), Bishop (diagonal), Knight (L-jump, also over walls),
  Pawn (1–2 forward, captures diagonally).
* **Walls:** each realm is walled in; only the two 2-square gates let pieces through.
* **Storm a castle:** land on an enemy's corner square and that kingdom falls.
* **Promotion:** a Pawn reaching one of the 3 crowned squares beside an enemy castle becomes Queen, Rook, Bishop or Knight.
* **Surrender:** demand it from a kingdom with 3 pieces or fewer; if it yields, its army becomes your Pawns (vassals).
* **Win:** be the last kingdom standing.

Controls: drag to turn the board · wheel / pinch to zoom · two-finger drag (or Shift+drag) to pan ·
⟲ ⟳ rotate 90° · ⌂ reset view · Space rolls the dice.

## Files

```
index.html          page + UI shell
manifest.json       installable-app identity (unique id)
sw.js               network-first service worker
.nojekyll           tells GitHub Pages to serve files as-is
css/style.css       fantasy parchment / wood theme
js/engine.js        rules (no DOM): moves, dice, walls, promotion, surrender
js/render.js        software-3D renderer: camera, lighting, sorting, animation, picking
js/mesh.js          3D mesh toolkit (lathe, box, prism)
js/models.js        pieces, castles, walls, gates
js/textures.js      procedural terrain & wood textures
js/main.js          game controller / UI wiring
js/audio.js         synthesised sound effects
js/icons.js         SVG emblems & icons
icons/              app icons
```

## Ideas for next steps

* Online rooms (Firebase) – the engine is DOM-free and its state is plain data, so it can be synced as-is.
* A computer opponent: pick a legal move with `game.movable()` / `game.moves(piece, roll)`.
