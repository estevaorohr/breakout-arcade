(function attachBreakoutEntities(globalScope) {
  function spawnCowboyOutlaw(brick, now = performance.now()) {
    return {
      x: brick.x + brick.width / 2,
      y: brick.y + brick.height / 2,
      radius: 18,
      state: 'idle',
      hits: 0,
      nextShotAt: 0,
      gunSpinUntil: 0,
      gunSpinStartedAt: 0,
      calmEndsAt: 0,
      vy: 0
    };
  }

  function fireCowboyPair(outlaw, now, state) {
    const targetX = state.paddle.x + state.paddle.width / 2;
    const targetY = state.paddle.y + state.paddle.height / 2;
    const dx = targetX - outlaw.x;
    const dy = targetY - outlaw.y;
    const magnitude = Math.hypot(dx, dy) || 1;
    const dirX = dx / magnitude;
    const dirY = dy / magnitude;
    const sideX = -dirY;
    const sideY = dirX;
    const speedModifier = state.currentPhase === 3 ? 0.85 : 1;
    const speed = 3.5 * state.hazardBulletSpeedMultiplier * speedModifier;
    const pairId = state.cowboyPairSequence;
    state.cowboyPairSequence += 1;

    const muzzleOffset = outlaw.radius + 5;
    const sideOffset = 6;

    state.cowboyBullets.push({
      x: outlaw.x + dirX * muzzleOffset + sideX * sideOffset,
      y: outlaw.y + dirY * muzzleOffset + sideY * sideOffset,
      radius: 4,
      vx: dirX * speed,
      vy: dirY * speed,
      color: '#ef4444',
      pairId
    });

    state.cowboyBullets.push({
      x: outlaw.x + dirX * muzzleOffset - sideX * sideOffset,
      y: outlaw.y + dirY * muzzleOffset - sideY * sideOffset,
      radius: 4,
      vx: dirX * speed,
      vy: dirY * speed,
      color: '#ef4444',
      pairId
    });

    outlaw.nextShotAt = now + 3000;
    outlaw.gunSpinStartedAt = now;
    outlaw.gunSpinUntil = now + 1000;
  }

  function updateCowboyOutlaws(now, delta, state, api) {
    for (const [pairId, endsAt] of state.cowboyPairHitUntil.entries()) {
      if (now >= endsAt) {
        state.cowboyPairHitUntil.delete(pairId);
      }
    }

    state.cowboyOutlaws = state.cowboyOutlaws.filter((outlaw) => {
      if (outlaw.state === 'idle') {
        if (state.paddle.x <= outlaw.x && state.paddle.x + state.paddle.width >= outlaw.x) {
          outlaw.state = 'angry';
          fireCowboyPair(outlaw, now, state);
          api.setStatus('Cowboy enraged');
        }
        return true;
      }

      if (outlaw.state === 'angry') {
        while (now >= outlaw.nextShotAt) {
          fireCowboyPair(outlaw, now, state);
        }
        return true;
      }

      if (outlaw.state === 'cooldown') {
        if (now >= outlaw.calmEndsAt) {
          outlaw.state = 'falling';
          outlaw.vy = 2.8;
        }
        return true;
      }

      if (outlaw.state === 'falling') {
        outlaw.y += outlaw.vy * delta;
        outlaw.vy = Math.min(8, outlaw.vy + 0.045 * delta);

        const intersectsPaddle =
          outlaw.x + outlaw.radius > state.paddle.x &&
          outlaw.x - outlaw.radius < state.paddle.x + state.paddle.width &&
          outlaw.y + outlaw.radius > state.paddle.y &&
          outlaw.y - outlaw.radius < state.paddle.y + state.paddle.height;

        if (intersectsPaddle) {
          const spawnPoint = api.clampToCanvas(outlaw.x, state.paddle.y - 14, 8, state.canvasWidth, state.canvasHeight);
          const cowboyBall = api.createBall(spawnPoint.x, spawnPoint.y, 0, 0, outlaw.radius, 0.8);
          cowboyBall.cowboyDecor = true;
          state.balls.push(cowboyBall);
          api.launchBallRandom(cowboyBall);
          state.awaitingServe = false;
          api.setStatus('Cowboy joined as an extra ball');
          return false;
        }

        if (outlaw.y - outlaw.radius > state.canvasHeight + 24) {
          return false;
        }
      }

      return true;
    });
  }

  function updateCowboyBullets(now, delta, state, api) {
    state.cowboyBullets = state.cowboyBullets.filter((bullet) => {
      bullet.x += bullet.vx * delta;
      bullet.y += bullet.vy * delta;

      if (
        bullet.x + bullet.radius > state.paddle.x &&
        bullet.x - bullet.radius < state.paddle.x + state.paddle.width &&
        bullet.y + bullet.radius > state.paddle.y &&
        bullet.y - bullet.radius < state.paddle.y + state.paddle.height
      ) {
        if (!state.cowboyPairHitUntil.has(bullet.pairId)) {
          state.cowboyPairHitUntil.set(bullet.pairId, now + 1200);
          api.loseLife('Cowboy shot! Life lost');
        }
        return false;
      }

      return (
        bullet.x > -40 &&
        bullet.x < state.canvasWidth + 40 &&
        bullet.y > -40 &&
        bullet.y < state.canvasHeight + 40
      );
    });
  }

  function hitCowboyOutlawWithBall(ball, outlaw, now, api) {
    if (outlaw.state === 'falling') return false;

    const dx = ball.x - outlaw.x;
    const dy = ball.y - outlaw.y;
    const distance = Math.hypot(dx, dy);
    const minDistance = ball.radius + outlaw.radius;

    if (distance >= minDistance) return false;

    const safeDistance = Math.max(0.0001, distance);
    const nx = dx / safeDistance;
    const ny = dy / safeDistance;
    const overlap = minDistance - distance + 0.4;
    ball.x += nx * overlap;
    ball.y += ny * overlap;

    const speedDot = ball.vx * nx + ball.vy * ny;
    ball.vx -= 2 * speedDot * nx;
    ball.vy -= 2 * speedDot * ny;

    if ((outlaw.state === 'angry' || outlaw.state === 'cooldown') && outlaw.hits < 2) {
      outlaw.hits += 1;
      if (outlaw.hits >= 2) {
        outlaw.state = 'cooldown';
        outlaw.calmEndsAt = now + 3000;
        outlaw.nextShotAt = 0;
        api.setStatus('Cowboy calmed down');
      }
    }

    return true;
  }

  function spawnEvilHand(brick, now = performance.now()) {
    return {
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
    };
  }

  function launchBallToRandomCorner(ball, now, state) {
    if (!ball) return;

    const margin = 26;
    const corners = [
      { x: margin, y: margin },
      { x: state.canvasWidth - margin, y: margin },
      { x: margin, y: state.canvasHeight * 0.52 },
      { x: state.canvasWidth - margin, y: state.canvasHeight * 0.52 }
    ];
    const corner = corners[Math.floor(Math.random() * corners.length)];
    ball.x = corner.x;
    ball.y = corner.y;

    const centerX = state.canvasWidth / 2;
    const centerY = state.canvasHeight / 2;
    const dx = centerX - ball.x;
    const dy = centerY - ball.y;
    const magnitude = Math.hypot(dx, dy) || 1;
    const speed = state.phaseBallSpeed * 1.15 * (ball.speedFactor || 1);
    let vx = (dx / magnitude) * speed;
    let vy = (dy / magnitude) * speed;

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

  function updateEvilHands(now, delta, state, api) {
    if (!state.evilHands.length) return;

    state.evilHands = state.evilHands.filter((hand) => {
      if (hand.disappearAt && now >= hand.disappearAt) {
        return false;
      }

      if (hand.state === 'holding-paddle') {
        if (now >= hand.releaseAt) {
          state.paddleOverdriveUntil = now + 10000;
          hand.disappearAt = now;
          return false;
        }
        hand.x = state.paddle.x + state.paddle.width / 2 - hand.width / 2;
        hand.y = state.paddle.y - hand.height + 2;
        return true;
      }

      if (hand.state === 'holding-ball') {
        const ball = hand.capturedBall;
        if (!ball) return false;

        ball.x = hand.x + hand.width / 2;
        ball.y = hand.y + hand.height * 0.55;
        if (now >= hand.releaseAt) {
          launchBallToRandomCorner(ball, now, state);
          hand.disappearAt = now;
          return false;
        }
        return true;
      }

      if (hand.state === 'waiting') {
        const paddleOverlap =
          hand.x + hand.width >= state.paddle.x &&
          hand.x < state.paddle.x + state.paddle.width &&
          hand.y + hand.height >= state.paddle.y &&
          hand.y < state.paddle.y + state.paddle.height;

        if (paddleOverlap) {
          state.paddleSnaredUntil = now + 1000;
          hand.state = 'holding-paddle';
          hand.releaseAt = now + 1000;
          hand.x = state.paddle.x + state.paddle.width / 2 - hand.width / 2;
          hand.y = state.paddle.y - hand.height + 2;
          api.setStatus('Evil hand trapped the paddle');
          return true;
        }

        if (now >= hand.pauseUntil) {
          return false;
        }
        return true;
      }

      hand.y += hand.vy * delta;

      const paddleOverlap =
        hand.x + hand.width >= state.paddle.x &&
        hand.x < state.paddle.x + state.paddle.width &&
        hand.y + hand.height >= state.paddle.y &&
        hand.y < state.paddle.y + state.paddle.height;

      if (paddleOverlap && hand.y + hand.height >= state.paddle.y + state.paddle.height) {
        state.paddleSnaredUntil = now + 1000;
        hand.state = 'holding-paddle';
        hand.releaseAt = now + 1000;
        hand.x = state.paddle.x + state.paddle.width / 2 - hand.width / 2;
        hand.y = state.paddle.y - hand.height + 2;
        api.setStatus('Evil hand trapped the paddle');
        return true;
      }

      const ball = now >= hand.canCatchBallAt ? state.balls.find((candidate) => {
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
        api.setStatus('Evil hand grabbed the ball');
        return true;
      }

      if (hand.y + hand.height >= state.paddle.y + state.paddle.height) {
        hand.y = state.paddle.y + state.paddle.height - hand.height;
        hand.state = 'waiting';
        hand.pauseUntil = now + 3000;
        return true;
      }

      return true;
    });
  }

  globalScope.BreakoutEntities = {
    spawnCowboyOutlaw,
    updateCowboyOutlaws,
    updateCowboyBullets,
    hitCowboyOutlawWithBall,
    spawnEvilHand,
    updateEvilHands
  };
})(typeof window !== 'undefined' ? window : globalThis);
