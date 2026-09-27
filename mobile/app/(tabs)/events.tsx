import { router } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { Button, Card, Chip, useColors } from '@/components/ui';
import { ErrorState, Loading } from '@/components/States';
import { TabHero } from '@/components/TabHero';
import { Calendar, RsvpPicker } from '@/features/events/Calendar';
import { CATEGORIES as EVENT_CATEGORIES, eventCatalog, eventDate, fromLiveEvent, whenLabel, type NetworkingEvent } from '@/features/events/catalog';
import { RSVP_OPTIONS, dayKey, eventDays, eventsNear, isPlanned, matchesSearch, milesLabel, nextRsvps, type RsvpMap, type RsvpStatus } from '@/features/events/plan';
import { useArea } from '@/features/events/useArea';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { useAuth } from '@/lib/auth';
import { useEventSession } from '@/lib/eventSession';

type Section = 'calendar' | 'local' | 'all';
const SECTIONS: { id: Section; label: string }[] = [
 {id:'calendar',label:'My calendar'},{id:'local',label:'Near you'},{id:'all',label:'All events'},
];
const CATEGORIES = ['All', ...EVENT_CATEGORIES];
const hasPlace = (e: NetworkingEvent): e is NetworkingEvent & { lat: number; lng: number } => e.lat !== undefined && e.lng !== undefined;

export default function EventsScreen() {
 const c=useColors(); const insets=useSafeAreaInsets(); const {session}=useAuth();
 const scope=session?.user.id ?? 'demo';
 const catalog=useAsync(async()=>({events:await eventCatalog.list(),rsvps:await eventCatalog.rsvps(scope)}),[scope]);
 const eventSession=useEventSession(); // refetch company events when you enter or leave one
 const live=useAsync(()=>api.listEvents(),[scope,eventSession?.eventId]);
 useLiveRefresh(live.refresh, 3000);
 const [section,setSection]=useState<Section>('all');
 const [areaWanted,setAreaWanted]=useState(false);
 const {area,retry}=useArea(areaWanted);
 const [selected,setSelected]=useState<NetworkingEvent|null>(null);
 const [filter,setFilter]=useState('All'); const [saved,setSaved]=useState<{scope:string;map:RsvpMap}|null>(null);
 const [error,setError]=useState<string|null>(null);
 const todayKey=dayKey(new Date());
 const [month,setMonth]=useState({year:Number(todayKey.slice(0,4)),month:Number(todayKey.slice(5,7))});
 const [day,setDay]=useState(todayKey);
 const savedRsvps:RsvpMap=saved?.scope===scope ? saved.map : catalog.state.status==='ready' ? catalog.state.data.rsvps : {};
 // Company events (created in the app) sit alongside the Handshake list. Registering one puts it on your calendar;
 // at the venue you scan the company's QR on its event page to enter the session.
 // Registration changes show instantly (optimistic) and are confirmed by the server in the background.
 const [regOverride,setRegOverride]=useState<Record<string,boolean>>({});
 const company=(live.state.status==='ready'?live.state.data.events.map(fromLiveEvent):[]).map(e=>
  e.id in regOverride?{...e,registered:regOverride[e.id],checkedIn:regOverride[e.id]?e.checkedIn:false}:e);
 const events=[...company,...(catalog.state.status==='ready'?catalog.state.data.events:[])];
 // Company events: registered = Attending; otherwise your saved Interested / Not attending choice.
 const rsvps:RsvpMap={...savedRsvps};
 for(const e of company){ if(e.registered) rsvps[e.id]='attending'; else if(rsvps[e.id]==='attending') delete rsvps[e.id]; }
 const openEvent=(e:NetworkingEvent)=>{
  if(e.companyEventId){router.push({pathname:'/attend/[id]',params:{id:String(e.companyEventId)}});return;}
  setSelected(e);setError(null);
 };

 // One tap handler for every picker. It updates the screen immediately, then saves; on failure it rolls back.
 const choose=(event:NetworkingEvent,status:RsvpStatus)=>{
  setError(null);
  const before=savedRsvps; const map=nextRsvps(rsvps,event.id,status);
  setSaved({scope,map});
  eventCatalog.saveRsvps(scope,map).catch(()=>{setSaved({scope,map:before});setError('Could not save that. Please try again.');});
  const cid=event.companyEventId;
  if(cid){
   const want=map[event.id]==='attending';
   if(want!==!!event.registered){
    setRegOverride(o=>({...o,[event.id]:want}));
    (want?api.registerEvent(cid):api.unregisterEvent(cid))
     .then(()=>live.reload())
     .catch(err=>{setRegOverride(o=>({...o,[event.id]:!want}));setError(err instanceof Error?err.message:'Could not update. Please try again.');});
   }
  }
 };
 const latest=useRef({events,choose});
 useLayoutEffect(()=>{latest.current={events,choose};});
 const pick=useCallback((id:string,status:RsvpStatus)=>{
  const ev=latest.current.events.find(e=>e.id===id); if(ev) latest.current.choose(ev,status);
 },[]);
 const [query,setQuery]=useState('');
 const found=(e:NetworkingEvent)=>matchesSearch(query,[e.name,e.host,e.category,e.location,...e.tags]);
 const noMatches=(<Card>
  <Text style={[styles.body,{color:c.text,fontWeight:'700'}]}>No events match “{query.trim()}”</Text>
  <Text style={[styles.body,{color:c.muted}]}>Try a company, a topic, or a place, like “Google”, “networking”, or “Klaus”.</Text>
  <Button label="Clear search" variant="secondary" onPress={()=>setQuery('')}/>
 </Card>);
 const scroller=useRef<ScrollView>(null);
 // Each section is its own page: switching jumps back to the top so the change is visible immediately.
 const open=(s:Section)=>{setSection(s);if(s==='local')setAreaWanted(true);scroller.current?.scrollTo({y:0,animated:false});};

 // Only the details area opens the event; the action buttons below sit outside it (no button inside a button).
 const card=(event:NetworkingEvent,km?:number)=><Card key={event.id}>
  <Pressable onPress={()=>openEvent(event)} accessibilityRole="button" accessibilityLabel={`View ${event.name}`} style={({pressed})=>({gap:12,opacity:pressed?0.85:1})}>
   <View style={styles.row}><View style={[styles.date,{backgroundColor:c.tintSoft}]}><Text style={{color:c.tint,fontSize:16,fontWeight:'700'}}>{event.dateless?'TBA':eventDate(event.startsAt,event.tz)}</Text></View><View style={{flex:1,gap:6}}><Chip label={event.category} tone="ai"/><Text style={[styles.title,{color:c.text}]}>{event.name}</Text><Text style={[styles.small,{color:c.muted}]}>{event.host}</Text></View></View>
   <View style={styles.row}><AppIcon name="event" size={18}/><Text style={[styles.small,{color:c.muted}]}>{whenLabel(event)} · {event.location}{km!==undefined?` · ${milesLabel(km)}`:''}</Text></View>
   {event.tags.includes('Hiring')&&<View style={styles.row}><Chip label="Hiring" tone="success"/></View>}
  </Pressable>
   <RsvpPicker id={event.id} value={rsvps[event.id]} onPick={pick}/>
   {/* Company events: Attending registers you; then the company QR unlocks the session. Switching away unregisters. */}
   {event.companyEventId&&event.registered&&(event.checkedIn
    ? <Button label="Enter session" onPress={()=>openEvent(event)}/>
    : <Button label="Scan company QR code" onPress={()=>router.push({pathname:'/join-event',params:{event:String(event.companyEventId)}})}/>)}
 </Card>;

 const planned=events.filter(e=>isPlanned(rsvps[e.id])).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
 // A multi-day event belongs to every day it covers; "Coming up" is only what starts after today (today's and
 // ongoing events are listed under Today instead). Events without a date yet get their own section.
 const covers=(e:NetworkingEvent,k:string)=>!e.dateless&&eventDays(e.startsAt,e.endsAt,e.tz).includes(k);
 const onDay=planned.filter(e=>covers(e,day));
 // "Coming up" follows the day you tapped: plans that start after it and haven't already ended.
 const lastDay=(e:NetworkingEvent)=>{const d=eventDays(e.startsAt,e.endsAt,e.tz);return d[d.length-1];};
 const comingUp=planned.filter(e=>!e.dateless&&dayKey(e.startsAt,e.tz)>day&&lastDay(e)>=todayKey);
 const dayLabel=(k:string)=>new Date(`${k}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'});
 const shortDay=(k:string)=>new Date(`${k}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
 const undated=planned.filter(e=>e.dateless);
 const isUpcoming=(e:NetworkingEvent)=>e.dateless||dayKey(e.endsAt??e.startsAt,e.tz)>=todayKey;
 const kmTo=(e:NetworkingEvent)=>area.status==='ready'&&hasPlace(e)?eventsNear([e],area.point,Infinity)[0].km:undefined;
 const statusLabel=(e:NetworkingEvent)=>RSVP_OPTIONS.find(o=>o.value===rsvps[e.id])?.label ?? '';
 const planRow=(e:NetworkingEvent)=><Pressable key={e.id} onPress={()=>openEvent(e)} accessibilityRole="button" accessibilityLabel={`${e.name}, ${statusLabel(e)}`} style={[styles.planRow,{borderColor:c.border,backgroundColor:c.surface}]}>
  <View style={[styles.bar,{backgroundColor:rsvps[e.id]==='attending'?c.success:c.ai}]}/>
  <View style={{flex:1,gap:2}}><Text style={{color:c.text,fontWeight:'700',fontSize:15}}>{e.name}</Text><Text style={[styles.small,{color:c.muted}]}>{whenLabel(e)} · {e.location}</Text></View>
  <Text style={{color:rsvps[e.id]==='attending'?c.success:c.ai,fontSize:12,fontWeight:'700'}}>{statusLabel(e)}</Text>
 </Pressable>;

 return <>
  <ScrollView ref={scroller} style={{backgroundColor:c.background}} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
   {section!=='calendar'&&<TabHero eyebrow={area.status==='ready'&&area.place?area.place.toUpperCase():'PROFESSIONAL EVENTS'} title={'Make room for\na new connection.'} body="Info sessions, networking, and club meetings for your career."/>}
   <View style={[styles.segments,{backgroundColor:c.surfaceAlt}]} accessibilityRole="tablist">
    {SECTIONS.map(s=><Pressable key={s.id} onPress={()=>open(s.id)} accessibilityRole="tab" accessibilityState={{selected:section===s.id}} style={[styles.segment,section===s.id&&{backgroundColor:c.surface,borderColor:c.border}]}>
     <Text numberOfLines={1} style={{color:section===s.id?c.text:c.muted,fontWeight:'700',fontSize:14}}>{s.label}</Text>
    </Pressable>)}
   </View>
   {section!=='calendar'&&<View style={[styles.search,{backgroundColor:c.surface,borderColor:query?c.tint:c.border}]}>
    <Text style={{color:c.muted,fontSize:16}}>⌕</Text>
    <TextInput value={query} onChangeText={setQuery} placeholder="Search events, companies, topics" placeholderTextColor={c.muted}
     style={[styles.searchInput,{color:c.text}]} returnKeyType="search" autoCorrect={false} autoCapitalize="none" clearButtonMode="never" accessibilityLabel="Search events"/>
    {!!query&&<Pressable onPress={()=>setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search"><Text style={{color:c.muted,fontSize:16,fontWeight:'700'}}>✕</Text></Pressable>}
   </View>}
   {section!=='calendar'&&<Text style={[styles.small,{color:c.muted}]}>Georgia Tech events from Handshake (updated Sep 26). Your status here is only for your calendar; register on Handshake.</Text>}
   {catalog.state.status==='loading'&&<Loading label="Finding events…"/>}
   {catalog.state.status==='error'&&<ErrorState message={catalog.state.message} onRetry={catalog.reload}/>}

   {catalog.state.status==='ready'&&section==='calendar'&&<>
    <Calendar year={month.year} month={month.month} onMonth={setMonth} events={events} rsvps={rsvps} selectedDay={day} onSelectDay={setDay}/>
    <Text style={[styles.title,{color:c.text}]}>{day===todayKey?'Today · ':''}{dayLabel(day)}</Text>
    {onDay.length?onDay.map(planRow):<Text style={[styles.body,{color:c.muted}]}>Nothing planned this day.</Text>}
    <Text style={[styles.title,{color:c.text,marginTop:6}]}>Coming up after {shortDay(day)}</Text>
    {comingUp.length?comingUp.map(planRow):planned.length?<Text style={[styles.body,{color:c.muted}]}>Nothing planned after this day.</Text>:<Card>
     <Text style={[styles.body,{color:c.text,fontWeight:'700'}]}>Your calendar is open</Text>
     <Text style={[styles.body,{color:c.muted}]}>Mark events as Attending or Interested and they’ll show up here.</Text>
     <View style={styles.row}><Button label="Events near you" variant="secondary" onPress={()=>open('local')}/><Button label="All events" variant="ghost" onPress={()=>open('all')}/></View>
    </Card>}
    {undated.length>0&&<>
     <Text style={[styles.title,{color:c.text,marginTop:6}]}>Date not set yet</Text>
     {undated.map(planRow)}
    </>}
   </>}

   {catalog.state.status==='ready'&&section==='local'&&<>
    <View style={{gap:4}}><Text style={[styles.title,{color:c.text}]}>Near you</Text><Text style={[styles.body,{color:c.muted}]}>{area.status==='ready'?`Professional events within 25 miles${area.place?` of ${area.place}`:''}.`:'Professional events in your area.'} Your location stays on this phone.</Text></View>
    {(area.status==='idle'||area.status==='asking')&&<Loading label="Finding your area…"/>}
    {area.status==='error'&&<ErrorState message={area.message} onRetry={retry}/>}
    {area.status==='denied'&&<Card>
     <Text style={[styles.body,{color:c.text,fontWeight:'700'}]}>Location is off</Text>
     <Text style={[styles.body,{color:c.muted}]}>Turn on location for this app to see events in your area. It’s only used on your phone to measure distance.</Text>
     <Button label={area.canAskAgain?'Allow location':'Open settings'} onPress={()=>area.canAskAgain?retry():Linking.openSettings()}/>
    </Card>}
    {area.status==='ready'&&(()=>{
     const near=eventsNear(events.filter(isUpcoming).filter(hasPlace).filter(found),area.point);
     return near.length?near.map(e=>card(e,e.km)):query.trim()?noMatches:<Card>
      <Text style={[styles.body,{color:c.text,fontWeight:'700'}]}>No events near you yet</Text>
      <Text style={[styles.body,{color:c.muted}]}>There aren’t any in-person events within 25 miles right now. Virtual events are under All events.</Text>
      <Button label="See all events" variant="secondary" onPress={()=>open('all')}/>
     </Card>;
    })()}
   </>}

   {catalog.state.status==='ready'&&section==='all'&&<>
    <View style={{gap:4}}><Text style={[styles.title,{color:c.text}]}>All events</Text><Text style={[styles.body,{color:c.muted}]}>Info sessions, networking, workshops, and club meetings, in person and virtual.</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>
     {CATEGORIES.map(category=><Pressable key={category} onPress={()=>setFilter(category)} accessibilityRole="button" accessibilityState={{selected:filter===category}} style={[styles.filter,{backgroundColor:filter===category?c.tint:c.surface,borderColor:c.border}]}><Text style={{color:filter===category?c.onTint:c.text,fontWeight:'600'}}>{category}</Text></Pressable>)}
    </ScrollView>
    {(()=>{const list=events.filter(e=>isUpcoming(e)&&(filter==='All'||e.category===filter)&&found(e)).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
     return <>
      {!!query.trim()&&list.length>0&&<Text style={[styles.small,{color:c.muted}]}>{list.length} {list.length===1?'event matches':'events match'} “{query.trim()}”{filter!=='All'?` in ${filter}`:''}</Text>}
      {list.length?list.map(e=>card(e,kmTo(e))):query.trim()?noMatches:<Text style={[styles.body,{color:c.muted}]}>No upcoming {filter.toLowerCase()} events.</Text>}
     </>;})()}
   </>}
   {error&&!selected&&<Text accessibilityRole="alert" style={{color:c.danger}}>{error}</Text>}
  </ScrollView>
  <Modal visible={!!selected} transparent animationType="slide" onRequestClose={()=>setSelected(null)}>
   <View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={()=>setSelected(null)} accessibilityRole="button" accessibilityLabel="Close event"/>
    <View accessibilityViewIsModal style={[styles.sheet,{backgroundColor:c.surface,paddingBottom:Math.max(insets.bottom,20)}]}>
     {selected&&<ScrollView contentContainerStyle={{padding:24,gap:18}}>
      <View style={{alignSelf:'center',width:36,height:4,borderRadius:2,backgroundColor:c.border}}/>
      <View style={styles.row}><Chip label={selected.category} tone="ai"/><View style={{flex:1}}/><Button label="Close" variant="ghost" onPress={()=>setSelected(null)}/></View>
      <Text style={{color:c.text,fontSize:30,lineHeight:36,fontWeight:'700',letterSpacing:-0.8}}>{selected.name}</Text>
      <Text style={[styles.body,{color:c.muted}]}>Hosted by {selected.host}</Text>
      <Card highlight><Text style={{color:c.text,fontWeight:'700'}}>{whenLabel(selected)}</Text><Text style={[styles.body,{color:c.text}]}>{selected.location}{kmTo(selected)!==undefined?` · ${milesLabel(kmTo(selected)!)}`:''}</Text></Card>
      <View style={[styles.row,{flexWrap:'wrap',gap:8}]}>{selected.tags.map(t=><Chip key={t} label={t} tone={t==='Hiring'?'success':'neutral'}/>)}</View>
      <Text style={[styles.body,{color:c.muted}]}>The room, full description, and registration are on Handshake.</Text>
      <Button label="Open in Handshake" variant="secondary" onPress={()=>{void Linking.openURL(selected.url);}}/>
      <Text style={[styles.title,{color:c.text}]}>Are you going?</Text>
      <RsvpPicker id={selected.id} value={rsvps[selected.id]} onPick={pick}/>
      {error&&<Text accessibilityRole="alert" style={{color:c.danger}}>{error}</Text>}
      <Text style={[styles.small,{color:c.muted,textAlign:'center'}]}>{isPlanned(rsvps[selected.id])?'On your calendar. ':''}This only updates your calendar here. Register on Handshake to save your spot.</Text>
     </ScrollView>}
    </View>
   </View>
  </Modal>
 </>;
}
const styles=StyleSheet.create({
 container:{padding:20,gap:18,paddingBottom:100,maxWidth:640,width:'100%',alignSelf:'center'},
 title:{fontSize:20,fontWeight:'700',letterSpacing:-0.4},body:{fontSize:15,lineHeight:23},small:{fontSize:12,lineHeight:18,flexShrink:1},
 row:{flexDirection:'row',alignItems:'center',gap:12},date:{padding:12,borderRadius:16},
 segments:{flexDirection:'row',borderRadius:16,padding:4,gap:4},
 segment:{flex:1,minHeight:44,borderRadius:12,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'transparent',paddingHorizontal:4},
 filter:{borderWidth:1,borderRadius:22,paddingHorizontal:16,minHeight:44,justifyContent:'center'},
 search:{flexDirection:'row',alignItems:'center',gap:10,borderWidth:1.5,borderRadius:16,paddingHorizontal:14,minHeight:50},
 searchInput:{flex:1,fontSize:16,paddingVertical:12},
 planRow:{flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderRadius:16,padding:12},
 bar:{width:4,alignSelf:'stretch',borderRadius:2},
 backdrop:{flex:1,backgroundColor:'#0B173A66',justifyContent:'flex-end'},sheet:{maxHeight:'90%',borderTopLeftRadius:30,borderTopRightRadius:30,width:'100%',maxWidth:640,alignSelf:'center'},
});
