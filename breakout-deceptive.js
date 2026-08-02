(function attachBreakoutDeceptive(globalScope) {
  function fireDeceptiveShot(state) {
    if (state.currentPhase !== 5 || state.deceptivePhase.stage !== 'guess' || state.paused) return false;

    state.guessShots.push({
      x: state.paddle.x + state.paddle.width / 2,
      y: state.paddle.y - 6,
      radius: 4,
      vy: -8
    });
    return true;
  }

  function beginDeceptiveSequence(ball, brick, now, state, api) {
    state.deceptivePhase.stage = 'locking';
    state.deceptivePhase.targetBrick = brick;
    state.deceptivePhase.capturedBall = ball;
    state.deceptivePhase.stageStartedAt = now;
    state.deceptivePhase.stageEndsAt = now + 3000;
    state.deceptivePhase.nextSwapAt = 0;
    state.deceptivePhase.shuffleEndsAt = 0;
    ball.deceptiveFrozen = true;
    api.setStatus('Watch closely... the blocks will shuffle');
  }

  function startDeceptiveShuffle(now, state, api) {
    state.deceptivePhase.stage = 'shuffling';
    state.deceptivePhase.stageStartedAt = now;
    state.deceptivePhase.nextSwapAt = now;
    state.deceptivePhase.shuffleEndsAt = now + 9750;
    api.setStatus('Shuffling! Follow where the ball is hidden');
  }

  function triggerDeceptiveSwap(now, state) {
    const alive = state.bricks.filter((brick) => brick.alive && brick.type === 'deceptive');
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
    first.swapEndAt = now + 300;
    first.swapArcDir = Math.random() < 0.5 ? -1 : 1;

    second.swapFromX = secondStartX;
    second.swapFromY = secondStartY;
    second.swapToX = firstStartX;
    second.swapToY = firstStartY;
    second.swapStartAt = now;
    second.swapEndAt = now + 300;
    second.swapArcDir = -first.swapArcDir;
  }

  function updateDeceptiveBrickSwaps(now, state) {
    state.bricks.forEach((brick) => {
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

  function updateDeceptiveGuessShots(now, delta, state, api) {
    if (state.currentPhase !== 5) {
      state.guessShots = [];
      return;
    }

    if (state.deceptivePhase.stage !== 'guess') {
      state.guessShots = [];
      return;
    }

    state.guessShots = state.guessShots.filter((shot) => {
      shot.y += shot.vy * delta;
      if (shot.y < -20) return false;

      const hitBrick = state.bricks.find((brick) => {
        if (!brick.alive || brick.type !== 'deceptive') return false;
        return (
          shot.x + shot.radius > brick.x &&
          shot.x - shot.radius < brick.x + brick.width &&
          shot.y + shot.radius > brick.y &&
          shot.y - shot.radius < brick.y + brick.height
        );
      });

      if (!hitBrick) return true;

      if (hitBrick === state.deceptivePhase.targetBrick) {
        api.setStatus('Correct block! Phase cleared');
        state.bricks.forEach((brick) => {
          if (brick.type === 'deceptive') brick.alive = false;
        });
        return false;
      }

      hitBrick.alive = false;
      if (state.deceptivePhase.targetBrick && !state.deceptivePhase.targetBrick.alive) {
        const aliveAlternatives = state.bricks.filter((brick) => brick.alive && brick.type === 'deceptive');
        state.deceptivePhase.targetBrick = aliveAlternatives[Math.floor(Math.random() * aliveAlternatives.length)] || null;
      }
      state.lives = Math.max(0, state.lives - 1);
      api.updateHud(now);
      if (state.lives <= 0) {
        api.endGame('Game over');
        return false;
      }
      api.setStatus('Wrong block! You lost one life, try again');
      return false;
    });
  }

  function updateDeceptivePhase(now, state, api) {
    if (state.currentPhase !== 5) return;

    updateDeceptiveBrickSwaps(now, state);

    if (state.deceptivePhase.capturedBall && state.deceptivePhase.targetBrick && state.deceptivePhase.targetBrick.alive) {
      state.deceptivePhase.capturedBall.x = state.deceptivePhase.targetBrick.x + state.deceptivePhase.targetBrick.width / 2;
      state.deceptivePhase.capturedBall.y = state.deceptivePhase.targetBrick.y + state.deceptivePhase.targetBrick.height / 2;
    }

    if (state.deceptivePhase.stage === 'locking' && now >= state.deceptivePhase.stageEndsAt) {
      startDeceptiveShuffle(now, state, api);
    }

    if (state.deceptivePhase.stage === 'shuffling') {
      while (now >= state.deceptivePhase.nextSwapAt && now < state.deceptivePhase.shuffleEndsAt) {
        triggerDeceptiveSwap(now, state);
        state.deceptivePhase.nextSwapAt += 300;
      }

      if (now >= state.deceptivePhase.shuffleEndsAt) {
        state.deceptivePhase.stage = 'guess';
        api.setStatus('Press Arrow Up to shoot the hidden block');
      }
    }
  }

  globalScope.BreakoutDeceptive = {
    fireDeceptiveShot,
    beginDeceptiveSequence,
    updateDeceptiveGuessShots,
    updateDeceptivePhase
  };
})(typeof window !== 'undefined' ? window : globalThis);
