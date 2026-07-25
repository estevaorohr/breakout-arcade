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
const maxPhases = Number.POSITIVE_INFINITY;
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
let evilHands = [];
let rouletteAnimations = [];
let pendingRouletteEffects = [];
let rouletteAnimationSeed = 1;
let guessShots = [];
let deceptivePhase = {
  stage: 'idle',
  targetBrick: null,
  capturedBall: null,
  stageStartedAt: 0,
  stageEndsAt: 0,
  nextSwapAt: 0,
  shuffleEndsAt: 0
};
let waterEffect = {
  activeUntil: 0,
  startedAt: 0,
  riseDurationMs: 1200,
  levelRows: 7,
  surgeUntil: 0
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
let mushroomBounceUntil = 0;
let mushroomBounceStartedAt = 0;
let paddleSnaredUntil = 0;
let paddleOverdriveUntil = 0;
let pausedAt = 0;
let activePointerId = null;
let activePointerStartX = 0;
let activePointerStartY = 0;
let activePointerStartAt = 0;
let paddle;
let bricks = [];
const keys = { ArrowLeft: false, ArrowRight: false };

const SPECIAL_TYPES = ['extra-ball', 'double-hit', 'mushroom', 'hammer', 'extra-life', 'roulette', 'wave', 'evil'];

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
    return;
  }

  if (type === 'evil') {
    brick.color = '#111111';
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
  const targetX = Math.max(0, Math.min(canvas.width - paddle.width, pointerCanvasX - paddle.width / 2));
  if (paddleSnaredUntil > performance.now()) {
    paddle.x += (targetX - paddle.x) * 0.15;
    return;
  }
  paddle.x = targetX;
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

  if (mushroomBounceUntil > 0) {
    mushroomBounceUntil += deltaMs;
    mushroomBounceStartedAt += deltaMs;
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
    if (waterEffect.surgeUntil > 0) {
      waterEffect.surgeUntil += deltaMs;
    }
  }

  if (deceptivePhase.stageEndsAt > 0) deceptivePhase.stageEndsAt += deltaMs;
  if (deceptivePhase.stageStartedAt > 0) deceptivePhase.stageStartedAt += deltaMs;
  if (deceptivePhase.nextSwapAt > 0) deceptivePhase.nextSwapAt += deltaMs;
  if (deceptivePhase.shuffleEndsAt > 0) deceptivePhase.shuffleEndsAt += deltaMs;

  if (paddleSnaredUntil > 0) {
    paddleSnaredUntil += deltaMs;
  }

  if (paddleOverdriveUntil > 0) {
    paddleOverdriveUntil += deltaMs;
  }

  evilHands.forEach((hand) => {
    if (hand.pauseUntil) hand.pauseUntil += deltaMs;
    if (hand.releaseAt) hand.releaseAt += deltaMs;
    if (hand.disappearAt) hand.disappearAt += deltaMs;
  });

  balls.forEach((ball) => {
    if (ball.nuclearBoostEndsAt) {
      ball.nuclearBoostEndsAt += deltaMs;
    }
  });
}

function getPhasePercent() {
  return Math.round(phaseMultiplier * 100);
}

function getPhaseTitle() {
  return currentPhase === 5 ? 'Fase Enganadora' : `Phase ${currentPhase}`;
}

function isWaterEffectActive(now = performance.now()) {
  return waterEffect.activeUntil > now;
}

function isWaveSurgeActive(now = performance.now()) {
  return waterEffect.surgeUntil > now;
}

function getWaterSlowFactor(now = performance.now()) {
  if (!isWaterEffectActive(now)) return 1;
  return isWaveSurgeActive(now) ? 0.4 : 0.6;
}

function getWaterTargetY() {
  const platformHeight = paddle ? paddle.height : 14;
  const rows = isWaveSurgeActive() ? waterEffect.levelRows * 2 : waterEffect.levelRows;
  const target = canvas.height - platformHeight * rows;
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
  waterEffect.activeUntil = now + 20000;
  waterEffect.surgeUntil = 0;
  statusDisplay.textContent = 'Wave activated: rising water for 20s';
}

function absorbRainIntoWave(item, now) {
  if (!isWaterEffectActive(now)) return false;

  const rainyKinds = new Set(['rain-drop', 'acid-cloud', 'lava-meteor', 'nuclear-drop', 'harm-drop', 'lava-drop']);
  if (!rainyKinds.has(item.kind)) return false;

  const surfaceY = getWaterSurfaceY(now);
  if (item.y + item.height < surfaceY) return false;

  if (!isWaveSurgeActive(now)) {
    waterEffect.surgeUntil = now + 5000;
    statusDisplay.textContent = 'Wave surge! Water height doubled for 5s';
  }

  waterEffect.activeUntil += 1000;
  return true;
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
    driftX: options.driftX || 0,
    fromTop: Boolean(options.fromTop)
  });
}

function emitFromTimedDropEmitter(emitter) {
  const spreadX = emitter.spreadX || 0;
  const spreadY = emitter.spreadY || 0;
  const x = emitter.originX + (Math.random() * 2 - 1) * spreadX;
  const y = emitter.fromTop ? -emitter.height : emitter.originY + (Math.random() * 2 - 1) * spreadY;
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
    intervalMs: 400,
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
      const shotCount = currentPhase === 7 && turret.kind === 'bazooka' ? (Math.random() < 0.5 ? 1 : 2) : 1;
      for (let shot = 0; shot < shotCount; shot += 1) {
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
          color: turret.type === 'minigun' ? '#c084fc' : '#a855f7'
        });
      }
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
  evilHands = [];
  guessShots = [];
  rouletteAnimations = [];
  pendingRouletteEffects = [];
  rouletteAnimationSeed = 1;
  waterEffect.activeUntil = 0;
  waterEffect.startedAt = 0;
  waterEffect.surgeUntil = 0;
  deceptivePhase = { stage: 'idle', targetBrick: null, capturedBall: null, stageStartedAt: 0, stageEndsAt: 0, nextSwapAt: 0, shuffleEndsAt: 0 };
  paddleSnaredUntil = 0;
  paddleOverdriveUntil = 0;
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
  evilHands = [];
  guessShots = [];
  rouletteAnimations = [];
  pendingRouletteEffects = [];
  rouletteAnimationSeed = 1;
  waterEffect.activeUntil = 0;
  waterEffect.startedAt = 0;
  waterEffect.surgeUntil = 0;
  deceptivePhase = { stage: 'idle', targetBrick: null, capturedBall: null, stageStartedAt: 0, stageEndsAt: 0, nextSwapAt: 0, shuffleEndsAt: 0 };
  paddleSnaredUntil = 0;
  paddleOverdriveUntil = 0;
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
  evilHands = [];
  guessShots = [];
  rouletteAnimations = [];
  pendingRouletteEffects = [];
  rouletteAnimationSeed = 1;
  waterEffect.activeUntil = 0;
  waterEffect.startedAt = 0;
  waterEffect.surgeUntil = 0;
  deceptivePhase = { stage: 'idle', targetBrick: null, capturedBall: null, stageStartedAt: 0, stageEndsAt: 0, nextSwapAt: 0, shuffleEndsAt: 0 };
  paddleSnaredUntil = 0;
  paddleOverdriveUntil = 0;
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

  pickDistinctBrickIndices(allIndices, 1, blocked).forEach((idx) => {
    applySpecialType(created[idx], 'evil');
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

  if (currentPhase === 5) {
    const count = 5;
    const deceptiveWidth = 86;
    const deceptiveHeight = 30;
    const gap = 20;
    const totalWidth = count * deceptiveWidth + (count - 1) * gap;
    const startX = (canvas.width - totalWidth) / 2;
    const y = brickOffsetTop + 56;

    for (let i = 0; i < count; i += 1) {
      created.push({
        row: 0,
        col: i,
        x: startX + i * (deceptiveWidth + gap),
        y,
        width: deceptiveWidth,
        height: deceptiveHeight,
        alive: true,
        color: '#7c3aed',
        boss: false,
        type: 'deceptive',
        hp: 1,
        hits: 0
      });
    }

    return created;
  }

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
    applySpecialType(bossBlocks[rainIndex], 'harm-drop');

    const remaining = nonBossIndices.filter((index) => index !== rainIndex);
    const rouletteIndex = remaining[Math.floor(Math.random() * remaining.length)];
    applySpecialType(bossBlocks[rouletteIndex], 'roulette');

    const remainingAfterRoulette = remaining.filter((index) => index !== rouletteIndex);
    const evilIndex = remainingAfterRoulette[Math.floor(Math.random() * remainingAfterRoulette.length)];
    applySpecialType(bossBlocks[evilIndex], 'evil');

    const remainingAfterEvil = remainingAfterRoulette.filter((index) => index !== evilIndex);
    const heartIndex = remainingAfterEvil[Math.floor(Math.random() * remainingAfterEvil.length)];
    applySpecialType(bossBlocks[heartIndex], 'extra-life');

    const remainingAfterHeart = remainingAfterEvil.filter((index) => index !== heartIndex);
    const randomIndex = remainingAfterHeart[Math.floor(Math.random() * remainingAfterHeart.length)];
    const phase3Specials = ['extra-ball', 'double-hit', 'mushroom', 'hammer'];
    const randomType = phase3Specials[Math.floor(Math.random() * phase3Specials.length)];
    applySpecialType(bossBlocks[randomIndex], randomType);

    created.push(...bossBlocks);
    return created;
  }

  for (let row = 0; row < brickRows; row += 1) {
    if (currentPhase === 7 && row === 0) {
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

  if (currentPhase === 7) {
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
  evilHands = [];
  guessShots = [];
  rouletteAnimations = [];
  pendingRouletteEffects = [];
  rouletteAnimationSeed = 1;
  waterEffect.activeUntil = 0;
  waterEffect.startedAt = 0;
  waterEffect.surgeUntil = 0;
  deceptivePhase = { stage: 'idle', targetBrick: null, capturedBall: null, stageStartedAt: 0, stageEndsAt: 0, nextSwapAt: 0, shuffleEndsAt: 0 };
  paddleSnaredUntil = 0;
  paddleOverdriveUntil = 0;
  turretBullets = [];
  fallingEmitters = [];
  if (balls.length) {
    if (currentPhase === 5) {
      balls = [balls[0]];
    }
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
  statusDisplay.textContent = `${getPhaseTitle()} starts in 3...`;
}

function updateHud(now = performance.now()) {
  scoreDisplay.textContent = `Score: ${score}`;
  phaseDisplay.textContent = `${getPhaseTitle()} • Speed ${getPhasePercent()}%`;
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
  guessShots = [];
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
  const largeKinds = new Set(['mushroom', 'hammer', 'heart']);
  const size = largeKinds.has(kind) ? 36 : 18;
  const adjustedX = largeKinds.has(kind) ? x - 9 : x;
  const adjustedY = largeKinds.has(kind) ? y - 9 : y;
  fallingItems.push({
    kind,
    x: adjustedX,
    y: adjustedY,
    width: size,
    height: size,
    vy,
    color
  });
}

function spawnHarmRain(brick, now = performance.now()) {
  spawnTimedDropEmitter({
    kind: 'rain-drop',
    label: 'Rain',
    color: '#7dd3fc',
    originX: canvas.width / 2,
    originY: brickOffsetTop,
    spreadX: canvas.width * 0.48,
    spreadY: 0,
    intervalMs: 1000,
    totalDrops: 15,
    durationMs: 15000,
    vy: 1.76,
    fromTop: true
  });
}

function spawnAcidRain(brick, now = performance.now()) {
  spawnTimedDropEmitter({
    kind: 'acid-cloud',
    label: 'Acid rain',
    color: '#84cc16',
    originX: canvas.width / 2,
    originY: brickOffsetTop,
    spreadX: canvas.width * 0.48,
    spreadY: 0,
    intervalMs: 1000,
    totalDrops: 15,
    durationMs: 15000,
    vy: 1.76,
    width: 18,
    height: 13,
    fromTop: true
  });
}

function spawnLavaRain(brick, now = performance.now()) {
  spawnTimedDropEmitter({
    kind: 'lava-meteor',
    label: 'Lava rain',
    color: '#7f1d1d',
    originX: canvas.width / 2,
    originY: brickOffsetTop,
    spreadX: canvas.width * 0.48,
    spreadY: 0,
    intervalMs: 1000,
    totalDrops: 10,
    durationMs: 10000,
    vy: 2.645,
    width: 29,
    height: 29,
    fromTop: true
  });
}

function spawnDropBurst(dropCount = 6) {
  for (let i = 0; i < dropCount; i += 1) {
    const randomX = Math.random() * (canvas.width - 18);
    const randomY = Math.random() * (canvas.height * 0.45);
    spawnFallingItem('acid-cloud', randomX, randomY, '#84cc16', 1.76 + Math.random() * 0.25);
  }
}

function spawnEvilHand(brick, now = performance.now()) {
  evilHands.push({
    x: brick.x + brick.width / 2 - 18,
    y: brick.y + brick.height,
    width: 36,
    height: 54,
    vy: 2.625,
    state: 'descending',
    capturedBall: null,
    canCatchBallAt: now + 800,
    releaseAt: 0,
    pauseUntil: 0,
    disappearAt: 0
  });
}

function launchBallToRandomCorner(ball, now = performance.now()) {
  if (!ball) return;

  const margin = 26;
  const corners = [
    { x: margin, y: margin },
    { x: canvas.width - margin, y: margin },
    { x: margin, y: canvas.height * 0.52 },
    { x: canvas.width - margin, y: canvas.height * 0.52 }
  ];
  const corner = corners[Math.floor(Math.random() * corners.length)];
  ball.x = corner.x;
  ball.y = corner.y;

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const dx = centerX - ball.x;
  const dy = centerY - ball.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  const speed = phaseBallSpeed * 1.15;
  let vx = (dx / magnitude) * speed;
  let vy = (dy / magnitude) * speed;

  // Keep launch angle at least 15 degrees away from the horizontal axis.
  const minVertical = speed * Math.sin(Math.PI / 12);
  if (Math.abs(vy) < minVertical) {
    vy = Math.sign(vy || (Math.random() < 0.5 ? -1 : 1)) * minVertical;
    const horizontal = Math.sqrt(Math.max(1, speed * speed - vy * vy));
    vx = Math.sign(vx || (Math.random() < 0.5 ? -1 : 1)) * horizontal;
  }

  ball.vx = vx;
  ball.vy = vy;
  ball.malignBoostEndsAt = now + 3000;
}

function updateEvilHands(now, delta) {
  if (!evilHands.length) return;

  evilHands = evilHands.filter((hand) => {
    if (hand.disappearAt && now >= hand.disappearAt) {
      return false;
    }

    if (hand.state === 'holding-paddle') {
      if (now >= hand.releaseAt) {
        paddleOverdriveUntil = now + 10000;
        hand.disappearAt = now;
        return false;
      }
      hand.x = paddle.x + paddle.width / 2 - hand.width / 2;
      hand.y = paddle.y - hand.height + 2;
      return true;
    }

    if (hand.state === 'holding-ball') {
      const ball = hand.capturedBall;
      if (!ball) return false;

      ball.x = hand.x + hand.width / 2;
      ball.y = hand.y + hand.height * 0.55;
      if (now >= hand.releaseAt) {
        launchBallToRandomCorner(ball, now);
        hand.disappearAt = now;
        return false;
      }
      return true;
    }

    if (hand.state === 'waiting') {
      const paddleOverlap =
        hand.x + hand.width > paddle.x &&
        hand.x < paddle.x + paddle.width &&
        hand.y + hand.height > paddle.y &&
        hand.y < paddle.y + paddle.height;

      if (paddleOverlap) {
        paddleSnaredUntil = now + 1000;
        hand.state = 'holding-paddle';
        hand.releaseAt = now + 1000;
        hand.x = paddle.x + paddle.width / 2 - hand.width / 2;
        hand.y = paddle.y - hand.height + 2;
        statusDisplay.textContent = 'Evil hand trapped the paddle';
        return true;
      }

      if (now >= hand.pauseUntil) {
        return false;
      }
      return true;
    }

    hand.y += hand.vy * delta;

    const paddleOverlap =
      hand.x + hand.width > paddle.x &&
      hand.x < paddle.x + paddle.width &&
      hand.y + hand.height > paddle.y &&
      hand.y < paddle.y + paddle.height;

    if (paddleOverlap) {
      paddleSnaredUntil = now + 1000;
      hand.state = 'holding-paddle';
      hand.releaseAt = now + 1000;
      hand.x = paddle.x + paddle.width / 2 - hand.width / 2;
      hand.y = paddle.y - hand.height + 2;
      statusDisplay.textContent = 'Evil hand trapped the paddle';
      return true;
    }

    const ball = now >= hand.canCatchBallAt ? balls.find((candidate) => {
      if (!candidate) return false;
      return (
        candidate.x + candidate.radius > hand.x &&
        candidate.x - candidate.radius < hand.x + hand.width &&
        candidate.y + candidate.radius > hand.y &&
        candidate.y - candidate.radius < hand.y + hand.height
      );
    }) : null;

    if (ball) {
      hand.state = 'holding-ball';
      hand.capturedBall = ball;
      hand.releaseAt = now + 2000;
      ball.handFrozenUntil = hand.releaseAt;
      statusDisplay.textContent = 'Evil hand grabbed the ball';
      return true;
    }

    if (hand.y + hand.height >= paddle.y) {
      hand.y = paddle.y - hand.height;
      hand.state = 'waiting';
      hand.pauseUntil = now + 3000;
      return true;
    }

    return true;
  });
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
      spawnAcidRain(brick, now);
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
    endsAt: now + 3000,
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
    const speedModifier = currentPhase === 3 ? 0.85 : 1;
    const speed = 3.5 * hazardBulletSpeedMultiplier * speedModifier;

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
    const shotCount = currentPhase === 7 ? (Math.random() < 0.5 ? 1 : 2) : 2;
    for (let i = 0; i < shotCount; i += 1) {
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

function fireDeceptiveShot() {
  if (currentPhase !== 5 || deceptivePhase.stage !== 'guess' || paused) return false;

  guessShots.push({
    x: paddle.x + paddle.width / 2,
    y: paddle.y - 6,
    radius: 4,
    vy: -8
  });
  return true;
}

function beginDeceptiveSequence(ball, brick, now) {
  deceptivePhase.stage = 'locking';
  deceptivePhase.targetBrick = brick;
  deceptivePhase.capturedBall = ball;
  deceptivePhase.stageStartedAt = now;
  deceptivePhase.stageEndsAt = now + 3000;
  deceptivePhase.nextSwapAt = 0;
  deceptivePhase.shuffleEndsAt = 0;
  ball.deceptiveFrozen = true;
  statusDisplay.textContent = 'Watch closely... the blocks will shuffle';
}

function startDeceptiveShuffle(now) {
  deceptivePhase.stage = 'shuffling';
  deceptivePhase.stageStartedAt = now;
  deceptivePhase.nextSwapAt = now;
  deceptivePhase.shuffleEndsAt = now + 15000;
  statusDisplay.textContent = 'Shuffling! Follow where the ball is hidden';
}

function triggerDeceptiveSwap(now) {
  const alive = bricks.filter((brick) => brick.alive && brick.type === 'deceptive');
  if (alive.length < 2) return;

  const first = alive[Math.floor(Math.random() * alive.length)];
  let second = alive[Math.floor(Math.random() * alive.length)];
  while (second === first && alive.length > 1) {
    second = alive[Math.floor(Math.random() * alive.length)];
  }

  const firstStartX = first.x;
  const firstStartY = first.y;
  const secondStartX = second.x;
  const secondStartY = second.y;

  first.swapFromX = firstStartX;
  first.swapFromY = firstStartY;
  first.swapToX = secondStartX;
  first.swapToY = secondStartY;
  first.swapStartAt = now;
  first.swapEndAt = now + 200;
  first.swapArcDir = Math.random() < 0.5 ? -1 : 1;

  second.swapFromX = secondStartX;
  second.swapFromY = secondStartY;
  second.swapToX = firstStartX;
  second.swapToY = firstStartY;
  second.swapStartAt = now;
  second.swapEndAt = now + 200;
  second.swapArcDir = -first.swapArcDir;
}

function updateDeceptiveBrickSwaps(now) {
  bricks.forEach((brick) => {
    if (!brick.swapEndAt) return;

    const span = Math.max(1, brick.swapEndAt - brick.swapStartAt);
    const t = Math.max(0, Math.min(1, (now - brick.swapStartAt) / span));
    const arc = Math.sin(t * Math.PI) * 16 * (brick.swapArcDir || 1);
    brick.x = brick.swapFromX + (brick.swapToX - brick.swapFromX) * t;
    brick.y = brick.swapFromY + (brick.swapToY - brick.swapFromY) * t + arc;

    if (now >= brick.swapEndAt) {
      brick.x = brick.swapToX;
      brick.y = brick.swapToY;
      delete brick.swapFromX;
      delete brick.swapFromY;
      delete brick.swapToX;
      delete brick.swapToY;
      delete brick.swapStartAt;
      delete brick.swapEndAt;
      delete brick.swapArcDir;
    }
  });
}

function updateDeceptiveGuessShots(now, delta) {
  if (currentPhase !== 5) {
    guessShots = [];
    return;
  }

  if (deceptivePhase.stage !== 'guess') {
    guessShots = [];
    return;
  }

  guessShots = guessShots.filter((shot) => {
    shot.y += shot.vy * delta;
    if (shot.y < -20) return false;

    const hitBrick = bricks.find((brick) => {
      if (!brick.alive || brick.type !== 'deceptive') return false;
      return (
        shot.x + shot.radius > brick.x &&
        shot.x - shot.radius < brick.x + brick.width &&
        shot.y + shot.radius > brick.y &&
        shot.y - shot.radius < brick.y + brick.height
      );
    });

    if (!hitBrick) return true;

    if (hitBrick === deceptivePhase.targetBrick) {
      statusDisplay.textContent = 'Correct block! Phase cleared';
      bricks.forEach((brick) => {
        if (brick.type === 'deceptive') brick.alive = false;
      });
      return false;
    }

    hitBrick.alive = false;
    if (deceptivePhase.targetBrick && !deceptivePhase.targetBrick.alive) {
      const aliveAlternatives = bricks.filter((brick) => brick.alive && brick.type === 'deceptive');
      deceptivePhase.targetBrick = aliveAlternatives[Math.floor(Math.random() * aliveAlternatives.length)] || null;
    }
    lives = Math.max(0, lives - 1);
    updateHud(now);
    if (lives <= 0) {
      endGame('Game over');
      return false;
    }
    statusDisplay.textContent = 'Wrong block! You lost one life, try again';
    return false;
  });
}

function updateDeceptivePhase(now) {
  if (currentPhase !== 5) return;

  updateDeceptiveBrickSwaps(now);

  if (deceptivePhase.capturedBall && deceptivePhase.targetBrick && deceptivePhase.targetBrick.alive) {
    deceptivePhase.capturedBall.x = deceptivePhase.targetBrick.x + deceptivePhase.targetBrick.width / 2;
    deceptivePhase.capturedBall.y = deceptivePhase.targetBrick.y + deceptivePhase.targetBrick.height / 2;
  }

  if (deceptivePhase.stage === 'locking' && now >= deceptivePhase.stageEndsAt) {
    startDeceptiveShuffle(now);
  }

  if (deceptivePhase.stage === 'shuffling') {
    while (now >= deceptivePhase.nextSwapAt && now < deceptivePhase.shuffleEndsAt) {
      triggerDeceptiveSwap(now);
      deceptivePhase.nextSwapAt += 200;
    }

    if (now >= deceptivePhase.shuffleEndsAt) {
      deceptivePhase.stage = 'guess';
      statusDisplay.textContent = 'Press Arrow Up to shoot the hidden block';
    }
  }
}

function handleBrickCollision(ball, brick, previousBallX, previousBallY, spawnedBalls, now) {
  if (currentPhase === 5 && brick.type === 'deceptive') {
    if (deceptivePhase.stage === 'idle') {
      beginDeceptiveSequence(ball, brick, now);
    }
    ball.deceptiveFrozen = true;
    return;
  }

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
    } else if (brick.type === 'evil') {
      spawnEvilHand(brick, now);
      statusDisplay.textContent = 'Evil hand summoned';
    } else if (brick.type === 'harm-drop') {
      spawnHarmRain(brick, now);
      statusDisplay.textContent = 'Watch out: rain storm';
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
      statusDisplay.textContent = `${getPhaseTitle()} starts in ${remaining}...`;
      return;
    }

    phaseCountdownEndsAt = 0;
    statusDisplay.textContent = `${getPhaseTitle()} — speed ${getPhasePercent()}%`;
    if (autoLaunchAfterCountdown) {
      launchBallRandom();
      autoLaunchAfterCountdown = false;
    }
  }

  updateTimedDropEmitters(now);
  updateTurrets(now);
  updateEvilHands(now, delta);
  updateDeceptivePhase(now);
  updateDeceptiveGuessShots(now, delta);

  if (waterEffect.activeUntil > 0 && now >= waterEffect.activeUntil) {
    waterEffect.activeUntil = 0;
    waterEffect.startedAt = 0;
    waterEffect.surgeUntil = 0;
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
  const snareFactor = paddleSnaredUntil > now ? 0.15 : 1;
  const paddleSpeedFactor = getWaterSlowFactor(now) * snareFactor * (paddleOverdriveUntil > now ? 1.15 : 1);

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

    const waterFactor = waterActive && bullet.y >= getWaterSurfaceY(now) ? getWaterSlowFactor(now) : 1;

    bullet.x += bullet.vx * delta * waterFactor;
    bullet.y += bullet.vy * delta * waterFactor;

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
    const waterFactor = waterActive && bullet.y >= getWaterSurfaceY(now) ? getWaterSlowFactor(now) : 1;
    bullet.x += bullet.vx * delta * waterFactor;
    bullet.y += bullet.vy * delta * waterFactor;

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
    const waterFactor = waterActive && item.y + item.height >= getWaterSurfaceY(now) ? getWaterSlowFactor(now) : 1;
    item.x += (item.vx || 0) * delta * waterFactor;
    item.y += item.vy * delta * waterFactor;

    if (item.x < 0) {
      item.x = 0;
      item.vx = Math.abs(item.vx || 0);
    } else if (item.x + item.width > canvas.width) {
      item.x = canvas.width - item.width;
      item.vx = -Math.abs(item.vx || 0);
    }

    if (absorbRainIntoWave(item, now)) {
      return false;
    }

    const intersectsPaddle =
      item.x + item.width > paddle.x &&
      item.x < paddle.x + paddle.width &&
      item.y + item.height > paddle.y &&
      item.y < paddle.y + paddle.height;

    if (intersectsPaddle) {
      if (item.kind === 'harm-drop' || item.kind === 'nuclear-drop' || item.kind === 'lava-drop' || item.kind === 'rain-drop' || item.kind === 'acid-cloud' || item.kind === 'lava-meteor') {
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

    if (ball.handFrozenUntil && ball.handFrozenUntil > now) {
      survivingBalls.push(ball);
      return;
    }

    if (ball.deceptiveFrozen) {
      if (currentPhase !== 5 || !deceptivePhase.targetBrick || !deceptivePhase.targetBrick.alive) {
        ball.deceptiveFrozen = false;
      } else {
        ball.x = deceptivePhase.targetBrick.x + deceptivePhase.targetBrick.width / 2;
        ball.y = deceptivePhase.targetBrick.y + deceptivePhase.targetBrick.height / 2;
        survivingBalls.push(ball);
        return;
      }
    }

    const waterSurfaceY = getWaterSurfaceY(now);
    const ballInWater = waterActive && ball.y + ball.radius >= waterSurfaceY;
    const ballWaterFactor = ballInWater ? getWaterSlowFactor(now) : 1;
    const malignFactor = ball.malignBoostEndsAt && ball.malignBoostEndsAt > now ? 1.15 : 1;

    ball.x += ball.vx * delta * ballWaterFactor * malignFactor;
    ball.y += ball.vy * delta * ballWaterFactor * malignFactor;

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
      if (paddleBoostEndsAt > now) {
        mushroomBounceStartedAt = now;
        mushroomBounceUntil = now + 360;
      }
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
  drawEvilHands();
  drawFallingItems();
  drawGuns();
  drawBullets();
  drawTurretBullets();
  drawGuessShots();
  drawTurrets();
  drawPaddle();
  drawBalls();
  drawHammerInventory();
  drawDeceptiveHint();
  drawPhaseCountdownOverlay();
}

function drawPaddle() {
  const isBoosted = paddleBoostEndsAt > performance.now();

  if (!isBoosted) {
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    return;
  }

  const now = performance.now();
  const bouncing = mushroomBounceUntil > now;
  const bounceProgress = bouncing ? 1 - (mushroomBounceUntil - now) / Math.max(1, mushroomBounceUntil - mushroomBounceStartedAt) : 1;
  const squash = bouncing ? 0.16 * Math.sin(Math.min(1, bounceProgress) * Math.PI) : 0;

  const capWidth = paddle.width * (1 + squash * 0.25);
  const capHeight = paddle.height * (1 - squash * 0.55);
  const capX = paddle.x + (paddle.width - capWidth) / 2;
  const capY = paddle.y + 2 + squash * 3;

  const stemWidth = paddle.width * 0.28;
  const stemX = paddle.x + (paddle.width - stemWidth) / 2;
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(stemX, paddle.y + 4, stemWidth, paddle.height - 2);

  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.ellipse(capX + capWidth / 2, capY + 1, capWidth / 2, capHeight, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(capX + capWidth * 0.26, capY + 4, 2.4, 0, Math.PI * 2);
  ctx.arc(capX + capWidth * 0.42, capY + 2.2, 2, 0, Math.PI * 2);
  ctx.arc(capX + capWidth * 0.58, capY + 3, 2.1, 0, Math.PI * 2);
  ctx.arc(capX + capWidth * 0.73, capY + 4.2, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawBalls() {
  balls.forEach((ball) => {
    if (ball.deceptiveFrozen && currentPhase === 5) return;

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
  const now = performance.now();
  bricks.forEach((brick) => {
    if (!brick.alive) return;

    let brickColor = brick.color;
    if (brick.type === 'deceptive') {
      brickColor = '#7c3aed';
      if (deceptivePhase.stage === 'locking') {
        const blinkStep = Math.floor((now - deceptivePhase.stageStartedAt) / 250);
        brickColor = blinkStep % 2 === 0 ? '#22c55e' : '#7c3aed';
      }
    }

    ctx.fillStyle = brickColor;
    ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
    ctx.strokeStyle = brick.type === 'deceptive' ? '#000000' : 'rgba(255,255,255,0.4)';
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
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.arc(brick.x + brick.width / 2 - 9, brick.y + brick.height / 2 - 1, 5, 0, Math.PI * 2);
      ctx.arc(brick.x + brick.width / 2 - 2, brick.y + brick.height / 2 - 4, 6.5, 0, Math.PI * 2);
      ctx.arc(brick.x + brick.width / 2 + 7, brick.y + brick.height / 2 - 1, 5.5, 0, Math.PI * 2);
      ctx.arc(brick.x + brick.width / 2 + 13, brick.y + brick.height / 2 + 1, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.ellipse(brick.x + brick.width / 2 - 4, brick.y + brick.height / 2 + 7, 2.1, 3.6, 0, 0, Math.PI * 2);
      ctx.ellipse(brick.x + brick.width / 2 + 3, brick.y + brick.height / 2 + 8, 2, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
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
    } else if (brick.type === 'evil') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(brick.x + 2, brick.y + 2, brick.width - 4, brick.height - 4);
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.moveTo(brick.x + brick.width / 2 - 13, brick.y + brick.height / 2 - 1);
      ctx.lineTo(brick.x + brick.width / 2 - 4, brick.y + brick.height / 2 - 4);
      ctx.lineTo(brick.x + brick.width / 2 - 4, brick.y + brick.height / 2 + 2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(brick.x + brick.width / 2 + 13, brick.y + brick.height / 2 - 1);
      ctx.lineTo(brick.x + brick.width / 2 + 4, brick.y + brick.height / 2 - 4);
      ctx.lineTo(brick.x + brick.width / 2 + 4, brick.y + brick.height / 2 + 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#7f1d1d';
      ctx.beginPath();
      ctx.moveTo(brick.x + brick.width / 2 - 13, brick.y + brick.height / 2 - 5);
      ctx.lineTo(brick.x + brick.width / 2 - 4, brick.y + brick.height / 2 - 7);
      ctx.moveTo(brick.x + brick.width / 2 + 13, brick.y + brick.height / 2 - 5);
      ctx.lineTo(brick.x + brick.width / 2 + 4, brick.y + brick.height / 2 - 7);
      ctx.stroke();
    }
  });
}

function drawEvilHands() {
  evilHands.forEach((hand) => {
    ctx.fillStyle = '#040404';
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    const palmRadius = 8.5;
    const centerX = hand.x + hand.width / 2;
    const centerY = hand.y + hand.height * 0.56;

    ctx.beginPath();
    ctx.roundRect(hand.x + 4, hand.y + 11, hand.width - 8, hand.height - 11, 7);
    ctx.fill();
    ctx.stroke();

    for (let i = 0; i < 4; i += 1) {
      const fingerX = hand.x + 4 + i * 4.9;
      ctx.beginPath();
      ctx.roundRect(fingerX, hand.y + (i % 2 ? 0 : 1), 4, 17 - (i % 2), 3);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(220, 38, 38, 0.24)';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 1, palmRadius * 0.7, palmRadius * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#040404';

    ctx.beginPath();
    ctx.arc(centerX, centerY, palmRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (hand.state === 'holding-paddle' || hand.state === 'holding-ball') {
      ctx.strokeStyle = 'rgba(220, 38, 38, 0.8)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, palmRadius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.lineWidth = 1;
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

  const surge = isWaveSurgeActive(now);
  const gradient = ctx.createLinearGradient(0, surfaceY, 0, canvas.height);
  gradient.addColorStop(0, surge ? 'rgba(45, 212, 191, 0.46)' : 'rgba(56, 189, 248, 0.32)');
  gradient.addColorStop(1, surge ? 'rgba(6, 78, 59, 0.7)' : 'rgba(8, 47, 73, 0.62)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, surfaceY, canvas.width, height);

  ctx.strokeStyle = surge ? 'rgba(110, 231, 183, 0.95)' : 'rgba(186, 230, 253, 0.9)';
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
    ctx.strokeStyle = bullet.color || '#a855f7';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fillStyle = bullet.color || '#a855f7';
    ctx.fill();
  });
}

function drawGuessShots() {
  guessShots.forEach((shot) => {
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, shot.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#a855f7';
    ctx.stroke();
  });
}

function drawDeceptiveHint() {
  if (currentPhase !== 5 || deceptivePhase.stage !== 'guess') return;

  ctx.fillStyle = 'rgba(88, 28, 135, 0.78)';
  ctx.fillRect(10, canvas.height - 48, 280, 32);
  ctx.strokeStyle = '#d8b4fe';
  ctx.strokeRect(10, canvas.height - 48, 280, 32);
  ctx.fillStyle = '#f5d0fe';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Press ARROW UP or swipe up to shoot a block', 18, canvas.height - 27);
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
    if (item.kind === 'rain-drop') {
      ctx.fillStyle = item.color || '#7dd3fc';
      ctx.beginPath();
      ctx.moveTo(item.x + item.width / 2, item.y + 1);
      ctx.bezierCurveTo(
        item.x + item.width * 0.1,
        item.y + item.height * 0.45,
        item.x + item.width * 0.22,
        item.y + item.height,
        item.x + item.width / 2,
        item.y + item.height
      );
      ctx.bezierCurveTo(
        item.x + item.width * 0.78,
        item.y + item.height,
        item.x + item.width * 0.9,
        item.y + item.height * 0.45,
        item.x + item.width / 2,
        item.y + 1
      );
      ctx.fill();
      return;
    }

    if (item.kind === 'acid-cloud') {
      ctx.fillStyle = item.color || '#84cc16';
      ctx.beginPath();
      ctx.arc(item.x + 5, item.y + 9, 4, 0, Math.PI * 2);
      ctx.arc(item.x + 10, item.y + 8, 5, 0, Math.PI * 2);
      ctx.arc(item.x + 14, item.y + 10, 3.8, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (item.kind === 'lava-meteor') {
      ctx.fillStyle = item.color || '#f97316';
      ctx.beginPath();
      ctx.arc(item.x + item.width / 2, item.y + item.height / 2, item.width * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(item.x + item.width * 0.62, item.y + item.height * 0.42, item.width * 0.12, 0, Math.PI * 2);
      ctx.arc(item.x + item.width * 0.42, item.y + item.height * 0.62, item.width * 0.1, 0, Math.PI * 2);
      ctx.fill();
      const firePulse = 0.7 + Math.sin(performance.now() * 0.02 + item.x * 0.04) * 0.3;
      ctx.strokeStyle = `rgba(251, 113, 47, ${0.65 + firePulse * 0.35})`;
      ctx.beginPath();
      ctx.moveTo(item.x + item.width * 0.28, item.y + item.height * 0.46);
      ctx.lineTo(item.x - 10 - firePulse * 5, item.y + item.height * 0.14);
      ctx.moveTo(item.x + item.width * 0.2, item.y + item.height * 0.62);
      ctx.lineTo(item.x - 8 - firePulse * 4, item.y + item.height * 0.5);
      ctx.moveTo(item.x + item.width * 0.34, item.y + item.height * 0.68);
      ctx.lineTo(item.x - 7 - firePulse * 3, item.y + item.height * 0.72);
      ctx.stroke();
      return;
    }

    if (item.kind === 'nuclear-drop') {
      const now = performance.now();
      const pulse = 1 + Math.sin(now * 0.015 + item.x * 0.2) * 0.12;
      const drift = Math.sin(now * 0.01 + item.y * 0.18) * 1.5;
      ctx.fillStyle = item.color || '#22c55e';
      ctx.beginPath();
      ctx.arc(item.x + 5 + drift, item.y + 9, 4 * pulse, 0, Math.PI * 2);
      ctx.arc(item.x + 10 + drift * 0.6, item.y + 8, 5 * pulse, 0, Math.PI * 2);
      ctx.arc(item.x + 14 + drift, item.y + 10, 3.8 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dcfce7';
      ctx.beginPath();
      ctx.arc(item.x + 10 + drift * 0.5, item.y + 8, 1.4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

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
  ctx.fillText(getPhaseTitle(), canvas.width / 2, canvas.height / 2 + 40);
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

  if (event.code === 'ArrowUp') {
    if (gameState === 'running') {
      event.preventDefault();
      fireDeceptiveShot();
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
  activePointerStartX = event.clientX;
  activePointerStartY = event.clientY;
  activePointerStartAt = performance.now();
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
  const swipeDistanceX = event.clientX - activePointerStartX;
  const swipeDistanceY = event.clientY - activePointerStartY;
  const swipeDuration = performance.now() - activePointerStartAt;
  if (
    event.pointerType === 'touch' &&
    gameState === 'running' &&
    !paused &&
    phaseCountdownEndsAt <= 0 &&
    currentPhase === 5 &&
    deceptivePhase.stage === 'guess' &&
    swipeDistanceY < -40 &&
    Math.abs(swipeDistanceY) > Math.abs(swipeDistanceX) &&
    swipeDuration < 900
  ) {
    fireDeceptiveShot();
  }
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
    const isLocalHost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '::1';

    if (isLocalHost) {
      // Avoid stale files while testing locally.
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch((error) => {
          console.error('Service worker cleanup failed:', error);
        });

      if ('caches' in window) {
        caches
          .keys()
          .then((cacheNames) => Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName))))
          .catch((error) => {
            console.error('Cache cleanup failed:', error);
          });
      }

      return;
    }

    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.error('Service worker registration failed:', error);
    });
  });
}

resetGame();
loadLeaderboard();
requestAnimationFrame(loop);
