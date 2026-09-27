const codes = new Map<number, string>();

export function rememberJoinCode(eventId: number, code: string | null | undefined) {
  if (code?.trim()) codes.set(eventId, code.trim());
}

export function lastJoinCode(eventId: number): string | null {
  return codes.get(eventId) ?? null;
}
