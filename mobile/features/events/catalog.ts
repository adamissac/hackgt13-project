// Sample opportunities, not live listings. Replace this adapter when an events API lands.
// Two kinds: professional (career, founders, tech) and local (community events in the user's area).
// RSVPs stay on this device; nothing is sent to organizers.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseRsvps, type RsvpMap } from './plan';

export type EventKind = 'professional' | 'local';
export interface NetworkingEvent {
 id: string; kind: EventKind; name: string; category: string; startsAt: string; endsAt: string;
 location: string; lat: number; lng: number; host: string; description: string; agenda: string[];
}
export const sampleEvents: NetworkingEvent[] = [
 {id:'build', kind:'professional', name:'Build something that matters', category:'Hackathon', startsAt:'2026-09-27T10:00:00-04:00', endsAt:'2026-09-27T13:00:00-04:00', location:'Georgia Tech · Atlanta', lat:33.7756, lng:-84.3963, host:'Campus builders', description:'Meet fellow builders, swap project ideas, and find a collaborator for your next experiment.', agenda:['Introductions over coffee','Small-group project demos','Find your next collaborator']},
 {id:'founders', kind:'professional', name:'The next big thing starts here', category:'Founders', startsAt:'2026-10-01T18:00:00-04:00', endsAt:'2026-10-01T20:00:00-04:00', location:'Midtown · Atlanta', lat:33.7838, lng:-84.3830, host:'Student founder circle', description:'An evening of early ideas and honest conversations with student founders. Bring a problem you care about.', agenda:['Founder stories','Idea exchange in small groups','Open networking']},
 {id:'careers', kind:'professional', name:'Beyond the résumé', category:'Careers', startsAt:'2026-10-03T11:00:00-04:00', endsAt:'2026-10-03T14:00:00-04:00', location:'Georgia Tech · Atlanta', lat:33.7756, lng:-84.3963, host:'Campus career community', description:'Practice your introduction and connect with peers exploring their next career chapter.', agenda:['Introduction workshop','Peer career conversations','Portfolio feedback']},
 {id:'ai', kind:'professional', name:'AI after hours', category:'Tech meetup', startsAt:'2026-10-06T18:30:00-04:00', endsAt:'2026-10-06T20:30:00-04:00', location:'Tech Square · Atlanta', lat:33.7766, lng:-84.3893, host:'Atlanta AI community', description:'A relaxed meetup for people building with machine learning, from first experiments to research projects.', agenda:['Lightning project talks','Research and builder roundtables','Meet someone outside your field']},
 {id:'portfolio', kind:'professional', name:'Portfolio night', category:'Careers', startsAt:'2026-10-09T18:00:00-04:00', endsAt:'2026-10-09T20:00:00-04:00', location:'Midtown · Atlanta', lat:33.7810, lng:-84.3866, host:'Designers and engineers of Atlanta', description:'Bring a project and get friendly feedback from people a few steps ahead of you.', agenda:['Five-minute project walkthroughs','Feedback pairs','Mentor office hours']},
 {id:'climate', kind:'professional', name:'Climate tech mixer', category:'Founders', startsAt:'2026-10-14T17:30:00-04:00', endsAt:'2026-10-14T19:30:00-04:00', location:'Old Fourth Ward · Atlanta', lat:33.7640, lng:-84.3720, host:'Southeast climate founders', description:'Founders, researchers, and students working on energy, water, and materials.', agenda:['Three founder spotlights','Problem-first roundtables','Open networking']},
 {id:'market', kind:'local', name:'Saturday green market', category:'Community', startsAt:'2026-09-26T09:00:00-04:00', endsAt:'2026-09-26T13:00:00-04:00', location:'Piedmont Park · Atlanta', lat:33.7851, lng:-84.3738, host:'Piedmont Park neighbors', description:'Local farmers, food stalls, and live music. An easy place to catch up with friends.', agenda:['Farm stands open','Acoustic sets','Cooking demo at noon']},
 {id:'run', kind:'local', name:'BeltLine social run', category:'Fitness', startsAt:'2026-09-29T18:30:00-04:00', endsAt:'2026-09-29T19:45:00-04:00', location:'Eastside Trail · Atlanta', lat:33.7726, lng:-84.3655, host:'Eastside run club', description:'A no-drop 5K at conversation pace, followed by snacks at Ponce City Market.', agenda:['Meet at the trail entrance','5K at conversation pace','Snacks afterward']},
 {id:'trivia', kind:'local', name:'Trivia night', category:'Social', startsAt:'2026-10-02T19:30:00-04:00', endsAt:'2026-10-02T21:30:00-04:00', location:'Krog Street · Atlanta', lat:33.7570, lng:-84.3640, host:'Krog Street regulars', description:'Teams of up to six. Come alone and join a table.', agenda:['Form teams','Six rounds','Prizes for the top three']},
 {id:'concert', kind:'local', name:'Free concert in the park', category:'Music', startsAt:'2026-10-04T17:00:00-04:00', endsAt:'2026-10-04T20:00:00-04:00', location:'Centennial Olympic Park · Atlanta', lat:33.7603, lng:-84.3932, host:'Downtown Atlanta', description:'Local bands on the main lawn. Bring a blanket.', agenda:['Opening act','Headliner','Food trucks all evening']},
 {id:'books', kind:'local', name:'Decatur book festival', category:'Community', startsAt:'2026-10-10T10:00:00-04:00', endsAt:'2026-10-10T17:00:00-04:00', location:'Decatur Square · Decatur', lat:33.7748, lng:-84.2963, host:'Decatur library friends', description:'Author talks, used-book stalls, and readings for all ages.', agenda:['Author talks','Book swap','Readings on the square']},
 {id:'garden', kind:'local', name:'Garden lights evening', category:'Outdoors', startsAt:'2026-10-17T18:30:00-04:00', endsAt:'2026-10-17T21:00:00-04:00', location:'Botanical Garden · Atlanta', lat:33.7900, lng:-84.3727, host:'Midtown neighbors', description:'An evening walk through the gardens with lanterns and local food.', agenda:['Lantern walk','Local food stands','Live music']},
];
const legacyKey = (scope: string) => `constellation:event-rsvps:v1:${scope}`;
const key = (scope: string) => `constellation:event-rsvps:v2:${scope}`;
const ids = sampleEvents.map((e) => e.id);
export const eventCatalog = {
 list: async () => sampleEvents,
 rsvps: async (scope: string): Promise<RsvpMap> => {
  const raw = (await AsyncStorage.getItem(key(scope))) ?? (await AsyncStorage.getItem(legacyKey(scope)));
  if (!raw) return {};
  try { return parseRsvps(JSON.parse(raw), ids); } catch { return {}; }
 },
 saveRsvps: async (scope: string, map: RsvpMap) => AsyncStorage.setItem(key(scope), JSON.stringify(map)),
};
export function eventDate(iso: string) {
 return new Date(iso).toLocaleDateString('en-US', {month:'short',day:'numeric',timeZone:'America/New_York'});
}
export function eventTime(iso: string) {
 return new Date(iso).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit',timeZone:'America/New_York'});
}
