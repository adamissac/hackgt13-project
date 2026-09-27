// Orthographic projection of an irregular constellation. Depth drives shading/scale, not
// match strength or physical distance. Sampled once, never recomputed per frame.
export function atomLayout(width: number, count: number, progress = 0) {
  const height = width + 24;
  const center = { x: width / 2, y: height / 2 };
  const radius = width / 2 - 34;
  const tilt = 0.35;
  const roll = -0.22;
  const total = Math.min(6, Math.max(0, count));
  // Stable, deliberately uneven positions avoid a mechanical ring without random
  // reshuffles. Keep a protected central space and generous angular separation.
  const radii = [0.84, 1, 0.91, 0.98, 0.86, 0.96];
  const offsets = [-0.045, 0.025, -0.02, 0.04, -0.025, 0.015];
  return { height, center, radius, nodes: Array.from({ length: total }, (_, i) => {
    const theta = -Math.PI / 2 + i * Math.PI * 2 / total + offsets[i] + progress * Math.PI * 2;
    const starRadius = radius * radii[i];
    const x = Math.cos(theta) * starRadius;
    const y = Math.sin(theta) * starRadius * Math.cos(tilt);
    const depth = Math.sin(theta) * Math.sin(tilt);
    const dx = x * Math.cos(roll) - y * Math.sin(roll);
    const dy = x * Math.sin(roll) + y * Math.cos(roll);
    const planarAngle = Math.atan2(y, x);
    return {
      x: center.x + dx, y: center.y + dy, depth,
      scale: 0.98 + depth * 0.16,
      opacity: 0.86 + depth * 0.22,
      angle: (planarAngle + Math.round((theta - planarAngle) / (Math.PI * 2)) * Math.PI * 2 + roll) * 180 / Math.PI,
      length: Math.hypot(dx, dy),
    };
  }) };
}
