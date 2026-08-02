(function attachBreakoutControls(globalScope) {
  function bindControls(config) {
    const {
      windowRef,
      canvas,
      startButton,
      pauseButton,
      restartButton,
      actionButton,
      getState,
      setHorizontalKey,
      onTogglePause,
      onStartGame,
      onLaunchBallRandom,
      onDeployMinigun,
      onDeployTurret,
      onFireDeceptiveShot,
      onResetGame,
      onTriggerActionPower,
      onMovePaddleByClientX,
      setStatus
    } = config;

    let activePointerId = null;
    let activePointerStartX = 0;
    let activePointerStartY = 0;
    let activePointerStartAt = 0;

    windowRef.addEventListener('keydown', (event) => {
      const state = getState();

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (state.gameState === 'running') {
          event.preventDefault();
          const active = document.activeElement;
          if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)) {
            active.blur();
          }
        }
        setHorizontalKey(event.key, true);
      }

      if (event.key === 'Escape' && state.gameState === 'running') {
        event.preventDefault();
        onTogglePause();
      }

      if (event.code === 'Enter') {
        event.preventDefault();
        if (state.gameState === 'ready' || state.gameState === 'over') {
          onStartGame();
        } else if (state.gameState === 'running' && state.awaitingServe && !state.paused && state.phaseCountdownEndsAt <= 0) {
          onLaunchBallRandom();
          setStatus('Use ← → to move');
        }
      }

      if (event.code === 'Space') {
        event.preventDefault();
        if (state.gameState === 'running' && !state.paused) {
          if (state.minigunCharges > 0) {
            onDeployMinigun(performance.now());
          } else if (state.hammerCount > 0) {
            onDeployTurret(performance.now());
          }
        } else if (state.gameState === 'ready' || state.gameState === 'over') {
          onStartGame();
        }
      }

      if (event.code === 'ArrowUp') {
        if (state.gameState === 'running') {
          event.preventDefault();
          onFireDeceptiveShot();
        }
      }
    });

    windowRef.addEventListener('keyup', (event) => {
      const state = getState();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (state.gameState === 'running') {
          event.preventDefault();
        }
        setHorizontalKey(event.key, false);
      }
    });

    startButton.addEventListener('click', () => {
      onStartGame();
    });

    pauseButton.addEventListener('click', onTogglePause);
    restartButton.addEventListener('click', () => {
      onResetGame();
    });

    if (actionButton) {
      actionButton.addEventListener('click', () => {
        onTriggerActionPower(performance.now());
      });
    }

    canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      activePointerId = event.pointerId;
      activePointerStartX = event.clientX;
      activePointerStartY = event.clientY;
      activePointerStartAt = performance.now();
      canvas.setPointerCapture(event.pointerId);
      onMovePaddleByClientX(event.clientX);

      const state = getState();
      if (state.gameState === 'running' && state.awaitingServe && !state.paused && state.phaseCountdownEndsAt <= 0) {
        onLaunchBallRandom();
        setStatus('Use arrows or drag to move');
      }
    });

    canvas.addEventListener('pointermove', (event) => {
      if (activePointerId !== event.pointerId) return;
      event.preventDefault();
      onMovePaddleByClientX(event.clientX);
    });

    canvas.addEventListener('pointerup', (event) => {
      if (activePointerId !== event.pointerId) return;

      const swipeDistanceX = event.clientX - activePointerStartX;
      const swipeDistanceY = event.clientY - activePointerStartY;
      const swipeDuration = performance.now() - activePointerStartAt;
      const state = getState();
      if (
        event.pointerType === 'touch' &&
        state.gameState === 'running' &&
        !state.paused &&
        state.phaseCountdownEndsAt <= 0 &&
        state.currentPhase === 5 &&
        state.deceptiveStage === 'guess' &&
        swipeDistanceY < -40 &&
        Math.abs(swipeDistanceY) > Math.abs(swipeDistanceX) &&
        swipeDuration < 900
      ) {
        onFireDeceptiveShot();
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
  }

  function setupServiceWorker(windowRef, navigatorRef) {
    if (!('serviceWorker' in navigatorRef)) return;

    windowRef.addEventListener('load', () => {
      const isLocalHost =
        windowRef.location.hostname === 'localhost' ||
        windowRef.location.hostname === '127.0.0.1' ||
        windowRef.location.hostname === '::1';

      if (isLocalHost) {
        navigatorRef.serviceWorker
          .getRegistrations()
          .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
          .catch((error) => {
            console.error('Service worker cleanup failed:', error);
          });

        if ('caches' in windowRef) {
          caches
            .keys()
            .then((cacheNames) => Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName))))
            .catch((error) => {
              console.error('Cache cleanup failed:', error);
            });
        }

        return;
      }

      navigatorRef.serviceWorker.register('./sw.js').catch((error) => {
        console.error('Service worker registration failed:', error);
      });
    });
  }

  globalScope.BreakoutControls = {
    bindControls,
    setupServiceWorker
  };
})(typeof window !== 'undefined' ? window : globalThis);
