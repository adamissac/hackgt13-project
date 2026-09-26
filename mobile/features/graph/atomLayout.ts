// Stable slots separate labels and 48px touch targets on phones.
// Distance is decorative; edge weight alone represents match strength.
export function atomLayout(width: number, count: number) {
  const height = width + 64;
  const center = { x: width / 2, y: height / 2 };
  const slots = [[0.5, 0.13], [0.82, 0.31], [0.82, 0.66], [0.5, 0.84], [0.18, 0.66], [0.18, 0.31]];
  return { height, center, nodes: slots.slice(0, Math.min(6, Math.max(0, count))).map(([x, y]) => ({ x: x * width, y: y * height })) };
}
