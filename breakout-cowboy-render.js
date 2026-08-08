(function attachBreakoutCowboyRender(globalScope) {
  function drawCowboyHat(ctx, cowboyHatSprite, centerX, topY, scale = 1) {
    if (cowboyHatSprite.complete && cowboyHatSprite.naturalWidth > 0) {
      const width = 26 * scale;
      const height = 16 * scale;
      ctx.drawImage(cowboyHatSprite, centerX - width / 2, topY, width, height);
      return;
    }

    ctx.fillStyle = '#7c3f12';
    ctx.fillRect(centerX - 12 * scale, topY + 7 * scale, 24 * scale, 3 * scale);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(centerX - 8 * scale, topY, 16 * scale, 8 * scale);
    ctx.strokeStyle = '#f59e0b';
    ctx.strokeRect(centerX - 8 * scale, topY, 16 * scale, 8 * scale);
  }

  function drawSingleRevolver(ctx, originX, originY, scale = 1, facing = 1) {
    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(facing, 1);

    ctx.fillStyle = '#111827';
    ctx.fillRect(-3 * scale, -2 * scale, 6 * scale, 10 * scale);
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(1 * scale, -3 * scale, 16 * scale, 4 * scale);
    ctx.fillStyle = '#d1d5db';
    ctx.fillRect(14 * scale, -3.6 * scale, 3.5 * scale, 5.2 * scale);
    ctx.restore();
  }

  function drawCowboyRevolvers(ctx, centerX, centerY, options = {}) {
    const scale = options.scale ?? 1;
    const spread = options.spread ?? 16;
    const spin = options.spin ?? 0;

    ctx.save();
    ctx.translate(centerX - spread, centerY);
    ctx.rotate(-spin);
    drawSingleRevolver(ctx, 0, 0, scale, -1);
    ctx.restore();

    ctx.save();
    ctx.translate(centerX + spread, centerY);
    ctx.rotate(spin);
    drawSingleRevolver(ctx, 0, 0, scale, 1);
    ctx.restore();
  }

  function drawCowboyFace(ctx, centerX, centerY, radius, mood) {
    const eyeY = centerY - radius * 0.22;
    const leftEyeX = centerX - radius * 0.34;
    const rightEyeX = centerX + radius * 0.34;

    if (mood === 'shock') {
      const xSize = Math.max(1.8, radius * 0.22);
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(leftEyeX - xSize, eyeY - xSize);
      ctx.lineTo(leftEyeX + xSize, eyeY + xSize);
      ctx.moveTo(leftEyeX - xSize, eyeY + xSize);
      ctx.lineTo(leftEyeX + xSize, eyeY - xSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(rightEyeX, eyeY, Math.max(1.2, radius * 0.18), 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(centerX - radius * 0.25, centerY + radius * 0.42);
      ctx.lineTo(centerX + radius * 0.25, centerY + radius * 0.42);
      ctx.stroke();
      ctx.lineWidth = 1;
      return;
    }

    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(leftEyeX, eyeY, 1.4, 0, Math.PI * 2);
    ctx.arc(rightEyeX, eyeY, 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (mood === 'angry') {
      ctx.arc(centerX, centerY + radius * 0.68, radius * 0.5, 1.12 * Math.PI, 1.88 * Math.PI, true);
    } else if (mood === 'less-angry') {
      ctx.moveTo(centerX - radius * 0.38, centerY + radius * 0.3);
      ctx.lineTo(centerX + radius * 0.38, centerY + radius * 0.3);
    } else if (mood === 'neutral') {
      ctx.moveTo(centerX - radius * 0.38, centerY + radius * 0.3);
      ctx.lineTo(centerX + radius * 0.38, centerY + radius * 0.3);
    } else {
      ctx.arc(centerX, centerY + radius * 0.24, radius * 0.43, 0.08 * Math.PI, 0.92 * Math.PI);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  globalScope.BreakoutCowboyRender = {
    drawCowboyHat,
    drawCowboyRevolvers,
    drawCowboyFace
  };
})(typeof window !== 'undefined' ? window : globalThis);
