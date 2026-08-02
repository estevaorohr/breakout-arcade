(function attachBreakoutUtils(globalScope) {
  const BreakoutUtils = {
    clampToCanvas(x, y, radius, canvasWidth, canvasHeight) {
      return {
        x: Math.max(radius, Math.min(canvasWidth - radius, x)),
        y: Math.max(radius, Math.min(canvasHeight - radius, y))
      };
    },

    getPhaseMultiplierFor(phase, growthEarly, growthLate) {
      if (phase <= 1) return 1;
      if (phase <= 10) {
        return Math.pow(growthEarly, phase - 1);
      }

      const phase10Multiplier = Math.pow(growthEarly, 9);
      return phase10Multiplier * Math.pow(growthLate, phase - 10);
    },

    getPaddleSpeedMultiplierFor(phase, growthPerPhase) {
      if (phase <= 1) return 1;
      return Math.pow(growthPerPhase, phase - 1);
    },

    toPercent(multiplier) {
      return Math.round(multiplier * 100);
    }
  };

  globalScope.BreakoutUtils = BreakoutUtils;
})(typeof window !== 'undefined' ? window : globalThis);
