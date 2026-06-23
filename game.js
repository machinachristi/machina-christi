const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ── Colors ─────────────────────────────────────────────────
const C = {
  grass:      '#3D5C32',
  pathLight:  '#C8A87A',
  pathMid:    '#B89860',
  pathDark:   '#987840',
  pathLine:   'rgba(152,120,64,0.4)',
  pathEdge:   '#7A6040',
  rock:       '#8A7A6A',
  rockHi:     '#A09080',
  puddle:     'rgba(55,95,155,0.8)',
  puddleHi:   'rgba(110,160,210,0.45)',
  crossGold:  '#C9A227',
  crossFaint: 'rgba(201,162,39,0.3)',
  churchWall: '#8A7256',
  churchWall2:'#9A8266',
  churchRoof: '#5A4632',
  churchDoor: '#3A2C1E',
  churchCross:'#6A5238',
  shellBody:  '#E8D5A3',
  shellLine:  '#B8986A',
  robe:       '#7A5C18',
  skin:       '#D4A574',
  hat:        '#4A3A10',
  staff:      '#5C4020',
  uiGold:     '#FFD700',
  uiCream:    '#E8D5A3',
  overlay:    'rgba(10,20,50,0.88)',
};

// ── Layout ─────────────────────────────────────────────────
let W, H, pL, pR, pW;

function recalcLayout() {
  W = window.innerWidth;
  H = window.innerHeight;

  // Render at the device's true pixel density so it's crisp on Retina/mobile,
  // but keep drawing in CSS-pixel coordinates (W, H) via a scaled transform.
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  pW = Math.min(W * 0.72, 440);
  pL = (W - pW) / 2;
  pR = pL + pW;
}

window.addEventListener('resize', () => {
  recalcLayout();
  if (player) clampPlayer();
});
recalcLayout();

// ── State ──────────────────────────────────────────────────
let gameState = 'start';
let player, obstacles, collectibles, decorations, particles, floats, motes;
let score, speed, frame, scrollY;
let spawnTimer, collectTimer, decoTimer, moteTimer;
let nextVerse, verse;

// Scripture shown at distance milestones
const VERSES = [
  { t: 'I am the way, the truth, and the life.',        r: 'John 14:6' },
  { t: 'Your word is a lamp to my feet.',               r: 'Psalm 119:105' },
  { t: 'The Lord is my shepherd; I shall not want.',    r: 'Psalm 23:1' },
  { t: 'Walk by faith, not by sight.',                  r: '2 Cor 5:7' },
  { t: 'Be strong and courageous. Do not be afraid.',   r: 'Joshua 1:9' },
  { t: 'I can do all things through Christ.',            r: 'Phil 4:13' },
  { t: 'Come to me, all who are weary, and I will give you rest.', r: 'Matthew 11:28' },
  { t: 'The light shines in the darkness.',             r: 'John 1:5' },
];
const VERSE_EVERY = 100; // km between verses
let shake = 0;     // remaining shake frames
let flash = 0;     // remaining hit-flash frames
let lifeFlash = 0; // animates the life-lost indicator in the HUD
let bestScore = Number(localStorage.getItem('camino_best') || 0);

// First-play guide: walk the player through the four moves once, ever.
let tutorial = null;
const TUT_KEY = 'camino_tutorial_done';

const MAX_LIVES = 3;

// After dying, ignore restart input briefly so leftover swipes/keys don't
// skip past the score screen.
const RESTART_LOCK_FRAMES = 50; // ~0.8s at 60fps
let restartReadyAt = 0;
let gameOverAt = 0;             // frameCount when the player died

function canRestart() {
  return gameState !== 'playing' && frameCount >= restartReadyAt;
}

const BASE_SPEED = 2.4;
const SPEED_INC  = 0.00045;

function startGame() {
  gameState    = 'playing';
  score        = 0;
  speed        = BASE_SPEED;
  frame        = 0;
  scrollY      = 0;
  spawnTimer   = 0;
  collectTimer = 50;
  decoTimer    = 0;
  moteTimer    = 0;
  obstacles    = [];
  collectibles = [];
  decorations  = [];
  particles    = [];
  floats       = [];
  motes        = [];
  shake        = 0;
  flash        = 0;
  nextVerse    = VERSE_EVERY;
  verse        = null;

  player = {
    x:        W / 2,
    y:        H * 0.74,
    targetX:  W / 2,
    targetY:  H * 0.74,
    size:     pW * 0.15,
    lives:    MAX_LIVES,
    hitTimer: 0,
  };
  lifeFlash = 0;

  // Only guide the very first journey; retries start straight away.
  tutorial = localStorage.getItem(TUT_KEY)
    ? null
    : { steps: ['left', 'right', 'up', 'down'], idx: 0 };
}

function endGame() {
  gameState = 'gameover';
  gameOverAt = frameCount;
  restartReadyAt = frameCount + RESTART_LOCK_FRAMES;
  if (Math.floor(score) > bestScore) {
    bestScore = Math.floor(score);
    localStorage.setItem('camino_best', bestScore);
  }
}

function clampPlayer() {
  const m = player.size * 0.55;
  player.targetX = Math.max(pL + m, Math.min(pR - m, player.targetX));
  player.targetY = Math.max(H * 0.12, Math.min(H * 0.88, player.targetY));
}

// ── Input ──────────────────────────────────────────────────
const SWIPE_MIN = 22;
let touch0 = null;

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  touch0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (!touch0) return;
  const dx = e.changedTouches[0].clientX - touch0.x;
  const dy = e.changedTouches[0].clientY - touch0.y;
  touch0 = null;
  handleInput(dx, dy);
}, { passive: false });

canvas.addEventListener('click', () => {
  if (canRestart()) startGame();
});

document.addEventListener('keydown', e => {
  const dirs = { ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0] };
  if (dirs[e.key]) {
    e.preventDefault();
    const [dx, dy] = dirs[e.key];
    handleInput(dx * 80, dy * 80);
  }
  if (e.key === ' ' && canRestart()) { e.preventDefault(); startGame(); }
});

function handleInput(dx, dy) {
  if (gameState !== 'playing') { if (canRestart()) startGame(); return; }
  if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;

  const stepH = pW * 0.22;   // ~1.5 pilgrim widths — clears one obstacle per swipe
  const stepV = H  * 0.085;

  let action;
  if (Math.abs(dx) >= Math.abs(dy)) {
    action = dx > 0 ? 'right' : 'left';
    player.targetX += dx > 0 ? stepH : -stepH;
  } else {
    action = dy > 0 ? 'down' : 'up';
    player.targetY += dy > 0 ? stepV : -stepV;
  }
  clampPlayer();

  // Advance the first-play tutorial when the prompted move is performed.
  if (tutorial && action === tutorial.steps[tutorial.idx]) {
    tutorial.idx++;
    if (tutorial.idx >= tutorial.steps.length) {
      tutorial = null;
      localStorage.setItem(TUT_KEY, '1');
    }
  }
}

// ── Spawn ──────────────────────────────────────────────────
function spawnObstacle() {
  const isPuddle = Math.random() < 0.38;
  const w = isPuddle ? pW * 0.26 : pW * 0.14;
  const h = isPuddle ? pW * 0.12 : pW * 0.14;
  const margin = w * 0.5 + 4;

  let x = pL + margin + Math.random() * (pW - margin * 2);

  // Guarantee a navigable lane: if a recent obstacle is still near the top,
  // keep this one far enough away that the pilgrim can always slip between.
  const lane = player.size * 1.5 + w * 0.5;
  for (const o of obstacles) {
    if (o.y < H * 0.22 && Math.abs(o.x - x) < lane) {
      // shove to the side of the existing obstacle that has more room
      x = (o.x - pL) > pW / 2 ? o.x - lane : o.x + lane;
      x = Math.max(pL + margin, Math.min(pR - margin, x));
      break;
    }
  }

  obstacles.push({ type: isPuddle ? 'puddle' : 'rock', x, y: -h, w, h });
}

function spawnCollectible() {
  const isCross = Math.random() < 0.3;
  const size = pW * 0.11;
  const margin = size + 4;
  collectibles.push({
    type: isCross ? 'cross' : 'shell',
    x: pL + margin + Math.random() * (pW - margin * 2),
    y: -size,
    size,
    done: false,
  });
}

function spawnDecoration() {
  // Scatter churches randomly in the grass on either side.
  const grassL = pL;            // left grass width: 0..pL
  const grassR = W - pR;        // right grass width: pR..W
  const place = (gw, base) => {
    if (gw < W * 0.06) return;  // skip if grass strip too thin
    const size = W * (0.05 + Math.random() * 0.035);
    const x = base + size * 0.7 + Math.random() * Math.max(0, gw - size * 1.4);
    decorations.push({ x, y: -size, size });
  };
  if (Math.random() < 0.7) place(grassL, 0);
  if (Math.random() < 0.7) place(grassR, pR);
}

function drawChurch(x, y, size) {
  const w = size;
  const h = size * 1.1;
  ctx.save();

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(x, y + h*0.52, w*0.6, h*0.1, 0, 0, Math.PI*2);
  ctx.fill();

  // Wall (base)
  const top = y - h*0.1;
  ctx.fillStyle = C.churchWall;
  ctx.fillRect(x - w*0.5, top, w, h*0.6);
  // shaded right face for depth
  ctx.fillStyle = C.churchWall2;
  ctx.fillRect(x - w*0.5, top, w*0.5, h*0.6);

  // Peaked roof
  ctx.fillStyle = C.churchRoof;
  ctx.beginPath();
  ctx.moveTo(x - w*0.58, top);
  ctx.lineTo(x,          top - h*0.34);
  ctx.lineTo(x + w*0.58, top);
  ctx.closePath();
  ctx.fill();

  // Door
  ctx.fillStyle = C.churchDoor;
  ctx.fillRect(x - w*0.13, top + h*0.28, w*0.26, h*0.32);

  // Steeple cross
  drawCross(x, top - h*0.46, h*0.26, C.churchCross, Math.max(1.5, size*0.05));

  ctx.restore();
}

// ── Particles ──────────────────────────────────────────────
function spawnParticles(x, y, color = '#D8C8A0', count = 14) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 3.5;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 22 + Math.random() * 10,
      max:  32,
      r:    2 + Math.random() * 2.5,
      color,
    });
  }
}

// ── Collision ──────────────────────────────────────────────
function hits(p, obj, shrink = 0.38) {
  const pw = p.size * shrink;
  const ow = (obj.w || obj.size) * 0.5;
  const oh = (obj.h || obj.size) * 0.5;
  return Math.abs(p.x - obj.x) < pw + ow
      && Math.abs(p.y - obj.y) < pw + oh;
}

// ── Update ─────────────────────────────────────────────────
// dt is a frame-rate-independent factor: 1.0 at 60fps, 0.5 at 120fps, etc.
// Every continuous motion is multiplied by dt so the game runs at the same
// real-world speed and stays smooth on any refresh rate or through frame drops.
function update(dt) {
  if (gameState !== 'playing') return;

  frame  += dt;
  speed   = BASE_SPEED + frame * SPEED_INC;
  score  += speed * 0.011 * dt;
  scrollY = (scrollY + speed * dt) % (H * 0.13);

  if (player.hitTimer > 0) player.hitTimer -= dt;
  if (shake > 0) shake -= dt;
  if (flash > 0) flash -= dt;
  if (lifeFlash > 0) lifeFlash -= dt;

  // Glide pilgrim toward target (exponential smoothing, dt-corrected)
  const glide = 1 - Math.pow(1 - 0.22, dt);
  player.x += (player.targetX - player.x) * glide;
  player.y += (player.targetY - player.y) * glide;

  // Particles
  const damp = Math.pow(0.92, dt);
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= damp;
    p.vy *= damp;
    p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);

  // Floating score text drifts up and fades
  for (const f of floats) { f.y -= 1.1 * dt; f.life -= dt; }
  floats = floats.filter(f => f.life > 0);

  // Drifting light motes (grace in the air)
  moteTimer += dt;
  if (moteTimer >= 18) {
    moteTimer = 0;
    motes.push({
      x: pL + Math.random() * pW,
      y: -10,
      r: 1 + Math.random() * 2.5,
      vy: 0.4 + Math.random() * 0.6,
      sway: Math.random() * Math.PI * 2,
      a: 0.15 + Math.random() * 0.35,
    });
  }
  for (const m of motes) {
    m.y += m.vy * dt;
    m.sway += 0.03 * dt;
    m.x += Math.sin(m.sway) * 0.4 * dt;
  }
  motes = motes.filter(m => m.y < H + 10);

  // Scripture milestone
  if (score >= nextVerse) {
    const v = VERSES[Math.floor(nextVerse / VERSE_EVERY - 1) % VERSES.length];
    verse = { ...v, life: 220, max: 220 };
    nextVerse += VERSE_EVERY;
  }
  if (verse) { verse.life -= dt; if (verse.life <= 0) verse = null; }

  // Spawn timers
  spawnTimer += dt;
  const spawnInterval = Math.max(36, 88 - frame * 0.042);
  // Hold obstacles back while the first-play tutorial teaches the moves.
  if (!tutorial && spawnTimer >= spawnInterval) { spawnObstacle();  spawnTimer  = 0; }

  collectTimer += dt;
  if (collectTimer >= 105) { spawnCollectible(); collectTimer = 0; }

  decoTimer += dt;
  if (decoTimer >= 52) { spawnDecoration();  decoTimer  = 0; }

  // Scroll everything toward player
  for (const obj of obstacles)    obj.y += speed * dt;
  for (const obj of collectibles) obj.y += speed * dt;
  for (const obj of decorations)  obj.y += speed * dt;

  // Obstacle collision
  if (player.hitTimer <= 0) {
    for (const obs of obstacles) {
      if (hits(player, obs)) {
        player.lives--;
        player.hitTimer = 90;
        shake = 16;
        flash = 18;
        lifeFlash = 40;
        spawnParticles(player.x, player.y);
        obs.y = H + 200;
        if (player.lives <= 0) { endGame(); return; }
        break;
      }
    }
  }

  // Collectible collision (more forgiving hitbox)
  for (const col of collectibles) {
    if (!col.done && hits(player, col, 0.65)) {
      col.done   = true;
      const pts  = col.type === 'cross' ? 20 : 8;
      score     += pts;
      floats.push({ x: col.x, y: col.y, text: `+${pts}`, life: 45, max: 45 });
      spawnParticles(col.x, col.y, '#FFE9A0', 8);
    }
  }

  // Cleanup
  const edge = H + 160;
  obstacles    = obstacles.filter(o => o.y < edge);
  collectibles = collectibles.filter(c => c.y < edge);
  decorations  = decorations.filter(d => d.y < edge);
}

// ── Draw helpers ───────────────────────────────────────────
function drawCross(x, y, size, color, lw) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = lw;
  ctx.lineCap     = 'square';
  ctx.beginPath();
  ctx.moveTo(x,             y - size * 0.5);
  ctx.lineTo(x,             y + size * 0.5);
  ctx.moveTo(x - size*0.34, y - size * 0.13);
  ctx.lineTo(x + size*0.34, y - size * 0.13);
  ctx.stroke();
  ctx.restore();
}

function drawCollectibleCross(x, y, size) {
  ctx.save();

  // Soft cream halo so the cross pops against the sandy path
  const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 1.1);
  glow.addColorStop(0,   'rgba(255,250,225,0.85)');
  glow.addColorStop(0.5, 'rgba(255,245,200,0.4)');
  glow.addColorStop(1,   'rgba(255,245,200,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, size * 1.1, 0, Math.PI * 2);
  ctx.fill();

  const lw = Math.max(3, size * 0.26);

  // Dark backing outline for contrast
  drawCross(x, y, size * 1.15, 'rgba(60,40,10,0.55)', lw + Math.max(2, size*0.1));
  // Gold cross on top
  drawCross(x, y, size * 1.15, C.crossGold, lw);

  ctx.restore();
}

function drawShell(x, y, size) {
  const r = size * 0.52;
  ctx.save();
  ctx.fillStyle   = C.shellBody;
  ctx.strokeStyle = C.shellLine;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  for (let i = -2; i <= 2; i++) {
    const a = (i / 2.5) * (Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.sin(a) * r, y - Math.cos(a) * r);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRock(x, y, w, h) {
  ctx.save();
  ctx.fillStyle = C.rock;
  ctx.beginPath();
  ctx.ellipse(x, y, w*0.5, h*0.5, 0.25, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = C.rockHi;
  ctx.beginPath();
  ctx.ellipse(x - w*0.13, y - h*0.18, w*0.22, h*0.17, -0.3, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawPuddle(x, y, w, h) {
  ctx.save();
  ctx.fillStyle = C.puddle;
  ctx.beginPath();
  ctx.ellipse(x, y, w*0.5, h*0.5, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = C.puddleHi;
  ctx.beginPath();
  ctx.ellipse(x - w*0.14, y - h*0.12, w*0.19, h*0.17, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawPilgrim(x, y, size, hitTimer) {
  const blink = hitTimer > 0 && Math.floor(hitTimer / 5) % 2 === 0;
  if (blink) return;

  ctx.save();

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(x + size*0.07, y + size*0.38, size*0.3, size*0.09, 0, 0, Math.PI*2);
  ctx.fill();

  // Robe
  ctx.fillStyle = C.robe;
  ctx.beginPath();
  ctx.ellipse(x, y, size*0.3, size*0.4, 0, 0, Math.PI*2);
  ctx.fill();

  // Cross emblem on robe
  drawCross(x, y + size*0.04, size*0.3, C.crossGold, Math.max(1.5, size*0.065));

  // Head
  ctx.fillStyle = C.skin;
  ctx.beginPath();
  ctx.arc(x, y - size*0.36, size*0.17, 0, Math.PI*2);
  ctx.fill();

  // Hat brim
  ctx.fillStyle = C.hat;
  ctx.beginPath();
  ctx.ellipse(x, y - size*0.47, size*0.23, size*0.057, 0, 0, Math.PI*2);
  ctx.fill();

  // Hat crown
  ctx.fillRect(x - size*0.12, y - size*0.64, size*0.24, size*0.18);

  // Shell badge on hat
  ctx.fillStyle = C.shellBody;
  ctx.beginPath();
  ctx.arc(x, y - size*0.55, size*0.055, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  // Staff
  ctx.strokeStyle = C.staff;
  ctx.lineWidth   = Math.max(1.5, size * 0.048);
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x + size*0.27, y - size*0.28);
  ctx.lineTo(x + size*0.34, y + size*0.5);
  ctx.stroke();

  ctx.restore();
}

// ── Background ─────────────────────────────────────────────
function drawBackground() {
  // Grass
  ctx.fillStyle = C.grass;
  ctx.fillRect(0, 0, W, H);

  // Path gradient
  const pg = ctx.createLinearGradient(pL, 0, pR, 0);
  pg.addColorStop(0,   C.pathDark);
  pg.addColorStop(0.5, C.pathLight);
  pg.addColorStop(1,   C.pathDark);
  ctx.fillStyle = pg;
  ctx.fillRect(pL, 0, pW, H);

  // Scrolling lane lines
  ctx.strokeStyle = C.pathLine;
  ctx.lineWidth   = 1;
  const gap = H * 0.13;
  for (let i = -1; i < 10; i++) {
    const y = (i * gap + scrollY) % (H + gap * 2) - gap;
    ctx.beginPath();
    ctx.moveTo(pL + 5, y);
    ctx.lineTo(pR - 5, y);
    ctx.stroke();
  }

  // Path edges
  ctx.strokeStyle = C.pathEdge;
  ctx.lineWidth   = 2.5;
  ctx.beginPath(); ctx.moveTo(pL, 0); ctx.lineTo(pL, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pR, 0); ctx.lineTo(pR, H); ctx.stroke();

  // Divine light from above — heaven drawing the pilgrim forward
  const glow = ctx.createRadialGradient(W/2, -H*0.05, 0, W/2, -H*0.05, H*0.6);
  glow.addColorStop(0,   'rgba(255,244,200,0.55)');
  glow.addColorStop(0.4, 'rgba(255,240,190,0.22)');
  glow.addColorStop(1,   'rgba(255,240,190,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H * 0.6);
}

// ── HUD ────────────────────────────────────────────────────
function drawHUD() {
  ctx.fillStyle = C.uiGold;
  ctx.font      = `bold ${Math.max(14, W*0.048)}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.floor(score)} km`, W*0.04, H*0.068);

  const lw      = Math.max(2, W * 0.009);
  const size    = W * 0.05;
  const spacing = W * 0.078;
  const x0      = W - W*0.055;   // rightmost slot
  const y       = H * 0.052;

  // Remaining lives briefly pulse when one is lost, drawing the eye to the HUD
  const pulse = lifeFlash > 0
    ? 1 + Math.sin((40 - lifeFlash) * 0.45) * 0.13 * (lifeFlash / 40)
    : 1;

  // Always show all MAX_LIVES slots: filled = life remaining, faint = lost.
  // Keeping empty slots visible makes "you have 3, you lost one" obvious.
  for (let i = 0; i < MAX_LIVES; i++) {
    const x = x0 - i * spacing;
    if (i < player.lives) drawCross(x, y, size * pulse, C.uiGold, lw);
    else                  drawCross(x, y, size, 'rgba(255,215,0,0.2)', lw);
  }

  // Flash the just-lost slot: a red cross expanding and fading away
  if (lifeFlash > 0) {
    const t = lifeFlash / 40;                  // 1 → 0
    const x = x0 - player.lives * spacing;
    drawCross(x, y, size * (1 + (1 - t) * 0.5), `rgba(220,60,40,${t})`, lw + 1);

    // Floating "−1" rising above the lives
    ctx.globalAlpha = t;
    ctx.fillStyle = '#E84A3A';
    ctx.font = `bold ${W*0.05}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('−1', x, y - (1 - t) * H * 0.045);
    ctx.globalAlpha = 1;
  }
}

// ── First-play tutorial ────────────────────────────────────
// Prompts the four moves one at a time; obstacles are paused until done.
function drawTutorial() {
  const prompts = {
    left:  '◀   Swipe left',
    right: 'Swipe right   ▶',
    up:    '▲   Swipe up',
    down:  'Swipe down   ▼',
  };
  const step = tutorial.steps[tutorial.idx];

  ctx.save();
  ctx.textAlign = 'center';

  // Dim banner so the prompt reads clearly over the path.
  ctx.fillStyle = 'rgba(10,20,50,0.4)';
  ctx.fillRect(0, H * 0.4, W, H * 0.16);

  const pulse = 1 + Math.sin(frameCount * 0.08) * 0.05;
  ctx.fillStyle = C.uiGold;
  ctx.font = `bold ${Math.min(W * 0.075, 34) * pulse}px sans-serif`;
  ctx.fillText(prompts[step], W / 2, H * 0.475);

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = `${Math.min(W * 0.04, 18)}px sans-serif`;
  ctx.fillText(`Learn the way   ·   ${tutorial.idx + 1} / ${tutorial.steps.length}`, W / 2, H * 0.53);

  ctx.restore();
}

// ── Start screen ───────────────────────────────────────────
function drawStart() {
  ctx.fillStyle = C.grass;
  ctx.fillRect(0, 0, W, H);
  const pg = ctx.createLinearGradient(pL, 0, pR, 0);
  pg.addColorStop(0, C.pathDark); pg.addColorStop(0.5, C.pathLight); pg.addColorStop(1, C.pathDark);
  ctx.fillStyle = pg;
  ctx.fillRect(pL, 0, pW, H);

  ctx.fillStyle = C.overlay;
  ctx.fillRect(0, 0, W, H);

  const crossSize = Math.min(H * 0.19, W * 0.42);
  drawCross(W/2, H*0.28, crossSize, C.crossGold, Math.max(7, crossSize*0.065));

  ctx.fillStyle   = C.uiGold;
  ctx.font        = `bold ${Math.min(W*0.15, 72)}px serif`;
  ctx.textAlign   = 'center';
  ctx.fillText('CAMINO', W/2, H*0.52);

  ctx.fillStyle = C.uiCream;
  ctx.font      = `${Math.min(W*0.05, 22)}px serif`;
  ctx.fillText("The Pilgrim's Journey", W/2, H*0.585);

  // Lives legend: show the three crosses so players learn the life system
  const lcSize = Math.min(W*0.055, 26);
  const lcGap  = lcSize * 1.5;
  const lcY    = H * 0.66;
  const lw     = Math.max(2, W*0.009);
  for (let i = 0; i < MAX_LIVES; i++) {
    drawCross(W/2 + (i - 1) * lcGap, lcY, lcSize, C.uiGold, lw);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font      = `${Math.min(W*0.04, 17)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('3 lives — avoid rocks & water', W/2, H*0.71);

  if (bestScore > 0) {
    ctx.fillStyle = C.uiCream;
    ctx.font      = `${Math.min(W*0.045, 20)}px sans-serif`;
    ctx.fillText(`Best: ${bestScore} km`, W/2, H*0.765);
  }

  // Swipe-direction hint: four arrows around a center pilgrim dot
  drawSwipeHint(W/2, H*0.86, Math.min(W*0.11, 52));

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font      = `${Math.min(W*0.045, 19)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Swipe to guide the pilgrim', W/2, H*0.96);
}

function drawSwipeHint(cx, cy, reach) {
  // Pulse so it draws the eye
  const pulse = 1 + Math.sin(frameCount * 0.06) * 0.08;
  const r = reach * pulse;

  // Center dot (the pilgrim)
  ctx.fillStyle = C.uiGold;
  ctx.beginPath();
  ctx.arc(cx, cy, reach * 0.16, 0, Math.PI * 2);
  ctx.fill();

  const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
  ctx.strokeStyle = 'rgba(255,215,0,0.85)';
  ctx.fillStyle   = 'rgba(255,215,0,0.85)';
  ctx.lineWidth   = Math.max(2, reach * 0.05);
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  for (const [dx, dy] of dirs) {
    const sx = cx + dx * reach * 0.34, sy = cy + dy * reach * 0.34;
    const ex = cx + dx * r,           ey = cy + dy * r;
    // shaft
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    // arrowhead (perpendicular wings)
    const px = -dy, py = dx;       // perpendicular
    const hs = reach * 0.18;       // head size
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - dx*hs + px*hs*0.7, ey - dy*hs + py*hs*0.7);
    ctx.lineTo(ex - dx*hs - px*hs*0.7, ey - dy*hs - py*hs*0.7);
    ctx.closePath();
    ctx.fill();
  }
}

// ── Game over screen ───────────────────────────────────────
function drawGameOver() {
  // Ease the whole screen in over ~0.5s so it doesn't appear abruptly.
  const fadeIn = Math.min(1, (frameCount - gameOverAt) / 30);

  ctx.save();
  ctx.globalAlpha = fadeIn;

  ctx.fillStyle = C.overlay;
  ctx.fillRect(0, 0, W, H);

  const crossSize = Math.min(H * 0.13, W * 0.3);
  drawCross(W/2, H*0.26, crossSize, C.crossGold, Math.max(5, crossSize*0.065));

  ctx.fillStyle   = C.uiGold;
  ctx.font        = `bold ${Math.min(W*0.092, 44)}px serif`;
  ctx.textAlign   = 'center';
  ctx.fillText("JOURNEY'S END", W/2, H*0.47);

  ctx.fillStyle = C.uiCream;
  ctx.font      = `${Math.min(W*0.06, 28)}px sans-serif`;
  ctx.fillText(`${Math.floor(score)} km walked`, W/2, H*0.575);

  const isBest = Math.floor(score) >= bestScore && bestScore > 0;
  ctx.fillStyle = C.uiGold;
  ctx.font      = `${Math.min(W*0.045, 20)}px sans-serif`;
  ctx.fillText(isBest ? '✦ New best journey! ✦' : `Best: ${bestScore} km`, W/2, H*0.655);

  // Only invite a restart once the input lockout has cleared, fading in so it
  // reads as "now you may go again" rather than an instant tap target.
  if (canRestart()) {
    const fade = Math.min(1, (frameCount - restartReadyAt) / 25);
    ctx.fillStyle = `rgba(255,255,255,${0.52 * fade})`;
    ctx.font      = `${Math.min(W*0.04, 18)}px sans-serif`;
    ctx.fillText('Tap or press Space to walk again', W/2, H*0.76);
  }

  ctx.restore();
}

// ── Render ─────────────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, W, H);

  if (gameState === 'start') { drawStart(); return; }

  // Screen shake offset
  ctx.save();
  if (shake > 0) {
    const m = shake * 0.6;
    ctx.translate((Math.random()-0.5) * m, (Math.random()-0.5) * m);
  }

  drawBackground();

  // Light motes drifting in the holy light
  for (const m of motes) {
    ctx.globalAlpha = m.a;
    ctx.fillStyle = '#FFF6D0';
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const d of decorations) {
    drawChurch(d.x, d.y, d.size);
  }

  for (const o of obstacles) {
    if (o.type === 'rock') drawRock(o.x, o.y, o.w, o.h);
    else drawPuddle(o.x, o.y, o.w, o.h);
  }

  for (const c of collectibles) {
    if (c.done) continue;
    if (c.type === 'cross') drawCollectibleCross(c.x, c.y, c.size);
    else drawShell(c.x, c.y, c.size);
  }

  drawPilgrim(player.x, player.y, player.size, player.hitTimer);

  // Impact particles
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color || '#E8D5A3';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Floating score text
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(14, pW*0.07)}px sans-serif`;
  for (const f of floats) {
    ctx.globalAlpha = Math.min(1, f.life / 20);
    ctx.fillStyle = C.uiGold;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  ctx.restore(); // end shake

  // Red vignette flash on hit (drawn over the shaken world, full screen)
  if (flash > 0) {
    const a = (flash / 18) * 0.5;
    const vg = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.25, W/2, H/2, Math.max(W,H)*0.65);
    vg.addColorStop(0, 'rgba(120,90,40,0)');
    vg.addColorStop(1, `rgba(90,60,25,${a})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  drawHUD();
  if (verse) drawVerse();
  if (tutorial && gameState === 'playing') drawTutorial();

  if (gameState === 'gameover') drawGameOver();
}

function drawVerse() {
  // Fade in over first 40 frames, hold, fade out over last 50.
  // Peak opacity capped below 1 so the path stays visible behind it.
  const PEAK = 0.7;
  let a = PEAK;
  if (verse.life > verse.max - 40) a = PEAK * (verse.max - verse.life) / 40;
  else if (verse.life < 50)        a = PEAK * verse.life / 50;
  a = Math.max(0, Math.min(PEAK, a));

  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';

  // Wrap the verse text to the path width
  const maxW = pW * 0.92;
  const fontSize = Math.min(W * 0.058, 26);
  ctx.font = `italic ${fontSize}px Georgia, serif`;
  const words = verse.t.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);

  const lineH = fontSize * 1.35;
  const blockH = lines.length * lineH + fontSize * 1.6;
  const cy = H * 0.3 - blockH / 2;

  // Very light panel — just enough for legibility without hiding the path
  ctx.fillStyle = 'rgba(20,30,55,0.22)';
  const pad = fontSize * 0.9;
  ctx.fillRect(W/2 - maxW/2 - pad, cy - pad, maxW + pad*2, blockH + pad);

  ctx.fillStyle = C.uiCream;
  lines.forEach((ln, i) => ctx.fillText(ln, W/2, cy + fontSize + i * lineH));

  ctx.fillStyle = C.uiGold;
  ctx.font = `${fontSize * 0.78}px Georgia, serif`;
  ctx.fillText(`— ${verse.r}`, W/2, cy + fontSize + lines.length * lineH + fontSize * 0.4);

  ctx.restore();
}

// ── Loop ───────────────────────────────────────────────────
let frameCount = 0;
let lastTime = performance.now();

function loop(now) {
  // dt = elapsed time as a fraction of one 60fps frame (16.67ms).
  // Capped at 3 so a long pause (tab backgrounded) can't teleport the world.
  const dt = Math.min((now - lastTime) / (1000 / 60), 3);
  lastTime = now;
  frameCount += dt;

  update(dt);
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
