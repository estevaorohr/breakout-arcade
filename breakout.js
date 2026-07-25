const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score-display');
const phaseDisplay = document.getElementById('phase-display');
const effectsDisplay = document.getElementById('effects-display');
const statusDisplay = document.getElementById('status-display');
const livesDisplay = document.getElementById('lives-display');
const startButton = document.getElementById('start-btn');
const actionButton = document.getElementById('action-btn');
const pauseButton = document.getElementById('pause-btn');
const restartButton = document.getElementById('restart-btn');
const leaderboardList = document.getElementById('leaderboard-list');

const STORAGE_KEY = 'breakout-top-scores';
const MAX_LEADERBOARD_ENTRIES = 20;
const brickRows = 4;
const brickCols = 8;
const brickWidth = 68;
const brickHeight = 24;
const brickPadding = 10;
const brickOffsetTop = 40;
const brickOffsetLeft = 24;
const maxPhases = 10;
const baseBallSpeed = 4.8;
const phaseGrowth = 1.07;
const hazardBulletSpeedMultiplier = 1.3;

let score = 0;
let lives = 3;
let paused = false;
let gameState = 'ready';
let currentPhase = 1;
let phaseMultiplier = 1;
let phaseBallSpeed = baseBallSpeed;
let guns = [];
let bullets = [];
let turretBullets = [];
let balls = [];
let fallingItems = [];
let fallingEmitters = [];
let radioactiveZones = [];
let turrets = [];
let rouletteAnimations = [];
let pendingRouletteEffects = [];
let rouletteAnimationSeed = 1;
let waterEffect = {
  activeUntil: 0,
  startedAt: 0,
  riseDurationMs: 1200,
  levelRows: 7
};
let hammerCount = 0;
let minigunCharges = 0;
let lastTime = 0;
let nextWeaponShotAt = 0;
let weaponShotIndex = 0;
let phaseCountdownEndsAt = 0;
let autoLaunchAfterCountdown = false;
let awaitingServe = false;
let paddleBoostEndsAt = 0;
let pausedAt = 0;
let activePointerId = null;
let paddle;
let bricks = [];
const keys = { ArrowLeft: false, ArrowRight: false };

const SPECIAL_TYPES = ['extra-ball', 'double-hit', 'mushroom', 'hammer', 'extra-life', 'roulette', 'wave'];

function createBall(x, y, vx = 0, vy = 0) {
  return { x, y, vx, vy, radius: 8 };
}

function applySpecialType(brick, type) {
  brick.type = type;
  if (type === 'extra-ball') {
    brick.color = '#22d3ee';
    return;
  }

  if (type === 'double-hit') {
    brick.hp = 2;
    brick.color = '#fb923c';
    return;
  }

  if (type === 'harm-drop') {
    brick.color = '#60a5fa';
    return;
  }

  if (type === 'mushroom') {
    brick.color = '#d946ef';
    return;
  }

  if (type === 'hammer') {
    brick.color = '#f59e0b';
    return;
  }

  if (type === 'extra-life') {
    brick.color = '#f43f5e';
    return;
  }

  if (type === 'roulette') {
    brick.color = '#fde047';
    return;
  }

  if (type === 'wave') {
    brick.color = '#0ea5e9';
  }
}

function randomSpecialType(includeNuclear = true, includeExtraLife = true) {
  const base = includeExtraLife ? [...SPECIAL_TYPES] : SPECIAL_TYPES.filter((type) => type !== 'extra-life');
  const pool = includeNuclear ? [...base, 'nuclear'] : base;
  return pool[Math.floor(Math.random() * pool.length)];
}

function clampToCanvas(x, y, radius) {
  return {
    x: Math.max(radius, Math.min(canvas.width - radius, x)),
    y: Math.max(radius, Math.min(canvas.height - radius, y))
  };
}

function movePaddleByClientX(clientX) {
  if (!paddle) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;

  const scaleX = canvas.width / rect.width;
  const pointerCanvasX = (clientX - rect.left) * scaleX;
  paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, pointerCanvasX - paddle.width / 2));
}

function triggerActionPower(now = performance.now()) {
  if (gameState !== 'running' || paused) return false;

  if (minigunCharges > 0) {
    return deployMinigun(now);
  }

  if (hammerCount > 0) {
    return deployTurret(now);
  }

  statusDisplay.textContent = 'No action available right now';
  return false;
}

function shiftTimeBasedState(deltaMs) {
  if (phaseCountdownEndsAt > 0) {
    phaseCountdownEndsAt += deltaMs;
  }

  if (paddleBoostEndsAt > 0) {
    paddleBoostEndsAt += deltaMs;
  }

  if (nextWeaponShotAt > 0) {
    nextWeaponShotAt += deltaMs;
  }

  turrets.forEach((turret) => {
    turret.endsAt += deltaMs;
    turret.nextShotAt += deltaMs;
  });

  fallingEmitters.forEach((emitter) => {
    emitter.endsAt += deltaMs;
    emitter.nextDropAt += deltaMs;
  });

  radioactiveZones.forEach((zone) => {
    zone.endsAt += deltaMs;
  });

  rouletteAnimations.forEach((effect) => {
    effect.startedAt += deltaMs;
    effect.endsAt += deltaMs;
  });

  pendingRouletteEffects.forEach((effect) => {
    effect.executeAt += deltaMs;
  });

  if (waterEffect.activeUntil > 0) {
    waterEffect.activeUntil += deltaMs;
    waterEffect.startedAt += deltaMs;
  }

  balls.forEach((ball) => {
    if (ball.nuclearBoostEndsAt) {
      ball.nuclearBoostEndsAt += deltaMs;
    }
  });
}

function getPhasePercent() {
  return Math.round(phaseMultiplier * 100);
}

function isWaterEffectActive(now = performance.now()) {
  return waterEffect.activeUntil > now;
}

function getWaterTargetY() {
  const platformHeight = paddle ? paddle.height : 14;
  const target = canvas.height - platformHeight * waterEffect.levelRows;
  return Math.max(brickOffsetTop + 12, Math.min(canvas.height - 24, target));
}

function getWaterSurfaceY(now = performance.now()) {
  if (!isWaterEffectActive(now)) {
    return canvas.height + 1;
  }

  const targetY = getWaterTargetY();
  const riseProgress = Math.max(0, Math.min(1, (now - waterEffect.startedAt) / waterEffect.riseDurationMs));
  return canvas.height - (canvas.height - targetY) * riseProgress;
}

function activateWaterWave(now = performance.now()) {
  waterEffect.startedAt = now;
  waterEffect.activeUntil = now + 30000;
  statusDisplay.textContent = 'Wave activated: rising water for 30s';
}

function updateEffectsDisplay(now = performance.now()) {
  const effects = [];

  effects.push(`Hammers ${hammerCount}/3`);
  if (minigunCharges > 0) {
    effects.push(`Minigun ${minigunCharges}`);
  }

  if (paddleBoostEndsAt > now) {
    effects.push(`Mushroom ${Math.ceil((paddleBoostEndsAt - now) / 1000)}s`);
  }

  const ballBoostRemaining = balls.reduce((remaining, ball) => {
    if (!ball.nuclearBoostEndsAt) return remaining;
    return Math.max(remaining, ball.nuclearBoostEndsAt - now);
  }, 0);

  if (ballBoostRemaining > 0) {
    effects.push(`Ball boost ${Math.ceil(ballBoostRemaining / 1000)}s`);
  }

  const activeRadiation = radioactiveZones.filter((zone) => zone.endsAt > now);
  if (activeRadiation.length) {
    const remaining = Math.max(...activeRadiation.map((zone) => zone.endsAt - now));
    effects.push(`Radiation ${Math.ceil(remaining / 1000)}s`);
  }

  const toxicRain = fallingEmitters.filter((emitter) => emitter.label === 'Toxic rain' && emitter.endsAt > now);
  if (toxicRain.length) {
    const remaining = Math.max(...toxicRain.map((emitter) => emitter.endsAt - now));
    effects.push(`Toxic rain ${Math.ceil(remaining / 1000)}s`);
  }

  const nuclearRain = fallingEmitters.filter((emitter) => emitter.label === 'Nuclear rain' && emitter.endsAt > now);
  if (nuclearRain.length) {
    const remaining = Math.max(...nuclearRain.map((emitter) => emitter.endsAt - now));
    effects.push(`Nuclear rain ${Math.ceil(remaining / 1000)}s`);
  }

  const lavaRain = fallingEmitters.filter((emitter) => emitter.label === 'Lava rain' && emitter.endsAt > now);
  if (lavaRain.length) {
    const remaining = Math.max(...lavaRain.map((emitter) => emitter.endsAt - now));
    effects.push(`Lava rain ${Math.ceil(remaining / 1000)}s`);
  }

  if (isWaterEffectActive(now)) {
    effects.push(`Water ${Math.ceil((waterEffect.activeUntil - now) / 1000)}s`);
  }

  const activeTurret = turrets.filter((turret) => turret.endsAt > now);
  if (activeTurret.length) {
    const remaining = Math.max(...activeTurret.map((turret) => turret.endsAt - now));
    effects.push(`Turret ${Math.ceil(remaining / 1000)}s`);
  }

  effectsDisplay.textContent = effects.length ? `Effects: ${effects.join(' | ')}` : 'Effects: none';
}

function refreshHud(now = performance.now()) {
  updateHud(now);
  updateEffectsDisplay(now);
}

function createRadioactiveZone(brick, now = performance.now()) {
  const zone = {
    x: brick.x - brick.width - brickPadding,
    y: brick.y - brick.height - brickPadding,
    width: brick.width * 3 + brickPadding * 2,
    height: brick.height * 3 + brickPadding * 2,
    endsAt: now + 5000,
    centerX: brick.x + brick.width / 2,
    centerY: brick.y + brick.height / 2
  };

  radioactiveZones.push(zone);
  return zone;
}

function spawnTimedDropEmitter(options) {
  const now = performance.now();
  fallingEmitters.push({
    kind: options.kind,
    label: options.label,
    color: options.color,
    originX: options.originX,
    originY: options.originY,
    spreadX: options.spreadX,
    spreadY: options.spreadY,
    intervalMs: options.intervalMs,
    remainingDrops: options.totalDrops,
    nextDropAt: now,
    endsAt: now + options.durationMs,
    width: options.width || 18,
    height: options.height || 18,
    vy: options.vy || 2.2,
    driftX: options.driftX || 0
  });
}

function emitFromTimedDropEmitter(emitter) {
  const spreadX = emitter.spreadX || 0;
  const spreadY = emitter.spreadY || 0;
  const x = emitter.originX + (Math.random() * 2 - 1) * spreadX;
  const y = emitter.originY + (Math.random() * 2 - 1) * spreadY;
  const wobbleX = (Math.random() * 2 - 1) * 0.35;

  fallingItems.push({
    kind: emitter.kind,
    x,
    y,
    width: emitter.width,
    height: emitter.height,
    vy: emitter.vy,
    vx: emitter.driftX + wobbleX,
    color: emitter.color
  });
}

function updateTimedDropEmitters(now) {
  fallingEmitters = fallingEmitters.filter((emitter) => {
    while (emitter.remainingDrops > 0 && now >= emitter.nextDropAt && now <= emitter.endsAt) {
      emitFromTimedDropEmitter(emitter);
      emitter.remainingDrops -= 1;
      emitter.nextDropAt += emitter.intervalMs;
    }

    return emitter.remainingDrops > 0 && now <= emitter.endsAt;
  });
}

function deployTurret(now = performance.now()) {
  if (hammerCount <= 0) return false;

  hammerCount -= 1;
  const turret = {
    x: canvas.width - 44,
    y: canvas.height - 34,
    width: 28,
    height: 20,
    endsAt: now + 10000,
    nextShotAt: now,
    intervalMs: 2000
  };

  turrets.push(turret);
  statusDisplay.textContent = 'Turret deployed for 10s';
  return true;
}

function deployMinigun(now = performance.now()) {
  if (minigunCharges <= 0) return false;

  minigunCharges -= 1;
  turrets.push({
    x: canvas.width - 44,
    y: canvas.height - 34,
    width: 28,
    height: 20,
    endsAt: now + 10000,
    nextShotAt: now,
    intervalMs: 300,
    type: 'minigun'
  });
  statusDisplay.textContent = 'Minigun deployed for 10s';
  return true;
}

function getTurretTargetPoint() {
  const aliveBricks = bricks.filter((brick) => brick.alive);
  if (!aliveBricks.length) {
    return { x: canvas.width / 2, y: canvas.height * 0.25 };
  }

  const target = aliveBricks[Math.floor(Math.random() * aliveBricks.length)];
  return {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2
  };
}

function updateTurrets(now) {
  turrets = turrets.filter((turret) => {
    if (now >= turret.endsAt) {
      return false;
    }

    while (now >= turret.nextShotAt && now < turret.endsAt) {
      const target = getTurretTargetPoint();
      const startX = turret.x + 3;
      const startY = turret.y + turret.height / 2;
      const dx = target.x - startX;
      const dy = target.y - startY;
      const magnitude = Math.hypot(dx, dy) || 1;
      const speed = turret.type === 'minigun' ? 5.4 : 4.4;
      turretBullets.push({
        x: startX,
        y: startY,
        radius: turret.type === 'minigun' ? 3 : 4,
        vx: (dx / magnitude) * speed,
        vy: (dy / magnitude) * speed,
        color: turret.type === 'minigun' ? '#fde047' : '#facc15'
      });
      turret.nextShotAt += turret.intervalMs;
    }

    return true;
  });
}

function getBrickNeighbors(brick) {
  if (brick.row == null || brick.col == null) return [];

  return bricks.filter((candidate) => {
    if (!candidate.alive) return false;
    if (candidate.row == null || candidate.col == null) return false;
    return Math.abs(candidate.row - brick.row) <= 1 && Math.abs(candidate.col - brick.col) <= 1;
  });
}

function detonateNuclearBrick(brick, now = performance.now()) {
  const affected = getBrickNeighbors(brick);
  if (!affected.length) {
    affected.push(brick);
  }

  affected.forEach((target) => {
    target.alive = false;
  });

  const zone = createRadioactiveZone(brick, now);
  spawnTimedDropEmitter({
    kind: 'nuclear-drop',
    label: 'Nuclear rain',
    color: '#22c55e',
    originX: zone.centerX,
    originY: zone.centerY,
    spreadX: zone.width * 0.42,
    spreadY: zone.height * 0.42,
    intervalMs: 500,
    totalDrops: 5,
    durationMs: 2500,
    vy: 1.76
  });
  statusDisplay.textContent = 'Radioactive blast unleashed';
}

function applyNuclearBoost(ball, now = performance.now()) {
  ball.vx *= 1.1;
  ball.vy *= 1.1;
  ball.nuclearBoostEndsAt = now + 7000;
}

function zoneIntersectsBall(zone, ball) {
  const nearestX = Math.max(zone.x, Math.min(ball.x, zone.x + zone.width));
  const nearestY = Math.max(zone.y, Math.min(ball.y, zone.y + zone.height));
  const dx = ball.x - nearestX;
  const dy = ball.y - nearestY;
  return dx * dx + dy * dy <= ball.radius * ball.radius;
}

function drawRadioactiveZones() {
  const now = performance.now();

  radioactiveZones = radioactiveZones.filter((zone) => zone.endsAt > now);

  radioactiveZones.forEach((zone) => {
    const lifeProgress = Math.max(0, Math.min(1, (zone.endsAt - now) / 5000));
    const alpha = 0.14 + lifeProgress * 0.24;
    const pulse = 1 + Math.sin(now / 180 + zone.centerX / 40) * 0.08;
    const glowRadiusX = zone.width * (0.45 + (1 - lifeProgress) * 0.06);
    const glowRadiusY = zone.height * (0.45 + (1 - lifeProgress) * 0.06);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const glow = ctx.createRadialGradient(zone.centerX, zone.centerY, 5, zone.centerX, zone.centerY, Math.max(zone.width, zone.height));
    glow.addColorStop(0, `rgba(217, 255, 218, ${alpha + 0.12})`);
    glow.addColorStop(0.3, `rgba(74, 222, 128, ${alpha + 0.15})`);
    glow.addColorStop(0.7, `rgba(34, 197, 94, ${alpha})`);
    glow.addColorStop(1, 'rgba(15, 118, 110, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(zone.centerX, zone.centerY, glowRadiusX * pulse, glowRadiusY * pulse, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(74, 222, 128, ${alpha + 0.14})`;
    for (let i = 0; i < 10; i += 1) {
      const jitterX = Math.sin(now / 220 + i * 1.3) * 10;
      const jitterY = Math.cos(now / 260 + i * 1.1) * 8;
      const puffX = zone.centerX + jitterX + (i - 5) * (zone.width / 13);
      const puffY = zone.centerY + jitterY + Math.sin(i * 1.9) * 8;
      ctx.beginPath();
      ctx.arc(puffX, puffY, 14 + (i % 3) * 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(240, 253, 244, 0.28)';
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      const centerShift = (i - 1) * 16;
      ctx.arc(zone.centerX + centerShift, zone.centerY + 2, 5 + i * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(187, 247, 208, 0.42)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(zone.centerX, zone.centerY, Math.min(zone.width, zone.height) * 0.26, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  });
}

function getBrickStartX() {
  const totalWidth = brickCols * brickWidth + (brickCols - 1) * brickPadding;
  return (canvas.width - totalWidth) / 2;
}

function drawHeartShape(centerX, centerY, size, color) {
  const topCurveHeight = size * 0.35;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY + size * 0.45);
  ctx.bezierCurveTo(
    centerX - size * 0.55,
    centerY + size * 0.05,
    centerX - size * 0.62,
    centerY - size * 0.35,
    centerX,
    centerY - topCurveHeight
  );
  ctx.bezierCurveTo(
    centerX + size * 0.62,
    centerY - size * 0.35,
    centerX + size * 0.55,
    centerY + size * 0.05,
    centerX,
    centerY + size * 0.45
  );
  ctx.closePath();
  ctx.fill();
}

function resetWeaponCycle() {
  nextWeaponShotAt = performance.now();
  weaponShotIndex = 0;
}

function resetGame() {
  score = 0;
  lives = 3;
  paused = false;
  gameState = 'ready';
  currentPhase = 1;
  phaseMultiplier = 1;
  phaseBallSpeed = baseBallSpeed;
  guns = [];
  bullets = [];
  turretBullets = [];
  balls = [];
  fallingItems = [];
  fallingEmitters = [];
  radioactiveZones = [];
  turrets = [];
  rouletteAnimations = [];
  pendingRouletteEffects = [];
  rouletteAnimationSeed = 1;
  waterEffect.activeUntil = 0;
  waterEffect.startedAt = 0;
  hammerCount = 0;
  minigunCharges = 0;
  pausedAt = 0;
  phaseCountdownEndsAt = 0;
  autoLaunchAfterCountdown = false;
  awaitingServe = false;
  paddleBoostEndsAt = 0;
  pauseButton.textContent = 'Pause';
  initializeRound();
  updateHud();
  statusDisplay.textContent = 'Press Start to play';
  draw();
}

function initializeRound() {
  paddle = {
    baseWidth: 120,
    width: 120,
    height: 14,
    x: (canvas.width - 120) / 2,
    y: canvas.height - 28,
    speed: 7
  };

  balls = [createBall(canvas.width / 2, paddle.y - 14, 0, 0)];
  bricks = buildBricks();
  guns = buildGuns();
  bullets = [];
  turretBullets = [];
  fallingItems = [];
  fallingEmitters = [];
  radioactiveZones = [];
  turrets = [];
  rouletteAnimations = [];
  pendingRouletteEffects = [];
  rouletteAnimationSeed = 1;
  waterEffect.activeUntil = 0;
  waterEffect.startedAt = 0;
  turretBullets = [];
  fallingEmitters = [];
  phaseCountdownEndsAt = 0;
  autoLaunchAfterCountdown = false;
  awaitingServe = false;
  paddleBoostEndsAt = 0;
  resetWeaponCycle();
}

function startGame() {
  if (gameState === 'running') return;

  score = 0;
  lives = 3;
  paused = false;
  gameState = 'running';
  currentPhase = 1;
  phaseMultiplier = 1;
  phaseBallSpeed = baseBallSpeed;
  guns = [];
  bullets = [];
  turretBullets = [];
  balls = [];
  fallingItems = [];
  fallingEmitters = [];
  radioactiveZones = [];
  turrets = [];
  rouletteAnimations = [];
  pendingRouletteEffects = [];
  rouletteAnimationSeed = 1;
  waterEffect.activeUntil = 0;
  waterEffect.startedAt = 0;
  hammerCount = 0;
  minigunCharges = 0;
  pausedAt = 0;
  phaseCountdownEndsAt = 0;
  autoLaunchAfterCountdown = false;
  awaitingServe = false;
  paddleBoostEndsAt = 0;
  initializeRound();
  launchBallRandom();
  updateHud();
  statusDisplay.textContent = 'Use ← → to move';
}

function pickDistinctBrickIndices(candidates, count, blocked) {
  const selected = [];
  const available = candidates.filter((idx) => !blocked.has(idx));

  while (selected.length < count && available.length > 0) {
    const randomIndex = Math.floor(Math.random() * available.length);
    const chosen = available.splice(randomIndex, 1)[0];
    blocked.add(chosen);
    selected.push(chosen);
  }

  return selected;
}

function applySpecialBricks(created) {
  const blocked = new Set();
  const allIndices = created.map((_, index) => index);

  if (currentPhase % 2 === 1) {
    pickDistinctBrickIndices(allIndices, 1, blocked).forEach((idx) => {
      applySpecialType(created[idx], 'nuclear');
    });
  } else {
    pickDistinctBrickIndices(allIndices, 1, blocked).forEach((idx) => {
      applySpecialType(created[idx], 'harm-drop');
    });
  }

  pickDistinctBrickIndices(allIndices, 1, blocked).forEach((idx) => {
    applySpecialType(created[idx], 'extra-ball');
  });

  if (currentPhase % 2 === 1) {
    pickDistinctBrickIndices(allIndices, 1, blocked).forEach((idx) => {
      applySpecialType(created[idx], 'roulette');
    });
  }

  pickDistinctBrickIndices(allIndices, 1, blocked).forEach((idx) => {
    applySpecialType(created[idx], 'wave');
  });

  pickDistinctBrickIndices(allIndices, currentPhase, blocked).forEach((idx) => {
    applySpecialType(created[idx], 'double-hit');
  });

  pickDistinctBrickIndices(allIndices, 1, blocked).forEach((idx) => {
    applySpecialType(created[idx], 'mushroom');
  });

  pickDistinctBrickIndices(allIndices, 1, blocked).forEach((idx) => {
    applySpecialType(created[idx], 'hammer');
  });

  pickDistinctBrickIndices(allIndices, 1, blocked).forEach((idx) => {
    applySpecialType(created[idx], 'extra-life');
  });
}

function buildBricks() {
  const created = [];

  if (currentPhase === 3) {
    const centerX = canvas.width / 2 - 40;
    const centerY = brickOffsetTop + 1 * (brickHeight + brickPadding);
    const bossBlocks = [
      { row: 0, col: 0, x: centerX - 90, y: centerY, width: 80, height: 28, alive: true, color: '#facc15', boss: true, hp: 1, type: 'normal' },
      { row: 0, col: 1, x: centerX, y: centerY, width: 80, height: 28, alive: true, color: '#a855f7', boss: true, hp: 5, hits: 0, type: 'boss-core' },
      { row: 0, col: 2, x: centerX + 90, y: centerY, width: 80, height: 28, alive: true, color: '#facc15', boss: true, hp: 1, type: 'normal' },
      { row: 1, col: 0, x: centerX - 90, y: centerY + 40, width: 80, height: 28, alive: true, color: '#facc15', boss: true, hp: 1, type: 'normal' },
      { row: 1, col: 1, x: centerX, y: centerY + 40, width: 80, height: 28, alive: true, color: '#facc15', boss: true, hp: 1, type: 'normal' },
      { row: 1, col: 2, x: centerX + 90, y: centerY + 40, width: 80, height: 28, alive: true, color: '#facc15', boss: true, hp: 1, type: 'normal' },
      { row: 2, col: 0, x: centerX - 90, y: centerY + 80, width: 80, height: 28, alive: true, color: '#facc15', boss: true, hp: 1, type: 'normal' },
      { row: 2, col: 1, x: centerX, y: centerY + 80, width: 80, height: 28, alive: true, color: '#facc15', boss: true, hp: 1, type: 'normal' },
      { row: 2, col: 2, x: centerX + 90, y: centerY + 80, width: 80, height: 28, alive: true, color: '#facc15', boss: true, hp: 1, type: 'normal' }
    ];

    const nonBossIndices = [0, 2, 3, 4, 5, 6, 7, 8];
    const rainIndex = nonBossIndices[Math.floor(Math.random() * nonBossIndices.length)];
    applySpecialType(bossBlocks[rainIndex], 'nuclear');

    const remaining = nonBossIndices.filter((index) => index !== rainIndex);
    const rouletteIndex = remaining[Math.floor(Math.random() * remaining.length)];
    applySpecialType(bossBlocks[rouletteIndex], 'roulette');

    const remainingAfterRoulette = remaining.filter((index) => index !== rouletteIndex);
    const waveIndex = remainingAfterRoulette[Math.floor(Math.random() * remainingAfterRoulette.length)];
    applySpecialType(bossBlocks[waveIndex], 'wave');

    const remainingAfterWave = remainingAfterRoulette.filter((index) => index !== waveIndex);
    const heartIndex = remainingAfterWave[Math.floor(Math.random() * remainingAfterWave.length)];
    applySpecialType(bossBlocks[heartIndex], 'extra-life');

    const remainingAfterHeart = remainingAfterWave.filter((index) => index !== heartIndex);
    const randomIndex = remainingAfterHeart[Math.floor(Math.random() * remainingAfterHeart.length)];
    const phase3Specials = ['extra-ball', 'double-hit', 'mushroom', 'hammer'];
    const randomType = phase3Specials[Math.floor(Math.random() * phase3Specials.length)];
    applySpecialType(bossBlocks[randomIndex], randomType);

    created.push(...bossBlocks);
    return created;
  }

  for (let row = 0; row < brickRows; row += 1) {
    if (currentPhase === 6 && row === 0) {
      continue;
    }

    const rowStartX = getBrickStartX();

    for (let col = 0; col < brickCols; col += 1) {
      created.push({
        row,
        col,
        x: rowStartX + col * (brickWidth + brickPadding),
        y: brickOffsetTop + row * (brickHeight + brickPadding),
        width: brickWidth,
        height: brickHeight,
        alive: true,
        color: ['#fb7185', '#f59e0b', '#38bdf8', '#34d399'][row % 4],
        boss: false,
        type: 'normal',
        hp: 1,
        hits: 0
      });
    }
  }

  applySpecialBricks(created);
  return created;
}

function buildGuns() {
  if (currentPhase === 3) {
    return [
      { x: 120, y: 24, width: 24, height: 18, color: '#ef4444', kind: 'pistol', mobile: false },
      { x: 308, y: 24, width: 24, height: 18, color: '#22c55e', kind: 'pistol', mobile: false },
      { x: 496, y: 24, width: 24, height: 18, color: '#3b82f6', kind: 'pistol', mobile: false }
    ];
  }

  if (currentPhase === 6) {
    return [
      { x: 120, y: brickOffsetTop, width: 34, height: 20, color: '#f97316', kind: 'bazooka', mobile: true, vx: 1.35, vy: 0, motion: 'horizontal', startOffsetMs: 0, intervalMs: 3000 },
      { x: 440, y: brickOffsetTop, width: 34, height: 20, color: '#eab308', kind: 'bazooka', mobile: true, vx: -1.35, vy: 0, motion: 'horizontal', startOffsetMs: 1500, intervalMs: 3000 }
    ];
  }

  return [];
}

function startNextPhase() {
  currentPhase += 1;
  if (currentPhase > maxPhases) {
    currentPhase = maxPhases;
  }

  phaseMultiplier = Math.pow(phaseGrowth, currentPhase - 1);
  phaseBallSpeed = baseBallSpeed * phaseMultiplier;
  bricks = buildBricks();
  guns = buildGuns();
  bullets = [];
  turretBullets = [];
  fallingItems = [];
  fallingEmitters = [];
  radioactiveZones = [];
  turrets = [];
  rouletteAnimations = [];
  pendingRouletteEffects = [];
  rouletteAnimationSeed = 1;
  waterEffect.activeUntil = 0;
  waterEffect.startedAt = 0;
  turretBullets = [];
  fallingEmitters = [];
  if (balls.length) {
    balls.forEach((ball) => {
      const magnitude = Math.hypot(ball.vx, ball.vy) || 0;
      if (magnitude > 0) {
        const scale = phaseBallSpeed / magnitude;
        ball.vx *= scale;
        ball.vy *= scale;
      } else {
        launchBallRandom(ball);
      }
    });
  }
  phaseCountdownEndsAt = performance.now() + 3000;
  autoLaunchAfterCountdown = false;
  awaitingServe = false;
  resetWeaponCycle();
  updateHud();
  statusDisplay.textContent = `Phase ${currentPhase} starts in 3...`;
}

function updateHud(now = performance.now()) {
  scoreDisplay.textContent = `Score: ${score}`;
  phaseDisplay.textContent = `Phase ${currentPhase} • Speed ${getPhasePercent()}%`;
  livesDisplay.textContent = `Lives: ${lives}`;
  updateEffectsDisplay(now);
}

function launchBallRandom(ball = balls[0]) {
  if (!ball) return;
  const angleMin = -130;
  const angleMax = -50;
  const angleDeg = angleMin + Math.random() * (angleMax - angleMin);
  const angle = (angleDeg * Math.PI) / 180;
  ball.vx = Math.cos(angle) * phaseBallSpeed;
  ball.vy = Math.sin(angle) * phaseBallSpeed;
  awaitingServe = false;
}

function spawnExtraBallFrom(sourceBall, spawnedBalls) {
  const speed = Math.hypot(sourceBall.vx, sourceBall.vy) || phaseBallSpeed;
  const mirroredVx = -sourceBall.vx || speed * 0.75;
  const vyDirection = sourceBall.vy <= 0 ? -1 : 1;
  const vyMagnitude = Math.sqrt(Math.max(1, speed * speed - mirroredVx * mirroredVx));
  const extraBall = createBall(sourceBall.x, sourceBall.y, mirroredVx, vyMagnitude * vyDirection);
  extraBall.radioactive = Boolean(sourceBall.radioactive);
  spawnedBalls.push(extraBall);
}

function spawnDelayedExtraBall(originX, originY, sourceVx = 0, sourceVy = -phaseBallSpeed) {
  const speed = Math.max(phaseBallSpeed, Math.hypot(sourceVx, sourceVy) || phaseBallSpeed);
  const randomDrift = (Math.random() - 0.5) * speed * 0.5;
  let vx = sourceVx * 0.35 + randomDrift;
  const maxVx = speed * 0.92;
  vx = Math.max(-maxVx, Math.min(maxVx, vx));
  const vy = -Math.sqrt(Math.max(1, speed * speed - vx * vx));
  const spawnPoint = clampToCanvas(originX, originY, 8);
  balls.push(createBall(spawnPoint.x, spawnPoint.y, vx, vy));
}

function loseLife(messageOnSurvive) {
  if (gameState !== 'running') return true;

  lives = Math.max(0, lives - 1);
  updateHud();
  bullets = [];
  fallingItems = [];
  paddle.width = paddle.baseWidth;
  paddleBoostEndsAt = 0;

  if (lives <= 0) {
    endGame('Game over');
    return true;
  }

  balls = [createBall(paddle.x + paddle.width / 2, paddle.y - 14, 0, 0)];
  awaitingServe = true;
  statusDisplay.textContent = `${messageOnSurvive} — press Enter to continue`;
  return false;
}

function spawnFallingItem(kind, x, y, color, vy = 2.2) {
  fallingItems.push({
    kind,
    x,
    y,
    width: 18,
    height: 18,
    vy,
    color
  });
}

function spawnHarmRain(brick, now = performance.now()) {
  spawnTimedDropEmitter({
    kind: 'harm-drop',
    label: 'Toxic rain',
    color: '#60a5fa',
    originX: canvas.width / 2,
    originY: canvas.height * 0.2,
    spreadX: canvas.width * 0.5,
    spreadY: canvas.height * 0.4,
    intervalMs: 1000,
    totalDrops: 15,
    durationMs: 15000,
    vy: 2.2
  });
}

function spawnLavaRain(brick, now = performance.now()) {
  spawnTimedDropEmitter({
    kind: 'lava-drop',
    label: 'Lava rain',
    color: '#f97316',
    originX: brick.x + brick.width / 2,
    originY: brick.y + brick.height / 2,
    spreadX: canvas.width * 0.46,
    spreadY: canvas.height * 0.35,
    intervalMs: 1000,
    totalDrops: 10,
    durationMs: 10000,
    vy: 2.3
  });
}

function spawnDropBurst(dropCount = 6) {
  for (let i = 0; i < dropCount; i += 1) {
    const randomX = Math.random() * (canvas.width - 18);
    const randomY = Math.random() * (canvas.height * 0.45);
    spawnFallingItem('harm-drop', randomX, randomY, '#60a5fa', 2.2 + Math.random() * 0.4);
  }
}

function resolveRouletteEffects(now = performance.now()) {
  if (!pendingRouletteEffects.length) return;

  const readyEffects = [];
  pendingRouletteEffects = pendingRouletteEffects.filter((effect) => {
    if (effect.executeAt <= now) {
      readyEffects.push(effect);
      return false;
    }
    return true;
  });

  readyEffects.forEach((effect) => {
    const brick = effect.sourceBrick;

    const animation = rouletteAnimations.find((entry) => entry.id === effect.animationId);
    const goodResult = Math.random() < 0.5;
    if (animation) {
      animation.resultColor = goodResult ? 'green' : 'red';
      animation.rotation = Math.round(animation.rotation / Math.PI) * Math.PI;
    }

    let outcome;
    if (goodResult) {
      const goodRoll = Math.floor(Math.random() * 3);
      outcome = goodRoll === 0 ? 'extra-life' : goodRoll === 1 ? 'hammer' : 'extra-ball';
    } else {
      const badRoll = Math.floor(Math.random() * 3);
      outcome = badRoll === 0 ? 'acid-rain' : badRoll === 1 ? 'toxic-drops' : 'lava-rain';
    }

    if (outcome === 'extra-life') {
      spawnFallingItem('heart', brick.x + brick.width / 2 - 9, brick.y + brick.height / 2 - 9, '#f43f5e', 2.25);
      statusDisplay.textContent = 'Roulette: extra life';
      return;
    }

    if (outcome === 'hammer') {
      spawnFallingItem('hammer', brick.x + brick.width / 2 - 9, brick.y + brick.height / 2 - 9, '#f59e0b', 2.35);
      statusDisplay.textContent = 'Roulette: hammer';
      return;
    }

    if (outcome === 'extra-ball') {
      spawnDelayedExtraBall(brick.x + brick.width / 2, brick.y + brick.height / 2, effect.sourceVx, effect.sourceVy);
      statusDisplay.textContent = 'Roulette: extra ball';
      return;
    }

    if (outcome === 'acid-rain') {
      spawnHarmRain(brick, now);
      statusDisplay.textContent = 'Roulette: acid rain';
      return;
    }

    if (outcome === 'toxic-drops') {
      spawnDropBurst(6);
      statusDisplay.textContent = 'Roulette: toxic drops';
      return;
    }

    spawnLavaRain(brick, now);
    statusDisplay.textContent = 'Roulette: lava rain';
  });
}

function activateRouletteEffect(ball, brick, spawnedBalls, now) {
  const animationId = rouletteAnimationSeed;
  rouletteAnimationSeed += 1;

  rouletteAnimations.push({
    id: animationId,
    x: brick.x,
    y: brick.y,
    width: brick.width,
    height: brick.height,
    startedAt: now,
    endsAt: now + 2000,
    spinEndsAt: now + 2000,
    resultColor: null,
    rotation: 0
  });

  pendingRouletteEffects.push({
    executeAt: now + 2000,
    animationId,
    sourceVx: ball.vx,
    sourceVy: ball.vy,
    sourceBrick: {
      x: brick.x,
      y: brick.y,
      width: brick.width,
      height: brick.height
    }
  });

  statusDisplay.textContent = 'Roulette spinning...';
}

function applyMushroomBoost(now) {
  paddle.width = paddle.baseWidth * 1.5;
  paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
  paddleBoostEndsAt = now + 10000;
  statusDisplay.textContent = 'Mushroom boost! Paddle enlarged for 10s';
}

function updateMobileWeapons(delta) {
  guns.forEach((gun) => {
    if (!gun.mobile) return;

    if (gun.motion === 'horizontal') {
      gun.x += gun.vx * delta;
      if (gun.x <= 0 || gun.x + gun.width >= canvas.width) {
        gun.vx *= -1;
        gun.x = Math.max(0, Math.min(canvas.width - gun.width, gun.x));
      }
      return;
    }

    gun.x += gun.vx * delta;
    gun.y += gun.vy * delta;

    const topBound = 20;
    const bottomBound = canvas.height / 2 - gun.height - 10;
    if (gun.x <= 0 || gun.x + gun.width >= canvas.width) {
      gun.vx *= -1;
      gun.x = Math.max(0, Math.min(canvas.width - gun.width, gun.x));
    }

    if (gun.y <= topBound || gun.y >= bottomBound) {
      gun.vy *= -1;
      gun.y = Math.max(topBound, Math.min(bottomBound, gun.y));
    }
  });
}

function fireFromGun(gun) {
  if (gun.kind === 'pistol') {
    const targetX = paddle.x + paddle.width / 2;
    const targetY = paddle.y + paddle.height / 2;
    const startX = gun.x + gun.width / 2;
    const startY = gun.y + gun.height;
    const dx = targetX - startX;
    const dy = targetY - startY;
    const magnitude = Math.hypot(dx, dy) || 1;
    const speed = 3.5 * hazardBulletSpeedMultiplier;

    bullets.push({
      x: startX,
      y: startY,
      radius: 5,
      vx: (dx / magnitude) * speed,
      vy: (dy / magnitude) * speed,
      color: gun.color
    });
    return;
  }

  if (gun.kind === 'bazooka') {
    for (let i = 0; i < 2; i += 1) {
      const angle = (55 + Math.random() * 70) * (Math.PI / 180);
      const speed = (3.2 + Math.random() * 0.8) * hazardBulletSpeedMultiplier;
      bullets.push({
        x: gun.x + gun.width / 2,
        y: gun.y + gun.height,
        radius: 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: gun.color
      });
    }
  }
}

function updateWeaponFire(now) {
  if (!guns.length) return;

  const perGunIntervalMs = currentPhase === 3 ? 3000 * 1.35 : 3000;
  const stepMs = perGunIntervalMs / guns.length;
  while (now >= nextWeaponShotAt) {
    const gun = guns[weaponShotIndex % guns.length];
    fireFromGun(gun);
    weaponShotIndex = (weaponShotIndex + 1) % guns.length;
    nextWeaponShotAt += stepMs;
  }
}

function handleBrickCollision(ball, brick, previousBallX, previousBallY, spawnedBalls, now) {
  if (brick.type === 'nuclear') {
    score += Math.round(14 * phaseMultiplier);
    updateHud(now);
    detonateNuclearBrick(brick, now);
    applyNuclearBoost(ball, now);
  } else if (brick.type === 'boss-core') {
    brick.hits = (brick.hits || 0) + 1;
    score += Math.round(10 * phaseMultiplier);
    updateHud(now);
    statusDisplay.textContent = `Boss core hit ${brick.hits}/5`;

    if (brick.hits >= 5) {
      brick.alive = false;
      statusDisplay.textContent = `Secret boss defeated! +${Math.round(50 * phaseMultiplier)} pts`;
    }
  } else if (brick.type === 'double-hit' && brick.hp > 1) {
    brick.hp -= 1;
    brick.hits = (brick.hits || 0) + 1;
    score += Math.round(6 * phaseMultiplier);
    updateHud(now);
  } else {
    brick.alive = false;
    score += Math.round(10 * phaseMultiplier);
    updateHud(now);

    if (brick.type === 'extra-ball') {
      spawnExtraBallFrom(ball, spawnedBalls);
      statusDisplay.textContent = 'Extra ball activated';
    } else if (brick.type === 'roulette') {
      activateRouletteEffect(ball, brick, spawnedBalls, now);
    } else if (brick.type === 'wave') {
      activateWaterWave(now);
    } else if (brick.type === 'harm-drop') {
      spawnHarmRain(brick, now);
      statusDisplay.textContent = 'Watch out: toxic rain';
    } else if (brick.type === 'mushroom') {
      spawnFallingItem('mushroom', brick.x + brick.width / 2 - 9, brick.y + brick.height / 2 - 9, undefined, 2.2 * 1.38);
      statusDisplay.textContent = 'Catch the mushroom power-up';
    } else if (brick.type === 'hammer') {
      spawnFallingItem('hammer', brick.x + brick.width / 2 - 9, brick.y + brick.height / 2 - 9, '#f59e0b', 2.35);
      statusDisplay.textContent = 'Catch the hammer power-up';
    } else if (brick.type === 'extra-life') {
      spawnFallingItem('heart', brick.x + brick.width / 2 - 9, brick.y + brick.height / 2 - 9, '#f43f5e', 2.25);
      statusDisplay.textContent = 'Catch the extra life heart';
    }
  }

  const previousLeft = previousBallX - ball.radius;
  const previousRight = previousBallX + ball.radius;
  const previousTop = previousBallY - ball.radius;
  const previousBottom = previousBallY + ball.radius;
  const currentLeft = ball.x - ball.radius;
  const currentRight = ball.x + ball.radius;
  const currentTop = ball.y - ball.radius;
  const currentBottom = ball.y + ball.radius;

  const hitFromLeftSide = previousRight <= brick.x && currentRight > brick.x;
  const hitFromRightSide = previousLeft >= brick.x + brick.width && currentLeft < brick.x + brick.width;
  const hitFromTopSide = previousBottom <= brick.y && currentBottom > brick.y;
  const hitFromBottomSide = previousTop >= brick.y + brick.height && currentTop < brick.y + brick.height;

  if ((hitFromLeftSide || hitFromRightSide) && !(hitFromTopSide || hitFromBottomSide)) {
    ball.vx *= -1;
  } else if ((hitFromTopSide || hitFromBottomSide) && !(hitFromLeftSide || hitFromRightSide)) {
    ball.vy *= -1;
  } else {
    const overlapLeft = Math.abs(currentRight - brick.x);
    const overlapRight = Math.abs(brick.x + brick.width - currentLeft);
    const overlapTop = Math.abs(currentBottom - brick.y);
    const overlapBottom = Math.abs(brick.y + brick.height - currentTop);
    const minHorizontalOverlap = Math.min(overlapLeft, overlapRight);
    const minVerticalOverlap = Math.min(overlapTop, overlapBottom);

    if (minHorizontalOverlap < minVerticalOverlap) {
      ball.vx *= -1;
    } else {
      ball.vy *= -1;
    }
  }
}

function update(delta) {
  if (gameState !== 'running' || paused) return;

  const now = performance.now();
  resolveRouletteEffects(now);
  updateEffectsDisplay(now);

  if (phaseCountdownEndsAt > 0) {
    const remaining = Math.ceil((phaseCountdownEndsAt - now) / 1000);
    if (remaining > 0) {
      statusDisplay.textContent = `Phase ${currentPhase} starts in ${remaining}...`;
      return;
    }

    phaseCountdownEndsAt = 0;
    statusDisplay.textContent = `Phase ${currentPhase} — speed ${getPhasePercent()}%`;
    if (autoLaunchAfterCountdown) {
      launchBallRandom();
      autoLaunchAfterCountdown = false;
    }
  }

  updateTimedDropEmitters(now);
  updateTurrets(now);

  if (waterEffect.activeUntil > 0 && now >= waterEffect.activeUntil) {
    waterEffect.activeUntil = 0;
    waterEffect.startedAt = 0;
  }

  if (awaitingServe) {
    const primaryBall = balls[0];
    if (primaryBall) {
      primaryBall.x = paddle.x + paddle.width / 2;
      primaryBall.y = paddle.y - 14;
    }
    return;
  }

  if (paddleBoostEndsAt > 0 && now > paddleBoostEndsAt) {
    paddle.width = paddle.baseWidth;
    paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
    paddleBoostEndsAt = 0;
  }

  const waterActive = isWaterEffectActive(now);
  const paddleSpeedFactor = waterActive ? 0.6 : 1;

  if (keys.ArrowLeft) {
    paddle.x = Math.max(0, paddle.x - paddle.speed * paddleSpeedFactor * delta);
  }
  if (keys.ArrowRight) {
    paddle.x = Math.min(canvas.width - paddle.width, paddle.x + paddle.speed * paddleSpeedFactor * delta);
  }

  updateMobileWeapons(delta);
  updateWeaponFire(now);

  bullets = bullets.filter((bullet) => {
    if (gameState !== 'running') return false;

    bullet.x += bullet.vx * delta;
    bullet.y += bullet.vy * delta;

    if (bullet.x - bullet.radius <= 0) {
      bullet.x = bullet.radius;
      bullet.vx = Math.abs(bullet.vx);
    } else if (bullet.x + bullet.radius >= canvas.width) {
      bullet.x = canvas.width - bullet.radius;
      bullet.vx = -Math.abs(bullet.vx);
    }

    if (bullet.y - bullet.radius <= 0) {
      bullet.y = bullet.radius;
      bullet.vy = Math.abs(bullet.vy);
    }

    if (
      bullet.x + bullet.radius > paddle.x &&
      bullet.x - bullet.radius < paddle.x + paddle.width &&
      bullet.y + bullet.radius > paddle.y &&
      bullet.y - bullet.radius < paddle.y + paddle.height
    ) {
      loseLife('Bullet hit! Life lost');
      return false;
    }

    return bullet.y < canvas.height + 40;
  });

  turretBullets = turretBullets.filter((bullet) => {
    bullet.x += bullet.vx * delta;
    bullet.y += bullet.vy * delta;

    if (bullet.x - bullet.radius <= 0) {
      bullet.x = bullet.radius;
      bullet.vx = Math.abs(bullet.vx);
    } else if (bullet.x + bullet.radius >= canvas.width) {
      bullet.x = canvas.width - bullet.radius;
      bullet.vx = -Math.abs(bullet.vx);
    }

    if (bullet.y - bullet.radius <= 0) {
      bullet.y = bullet.radius;
      bullet.vy = Math.abs(bullet.vy);
    } else if (bullet.y + bullet.radius >= canvas.height) {
      bullet.y = canvas.height - bullet.radius;
      bullet.vy = -Math.abs(bullet.vy);
    }

    for (const brick of bricks) {
      if (!brick.alive) continue;

      const hit =
        bullet.x + bullet.radius > brick.x &&
        bullet.x - bullet.radius < brick.x + brick.width &&
        bullet.y + bullet.radius > brick.y &&
        bullet.y - bullet.radius < brick.y + brick.height;

      if (!hit) continue;

      brick.alive = false;
      score += Math.round(8 * phaseMultiplier);
      updateHud(now);
      return false;
    }

    return true;
  });

  fallingItems = fallingItems.filter((item) => {
    item.x += (item.vx || 0) * delta;
    item.y += item.vy * delta;

    if (item.x < 0) {
      item.x = 0;
      item.vx = Math.abs(item.vx || 0);
    } else if (item.x + item.width > canvas.width) {
      item.x = canvas.width - item.width;
      item.vx = -Math.abs(item.vx || 0);
    }

    const intersectsPaddle =
      item.x + item.width > paddle.x &&
      item.x < paddle.x + paddle.width &&
      item.y + item.height > paddle.y &&
      item.y < paddle.y + paddle.height;

    if (intersectsPaddle) {
      if (item.kind === 'harm-drop' || item.kind === 'nuclear-drop' || item.kind === 'lava-drop') {
        loseLife('Toxic drop hit! Life lost');
      } else if (item.kind === 'mushroom') {
        applyMushroomBoost(now);
      } else if (item.kind === 'hammer') {
        hammerCount += 1;
        if (hammerCount >= 3) {
          hammerCount = 0;
          minigunCharges += 1;
          statusDisplay.textContent = `Minigun ready (${minigunCharges})`;
        } else {
          statusDisplay.textContent = `Hammer collected (${hammerCount}/3)`;
        }
      } else if (item.kind === 'heart') {
        lives += 1;
        updateHud(now);
        statusDisplay.textContent = `Extra life gained (${lives})`;
      }
      return false;
    }

    return item.y < canvas.height + 20;
  });

  if (gameState !== 'running') return;

  const survivingBalls = [];
  const spawnedBalls = [];
  let ballsLostThisFrame = 0;

  balls.forEach((ball) => {
    const previousBallX = ball.x;
    const previousBallY = ball.y;
    const ballBoostActive = ball.nuclearBoostEndsAt && ball.nuclearBoostEndsAt > now;

    if (ball.nuclearBoostEndsAt && ball.nuclearBoostEndsAt <= now) {
      delete ball.nuclearBoostEndsAt;
    }

    const waterSurfaceY = getWaterSurfaceY(now);
    const ballInWater = waterActive && ball.y + ball.radius >= waterSurfaceY;
    const ballWaterFactor = ballInWater ? 0.6 : 1;

    ball.x += ball.vx * delta * ballWaterFactor;
    ball.y += ball.vy * delta * ballWaterFactor;

    if (ball.x - ball.radius <= 0) {
      ball.x = ball.radius;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x + ball.radius >= canvas.width) {
      ball.x = canvas.width - ball.radius;
      ball.vx = -Math.abs(ball.vx);
    }

    if (ball.y - ball.radius <= 0) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy);
    }

    if (
      ball.y + ball.radius >= paddle.y &&
      ball.y - ball.radius <= paddle.y + paddle.height &&
      ball.x + ball.radius >= paddle.x &&
      ball.x - ball.radius <= paddle.x + paddle.width &&
      ball.vy > 0
    ) {
      ball.y = paddle.y - ball.radius;
      const hitPosition = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
      const speed = Math.max(phaseBallSpeed, Math.hypot(ball.vx, ball.vy));
      ball.vx = hitPosition * speed * 0.9;
      ball.vy = -Math.sqrt(Math.max(1, speed * speed - ball.vx * ball.vx));
    }

    radioactiveZones.forEach((zone) => {
      if (zone.endsAt > now && zoneIntersectsBall(zone, ball)) {
        ball.nuclearBoostEndsAt = Math.max(ball.nuclearBoostEndsAt || 0, now + 7000);
        ball.radioactive = true;
      }
    });

    for (const brick of bricks) {
      if (!brick.alive) continue;

      const hitLeft = ball.x + ball.radius > brick.x && ball.x - ball.radius < brick.x + brick.width;
      const hitTop = ball.y + ball.radius > brick.y && ball.y - ball.radius < brick.y + brick.height;

      if (hitLeft && hitTop) {
        handleBrickCollision(ball, brick, previousBallX, previousBallY, spawnedBalls, now);
        break;
      }
    }

    if (ball.y - ball.radius > canvas.height) {
      ballsLostThisFrame += 1;
      return;
    }

    if (ballBoostActive) {
      ball.radioactive = true;
    } else if (!ball.nuclearBoostEndsAt) {
      ball.radioactive = false;
    }

    survivingBalls.push(ball);
  });

  balls = survivingBalls.concat(spawnedBalls);

  if (ballsLostThisFrame > 0 && survivingBalls.length === 0 && spawnedBalls.length === 0 && gameState === 'running') {
    loseLife('Ball lost');
    return;
  }

  if (bricks.every((brick) => !brick.alive)) {
    if (currentPhase < maxPhases) {
      startNextPhase();
      return;
    }

    endGame('You cleared the board!');
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawWaterEffect();
  drawBricks();
  drawRadioactiveZones();
  drawRouletteAnimations();
  drawFallingItems();
  drawGuns();
  drawBullets();
  drawTurretBullets();
  drawTurrets();
  drawPaddle();
  drawBalls();
  drawHammerInventory();
  drawPhaseCountdownOverlay();
}

function drawPaddle() {
  const isBoosted = paddleBoostEndsAt > performance.now();

  if (!isBoosted) {
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    return;
  }

  const stemWidth = paddle.width * 0.36;
  const stemX = paddle.x + (paddle.width - stemWidth) / 2;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(stemX, paddle.y + 4, stemWidth, paddle.height - 3);

  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.ellipse(paddle.x + paddle.width / 2, paddle.y + 4, paddle.width / 2, paddle.height, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(paddle.x + paddle.width * 0.32, paddle.y + 3, 2.5, 0, Math.PI * 2);
  ctx.arc(paddle.x + paddle.width * 0.5, paddle.y + 1.5, 2, 0, Math.PI * 2);
  ctx.arc(paddle.x + paddle.width * 0.68, paddle.y + 3, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawBalls() {
  balls.forEach((ball) => {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = (ball.nuclearBoostEndsAt && ball.nuclearBoostEndsAt > performance.now()) || ball.radioactive ? '#22c55e' : '#f8fafc';
    ctx.fill();

    if ((ball.nuclearBoostEndsAt && ball.nuclearBoostEndsAt > performance.now()) || ball.radioactive) {
      ctx.strokeStyle = '#bbf7d0';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  });
}

function drawBricks() {
  bricks.forEach((brick) => {
    if (!brick.alive) return;

    ctx.fillStyle = brick.color;
    ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);

    if (brick.type === 'boss-core') {
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${brick.hits || 0}/5`, brick.x + brick.width / 2, brick.y + brick.height / 2 + 4);
      return;
    }

    if (brick.type === 'nuclear') {
      ctx.fillStyle = '#dcfce7';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('☢', brick.x + brick.width / 2, brick.y + brick.height / 2 + 6);
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.95)';
      ctx.beginPath();
      ctx.arc(brick.x + brick.width / 2, brick.y + brick.height / 2, 10, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    if (brick.type === 'double-hit') {
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${brick.hp}x`, brick.x + brick.width / 2, brick.y + brick.height / 2 + 4);
    } else if (brick.type === 'extra-ball') {
      ctx.fillStyle = '#083344';
      ctx.beginPath();
      ctx.arc(brick.x + brick.width / 2, brick.y + brick.height / 2, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(brick.x + brick.width / 2 - 4, brick.y + brick.height / 2);
      ctx.lineTo(brick.x + brick.width / 2 + 4, brick.y + brick.height / 2);
      ctx.moveTo(brick.x + brick.width / 2, brick.y + brick.height / 2 - 4);
      ctx.lineTo(brick.x + brick.width / 2, brick.y + brick.height / 2 + 4);
      ctx.stroke();
      ctx.lineWidth = 1;
    } else if (brick.type === 'harm-drop') {
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      ctx.moveTo(brick.x + brick.width / 2, brick.y + 6);
      ctx.lineTo(brick.x + brick.width / 2 - 6, brick.y + 16);
      ctx.lineTo(brick.x + brick.width / 2 + 6, brick.y + 16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#dbeafe';
      ctx.fillText('!', brick.x + brick.width / 2, brick.y + brick.height / 2 + 4);
    } else if (brick.type === 'mushroom') {
      ctx.fillStyle = '#4a044e';
      ctx.beginPath();
      ctx.ellipse(brick.x + brick.width / 2, brick.y + 10, 8, 5, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fdf4ff';
      ctx.fillRect(brick.x + brick.width / 2 - 2, brick.y + 10, 4, 8);
    } else if (brick.type === 'hammer') {
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(brick.x + brick.width / 2 - 2, brick.y + 8, 4, 10);
      ctx.fillStyle = '#9a3412';
      ctx.fillRect(brick.x + brick.width / 2 - 8, brick.y + 6, 16, 4);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(brick.x + brick.width / 2 + 5, brick.y + 8, 2, 5);
    } else if (brick.type === 'extra-life') {
      drawHeartShape(brick.x + brick.width / 2, brick.y + brick.height / 2, 11, '#fff1f2');
    } else if (brick.type === 'roulette') {
      ctx.beginPath();
      ctx.moveTo(brick.x + brick.width / 2, brick.y + brick.height / 2);
      ctx.fillStyle = '#22c55e';
      ctx.arc(brick.x + brick.width / 2, brick.y + brick.height / 2, 8, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(brick.x + brick.width / 2, brick.y + brick.height / 2);
      ctx.fillStyle = '#ef4444';
      ctx.arc(brick.x + brick.width / 2, brick.y + brick.height / 2, 8, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#111827';
      ctx.beginPath();
      ctx.arc(brick.x + brick.width / 2, brick.y + brick.height / 2, 8.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (brick.type === 'wave') {
      ctx.strokeStyle = '#dbeafe';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const startX = brick.x + 10;
      const endX = brick.x + brick.width - 10;
      const baseY = brick.y + brick.height / 2 + 2;
      ctx.moveTo(startX, baseY);
      for (let x = startX; x <= endX; x += 4) {
        const t = (x - startX) / (endX - startX);
        const y = baseY + Math.sin(t * Math.PI * 3) * 3;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  });
}

function drawRouletteAnimations() {
  const now = performance.now();
  rouletteAnimations = rouletteAnimations.filter((effect) => effect.endsAt > now);

  rouletteAnimations.forEach((effect) => {
    const elapsed = now - effect.startedAt;
    const total = effect.spinEndsAt - effect.startedAt;
    const progress = Math.max(0, Math.min(1, elapsed / Math.max(1, total)));
    const spin = progress * Math.PI * 14;
    const centerX = effect.x + effect.width / 2;
    const centerY = effect.y + effect.height / 2;
    const radius = Math.min(effect.width, effect.height) * 0.45;
    const pulse = 0.85 + Math.sin(progress * Math.PI * 8) * 0.15;

    ctx.save();
    ctx.translate(centerX, centerY);

    const isSpinning = now < effect.spinEndsAt;
    if (isSpinning) {
      effect.rotation = spin;
    }

    ctx.rotate(effect.rotation);
    ctx.globalAlpha = 0.95;

    if (isSpinning) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.fillStyle = '#22c55e';
      ctx.arc(0, 0, radius * pulse, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.fillStyle = '#ef4444';
      ctx.arc(0, 0, radius * pulse, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = effect.resultColor === 'green' ? '#22c55e' : '#ef4444';
      ctx.fill();
    }

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}

function drawWaterEffect() {
  const now = performance.now();
  if (!isWaterEffectActive(now)) return;

  const surfaceY = getWaterSurfaceY(now);
  const height = canvas.height - surfaceY;
  if (height <= 1) return;

  const gradient = ctx.createLinearGradient(0, surfaceY, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(56, 189, 248, 0.32)');
  gradient.addColorStop(1, 'rgba(8, 47, 73, 0.62)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, surfaceY, canvas.width, height);

  ctx.strokeStyle = 'rgba(186, 230, 253, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= canvas.width; x += 8) {
    const waveY = surfaceY + Math.sin((x + now * 0.18) * 0.06) * 4;
    if (x === 0) {
      ctx.moveTo(x, waveY);
    } else {
      ctx.lineTo(x, waveY);
    }
  }
  ctx.stroke();
  ctx.lineWidth = 1;
}

function drawGuns() {
  guns.forEach((gun) => {
    ctx.fillStyle = gun.color;
    ctx.fillRect(gun.x, gun.y, gun.width, gun.height);

    ctx.fillStyle = '#111827';
    const barrelY = gun.y + gun.height / 2 - 2;
    const barrelWidth = gun.kind === 'bazooka' ? 12 : 8;
    ctx.fillRect(gun.x + gun.width - 2, barrelY, barrelWidth, 4);
  });
}

function drawBullets() {
  bullets.forEach((bullet) => {
    const magnitude = Math.hypot(bullet.vx, bullet.vy) || 1;
    const lineLength = 1200;
    const lineEndX = bullet.x + (bullet.vx / magnitude) * lineLength;
    const lineEndY = bullet.y + (bullet.vy / magnitude) * lineLength;

    ctx.beginPath();
    ctx.moveTo(bullet.x, bullet.y);
    ctx.lineTo(lineEndX, lineEndY);
    ctx.strokeStyle = bullet.color || '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fillStyle = bullet.color || '#fbbf24';
    ctx.fill();
  });
}

function drawTurretBullets() {
  turretBullets.forEach((bullet) => {
    const magnitude = Math.hypot(bullet.vx, bullet.vy) || 1;
    const lineLength = 1200;
    const lineEndX = bullet.x + (bullet.vx / magnitude) * lineLength;
    const lineEndY = bullet.y + (bullet.vy / magnitude) * lineLength;

    ctx.beginPath();
    ctx.moveTo(bullet.x, bullet.y);
    ctx.lineTo(lineEndX, lineEndY);
    ctx.strokeStyle = bullet.color || '#facc15';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fillStyle = bullet.color || '#facc15';
    ctx.fill();
  });
}

function drawTurrets() {
  turrets.forEach((turret) => {
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(turret.x, turret.y, turret.width, turret.height);
    ctx.fillStyle = '#111827';
    ctx.fillRect(turret.x - 8, turret.y + turret.height / 2 - 2, 12, 4);
  });
}

function drawHammerInventory() {
  const size = 16;
  const gap = 8;
  const startX = canvas.width - (size + gap) * 3 - 12;
  const y = 10;

  for (let i = 0; i < 3; i += 1) {
    const x = startX + i * (size + gap);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(x, y, size, size);

    if (i >= hammerCount) continue;

    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(x + 7, y + 6, 2, 7);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(x + 3, y + 4, 10, 3);
  }

  if (minigunCharges > 0) {
    ctx.fillStyle = '#fde047';
    ctx.fillRect(startX - 30, y + 3, 16, 10);
    ctx.fillStyle = '#111827';
    ctx.fillRect(startX - 35, y + 6, 8, 4);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`x${minigunCharges}`, startX - 11, y + 12);
  }
}

function drawFallingItems() {
  fallingItems.forEach((item) => {
    if (item.kind === 'harm-drop' || item.kind === 'nuclear-drop' || item.kind === 'lava-drop') {
      ctx.fillStyle = item.color || (item.kind === 'nuclear-drop' ? '#22c55e' : item.kind === 'lava-drop' ? '#f97316' : '#60a5fa');
      ctx.beginPath();
      ctx.moveTo(item.x + item.width / 2, item.y);
      ctx.lineTo(item.x, item.y + item.height);
      ctx.lineTo(item.x + item.width, item.y + item.height);
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (item.kind === 'mushroom') {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.ellipse(item.x + item.width / 2, item.y + item.height * 0.45, item.width * 0.5, item.height * 0.32, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(item.x + item.width * 0.42, item.y + item.height * 0.45, item.width * 0.16, item.height * 0.4);
      return;
    }

    if (item.kind === 'hammer') {
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(item.x + 8, item.y + 5, 3, 10);
      ctx.fillStyle = '#9a3412';
      ctx.fillRect(item.x + 2, item.y + 3, 14, 4);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(item.x + 12, item.y + 6, 2, 5);
      return;
    }

    if (item.kind === 'heart') {
      drawHeartShape(item.x + item.width / 2, item.y + item.height / 2 + 1, 12, '#f43f5e');
    }
  });
}

function drawPhaseCountdownOverlay() {
  if (phaseCountdownEndsAt <= 0 || gameState !== 'running') return;

  const remaining = Math.max(0, Math.ceil((phaseCountdownEndsAt - performance.now()) / 1000));
  if (remaining <= 0) return;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 42px Arial';
  ctx.fillText(`${remaining}`, canvas.width / 2, canvas.height / 2);
  ctx.font = 'bold 20px Arial';
  ctx.fillText(`Phase ${currentPhase}`, canvas.width / 2, canvas.height / 2 + 40);
}

function endGame(message) {
  gameState = 'over';
  paused = false;
  awaitingServe = false;
  autoLaunchAfterCountdown = false;
  phaseCountdownEndsAt = 0;
  pauseButton.textContent = 'Pause';
  statusDisplay.textContent = message;
  saveHighScore();
}

function promptForPlayerName() {
  return new Promise((resolve) => {
    const modal = document.getElementById('name-modal');
    const customNameRow = document.getElementById('custom-name-row');
    const customNameInput = document.getElementById('custom-name-input');
    const confirmCustomButton = document.getElementById('confirm-custom-name');
    const optionButtons = Array.from(document.querySelectorAll('.name-option'));

    const closeModal = () => {
      modal.classList.add('hidden');
      customNameRow.classList.add('hidden');
      customNameInput.value = '';
    };

    const finish = (name) => {
      closeModal();
      resolve(name || 'Anonymous');
    };

    optionButtons.forEach((button) => {
      button.onclick = () => {
        if (button.dataset.name === 'Other') {
          customNameRow.classList.remove('hidden');
          customNameInput.focus();
          return;
        }

        finish(button.dataset.name);
      };
    });

    confirmCustomButton.onclick = () => {
      finish(customNameInput.value.trim());
    };

    modal.onclick = (event) => {
      if (event.target === modal) {
        finish('Anonymous');
      }
    };

    modal.classList.remove('hidden');
  });
}

async function saveHighScore() {
  if (score <= 0) return;

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const qualifies = stored.length < MAX_LEADERBOARD_ENTRIES || score > (stored[stored.length - 1]?.score || 0);
    if (!qualifies) {
      return;
    }

    const selectedName = await promptForPlayerName();
    const entry = {
      name: selectedName || 'Anonymous',
      score,
      date: new Date().toLocaleDateString('en-CA')
    };

    const updated = [...stored, entry].sort((a, b) => b.score - a.score).slice(0, MAX_LEADERBOARD_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    renderLeaderboard(updated);
  } catch (error) {
    console.error('Unable to save leaderboard:', error);
  }
}

function renderLeaderboard(entries) {
  leaderboardList.innerHTML = '';

  if (!entries.length) {
    leaderboardList.innerHTML = '<li>No scores yet.</li>';
    return;
  }

  entries.forEach((entry) => {
    const item = document.createElement('li');
    item.innerHTML = `<strong>${entry.name}</strong> — ${entry.score} pts <span>(${entry.date})</span>`;
    leaderboardList.appendChild(item);
  });
}

function loadLeaderboard() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    renderLeaderboard(stored);
  } catch (error) {
    console.error('Unable to load leaderboard:', error);
    renderLeaderboard([]);
  }
}

function loop(timestamp) {
  if (!lastTime) {
    lastTime = timestamp;
  }

  const delta = Math.min((timestamp - lastTime) / 16.67, 2);
  lastTime = timestamp;
  update(delta);
  draw();
  requestAnimationFrame(loop);
}

function togglePause() {
  if (gameState !== 'running') return;

  if (!paused) {
    paused = true;
    pausedAt = performance.now();
    pauseButton.textContent = 'Resume';
    statusDisplay.textContent = 'Paused';
    return;
  }

  paused = false;
  const now = performance.now();
  const freezeDuration = pausedAt ? now - pausedAt : 0;
  if (freezeDuration > 0) {
    shiftTimeBasedState(freezeDuration);
  }
  pausedAt = 0;
  pauseButton.textContent = 'Pause';
  statusDisplay.textContent = 'Keep going!';
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (gameState === 'running') {
      event.preventDefault();
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)) {
        active.blur();
      }
    }
    keys[event.key] = true;
  }

  if (event.key === 'Escape' && gameState === 'running') {
    event.preventDefault();
    togglePause();
  }

  if (event.code === 'Enter') {
    event.preventDefault();
    if (gameState === 'ready' || gameState === 'over') {
      startGame();
    } else if (gameState === 'running' && awaitingServe && !paused && phaseCountdownEndsAt <= 0) {
      launchBallRandom();
      statusDisplay.textContent = 'Use ← → to move';
    }
  }

  if (event.code === 'Space') {
    event.preventDefault();
    if (gameState === 'running' && !paused) {
      if (minigunCharges > 0) {
        deployMinigun(performance.now());
      } else if (hammerCount > 0) {
        deployTurret(performance.now());
      }
    } else if (gameState === 'ready' || gameState === 'over') {
      startGame();
    }
  }
});

window.addEventListener('keyup', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (gameState === 'running') {
      event.preventDefault();
    }
    keys[event.key] = false;
  }
});

startButton.addEventListener('click', () => {
  startGame();
});

pauseButton.addEventListener('click', togglePause);
restartButton.addEventListener('click', () => {
  resetGame();
});

if (actionButton) {
  actionButton.addEventListener('click', () => {
    triggerActionPower(performance.now());
  });
}

canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  activePointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  movePaddleByClientX(event.clientX);

  if (gameState === 'running' && awaitingServe && !paused && phaseCountdownEndsAt <= 0) {
    launchBallRandom();
    statusDisplay.textContent = 'Use arrows or drag to move';
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (activePointerId !== event.pointerId) return;
  event.preventDefault();
  movePaddleByClientX(event.clientX);
});

canvas.addEventListener('pointerup', (event) => {
  if (activePointerId !== event.pointerId) return;
  activePointerId = null;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
});

canvas.addEventListener('pointercancel', (event) => {
  if (activePointerId !== event.pointerId) return;
  activePointerId = null;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.error('Service worker registration failed:', error);
    });
  });
}

resetGame();
loadLeaderboard();
requestAnimationFrame(loop);
