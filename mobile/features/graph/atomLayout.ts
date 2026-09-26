// Circular slots leave room for upright 72x68 targets through a full rotation.
// Distance is decorative; edge weight alone represents match strength.
export function atomLayout(width: number, count: number) {
  const height = width + 64;
  const center = { x: width / 2, y: height / 2 };
  const radius = width / 2 - 42;
  const total = Math.min(6, Math.max(0, count));
  return { height, center, nodes: Array.from({ length: total }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / total;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  }) };
}
