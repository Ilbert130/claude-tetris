'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
  '#f8bbd0', // + (plus) - pink
  '#4db6ac', // U - teal
  '#9575cd', // Y - deep purple
  '#fff176', // 1x1 (Tetris reward) - bright gold
  '#b0bec5', // 3x3 hollow - steel gray
  '#ff5252', // Power-up: Bomba - danger red
  '#ffee58', // Power-up: Rayo - electric yellow
  '#ec407a', // Power-up: Tinte - magenta
  '#66bb6a', // Power-up: Gravedad - green
  '#4fc3f7', // Power-up: Congelar - ice blue
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // + (plus) - special
  [[9,0,9],[9,9,9]],                          // U - special
  [[0,10],[10,10],[0,10],[0,10]],             // Y - special
  [[11]],                                     // 1x1 single - Tetris reward
  [[12,12,12],[12,0,12],[12,12,12]],          // 3x3 hollow - special
  [[13]],                                     // Power-up: Bomba
  [[14]],                                     // Power-up: Rayo
  [[15]],                                     // Power-up: Tinte
  [[16]],                                     // Power-up: Gravedad
  [[17]],                                     // Power-up: Congelar
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// Standard pieces are types 1-7 (drawn on every spawn unless overridden below).
const STANDARD_TYPE_COUNT = 7;
// Special pieces that occasionally replace a standard spawn (excludes the Tetris reward piece).
const SPECIAL_TYPES = [8, 9, 10, 12];
// Probability [0,1] that a given spawn produces a random special piece instead of a standard one.
// Tune this to make special pieces more or less frequent.
const SPECIAL_PIECE_CHANCE = 0.12;
// Piece type awarded right after a Tetris (4-line clear).
const REWARD_PIECE_TYPE = 11;

// Power-up piece types: 1x1 pieces that trigger a board effect on lock instead of merging.
const POWERUP_BOMBA = 13;    // destroys a 3x3 area around the landing cell
const POWERUP_RAYO = 14;     // clears the entire row it lands in
const POWERUP_TINTE = 15;    // removes every block of the color it lands next to
const POWERUP_GRAVEDAD = 16; // compacts gaps in every column
const POWERUP_CONGELAR = 17; // freezes automatic gravity for a few seconds
const POWERUP_TYPES = [POWERUP_BOMBA, POWERUP_RAYO, POWERUP_TINTE, POWERUP_GRAVEDAD, POWERUP_CONGELAR];
const POWERUP_GLYPHS = { 13: '💣', 14: '⚡', 15: '🎨', 16: '🌀', 17: '❄️' };
// Number of total lines cleared between forced power-up piece spawns.
const POWERUP_LINE_INTERVAL = 5;
const FREEZE_DURATION_MS = 5000;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const powerupIndicatorEl = document.getElementById('powerup-indicator');
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';
const SKINS = ['retro', 'neon', 'pastel', 'pixel'];

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor = '#22222e';
let currentSkin = 'retro';
// Set when a Tetris (4-line clear) happens; consumed by the next randomPiece() call.
let rewardPending = false;
// Lines cleared since the last power-up spawn; and the pending power-up (if any) for the next randomPiece() call.
let linesSincePowerup = 0;
let powerupPending = false;
let pendingPowerupType = null;
// Timestamp (performance.now()-space) until which automatic gravity is suspended; 0 = not frozen.
let freezeUntil = 0;
let powerupLabelTimeout = null;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  let type;
  if (rewardPending) {
    type = REWARD_PIECE_TYPE;
    rewardPending = false;
  } else if (powerupPending) {
    type = pendingPowerupType;
    powerupPending = false;
    pendingPowerupType = null;
  } else if (Math.random() < SPECIAL_PIECE_CHANCE) {
    type = SPECIAL_TYPES[Math.floor(Math.random() * SPECIAL_TYPES.length)];
  } else {
    type = Math.floor(Math.random() * STANDARD_TYPE_COUNT) + 1;
  }
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (cleared === 4) rewardPending = true;
    linesSincePowerup += cleared;
    if (linesSincePowerup >= POWERUP_LINE_INTERVAL) {
      linesSincePowerup -= POWERUP_LINE_INTERVAL;
      powerupPending = true;
      pendingPowerupType = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    }
    updateHUD();
  }
}

function applyPowerup(type, row, col) {
  showPowerupLabel(POWERUP_GLYPHS[type]);
  switch (type) {
    case POWERUP_BOMBA:
      applyBomba(row, col);
      break;
    case POWERUP_RAYO:
      applyRayo(row);
      break;
    case POWERUP_TINTE:
      applyTinte(row, col);
      break;
    case POWERUP_GRAVEDAD:
      applyGravedad();
      break;
    case POWERUP_CONGELAR:
      freezeUntil = performance.now() + FREEZE_DURATION_MS;
      break;
  }
}

function applyBomba(row, col) {
  for (let r = row - 1; r <= row + 1; r++) {
    if (r < 0 || r >= ROWS) continue;
    for (let c = col - 1; c <= col + 1; c++) {
      if (c < 0 || c >= COLS) continue;
      board[r][c] = 0;
    }
  }
  applyGravedad();
}

function applyRayo(row) {
  board.splice(row, 1);
  board.unshift(new Array(COLS).fill(0));
  score += (LINE_SCORES[1] || 0) * level;
  lines += 1;
  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  linesSincePowerup += 1;
}

function applyTinte(row, col) {
  const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  let targetColor = null;
  for (const [dr, dc] of deltas) {
    const r = row + dr, c = col + dc;
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c]) {
      targetColor = board[r][c];
      break;
    }
  }
  if (!targetColor) targetColor = mostCommonBoardColor();
  if (targetColor) {
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (board[r][c] === targetColor) board[r][c] = 0;
  }
  applyGravedad();
}

function mostCommonBoardColor() {
  const counts = {};
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c]) counts[board[r][c]] = (counts[board[r][c]] || 0) + 1;
  let best = null, bestCount = 0;
  for (const k in counts) {
    if (counts[k] > bestCount) { bestCount = counts[k]; best = Number(k); }
  }
  return best;
}

function applyGravedad() {
  for (let c = 0; c < COLS; c++) {
    const colVals = [];
    for (let r = 0; r < ROWS; r++) if (board[r][c]) colVals.push(board[r][c]);
    const gap = ROWS - colVals.length;
    for (let r = 0; r < ROWS; r++) board[r][c] = r < gap ? 0 : colVals[r - gap];
  }
}

function showPowerupLabel(glyph) {
  if (!powerupIndicatorEl) return;
  powerupIndicatorEl.textContent = glyph;
  clearTimeout(powerupLabelTimeout);
  powerupLabelTimeout = setTimeout(() => {
    powerupIndicatorEl.textContent = '—';
  }, 1500);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (POWERUP_TYPES.includes(current.type)) {
    applyPowerup(current.type, current.y, current.x);
  } else {
    merge();
  }
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// Blends a hex color toward white by `amount` (0-1) to produce softer pastel tones.
function lightenColor(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const nr = Math.round(r + (255 - r) * amount);
  const ng = Math.round(g + (255 - g) * amount);
  const nb = Math.round(b + (255 - b) * amount);
  return `rgb(${nr}, ${ng}, ${nb})`;
}

// Draws a rounded rect, using the native API when available and falling back to arcs otherwise.
function fillRoundedRect(context, x, y, w, h, radius) {
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(x, y, w, h, radius);
    context.fill();
    return;
  }
  const r = Math.min(radius, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
  context.fill();
}

function drawBlockRetro(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawBlockNeon(context, px, py, size, color) {
  context.save();
  context.shadowColor = color;
  context.shadowBlur = size * 0.5;
  context.fillStyle = color;
  context.fillRect(px + 2, py + 2, size - 4, size - 4);
  context.restore();
  context.fillStyle = 'rgba(255,255,255,0.18)';
  context.fillRect(px + 2, py + 2, size - 4, 3);
}

function drawBlockPastel(context, px, py, size, color) {
  const soft = lightenColor(color, 0.45);
  context.fillStyle = soft;
  fillRoundedRect(context, px + 1, py + 1, size - 2, size - 2, size * 0.25);
  context.fillStyle = 'rgba(255,255,255,0.35)';
  fillRoundedRect(context, px + 1, py + 1, size - 2, size * 0.3, size * 0.25);
}

function drawBlockPixel(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
  // pixel-art checkerboard texture on top
  const cells = 4;
  const cellSize = (size - 2) / cells;
  context.fillStyle = 'rgba(0,0,0,0.12)';
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      if ((gx + gy) % 2 === 0) {
        context.fillRect(px + 1 + gx * cellSize, py + 1 + gy * cellSize, cellSize, cellSize);
      }
    }
  }
  context.strokeStyle = 'rgba(0,0,0,0.25)';
  context.lineWidth = 1;
  context.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  const px = x * size;
  const py = y * size;
  context.globalAlpha = alpha ?? 1;
  switch (currentSkin) {
    case 'neon':
      drawBlockNeon(context, px, py, size, color);
      break;
    case 'pastel':
      drawBlockPastel(context, px, py, size, color);
      break;
    case 'pixel':
      drawBlockPixel(context, px, py, size, color);
      break;
    default:
      drawBlockRetro(context, px, py, size, color);
      break;
  }
  if (POWERUP_GLYPHS[colorIndex]) {
    context.font = `${size * 0.6}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(POWERUP_GLYPHS[colorIndex], px + size / 2, py + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (currentSkin === 'neon') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (currentSkin === 'neon') {
    nextCtx.fillStyle = '#000000';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function updatePowerupIndicator() {
  if (!powerupIndicatorEl || !freezeUntil) return;
  const remaining = freezeUntil - performance.now();
  if (remaining > 0) {
    powerupIndicatorEl.textContent = `❄️ ${Math.ceil(remaining / 1000)}s`;
  } else {
    freezeUntil = 0;
    powerupIndicatorEl.textContent = '—';
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (performance.now() >= freezeUntil) {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  updatePowerupIndicator();
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  rewardPending = false;
  linesSincePowerup = 0;
  powerupPending = false;
  pendingPowerupType = null;
  freezeUntil = 0;
  clearTimeout(powerupLabelTimeout);
  if (powerupIndicatorEl) powerupIndicatorEl.textContent = '—';
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

function updateGridColor() {
  gridColor = getComputedStyle(document.body).getPropertyValue('--grid-color').trim() || gridColor;
}

function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'light');
  themeToggle.checked = theme === 'light';
  updateGridColor();
  localStorage.setItem(THEME_KEY, theme);
  if (board && current) draw();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
});

function applySkin(skin) {
  currentSkin = SKINS.includes(skin) ? skin : 'retro';
  if (skinSelect) skinSelect.value = currentSkin;
  localStorage.setItem(SKIN_KEY, currentSkin);
  if (board && current) draw();
  if (next) drawNext();
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  applySkin(saved || 'retro');
}

if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    applySkin(skinSelect.value);
  });
}

restartBtn.addEventListener('click', init);

initTheme();
initSkin();
init();
