/** Also protects clients while an older API deployment still includes own activity. */
export function otherPeopleFeed<T extends { author: { user_id: string } }>(items: T[], viewer?: string): T[] {
  if (!viewer) return [];
  return items.filter(item => item.author.user_id !== viewer && item.author.user_id !== 'me');
}
