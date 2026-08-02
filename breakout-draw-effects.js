(function attachBreakoutDrawEffects(globalScope) {
  function drawSpotlightCone(ctx, canvas, api) {
    const now = performance.now();
    if (!api.isSpotlightActive(now)) return;

    const geo = api.getSpotlightGeometry();
    if (!geo) return;

    const sourceY = geo.sourceY;
    const topY = geo.topY;
    const leftTop = geo.sourceX - geo.bottomHalfWidth;
    const rightTop = geo.sourceX + geo.bottomHalfWidth;
    const leftBottom = geo.sourceX - geo.topHalfWidth;
    const rightBottom = geo.sourceX + geo.topHalfWidth;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(leftTop, topY);
    ctx.lineTo(rightTop, topY);
    ctx.lineTo(rightBottom, sourceY);
    ctx.lineTo(leftBottom, sourceY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGuns(ctx, guns) {
    guns.forEach((gun) => {
      ctx.fillStyle = gun.color;
      ctx.fillRect(gun.x, gun.y, gun.width, gun.height);

      ctx.fillStyle = '#111827';
      const barrelY = gun.y + gun.height / 2 - 2;
      const barrelWidth = gun.kind === 'bazooka' ? 12 : 8;
      ctx.fillRect(gun.x + gun.width - 2, barrelY, barrelWidth, 4);
    });
  }

  function drawBullets(ctx, bullets) {
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

  function drawCowboyBullets(ctx, cowboyBullets) {
    cowboyBullets.forEach((bullet) => {
      const magnitude = Math.hypot(bullet.vx, bullet.vy) || 1;
      const lineEndX = bullet.x + (bullet.vx / magnitude) * 1200;
      const lineEndY = bullet.y + (bullet.vy / magnitude) * 1200;

      ctx.beginPath();
      ctx.moveTo(bullet.x, bullet.y);
      ctx.lineTo(lineEndX, lineEndY);
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.52)';
      ctx.lineWidth = 1.35;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      ctx.fillStyle = bullet.color || '#ef4444';
      ctx.fill();
    });
  }

  function drawWaterImpacts(ctx, waterImpacts) {
    const now = performance.now();
    const nextWaterImpacts = waterImpacts.filter((impact) => impact.endsAt > now);

    nextWaterImpacts.forEach((impact) => {
      const t = Math.max(0, Math.min(1, (now - impact.startedAt) / Math.max(1, impact.endsAt - impact.startedAt)));
      const fade = 1 - t;
      const radius = impact.radius * (1 + t * 0.65);

      ctx.fillStyle = impact.tint.replace('0.52', `${0.52 * fade}`).replace('0.46', `${0.46 * fade}`);
      ctx.beginPath();
      ctx.ellipse(impact.x, impact.y + 2, radius, radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(248, 250, 252, ${0.42 * fade})`;
      ctx.beginPath();
      ctx.arc(impact.x, impact.y - 5, 6 + 15 * t, Math.PI, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(71, 85, 105, ${0.55 * fade})`;
      ctx.beginPath();
      ctx.moveTo(impact.x - 8, impact.y - 10 - 8 * t);
      ctx.lineTo(impact.x - 16, impact.y - 20 - 18 * t);
      ctx.moveTo(impact.x + 8, impact.y - 10 - 8 * t);
      ctx.lineTo(impact.x + 16, impact.y - 20 - 18 * t);
      ctx.stroke();
    });

    return nextWaterImpacts;
  }

  function drawTurretBullets(ctx, turretBullets) {
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

  function drawGuessShots(ctx, guessShots) {
    guessShots.forEach((shot) => {
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.strokeStyle = '#a855f7';
      ctx.stroke();
    });
  }

  function drawHammerInventory(ctx, canvas, hammerCount, minigunCharges) {
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

  function drawPhaseCountdownOverlay(ctx, canvas, phaseCountdownEndsAt, gameState, getPhaseTitle) {
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

  function drawFallingItems(ctx, fallingItems, api) {
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
        api.drawHeartShape(item.x + item.width / 2, item.y + item.height / 2 + 1, 12, '#f43f5e');
        return;
      }

      if (item.kind === 'shield') {
        const cx = item.x + item.width / 2;
        const cy = item.y + item.height / 2;
        ctx.fillStyle = '#1d4ed8';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 7);
        ctx.lineTo(cx + 7, cy - 2);
        ctx.lineTo(cx + 5, cy + 7);
        ctx.lineTo(cx, cy + 10);
        ctx.lineTo(cx - 5, cy + 7);
        ctx.lineTo(cx - 7, cy - 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#bfdbfe';
        ctx.stroke();
      }
    });
  }

  globalScope.BreakoutDrawEffects = {
    drawSpotlightCone,
    drawGuns,
    drawBullets,
    drawCowboyBullets,
    drawWaterImpacts,
    drawTurretBullets,
    drawGuessShots,
    drawHammerInventory,
    drawPhaseCountdownOverlay,
    drawFallingItems
  };
})(typeof window !== 'undefined' ? window : globalThis);
