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
const hsPanelList = document.getElementById('hs-panel-list');
const hsOverlayList = document.getElementById('hs-overlay-list');
const hsOverlaySection = document.getElementById('hs-overlay-section');
const hsEntryForm = document.getElementById('hs-entry-form');
const hsNameInput = document.getElementById('hs-name-input');
const hsSubmitBtn = document.getElementById('hs-submit-btn');
const hsBestComboEl = document.getElementById('hs-best-combo');
const hsMaxLinesEl = document.getElementById('hs-max-lines');
const hsResetBtn = document.getElementById('hs-reset-btn');

const THEME_KEY = 'tetris-theme';
const HS_KEY = 'tetris-highscores';
const HS_COMBO_KEY = 'tetris-best-combo';
const HS_MAXLINES_KEY = 'tetris-max-lines';
const HS_MAX_ENTRIES = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor = '#22222e';
// Set when a Tetris (4-line clear) happens; consumed by the next randomPiece() call.
let rewardPending = false;
// Lines cleared since the last power-up spawn; and the pending power-up (if any) for the next randomPiece() call.
let linesSincePowerup = 0;
let powerupPending = false;
let pendingPowerupType = null;
// Timestamp (performance.now()-space) until which automatic gravity is suspended; 0 = not frozen.
let freezeUntil = 0;
let powerupLabelTimeout = null;
// High-score / combo tracking (see bottom of file for the leaderboard functions).
let highScores = [];
let bestCombo = 0;
let maxLinesGame = 0;
let comboCount = 0;
let maxComboSession = 0;
// Lines cleared by the current lockPiece() call (standard clears + Rayo power-up clears).
let linesThisLock = 0;

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
  linesThisLock += cleared;
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
  linesThisLock += 1;
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
  linesThisLock = 0;
  if (POWERUP_TYPES.includes(current.type)) {
    applyPowerup(current.type, current.y, current.x);
  } else {
    merge();
  }
  clearLines();
  if (linesThisLock > 0) {
    comboCount++;
    if (comboCount > maxComboSession) maxComboSession = comboCount;
  } else {
    comboCount = 0;
  }
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  if (POWERUP_GLYPHS[colorIndex]) {
    context.font = `${size * 0.6}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(POWERUP_GLYPHS[colorIndex], x * size + size / 2, y * size + size / 2 + 1);
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

  if (maxComboSession > bestCombo) {
    bestCombo = maxComboSession;
    safeSetItem(HS_COMBO_KEY, String(bestCombo));
  }
  if (lines > maxLinesGame) {
    maxLinesGame = lines;
    safeSetItem(HS_MAXLINES_KEY, String(maxLinesGame));
  }

  hsOverlaySection.classList.remove('hidden');
  renderAllLeaderboards(null);
  if (qualifiesForHighScore(score)) {
    hsEntryForm.classList.remove('hidden');
    hsNameInput.value = '';
    hsNameInput.focus();
  } else {
    hsEntryForm.classList.add('hidden');
  }
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
    hsOverlaySection.classList.add('hidden');
    hsEntryForm.classList.add('hidden');
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
  comboCount = 0;
  maxComboSession = 0;
  linesThisLock = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  hsOverlaySection.classList.add('hidden');
  hsEntryForm.classList.add('hidden');
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

restartBtn.addEventListener('click', init);

// ---- Leaderboard / high scores ----

function loadHighScores() {
  try {
    const raw = localStorage.getItem(HS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    highScores = Array.isArray(parsed)
      ? parsed.filter(e => e && typeof e.score === 'number' && typeof e.name === 'string')
      : [];
  } catch {
    highScores = [];
  }
}

function saveHighScores() {
  try {
    localStorage.setItem(HS_KEY, JSON.stringify(highScores));
  } catch {
    // storage unavailable/full — keep playing without persistence
  }
}

function loadRecordsMeta() {
  bestCombo = Number(localStorage.getItem(HS_COMBO_KEY)) || 0;
  maxLinesGame = Number(localStorage.getItem(HS_MAXLINES_KEY)) || 0;
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable/full — keep playing without persistence
  }
}

function qualifiesForHighScore(s) {
  return highScores.length < HS_MAX_ENTRIES || s > highScores[highScores.length - 1].score;
}

function addHighScore(name, s, l) {
  const entry = { id: Date.now() + Math.random(), name: name || 'AAA', score: s, lines: l };
  highScores.push(entry);
  highScores.sort((a, b) => b.score - a.score);
  highScores = highScores.slice(0, HS_MAX_ENTRIES);
  saveHighScores();
  return entry;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderHighScoresList(el, highlightId) {
  if (!el) return;
  el.innerHTML = '';
  if (highScores.length === 0) {
    const li = document.createElement('li');
    li.className = 'hs-empty';
    li.textContent = 'Sin récords todavía';
    el.appendChild(li);
    return;
  }
  highScores.forEach((entry, i) => {
    const li = document.createElement('li');
    li.className = 'hs-entry' + (entry.id === highlightId ? ' hs-highlight' : '');
    li.innerHTML = `<span class="hs-rank">${i + 1}.</span>` +
      `<span class="hs-name">${escapeHtml(entry.name)}</span>` +
      `<span class="hs-score">${entry.score.toLocaleString()}</span>`;
    el.appendChild(li);
  });
}

function renderAllLeaderboards(highlightId) {
  renderHighScoresList(hsPanelList, highlightId);
  renderHighScoresList(hsOverlayList, highlightId);
  if (hsBestComboEl) hsBestComboEl.textContent = bestCombo;
  if (hsMaxLinesEl) hsMaxLinesEl.textContent = maxLinesGame;
}

function resetRecords() {
  if (!window.confirm('¿Resetear todos los récords guardados?')) return;
  highScores = [];
  bestCombo = 0;
  maxLinesGame = 0;
  localStorage.removeItem(HS_KEY);
  localStorage.removeItem(HS_COMBO_KEY);
  localStorage.removeItem(HS_MAXLINES_KEY);
  renderAllLeaderboards(null);
}

function submitHighScore() {
  const name = hsNameInput.value.trim().slice(0, 12) || 'AAA';
  const entry = addHighScore(name, score, lines);
  hsEntryForm.classList.add('hidden');
  renderAllLeaderboards(entry.id);
}

hsSubmitBtn.addEventListener('click', submitHighScore);
hsNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') {
    e.preventDefault();
    submitHighScore();
  }
});
hsResetBtn.addEventListener('click', resetRecords);

function initHighScores() {
  loadHighScores();
  loadRecordsMeta();
  renderAllLeaderboards(null);
}

initTheme();
initHighScores();
init();
