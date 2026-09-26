/** One line for the viewer's own connection. Never includes anyone's connection count. */
export function metLine(row: { how_met?: 'in_person' | 'invite'; met_at: string | null }): string {
  const place = row.met_at ? ` at ${row.met_at}` : '';
  if (row.how_met === 'invite') return `Through a private invite${place}`;
  if (row.how_met === 'in_person') return `In person${place}`;
  return row.met_at ? `Met at ${row.met_at}` : 'Connected';
}
