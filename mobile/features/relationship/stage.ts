// The one state machine for "me and this person" (MASTER_SPEC 3.2-3.6). Screens render from a
// RelationshipStage instead of scattered booleans. Wanting to meet and being connected are
// different stages: a connection only exists after a verified conversation and two yeses.
// No stage ever reveals the other person's "no": a declined suggestion simply stays pending.

export type RelationshipStage =
  | 'DISCOVERED' // a match; nobody has said anything yet
  | 'MEET_INTEREST_PENDING' // I said "want to meet"; waiting (silently) on them
  | 'MUTUAL_MEET' // both said yes: chat + find-each-other unlocked
  | 'MEETUP_IN_PROGRESS' // sharing location / walking over
  | 'CONVERSATION_VERIFIED' // Bluetooth or QR confirmed a real conversation
  | 'POST_CONVERSATION_PENDING' // checklist + "connect?" waiting on my answer
  | 'CONNECTED' // both said yes after talking
  | 'DECLINED' // I said no (only ever shown to me)
  | 'EXPIRED'
  | 'CANCELLED';

export interface Relationship {
  user_id: string;
  stage: RelationshipStage;
  suggestion_id: number | null;
  chat_id: number | null;
  conversation_id: number | null;
}

const NEXT: Record<RelationshipStage, RelationshipStage[]> = {
  DISCOVERED: ['MEET_INTEREST_PENDING', 'MUTUAL_MEET', 'DECLINED', 'EXPIRED', 'CONVERSATION_VERIFIED'],
  MEET_INTEREST_PENDING: ['MUTUAL_MEET', 'EXPIRED', 'CANCELLED'],
  MUTUAL_MEET: ['MEETUP_IN_PROGRESS', 'CONVERSATION_VERIFIED', 'CANCELLED'],
  MEETUP_IN_PROGRESS: ['CONVERSATION_VERIFIED', 'MUTUAL_MEET', 'CANCELLED'],
  CONVERSATION_VERIFIED: ['POST_CONVERSATION_PENDING'],
  POST_CONVERSATION_PENDING: ['CONNECTED', 'DECLINED'],
  CONNECTED: [],
  DECLINED: [],
  EXPIRED: ['DISCOVERED'],
  CANCELLED: ['DISCOVERED'],
};

export function canTransition(from: RelationshipStage, to: RelationshipStage): boolean {
  return NEXT[from].includes(to);
}

/** The visible progress steps, in order, for the tracker on a match's page. */
export const STEPS: { key: string; label: string; reached: RelationshipStage[] }[] = [
  { key: 'want', label: 'Want to meet', reached: ['MEET_INTEREST_PENDING', 'MUTUAL_MEET', 'MEETUP_IN_PROGRESS', 'CONVERSATION_VERIFIED', 'POST_CONVERSATION_PENDING', 'CONNECTED'] },
  { key: 'mutual', label: 'Both said yes', reached: ['MUTUAL_MEET', 'MEETUP_IN_PROGRESS', 'CONVERSATION_VERIFIED', 'POST_CONVERSATION_PENDING', 'CONNECTED'] },
  { key: 'met', label: 'Talked in person', reached: ['CONVERSATION_VERIFIED', 'POST_CONVERSATION_PENDING', 'CONNECTED'] },
  { key: 'connected', label: 'Connected', reached: ['CONNECTED'] },
];

export function stepIndex(stage: RelationshipStage): number {
  let last = -1;
  STEPS.forEach((s, i) => {
    if (s.reached.includes(stage)) last = i;
  });
  return last;
}

/** Short status line for a person. Never implies the other person declined. */
export function stageLabel(stage: RelationshipStage, firstName: string): string {
  switch (stage) {
    case 'DISCOVERED':
      return `You and ${firstName} have a lot in common.`;
    case 'MEET_INTEREST_PENDING':
      return `You’d like to meet ${firstName}. We’ll let you know if it’s mutual.`;
    case 'MUTUAL_MEET':
      return `You both want to meet. Say hi and find each other.`;
    case 'MEETUP_IN_PROGRESS':
      return `You’re on your way to meet ${firstName}.`;
    case 'CONVERSATION_VERIFIED':
    case 'POST_CONVERSATION_PENDING':
      return `You talked with ${firstName}. How did it go?`;
    case 'CONNECTED':
      return `You and ${firstName} are connected.`;
    case 'DECLINED':
      return `You passed on meeting ${firstName}. They weren’t told.`;
    case 'EXPIRED':
    case 'CANCELLED':
      return `This introduction ended.`;
  }
}
