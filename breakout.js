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

const cowboyHatSprite = new Image();
cowboyHatSprite.src = 'cowboy-hat.png';

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
const basePaddleSpeed = 7;
const phaseGrowthEarly = 1.07;
const phaseGrowthLate = 1.04;
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
let waterImpacts = [];
let radioactiveZones = [];
let turrets = [];
let evilHands = [];
let cowboyOutlaws = [];
let cowboyBullets = [];
let rouletteAnimations = [];
let pendingRouletteEffects = [];
let rouletteAnimationSeed = 1;
let cowboyPairSequence = 1;
let cowboyPairHitUntil = new Map();
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
  surgeUntil: 0,
  rowsCurrent: 7,
  rowsFrom: 7,
  rowsTo: 7,
  rowsTransitionStartedAt: 0,
  rowsTransitionDurationMs: 650
};
let spotlightEffect = {
  activeUntil: 0,
  durationMs: 5000,
  topHalfWidth: 27,
  bottomHalfWidth: 180
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
let paddleInvulnerableUntil = 0;
let paddleShieldUntil = 0;
let paddleOverdriveUntil = 0;
let pausedAt = 0;
let paddleFace = {
  deadEyes: false,
  nextBlinkAt: 0,
  blinkUntil: 0
};
let paddle;
let bricks = [];
const keys = { ArrowLeft: false, ArrowRight: false };

const SPECIAL_TYPES = ['extra-ball', 'double-hit', 'mushroom', 'hammer', 'extra-life', 'roulette', 'wave', 'evil', 'meteor', 'shield'];

const specialsModule = typeof BreakoutSpecials !== 'undefined' ? BreakoutSpecials : null;
const cowboyRenderModule = typeof BreakoutCowboyRender !== 'undefined' ? BreakoutCowboyRender : null;
const entitiesModule = typeof BreakoutEntities !== 'undefined' ? BreakoutEntities : null;
const deceptiveModule = typeof BreakoutDeceptive !== 'undefined' ? BreakoutDeceptive : null;
const drawEffectsModule = typeof BreakoutDrawEffects !== 'undefined' ? BreakoutDrawEffects : null;
const leaderboardModule = typeof BreakoutLeaderboard !== 'undefined' ? BreakoutLeaderboard : null;
const controlsModule = typeof BreakoutControls !== 'undefined' ? BreakoutControls : null;

function createBall(x, y, vx = 0, vy = 0, radius = 8, speedFactor = 1) {
  return { x, y, vx, vy, radius, speedFactor };
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
    return;
  }

  if (type === 'cowboy') {
    brick.color = '#d4b08a';
    return;
  }

  if (type === 'flashlight') {
    brick.color = '#facc15';
    return;
  }

  if (type === 'meteor') {
    brick.color = '#f97316';
    return;
  }

  if (type === 'shield') {
    brick.color = '#1d4ed8';
  }
}

function randomSpecialType(includeNuclear = true, includeExtraLife = true) {
  const base = includeExtraLife ? [...SPECIAL_TYPES] : SPECIAL_TYPES.filter((type) => type !== 'extra-life');
  const pool = includeNuclear ? [...base, 'nuclear'] : base;
  return pool[Math.floor(Math.random() * pool.length)];
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

  if (currentPhase === 5) {
    statusDisplay.textContent = 'Turrets are disabled in Phase 5';
    return false;
  }

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
    if (waterEffect.rowsTransitionStartedAt > 0) {
      waterEffect.rowsTransitionStartedAt += deltaMs;
    }
  }

  if (deceptivePhase.stageEndsAt > 0) deceptivePhase.stageEndsAt += deltaMs;
  if (deceptivePhase.stageStartedAt > 0) deceptivePhase.stageStartedAt += deltaMs;
  if (deceptivePhase.nextSwapAt > 0) deceptivePhase.nextSwapAt += deltaMs;
  if (deceptivePhase.shuffleEndsAt > 0) deceptivePhase.shuffleEndsAt += deltaMs;

  if (paddleSnaredUntil > 0) {
    paddleSnaredUntil += deltaMs;
  }

  if (paddleInvulnerableUntil > 0) {
    paddleInvulnerableUntil += deltaMs;
  }

  if (paddleShieldUntil > 0) {
    paddleShieldUntil += deltaMs;
  }

  if (paddleOverdriveUntil > 0) {
    paddleOverdriveUntil += deltaMs;
  }

  if (spotlightEffect.activeUntil > 0) {
    spotlightEffect.activeUntil += deltaMs;
  }

  evilHands.forEach((hand) => {
    if (hand.pauseUntil) hand.pauseUntil += deltaMs;
    if (hand.releaseAt) hand.releaseAt += deltaMs;
    if (hand.disappearAt) hand.disappearAt += deltaMs;
  });

  cowboyOutlaws.forEach((outlaw) => {
    if (outlaw.nextShotAt) outlaw.nextShotAt += deltaMs;
    if (outlaw.calmEndsAt) outlaw.calmEndsAt += deltaMs;
  });

  for (const [pairId, endsAt] of cowboyPairHitUntil.entries()) {
    cowboyPairHitUntil.set(pairId, endsAt + deltaMs);
  }

  balls.forEach((ball) => {
    if (ball.nuclearBoostEndsAt) {
      ball.nuclearBoostEndsAt += deltaMs;
    }
  });

  waterImpacts.forEach((impact) => {
    impact.startedAt += deltaMs;
    impact.endsAt += deltaMs;
  });
}

function getPhaseTitle() {
  return currentPhase === 5 ? 'Fase Enganadora' : `Phase ${currentPhase}`;
}

function getPaddleInvulnerableUntil() {
  return Math.max(paddleInvulnerableUntil, paddleShieldUntil);
}

function isPaddleInvulnerable(now = performance.now()) {
  return now < getPaddleInvulnerableUntil();
}

function isSpotlightActive(now = performance.now()) {
  return spotlightEffect.activeUntil > now;
}

function activateSpotlight(now = performance.now()) {
  spotlightEffect.activeUntil = now + spotlightEffect.durationMs;
  paddleOverdriveUntil = Math.max(paddleOverdriveUntil, now + spotlightEffect.durationMs);
  statusDisplay.textContent = 'Flashlight active for 5s';
}

function getSpotlightGeometry() {
  if (!paddle) return null;
  const sourceX = paddle.x + paddle.width / 2;
  const sourceY = paddle.y + paddle.height / 2;
  return {
    sourceX,
    sourceY,
    topY: 0,
    topHalfWidth: spotlightEffect.topHalfWidth,
    bottomHalfWidth: spotlightEffect.bottomHalfWidth
  };
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

function getWaterRows(now = performance.now()) {
  if (waterEffect.rowsTransitionStartedAt > 0) {
    const elapsed = now - waterEffect.rowsTransitionStartedAt;
    const t = Math.max(0, Math.min(1, elapsed / waterEffect.rowsTransitionDurationMs));
    waterEffect.rowsCurrent = waterEffect.rowsFrom + (waterEffect.rowsTo - waterEffect.rowsFrom) * t;
    if (t >= 1) {
      waterEffect.rowsTransitionStartedAt = 0;
      waterEffect.rowsCurrent = waterEffect.rowsTo;
    }
  }

  return waterEffect.rowsCurrent;
}

function setWaterRowsTarget(rows, now = performance.now()) {
  const clampedRows = Math.max(1, rows);
  const currentRows = getWaterRows(now);
  waterEffect.rowsFrom = currentRows;
  waterEffect.rowsTo = clampedRows;
  waterEffect.rowsTransitionStartedAt = now;
}

function getWaterTargetY(now = performance.now()) {
  const platformHeight = paddle ? paddle.height : 14;
  const rows = getWaterRows(now);
  const target = canvas.height - platformHeight * rows;
  return Math.max(brickOffsetTop + 12, Math.min(canvas.height - 24, target));
}

function getWaterSurfaceY(now = performance.now()) {
  if (!isWaterEffectActive(now)) {
    return canvas.height + 1;
  }

  const targetY = getWaterTargetY(now);
  const riseProgress = Math.max(0, Math.min(1, (now - waterEffect.startedAt) / waterEffect.riseDurationMs));
  return canvas.height - (canvas.height - targetY) * riseProgress;
}

function activateWaterWave(now = performance.now()) {
  waterEffect.startedAt = now;
  waterEffect.activeUntil = now + 20000;
  waterEffect.surgeUntil = 0;
  waterEffect.rowsCurrent = waterEffect.levelRows;
  waterEffect.rowsFrom = waterEffect.levelRows;
  waterEffect.rowsTo = waterEffect.levelRows;
  waterEffect.rowsTransitionStartedAt = 0;
  statusDisplay.textContent = 'Wave activated: rising water for 20s';
}

function absorbRainIntoWave(item, now) {
  if (!isWaterEffectActive(now)) return false;

  const impactOnlyKinds = new Set(['lava-meteor', 'acid-cloud']);
  const rainyKinds = new Set(['rain-drop', 'nuclear-drop', 'harm-drop', 'lava-drop']);
  if (!impactOnlyKinds.has(item.kind) && !rainyKinds.has(item.kind)) return false;

  const surfaceY = getWaterSurfaceY(now);
  if (item.y + item.height < surfaceY) return false;

  if (impactOnlyKinds.has(item.kind)) {
    createWaterImpact(item, now);
    return true;
  }

  if (!isWaveSurgeActive(now)) {
    waterEffect.surgeUntil = now + 5000;
    setWaterRowsTarget(waterEffect.levelRows * 2, now);
    statusDisplay.textContent = 'Wave surge! Water height doubled for 5s';
  }

  waterEffect.activeUntil += 1000;
  return true;
}

function createWaterImpact(item, now = performance.now()) {
  const isMeteor = item.kind === 'lava-meteor';
  waterImpacts.push({
    kind: item.kind,
    x: item.x + item.width / 2,
    y: getWaterSurfaceY(now),
    startedAt: now,
    endsAt: now + 2000,
    radius: isMeteor ? 24 : 20,
    tint: isMeteor ? 'rgba(239, 68, 68, 0.52)' : 'rgba(34, 197, 94, 0.46)'
  });
}

function updateEffectsDisplay(now = performance.now()) {
  const effects = [];

  effects.push(`Paddle speed ${BreakoutUtils.toPercent(BreakoutUtils.getPaddleSpeedMultiplierFor(currentPhase, 1.02))}%`);
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

  if (isSpotlightActive(now)) {
    effects.push(`Flashlight ${Math.ceil((spotlightEffect.activeUntil - now) / 1000)}s`);
  }

  if (paddleShieldUntil > now) {
    effects.push(`Shield ${(Math.ceil((paddleShieldUntil - now) / 100) / 10).toFixed(1)}s`);
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
  waterImpacts = [];
  radioactiveZones = [];
  turrets = [];
  evilHands = [];
  cowboyOutlaws = [];
  cowboyBullets = [];
  guessShots = [];
  rouletteAnimations = [];
  pendingRouletteEffects = [];
  rouletteAnimationSeed = 1;
  waterEffect.activeUntil = 0;
  waterEffect.startedAt = 0;
  waterEffect.surgeUntil = 0;
  waterEffect.rowsCurrent = waterEffect.levelRows;
  waterEffect.rowsFrom = waterEffect.levelRows;
  waterEffect.rowsTo = waterEffect.levelRows;
  waterEffect.rowsTransitionStartedAt = 0;
  deceptivePhase = { stage: 'idle', targetBrick: null, capturedBall: null, stageStartedAt: 0, stageEndsAt: 0, nextSwapAt: 0, shuffleEndsAt: 0 };
  paddleSnaredUntil = 0;
  paddleInvulnerableUntil = 0;
  paddleShieldUntil = 0;
  paddleOverdriveUntil = 0;
  hammerCount = 0;
  minigunCharges = 0;
  pausedAt = 0;
  phaseCountdownEndsAt = 0;
  autoLaunchAfterCountdown = false;
  awaitingServe = false;
  paddleBoostEndsAt = 0;
  cowboyPairSequence = 1;
  cowboyPairHitUntil = new Map();
  paddleFace = { deadEyes: false, nextBlinkAt: performance.now() + 2000, blinkUntil: 0 };
  spotlightEffect.activeUntil = 0;
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
    speed: basePaddleSpeed * BreakoutUtils.getPaddleSpeedMultiplierFor(currentPhase, 1.02)
  };

  balls = [createBall(canvas.width / 2, paddle.y - 14, 0, 0)];
  bricks = buildBricks();
  guns = buildGuns();
  bullets = [];
  turretBullets = [];
  fallingItems = [];
  fallingEmitters = [];
  waterImpacts = [];
  radioactiveZones = [];
  turrets = [];
  evilHands = [];
  cowboyOutlaws = [];
  cowboyBullets = [];
  guessShots = [];
  rouletteAnimations = [];
  pendingRouletteEffects = [];
  rouletteAnimationSeed = 1;
  waterEffect.activeUntil = 0;
  waterEffect.startedAt = 0;
  waterEffect.surgeUntil = 0;
  waterEffect.rowsCurrent = waterEffect.levelRows;
  waterEffect.rowsFrom = waterEffect.levelRows;
  waterEffect.rowsTo = waterEffect.levelRows;
  waterEffect.rowsTransitionStartedAt = 0;
  deceptivePhase = { stage: 'idle', targetBrick: null, capturedBall: null, stageStartedAt: 0, stageEndsAt: 0, nextSwapAt: 0, shuffleEndsAt: 0 };
  paddleSnaredUntil = 0;
  paddleInvulnerableUntil = 0;
  paddleShieldUntil = 0;
  paddleOverdriveUntil = 0;
  turretBullets = [];
  fallingEmitters = [];
  phaseCountdownEndsAt = 0;
  autoLaunchAfterCountdown = false;
  awaitingServe = false;
  paddleBoostEndsAt = 0;
  cowboyPairSequence = 1;
  cowboyPairHitUntil = new Map();
  paddleFace = { deadEyes: false, nextBlinkAt: performance.now() + 2000, blinkUntil: 0 };
  spotlightEffect.activeUntil = 0;
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
  waterImpacts = [];
  radioactiveZones = [];
  turrets = [];
  evilHands = [];
  cowboyOutlaws = [];
  cowboyBullets = [];
  guessShots = [];
  rouletteAnimations = [];
  pendingRouletteEffects = [];
  rouletteAnimationSeed = 1;
  waterEffect.activeUntil = 0;
  waterEffect.startedAt = 0;
  waterEffect.surgeUntil = 0;
  waterEffect.rowsCurrent = waterEffect.levelRows;
  waterEffect.rowsFrom = waterEffect.levelRows;
  waterEffect.rowsTo = waterEffect.levelRows;
  waterEffect.rowsTransitionStartedAt = 0;
  deceptivePhase = { stage: 'idle', targetBrick: null, capturedBall: null, stageStartedAt: 0, stageEndsAt: 0, nextSwapAt: 0, shuffleEndsAt: 0 };
  paddleSnaredUntil = 0;
  paddleInvulnerableUntil = 0;
  paddleShieldUntil = 0;
  paddleOverdriveUntil = 0;
  hammerCount = 0;
  minigunCharges = 0;
  pausedAt = 0;
  phaseCountdownEndsAt = 0;
  autoLaunchAfterCountdown = false;
  awaitingServe = false;
  paddleBoostEndsAt = 0;
  cowboyPairSequence = 1;
  cowboyPairHitUntil = new Map();
  spotlightEffect.activeUntil = 0;
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

  if (currentPhase !== 3) {
    pickDistinctBrickIndices(allIndices, 1, blocked).forEach((idx) => {
      applySpecialType(created[idx], 'cowboy');
    });
  }

  if (currentPhase !== 3) {
    const atmosphericTypes = ['harm-drop', 'nuclear', 'meteor'];
    const atmosphericType = atmosphericTypes[Math.floor(Math.random() * atmosphericTypes.length)];
    pickDistinctBrickIndices(allIndices, 1, blocked).forEach((idx) => {
      applySpecialType(created[idx], atmosphericType);
    });
  }

  pickDistinctBrickIndices(allIndices, 1, blocked).forEach((idx) => {
    applySpecialType(created[idx], 'extra-ball');
  });

  if (currentPhase % 2 === 1 && currentPhase !== 3) {
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

  if (currentPhase % 2 === 0) {
    pickDistinctBrickIndices(allIndices, 1, blocked).forEach((idx) => {
      applySpecialType(created[idx], 'shield');
    });
  }
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
    const candidates = [...nonBossIndices];
    const evilIndex = candidates[Math.floor(Math.random() * candidates.length)];
    applySpecialType(bossBlocks[evilIndex], 'evil');

    const remainingAfterEvil = candidates.filter((index) => index !== evilIndex);
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

  phaseMultiplier = BreakoutUtils.getPhaseMultiplierFor(currentPhase, phaseGrowthEarly, phaseGrowthLate);
  phaseBallSpeed = baseBallSpeed * phaseMultiplier;
  if (paddle) {
    paddle.speed = basePaddleSpeed * BreakoutUtils.getPaddleSpeedMultiplierFor(currentPhase, 1.02);
  }
  bricks = buildBricks();
  guns = buildGuns();
  bullets = [];
  turretBullets = [];
  fallingItems = [];
  fallingEmitters = [];
  waterImpacts = [];
  radioactiveZones = [];
  turrets = [];
  evilHands = [];
  cowboyOutlaws = [];
  cowboyBullets = [];
  guessShots = [];
  rouletteAnimations = [];
  pendingRouletteEffects = [];
  rouletteAnimationSeed = 1;
  waterEffect.activeUntil = 0;
  waterEffect.startedAt = 0;
  waterEffect.surgeUntil = 0;
  waterEffect.rowsCurrent = waterEffect.levelRows;
  waterEffect.rowsFrom = waterEffect.levelRows;
  waterEffect.rowsTo = waterEffect.levelRows;
  waterEffect.rowsTransitionStartedAt = 0;
  deceptivePhase = { stage: 'idle', targetBrick: null, capturedBall: null, stageStartedAt: 0, stageEndsAt: 0, nextSwapAt: 0, shuffleEndsAt: 0 };
  paddleSnaredUntil = 0;
  paddleInvulnerableUntil = 0;
  paddleShieldUntil = 0;
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
        const targetSpeed = phaseBallSpeed * (ball.speedFactor || 1);
        const scale = targetSpeed / magnitude;
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
  cowboyPairSequence = 1;
  cowboyPairHitUntil = new Map();
  spotlightEffect.activeUntil = 0;
  resetWeaponCycle();
  updateHud();
  statusDisplay.textContent = `${getPhaseTitle()} starts in 3... Paddle ${BreakoutUtils.toPercent(BreakoutUtils.getPaddleSpeedMultiplierFor(currentPhase, 1.02))}%`;
}

function updateHud(now = performance.now()) {
  scoreDisplay.textContent = `Score: ${score}`;
  phaseDisplay.textContent = `${getPhaseTitle()} • Speed ${BreakoutUtils.toPercent(phaseMultiplier)}%`;
  livesDisplay.textContent = `Lives: ${lives}`;
  updateEffectsDisplay(now);
}

function launchBallRandom(ball = balls[0]) {
  if (!ball) return;
  const angleMin = -130;
  const angleMax = -50;
  const angleDeg = angleMin + Math.random() * (angleMax - angleMin);
  const angle = (angleDeg * Math.PI) / 180;
  const speed = phaseBallSpeed * (ball.speedFactor || 1);
  ball.vx = Math.cos(angle) * speed;
  ball.vy = Math.sin(angle) * speed;
  paddleFace.deadEyes = false;
  paddleFace.blinkUntil = 0;
  paddleFace.nextBlinkAt = performance.now() + 2000;
  awaitingServe = false;
}

function spawnExtraBallFrom(sourceBall, spawnedBalls) {
  const sourceSpeedFactor = sourceBall.speedFactor || 1;
  const speed = Math.hypot(sourceBall.vx, sourceBall.vy) || phaseBallSpeed * sourceSpeedFactor;
  const mirroredVx = -sourceBall.vx || speed * 0.75;
  const vyDirection = sourceBall.vy <= 0 ? -1 : 1;
  const vyMagnitude = Math.sqrt(Math.max(1, speed * speed - mirroredVx * mirroredVx));
  const extraBall = createBall(sourceBall.x, sourceBall.y, mirroredVx, vyMagnitude * vyDirection, sourceBall.radius || 8, sourceSpeedFactor);
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
  const spawnPoint = BreakoutUtils.clampToCanvas(originX, originY, 8, canvas.width, canvas.height);
  balls.push(createBall(spawnPoint.x, spawnPoint.y, vx, vy));
}

function loseLife(messageOnSurvive) {
  const now = performance.now();
  const ignoreInvulnerability = messageOnSurvive === 'Ball lost';

  if (gameState !== 'running') return true;

  if (!ignoreInvulnerability && isPaddleInvulnerable(now)) {
    return false;
  }

  lives = Math.max(0, lives - 1);
  paddleFace.deadEyes = true;
  updateHud();
  bullets = [];
  cowboyBullets = [];
  guessShots = [];
  fallingItems = [];
  paddle.width = paddle.baseWidth;
  paddleBoostEndsAt = 0;

  if (lives <= 0) {
    endGame('Game over');
    return true;
  }

  balls = [createBall(paddle.x + paddle.width / 2, paddle.y - 14, 0, 0)];
  paddleInvulnerableUntil = now + 2500;
  awaitingServe = true;
  statusDisplay.textContent = `${messageOnSurvive} — press Enter to continue`;
  return false;
}

function spawnCowboyOutlaw(brick, now = performance.now()) {
  if (!entitiesModule) return;
  cowboyOutlaws.push(entitiesModule.spawnCowboyOutlaw(brick, now));
  statusDisplay.textContent = 'Cowboy awakened: touch the red line to provoke him';
}

function updateCowboyOutlaws(now, delta) {
  if (!entitiesModule) return;

  const state = {
    cowboyPairHitUntil,
    cowboyOutlaws,
    cowboyBullets,
    cowboyPairSequence,
    paddle,
    balls,
    awaitingServe,
    currentPhase,
    hazardBulletSpeedMultiplier,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height
  };

  entitiesModule.updateCowboyOutlaws(now, delta, state, {
    clampToCanvas: BreakoutUtils.clampToCanvas,
    createBall,
    launchBallRandom,
    setStatus: (text) => {
      statusDisplay.textContent = text;
    }
  });

  cowboyPairHitUntil = state.cowboyPairHitUntil;
  cowboyOutlaws = state.cowboyOutlaws;
  cowboyBullets = state.cowboyBullets;
  cowboyPairSequence = state.cowboyPairSequence;
  balls = state.balls;
  awaitingServe = state.awaitingServe;
}

function updateCowboyBullets(now, delta) {
  if (!entitiesModule) return;

  const state = {
    cowboyBullets,
    cowboyPairHitUntil,
    paddle,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height
  };

  entitiesModule.updateCowboyBullets(now, delta, state, {
    loseLife
  });

  cowboyBullets = state.cowboyBullets;
  cowboyPairHitUntil = state.cowboyPairHitUntil;
}

function hitCowboyOutlawWithBall(ball, outlaw, now) {
  if (!entitiesModule) return false;
  return entitiesModule.hitCowboyOutlawWithBall(ball, outlaw, now, {
    setStatus: (text) => {
      statusDisplay.textContent = text;
    }
  });
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

function triggerSpecialEffect(type, context = {}) {
  if (!specialsModule) return false;

  return specialsModule.triggerSpecialEffect(type, context, {
    phaseBallSpeed,
    spawnExtraBallFrom,
    spawnDelayedExtraBall,
    activateRouletteEffect,
    activateWaterWave,
    spawnEvilHand,
    spawnCowboyOutlaw,
    spawnHarmRain,
    detonateNuclearBrick,
    applyNuclearBoost,
    spawnLavaRain,
    spawnFallingItem,
    activateSpotlight,
    setStatus: (text) => {
      statusDisplay.textContent = text;
    }
  });
}

function spawnEvilHand(brick, now = performance.now()) {
  if (!entitiesModule) return;
  evilHands.push(entitiesModule.spawnEvilHand(brick, now));
}

function updateEvilHands(now, delta) {
  if (!entitiesModule) return;

  const state = {
    evilHands,
    balls,
    paddle,
    phaseBallSpeed,
    paddleOverdriveUntil,
    paddleSnaredUntil,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height
  };

  entitiesModule.updateEvilHands(now, delta, state, {
    setStatus: (text) => {
      statusDisplay.textContent = text;
    }
  });

  evilHands = state.evilHands;
  balls = state.balls;
  paddleOverdriveUntil = state.paddleOverdriveUntil;
  paddleSnaredUntil = state.paddleSnaredUntil;
}

function resolveRouletteEffects(now = performance.now()) {
  if (!specialsModule) return;

  const nextState = specialsModule.resolveRouletteEffects(
    now,
    {
      pendingRouletteEffects,
      rouletteAnimations
    },
    {
      triggerSpecialEffect,
      setStatus: (text) => {
        statusDisplay.textContent = text;
      }
    }
  );

  pendingRouletteEffects = nextState.pendingRouletteEffects;
  rouletteAnimations = nextState.rouletteAnimations;
}

function activateRouletteEffect(ball, brick, spawnedBalls, now) {
  if (!specialsModule) return;

  const nextState = specialsModule.activateRouletteEffect(ball, brick, spawnedBalls, now, {
    rouletteAnimationSeed,
    rouletteAnimations,
    pendingRouletteEffects
  });

  rouletteAnimationSeed = nextState.rouletteAnimationSeed;
  rouletteAnimations = nextState.rouletteAnimations;
  pendingRouletteEffects = nextState.pendingRouletteEffects;
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
  if (!deceptiveModule) return false;
  const state = {
    currentPhase,
    deceptivePhase,
    paused,
    guessShots,
    paddle
  };
  const fired = deceptiveModule.fireDeceptiveShot(state);
  guessShots = state.guessShots;
  return fired;
}

function beginDeceptiveSequence(ball, brick, now) {
  if (!deceptiveModule) return;
  const state = {
    deceptivePhase
  };
  deceptiveModule.beginDeceptiveSequence(ball, brick, now, state, {
    setStatus: (text) => {
      statusDisplay.textContent = text;
    }
  });
}

function updateDeceptiveGuessShots(now, delta) {
  if (!deceptiveModule) return;
  const state = {
    currentPhase,
    deceptivePhase,
    guessShots,
    bricks,
    lives
  };
  deceptiveModule.updateDeceptiveGuessShots(now, delta, state, {
    setStatus: (text) => {
      statusDisplay.textContent = text;
    },
    updateHud,
    endGame
  });
  guessShots = state.guessShots;
  lives = state.lives;
}

function updateDeceptivePhase(now) {
  if (!deceptiveModule) return;
  const state = {
    currentPhase,
    deceptivePhase,
    bricks
  };
  deceptiveModule.updateDeceptivePhase(now, state, {
    setStatus: (text) => {
      statusDisplay.textContent = text;
    }
  });
}

function handleBrickCollision(ball, brick, previousBallX, previousBallY, spawnedBalls, now) {
  if (currentPhase === 5 && brick.type === 'deceptive') {
    if (deceptivePhase.stage === 'idle') {
      beginDeceptiveSequence(ball, brick, now);
    }
    ball.deceptiveFrozen = true;
    return;
  }

  if (brick.type === 'boss-core') {
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
    const basePoints = brick.type === 'nuclear' ? 14 : 10;
    score += Math.round(basePoints * phaseMultiplier);
    updateHud(now);

    triggerSpecialEffect(brick.type, {
      now,
      brick,
      ball,
      spawnedBalls,
      sourceVx: ball.vx,
      sourceVy: ball.vy
    });
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

function handlePhaseCountdown(now) {
  if (phaseCountdownEndsAt <= 0) return true;

  const remaining = Math.ceil((phaseCountdownEndsAt - now) / 1000);
  if (remaining > 0) {
    statusDisplay.textContent = `${getPhaseTitle()} starts in ${remaining}... Paddle ${BreakoutUtils.toPercent(BreakoutUtils.getPaddleSpeedMultiplierFor(currentPhase, 1.02))}%`;
    return false;
  }

  phaseCountdownEndsAt = 0;
  statusDisplay.textContent = `${getPhaseTitle()} — ball ${BreakoutUtils.toPercent(phaseMultiplier)}% | paddle ${BreakoutUtils.toPercent(BreakoutUtils.getPaddleSpeedMultiplierFor(currentPhase, 1.02))}%`;
  if (autoLaunchAfterCountdown) {
    launchBallRandom();
    autoLaunchAfterCountdown = false;
  }
  return true;
}

function updatePreBallSystems(now, delta) {
  updateTimedDropEmitters(now);
  updateTurrets(now);
  updateEvilHands(now, delta);
  updateCowboyOutlaws(now, delta);
  updateDeceptivePhase(now);
  updateDeceptiveGuessShots(now, delta);

  if (isWaterEffectActive(now)) {
    if (isWaveSurgeActive(now) && waterEffect.rowsTo < waterEffect.levelRows * 2) {
      setWaterRowsTarget(waterEffect.levelRows * 2, now);
    } else if (!isWaveSurgeActive(now) && waterEffect.rowsTo > waterEffect.levelRows) {
      setWaterRowsTarget(waterEffect.levelRows, now);
    }
  }

  if (waterEffect.activeUntil > 0 && now >= waterEffect.activeUntil) {
    waterEffect.activeUntil = 0;
    waterEffect.startedAt = 0;
    waterEffect.surgeUntil = 0;
    waterEffect.rowsCurrent = waterEffect.levelRows;
    waterEffect.rowsFrom = waterEffect.levelRows;
    waterEffect.rowsTo = waterEffect.levelRows;
    waterEffect.rowsTransitionStartedAt = 0;
  }
}

function updatePaddleMovementAndWeapons(now, delta) {
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
  updateCowboyBullets(now, delta);

  return waterActive;
}

function updateProjectilesAndFallingItems(now, delta, waterActive) {
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
      } else if (item.kind === 'shield') {
        paddleShieldUntil = now + 15000;
        statusDisplay.textContent = 'Shield active for 15s';
      }
      return false;
    }

    return item.y < canvas.height + 20;
  });
}

function updateBallsAndPhaseProgression(now, delta, waterActive) {
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
      const minBallSpeed = phaseBallSpeed * (ball.speedFactor || 1);
      const speed = Math.max(minBallSpeed, Math.hypot(ball.vx, ball.vy));
      ball.vx = hitPosition * speed * 0.9;
      ball.vy = -Math.sqrt(Math.max(1, speed * speed - ball.vx * ball.vx));
    }

    radioactiveZones.forEach((zone) => {
      if (zone.endsAt > now && zoneIntersectsBall(zone, ball)) {
        ball.nuclearBoostEndsAt = Math.max(ball.nuclearBoostEndsAt || 0, now + 7000);
        ball.radioactive = true;
      }
    });

    cowboyOutlaws.forEach((outlaw) => {
      hitCowboyOutlawWithBall(ball, outlaw, now);
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
    return false;
  }

  if (bricks.every((brick) => !brick.alive) && cowboyOutlaws.length === 0) {
    if (currentPhase < maxPhases) {
      startNextPhase();
      return false;
    }

    endGame('You cleared the board!');
    return false;
  }

  return true;
}

function update(delta) {
  if (gameState !== 'running' || paused) return;

  const now = performance.now();
  resolveRouletteEffects(now);
  updateEffectsDisplay(now);

  if (!handlePhaseCountdown(now)) return;

  updatePreBallSystems(now, delta);

  if (awaitingServe) {
    const primaryBall = balls[0];
    if (primaryBall) {
      primaryBall.x = paddle.x + paddle.width / 2;
      primaryBall.y = paddle.y - 14;
    }
    return;
  }

  const waterActive = updatePaddleMovementAndWeapons(now, delta);
  updateProjectilesAndFallingItems(now, delta, waterActive);

  if (gameState !== 'running') return;

  updateBallsAndPhaseProgression(now, delta, waterActive);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawWaterEffect();
  drawBricks();
  drawCowboyOutlaws();
  drawRadioactiveZones();
  drawRouletteAnimations();
  drawEvilHands();
  drawFallingItems();
  drawGuns();
  drawBullets();
  drawCowboyBullets();
  drawTurretBullets();
  drawGuessShots();
  drawTurrets();
  drawPaddle();
  drawBalls();
  drawWaterImpacts();
  drawHammerInventory();
  drawSpotlightCone();
  drawDeceptiveHint();
  drawPhaseCountdownOverlay();
}

function drawSpotlightCone() {
  if (!drawEffectsModule) return;
  drawEffectsModule.drawSpotlightCone(ctx, canvas, {
    isSpotlightActive,
    getSpotlightGeometry
  });
}

function drawPaddle() {
  const isBoosted = paddleBoostEndsAt > performance.now();
  const now = performance.now();
  const invulnerableRemaining = Math.max(0, getPaddleInvulnerableUntil() - now);

  if (invulnerableRemaining > 0) {
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 2;
    ctx.strokeRect(paddle.x, paddle.y, paddle.width, paddle.height);
    ctx.lineWidth = 1;

    const seconds = (Math.ceil(invulnerableRemaining / 100) / 10).toFixed(1);
    ctx.fillStyle = '#dbeafe';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(seconds, paddle.x + paddle.width / 2, paddle.y - 8);
    drawPaddleEyes(false);
    return;
  }

  if (isSpotlightActive(now)) {
    ctx.fillStyle = '#facc15';
    ctx.fillRect(paddle.x + 8, paddle.y + 2, paddle.width - 16, paddle.height - 4);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(paddle.x + paddle.width / 2 - 3, paddle.y + 3, 6, paddle.height - 6);
    ctx.strokeStyle = '#fde68a';
    ctx.strokeRect(paddle.x + 8, paddle.y + 2, paddle.width - 16, paddle.height - 4);
    drawPaddleEyes(false);
    return;
  }

  if (!isBoosted) {
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    drawPaddleEyes(false);
    return;
  }

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
  drawPaddleEyes(true);
}

function drawPaddleEyes(isMushroom) {
  const now = performance.now();
  if (paddleFace.nextBlinkAt <= 0) {
    paddleFace.nextBlinkAt = now + 2000;
  }

  if (!paddleFace.deadEyes && now >= paddleFace.nextBlinkAt) {
    if (Math.random() < 0.5) {
      paddleFace.blinkUntil = now + 140;
    }
    paddleFace.nextBlinkAt = now + 2000;
  }

  const eyeOffsetX = paddle.width * 0.19;
  const eyeY = paddle.y + (isMushroom ? 6 : paddle.height / 2);
  const leftEyeX = paddle.x + paddle.width / 2 - eyeOffsetX;
  const rightEyeX = paddle.x + paddle.width / 2 + eyeOffsetX;
  const eyeRadius = isMushroom ? 6.12 : 5.58;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(leftEyeX, eyeY, eyeRadius, 0, Math.PI * 2);
  ctx.arc(rightEyeX, eyeY, eyeRadius, 0, Math.PI * 2);
  ctx.fill();

  if (paddleFace.deadEyes) {
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.4;
    const xSize = eyeRadius * 0.85;
    [leftEyeX, rightEyeX].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x - xSize, eyeY - xSize);
      ctx.lineTo(x + xSize, eyeY + xSize);
      ctx.moveTo(x - xSize, eyeY + xSize);
      ctx.lineTo(x + xSize, eyeY - xSize);
      ctx.stroke();
    });
    ctx.lineWidth = 1;
    return;
  }

  if (now < paddleFace.blinkUntil) {
    ctx.strokeStyle = '#111827';
    ctx.beginPath();
    ctx.moveTo(leftEyeX - eyeRadius, eyeY);
    ctx.lineTo(leftEyeX + eyeRadius, eyeY);
    ctx.moveTo(rightEyeX - eyeRadius, eyeY);
    ctx.lineTo(rightEyeX + eyeRadius, eyeY);
    ctx.stroke();
    return;
  }

  const target = balls.find((ball) => !ball.deceptiveFrozen) || balls[0];
  const tx = target ? target.x : paddle.x + paddle.width / 2;
  const ty = target ? target.y : paddle.y;
  const pupilRadius = eyeRadius * 0.46;

  function drawPupil(ex, ey) {
    const dx = tx - ex;
    const dy = ty - ey;
    const magnitude = Math.hypot(dx, dy) || 1;
    const travel = eyeRadius * 0.52;
    const px = ex + (dx / magnitude) * Math.min(travel, magnitude);
    const py = ey + (dy / magnitude) * Math.min(travel, magnitude);
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(px, py, pupilRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPupil(leftEyeX, eyeY);
  drawPupil(rightEyeX, eyeY);
}

function drawBalls() {
  balls.forEach((ball) => {
    if (ball.deceptiveFrozen && currentPhase === 5) return;

    const activeBoost = (ball.nuclearBoostEndsAt && ball.nuclearBoostEndsAt > performance.now()) || ball.radioactive;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ball.cowboyDecor ? '#d6b38a' : activeBoost ? '#22c55e' : '#f8fafc';
    ctx.fill();

    if (activeBoost) {
      ctx.strokeStyle = '#bbf7d0';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    if (ball.cowboyDecor) {
      const hatScale = Math.max(1.84, ball.radius * 0.102);
      const spin = (performance.now() * 0.01 + ball.x * 0.03) % (Math.PI * 2);
      drawCowboyHat(ball.x, ball.y - ball.radius - 6, hatScale);
      drawCowboyRevolvers(ball.x, ball.y + 1, {
        scale: Math.max(0.85, ball.radius * 0.07),
        spread: ball.radius + 7,
        spin
      });
      drawCowboyFace(ball.x, ball.y + 1, Math.max(4.8, ball.radius * 0.56), 'happy');
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
    } else if (brick.type === 'cowboy') {
      const cx = brick.x + brick.width / 2;
      const cy = brick.y + brick.height / 2 + 1;
      ctx.fillStyle = '#d6b38a';
      ctx.fillRect(brick.x + 2, brick.y + 2, brick.width - 4, brick.height - 4);
      drawCowboyHat(cx, brick.y - 1, 1.6);
      drawCowboyFace(cx, cy + 1, 8, 'happy');
    } else if (brick.type === 'flashlight') {
      const cx = brick.x + brick.width / 2;
      const cy = brick.y + brick.height / 2;
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(cx - 3, cy - 4, 6, 10);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(cx - 8, cy - 8, 16, 6);
      ctx.fillStyle = 'rgba(253, 224, 71, 0.6)';
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy - 2);
      ctx.lineTo(cx + 7, cy - 2);
      ctx.lineTo(cx + 15, cy + 9);
      ctx.lineTo(cx - 15, cy + 9);
      ctx.closePath();
      ctx.fill();
    } else if (brick.type === 'meteor') {
      const cx = brick.x + brick.width / 2;
      const cy = brick.y + brick.height / 2;
      const meteorScale = 1.9;
      const flamePulse = 0.75 + Math.sin(now * 0.02 + brick.x * 0.07) * 0.25;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(cx, cy, 8 * meteorScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(cx + 2 * meteorScale, cy - 2 * meteorScale, 3 * meteorScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(251, 146, 60, ${0.65 + flamePulse * 0.25})`;
      ctx.beginPath();
      ctx.moveTo(cx - 6 * meteorScale, cy - 5 * meteorScale);
      ctx.quadraticCurveTo(cx - 2 * meteorScale, cy - 13 * meteorScale - flamePulse * 3, cx, cy - 8 * meteorScale);
      ctx.quadraticCurveTo(cx + 2 * meteorScale, cy - 14 * meteorScale - flamePulse * 3, cx + 6 * meteorScale, cy - 5 * meteorScale);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(254, 215, 170, ${0.5 + flamePulse * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(cx - 2.6 * meteorScale, cy - 6 * meteorScale);
      ctx.quadraticCurveTo(cx, cy - 11 * meteorScale - flamePulse * 2.5, cx + 2.6 * meteorScale, cy - 6 * meteorScale);
      ctx.closePath();
      ctx.fill();
    } else if (brick.type === 'shield') {
      const cx = brick.x + brick.width / 2;
      const cy = brick.y + brick.height / 2;
      ctx.fillStyle = '#1d4ed8';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 9);
      ctx.lineTo(cx + 9, cy - 3);
      ctx.lineTo(cx + 6, cy + 8);
      ctx.lineTo(cx, cy + 12);
      ctx.lineTo(cx - 6, cy + 8);
      ctx.lineTo(cx - 9, cy - 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#bfdbfe';
      ctx.stroke();
    }
  });
}

function getCowboyMood(outlaw) {
  if (outlaw.state === 'idle') return 'happy';
  if (outlaw.hits >= 2) return 'happy';
  if (outlaw.hits === 1) return 'less-angry';
  return 'angry';
}

function drawCowboyHat(centerX, topY, scale = 1) {
  if (!cowboyRenderModule) return;
  cowboyRenderModule.drawCowboyHat(ctx, cowboyHatSprite, centerX, topY, scale);
}

function drawCowboyRevolvers(centerX, centerY, options = {}) {
  if (!cowboyRenderModule) return;
  cowboyRenderModule.drawCowboyRevolvers(ctx, centerX, centerY, options);
}

function drawCowboyFace(centerX, centerY, radius, mood) {
  if (!cowboyRenderModule) return;
  cowboyRenderModule.drawCowboyFace(ctx, centerX, centerY, radius, mood);
}

function drawCowboyOutlaws() {
  cowboyOutlaws.forEach((outlaw) => {
    if (outlaw.state === 'idle') {
      ctx.strokeStyle = 'rgba(220, 38, 38, 0.88)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(outlaw.x, outlaw.y + outlaw.radius);
      ctx.lineTo(outlaw.x, canvas.height);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    ctx.fillStyle = '#d6b38a';
    ctx.beginPath();
    ctx.arc(outlaw.x, outlaw.y, outlaw.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#92400e';
    ctx.stroke();

    const spinProgress = outlaw.gunSpinUntil > performance.now()
      ? (performance.now() - (outlaw.gunSpinStartedAt || performance.now())) / 1000
      : 0;
    const spinAngle = outlaw.gunSpinUntil > performance.now() ? spinProgress * Math.PI * 4 : 0;

    drawCowboyHat(outlaw.x, outlaw.y - outlaw.radius - 14, 1.84);
    drawCowboyRevolvers(outlaw.x, outlaw.y + 5, { scale: 1.6, spread: outlaw.radius + 14, spin: spinAngle });
    const faceRadius = outlaw.hits > 0 ? outlaw.radius * 0.72 : outlaw.radius * 0.58;
    drawCowboyFace(outlaw.x, outlaw.y + 1, faceRadius, getCowboyMood(outlaw));
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
  if (!drawEffectsModule) return;
  drawEffectsModule.drawGuns(ctx, guns);
}

function drawBullets() {
  if (!drawEffectsModule) return;
  drawEffectsModule.drawBullets(ctx, bullets);
}

function drawCowboyBullets() {
  if (!drawEffectsModule) return;
  drawEffectsModule.drawCowboyBullets(ctx, cowboyBullets);
}

function drawWaterImpacts() {
  if (!drawEffectsModule) return;
  waterImpacts = drawEffectsModule.drawWaterImpacts(ctx, waterImpacts);
}

function drawTurretBullets() {
  if (!drawEffectsModule) return;
  drawEffectsModule.drawTurretBullets(ctx, turretBullets);
}

function drawGuessShots() {
  if (!drawEffectsModule) return;
  drawEffectsModule.drawGuessShots(ctx, guessShots);
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
  if (!drawEffectsModule) return;
  drawEffectsModule.drawHammerInventory(ctx, canvas, hammerCount, minigunCharges);
}

function drawFallingItems() {
  if (!drawEffectsModule) return;
  drawEffectsModule.drawFallingItems(ctx, fallingItems, {
    drawHeartShape
  });
}

function drawPhaseCountdownOverlay() {
  if (!drawEffectsModule) return;
  drawEffectsModule.drawPhaseCountdownOverlay(ctx, canvas, phaseCountdownEndsAt, gameState, getPhaseTitle);
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
  if (!leaderboardModule) return Promise.resolve('Anonymous');
  return leaderboardModule.promptForPlayerName(document);
}

async function saveHighScore() {
  if (!leaderboardModule) return;
  await leaderboardModule.saveHighScore(score, STORAGE_KEY, MAX_LEADERBOARD_ENTRIES, leaderboardList);
}

function renderLeaderboard(entries) {
  if (!leaderboardModule) return;
  leaderboardModule.renderLeaderboard(entries, leaderboardList);
}

function loadLeaderboard() {
  if (!leaderboardModule) return;
  leaderboardModule.loadLeaderboard(STORAGE_KEY, leaderboardList);
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

if (controlsModule) {
  controlsModule.bindControls({
    windowRef: window,
    canvas,
    startButton,
    pauseButton,
    restartButton,
    actionButton,
    getState: () => ({
      gameState,
      paused,
      awaitingServe,
      phaseCountdownEndsAt,
      currentPhase,
      deceptiveStage: deceptivePhase.stage,
      minigunCharges,
      hammerCount
    }),
    setHorizontalKey: (key, value) => {
      keys[key] = value;
    },
    onTogglePause: togglePause,
    onStartGame: startGame,
    onLaunchBallRandom: () => launchBallRandom(),
    onDeployMinigun: deployMinigun,
    onDeployTurret: deployTurret,
    onFireDeceptiveShot: fireDeceptiveShot,
    onResetGame: resetGame,
    onTriggerActionPower: triggerActionPower,
    onMovePaddleByClientX: movePaddleByClientX,
    setStatus: (text) => {
      statusDisplay.textContent = text;
    }
  });

  controlsModule.setupServiceWorker(window, navigator);
}

resetGame();
loadLeaderboard();
requestAnimationFrame(loop);
