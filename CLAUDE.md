# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris implementation using HTML5 Canvas. No dependencies, no build step, no package.json.

## Running

Open `index.html` directly in a browser, or serve it statically:

```bash
python3 -m http.server 8000
# or
npx serve .
```

There is no build, lint, or test tooling in this repo — changes are verified by opening `index.html` and playing.

## Architecture

Three files, all logic lives in `game.js` (~300 lines, single scope, no modules):

- `index.html` — DOM shell: `#board` canvas (300×600, 10×20 grid at `BLOCK=30`px), `#next-canvas` for the piece preview, HUD spans (`#score`, `#lines`, `#level`), and the pause/game-over `#overlay`.
- `style.css` — dark/retro arcade visual theme.
- `game.js` — game state, update loop, and rendering, all as module-level functions operating on shared top-level `let` variables (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.). There are no classes and no state container object — functions mutate these globals directly.

Key mechanics to know before editing:

- **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or a piece color index `1–7`.
- **Pieces**: `PIECES` are square matrices; rotation is done via `rotateCW` (transpose + reverse), not by storing rotation states.
- **Collision**: `collide(shape, ox, oy)` is the single source of truth for whether a shape placement is legal (used for movement, rotation, ghost piece, and spawn checks).
- **Wall kicks**: `tryRotate()` tries offsets `[0, -1, 1, -2, 2]` after rotating, applying the first that doesn't collide.
- **Game loop**: `requestAnimationFrame`-driven `loop(ts)` accumulates elapsed time in `dropAccum` and advances the piece when it exceeds `dropInterval`; `animId` is tracked so pause/restart can cancel and restart the loop cleanly.
- **Line clears**: `clearLines()` scans bottom-up, splices completed rows out and unshifts empty rows in, then recomputes `level` (every 10 lines) and `dropInterval` (`max(100, 1000 - (level-1)*90)`).
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop adds 2 pts/row dropped, soft drop 1 pt/row.
- **Rendering**: `draw()` clears and redraws the whole board every frame (grid, locked blocks, ghost piece at `globalAlpha 0.2` via `ghostY()`, then the current piece). `drawNext()` renders the preview canvas the same way.

Tunable constants are all at the top of `game.js`: `COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).

Controls (keydown handler at bottom of `game.js`): arrows to move/rotate/soft-drop, `X` also rotates, `Space` hard-drops, `P` toggles pause.
