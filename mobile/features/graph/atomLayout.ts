// Orthographic projection of a tilted 3D ring. Depth drives shading/scale, not
// match strength or physical distance. Sampled once, never recomputed per frame.
export function atomLayout(width: number, count: number, progress = 0) {
  const height = width + 24;
  const center = { x: width / 2, y: height / 2 };
  const radius = width / 2 - 34;
  const tilt = 0.58;
  const roll = -0.22;
  const total = Math.min(6, Math.max(0, count));
  return { height, center, radius, nodes: Array.from({ length: total }, (_, i) => {
    const theta = -Math.PI / 2 + i * Math.PI * 2 / total + progress * Math.PI * 2;
    const x = Math.cos(theta) * radius;
    const y = Math.sin(theta) * radius * Math.cos(tilt);
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
