// Sample opportunities, not live listings. Replace this adapter when an events API lands.
import AsyncStorage from '@react-native-async-storage/async-storage';
export interface NetworkingEvent {
 id: string; name: string; category: string; startsAt: string; endsAt: string;
 location: string; host: string; description: string; agenda: string[];
}
export const sampleEvents: NetworkingEvent[] = [
 {id:'build', name:'Build something that matters', category:'Hackathon', startsAt:'2026-09-27T10:00:00-04:00', endsAt:'2026-09-27T13:00:00-04:00', location:'Georgia Tech · Atlanta', host:'Campus builders', description:'Meet fellow builders, swap project ideas, and find a collaborator for your next experiment.', agenda:['Introductions over coffee','Small-group project demos','Find your next collaborator']},
 {id:'founders', name:'The next big thing starts here', category:'Founders', startsAt:'2026-10-01T18:00:00-04:00', endsAt:'2026-10-01T20:00:00-04:00', location:'Midtown · Atlanta', host:'Student founder circle', description:'An evening of early ideas and honest conversations with student founders. Bring a problem you care about.', agenda:['Founder stories','Idea exchange in small groups','Open networking']},
 {id:'careers', name:'Beyond the résumé', category:'Careers', startsAt:'2026-10-03T11:00:00-04:00', endsAt:'2026-10-03T14:00:00-04:00', location:'Georgia Tech · Atlanta', host:'Campus career community', description:'Practice your introduction and connect with peers exploring their next career chapter.', agenda:['Introduction workshop','Peer career conversations','Portfolio feedback']},
 {id:'ai', name:'AI after hours', category:'Tech meetup', startsAt:'2026-10-06T18:30:00-04:00', endsAt:'2026-10-06T20:30:00-04:00', location:'Tech Square · Atlanta', host:'Atlanta AI community', description:'A relaxed meetup for people building with machine learning, from first experiments to research projects.', agenda:['Lightning project talks','Research and builder roundtables','Meet someone outside your field']},
];
const key = (scope: string) => `constellation:event-rsvps:v1:${scope}`;
export const eventCatalog = {
 list: async () => sampleEvents,
 registrations: async (scope: string): Promise<string[]> => {
  const raw = await AsyncStorage.getItem(key(scope));
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && sampleEvents.some(e => e.id === id)) : [];
 },
 save: async (scope: string, ids: string[]) => AsyncStorage.setItem(key(scope), JSON.stringify(ids)),
};
export function eventDate(iso: string) {
 return new Date(iso).toLocaleDateString('en-US', {month:'short',day:'numeric',timeZone:'America/New_York'});
}
export function eventTime(iso: string) {
 return new Date(iso).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit',timeZone:'America/New_York'});
}
