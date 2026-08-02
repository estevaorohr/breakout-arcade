(function attachBreakoutSpecials(globalScope) {
  function triggerSpecialEffect(type, context = {}, api) {
    const now = context.now || performance.now();
    const brick = context.brick;
    if (!brick) return false;

    if (type === 'extra-ball') {
      if (context.ball && context.spawnedBalls) {
        api.spawnExtraBallFrom(context.ball, context.spawnedBalls);
      } else {
        api.spawnDelayedExtraBall(
          brick.x + brick.width / 2,
          brick.y + brick.height / 2,
          context.sourceVx || 0,
          context.sourceVy || -api.phaseBallSpeed
        );
      }
      api.setStatus('Extra ball activated');
      return true;
    }

    if (type === 'roulette') {
      if (context.ball && context.spawnedBalls) {
        api.activateRouletteEffect(context.ball, brick, context.spawnedBalls, now);
        return true;
      }
    }

    if (type === 'wave') {
      api.activateWaterWave(now);
      return true;
    }

    if (type === 'evil') {
      api.spawnEvilHand(brick, now);
      api.setStatus('Evil hand summoned');
      return true;
    }

    if (type === 'cowboy') {
      api.spawnCowboyOutlaw(brick, now);
      api.setStatus('Cowboy transformed');
      return true;
    }

    if (type === 'harm-drop') {
      api.spawnHarmRain(brick, now);
      api.setStatus('Watch out: rain storm');
      return true;
    }

    if (type === 'nuclear') {
      api.detonateNuclearBrick(brick, now);
      if (context.ball) {
        api.applyNuclearBoost(context.ball, now);
      }
      api.setStatus('Radioactive blast unleashed');
      return true;
    }

    if (type === 'meteor') {
      api.spawnLavaRain(brick, now);
      api.setStatus('Meteor rain unleashed');
      return true;
    }

    if (type === 'mushroom') {
      api.spawnFallingItem('mushroom', brick.x + brick.width / 2 - 9, brick.y + brick.height / 2 - 9, undefined, 2.2 * 1.38);
      api.setStatus('Catch the mushroom power-up');
      return true;
    }

    if (type === 'hammer') {
      api.spawnFallingItem('hammer', brick.x + brick.width / 2 - 9, brick.y + brick.height / 2 - 9, '#f59e0b', 2.35);
      api.setStatus('Catch the hammer power-up');
      return true;
    }

    if (type === 'extra-life') {
      api.spawnFallingItem('heart', brick.x + brick.width / 2 - 9, brick.y + brick.height / 2 - 9, '#f43f5e', 2.25);
      api.setStatus('Catch the extra life heart');
      return true;
    }

    if (type === 'shield') {
      api.spawnFallingItem('shield', brick.x + brick.width / 2 - 9, brick.y + brick.height / 2 - 9, '#1d4ed8', 2.2);
      api.setStatus('Catch the shield');
      return true;
    }

    if (type === 'flashlight') {
      api.activateSpotlight(now);
      return true;
    }

    return false;
  }

  function resolveRouletteEffects(now, state, api) {
    if (!state.pendingRouletteEffects.length) return state;

    const readyEffects = [];
    const pendingRouletteEffects = state.pendingRouletteEffects.filter((effect) => {
      if (effect.executeAt <= now) {
        readyEffects.push(effect);
        return false;
      }
      return true;
    });

    const rouletteAnimations = state.rouletteAnimations;
    readyEffects.forEach((effect) => {
      const brick = effect.sourceBrick;

      const animation = rouletteAnimations.find((entry) => entry.id === effect.animationId);
      const goodResult = Math.random() < 0.5;
      if (animation) {
        animation.resultColor = goodResult ? 'green' : 'red';
        animation.rotation = Math.round(animation.rotation / Math.PI) * Math.PI;
      }

      const goodOutcomes = ['extra-life', 'hammer', 'extra-ball', 'shield'];
      const badOutcomes = ['harm-drop', 'nuclear', 'meteor', 'wave', 'evil', 'mushroom'];
      const outcomePool = goodResult ? goodOutcomes : badOutcomes;
      const outcome = outcomePool[Math.floor(Math.random() * outcomePool.length)];

      api.triggerSpecialEffect(outcome, {
        now,
        brick,
        sourceVx: effect.sourceVx,
        sourceVy: effect.sourceVy
      });
      api.setStatus(`Roulette: ${outcome}`);
    });

    return {
      pendingRouletteEffects,
      rouletteAnimations
    };
  }

  function activateRouletteEffect(ball, brick, spawnedBalls, now, state) {
    const animationId = state.rouletteAnimationSeed;
    const rouletteAnimationSeed = state.rouletteAnimationSeed + 1;

    const rouletteAnimations = state.rouletteAnimations.concat([
      {
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
      }
    ]);

    const pendingRouletteEffects = state.pendingRouletteEffects.concat([
      {
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
      }
    ]);

    return {
      rouletteAnimationSeed,
      rouletteAnimations,
      pendingRouletteEffects
    };
  }

  globalScope.BreakoutSpecials = {
    triggerSpecialEffect,
    resolveRouletteEffects,
    activateRouletteEffect
  };
})(typeof window !== 'undefined' ? window : globalThis);
