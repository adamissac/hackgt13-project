import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { ConstellationMark } from '@/components/Brand';
import { Button, Card, Chip, useColors } from '@/components/ui';
import { ErrorState, Loading } from '@/components/States';
import { Calendar, RsvpPicker } from '@/features/events/Calendar';
import { eventCatalog, eventDate, eventTime, type NetworkingEvent } from '@/features/events/catalog';
import { RSVP_OPTIONS, dayKey, eventsNear, isPlanned, milesLabel, nextRsvps, type RsvpMap, type RsvpStatus } from '@/features/events/plan';
import { useArea } from '@/features/events/useArea';
import { useAsync } from '@/lib/useAsync';
import { useAuth } from '@/lib/auth';

type Section = 'calendar' | 'local' | 'professional';
const SECTIONS: { id: Section; label: string }[] = [
 {id:'calendar',label:'My calendar'},{id:'local',label:'Near you'},{id:'professional',label:'Professional'},
];
const CATEGORIES = ['All','Hackathon','Founders','Careers','Tech meetup'];

export default function EventsScreen() {
 const c=useColors(); const insets=useSafeAreaInsets(); const {session}=useAuth();
 const scope=session?.user.id ?? 'demo';
 const catalog=useAsync(async()=>({events:await eventCatalog.list(),rsvps:await eventCatalog.rsvps(scope)}),[scope]);
 const [section,setSection]=useState<Section>('professional');
 const [areaWanted,setAreaWanted]=useState(false);
 const {area,retry}=useArea(areaWanted);
 const [selected,setSelected]=useState<NetworkingEvent|null>(null);
 const [filter,setFilter]=useState('All'); const [saved,setSaved]=useState<{scope:string;map:RsvpMap}|null>(null);
 const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
 const todayKey=dayKey(new Date());
 const [month,setMonth]=useState({year:Number(todayKey.slice(0,4)),month:Number(todayKey.slice(5,7))});
 const [day,setDay]=useState(todayKey);
 const rsvps:RsvpMap=saved?.scope===scope ? saved.map : catalog.state.status==='ready' ? catalog.state.data.rsvps : {};
 const events=catalog.state.status==='ready'?catalog.state.data.events:[];

 const choose=async(event:NetworkingEvent,status:RsvpStatus)=>{
  if(busy)return; setBusy(true);setError(null);
  const map=nextRsvps(rsvps,event.id,status);
  try { await eventCatalog.saveRsvps(scope,map);setSaved({scope,map}); }
  catch {setError('Could not save your RSVP. Please try again.');} finally {setBusy(false);}
 };
 const open=(s:Section)=>{setSection(s);if(s==='local')setAreaWanted(true);};

 const card=(event:NetworkingEvent,km?:number)=><Pressable key={event.id} onPress={()=>{setSelected(event);setError(null);}} accessibilityRole="button" accessibilityLabel={`View ${event.name}`} style={({pressed})=>({opacity:pressed?0.85:1})}>
  <Card>
   <View style={styles.row}><View style={[styles.date,{backgroundColor:c.tintSoft}]}><Text style={{color:c.tint,fontSize:16,fontWeight:'700'}}>{eventDate(event.startsAt)}</Text></View><View style={{flex:1,gap:6}}><Chip label={event.category} tone="ai"/><Text style={[styles.title,{color:c.text}]}>{event.name}</Text></View></View>
   <View style={styles.row}><AppIcon name="event" size={18}/><Text style={[styles.small,{color:c.muted}]}>{eventTime(event.startsAt)} ET · {event.location}{km!==undefined?` · ${milesLabel(km)}`:''}</Text></View>
   <RsvpPicker value={rsvps[event.id]} disabled={busy} onChange={(s)=>choose(event,s)}/>
  </Card>
 </Pressable>;

 const planned=events.filter(e=>isPlanned(rsvps[e.id])).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
 const onDay=planned.filter(e=>dayKey(e.startsAt)===day);
 const upcoming=planned.filter(e=>dayKey(e.endsAt)>=todayKey);
 const statusLabel=(e:NetworkingEvent)=>RSVP_OPTIONS.find(o=>o.value===rsvps[e.id])?.label ?? '';
 const planRow=(e:NetworkingEvent)=><Pressable key={e.id} onPress={()=>{setSelected(e);setError(null);}} accessibilityRole="button" accessibilityLabel={`${e.name}, ${statusLabel(e)}`} style={[styles.planRow,{borderColor:c.border,backgroundColor:c.surface}]}>
  <View style={[styles.bar,{backgroundColor:rsvps[e.id]==='attending'?c.success:c.ai}]}/>
  <View style={{flex:1,gap:2}}><Text style={{color:c.text,fontWeight:'700',fontSize:15}}>{e.name}</Text><Text style={[styles.small,{color:c.muted}]}>{eventDate(e.startsAt)} · {eventTime(e.startsAt)} ET · {e.location}</Text></View>
  <Text style={{color:rsvps[e.id]==='attending'?c.success:c.ai,fontSize:12,fontWeight:'700'}}>{statusLabel(e)}</Text>
 </Pressable>;

 return <>
  <ScrollView style={{backgroundColor:c.background}} contentContainerStyle={styles.container}>
   <View style={[styles.hero,{backgroundColor:c.tint}]}>
    <ConstellationMark color="#B6C9FA" size={44}/>
    <Text style={styles.eyebrow}>{area.status==='ready'&&area.place?area.place.toUpperCase():'ATLANTA, GEORGIA'}</Text>
    <Text style={styles.heroTitle}>Make room for
a new connection.</Text>
    <Text style={styles.heroBody}>Shared interests. Real conversations. Your next reason to get together.</Text>
   </View>
   <View style={[styles.segments,{backgroundColor:c.surfaceAlt}]} accessibilityRole="tablist">
    {SECTIONS.map(s=><Pressable key={s.id} onPress={()=>open(s.id)} accessibilityRole="tab" accessibilityState={{selected:section===s.id}} style={[styles.segment,section===s.id&&{backgroundColor:c.surface,borderColor:c.border}]}>
     <Text numberOfLines={1} style={{color:section===s.id?c.text:c.muted,fontWeight:'700',fontSize:14}}>{s.label}</Text>
    </Pressable>)}
   </View>
   <Text style={[styles.small,{color:c.muted}]}>Sample events · RSVPs are saved on this device, not sent to organizers.</Text>
   {catalog.state.status==='loading'&&<Loading label="Finding events…"/>}
   {catalog.state.status==='error'&&<ErrorState message={catalog.state.message} onRetry={catalog.reload}/>}

   {catalog.state.status==='ready'&&section==='calendar'&&<>
    <Calendar year={month.year} month={month.month} onMonth={setMonth} events={events} rsvps={rsvps} selectedDay={day} onSelectDay={setDay}/>
    <Text style={[styles.title,{color:c.text}]}>{new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'})}</Text>
    {onDay.length?onDay.map(planRow):<Text style={[styles.body,{color:c.muted}]}>Nothing planned this day.</Text>}
    <Text style={[styles.title,{color:c.text,marginTop:6}]}>Coming up</Text>
    {upcoming.length?upcoming.map(planRow):<Card>
     <Text style={[styles.body,{color:c.text,fontWeight:'700'}]}>Your calendar is open</Text>
     <Text style={[styles.body,{color:c.muted}]}>Mark events as Attending or Interested and they’ll show up here.</Text>
     <View style={styles.row}><Button label="Events near you" variant="secondary" onPress={()=>open('local')}/><Button label="Professional" variant="ghost" onPress={()=>open('professional')}/></View>
    </Card>}
   </>}

   {catalog.state.status==='ready'&&section==='local'&&<>
    <View style={{gap:4}}><Text style={[styles.title,{color:c.text}]}>Near you</Text><Text style={[styles.body,{color:c.muted}]}>{area.status==='ready'?`Community events within 25 miles${area.place?` of ${area.place}`:''}.`:'Community events in your area.'} Your location stays on this phone.</Text></View>
    {(area.status==='idle'||area.status==='asking')&&<Loading label="Finding your area…"/>}
    {area.status==='error'&&<ErrorState message={area.message} onRetry={retry}/>}
    {area.status==='denied'&&<Card>
     <Text style={[styles.body,{color:c.text,fontWeight:'700'}]}>Location is off</Text>
     <Text style={[styles.body,{color:c.muted}]}>Turn on location for this app to see events in your area. It’s only used on your phone to measure distance.</Text>
     <Button label={area.canAskAgain?'Allow location':'Open settings'} onPress={()=>area.canAskAgain?retry():Linking.openSettings()}/>
    </Card>}
    {area.status==='ready'&&(()=>{
     const near=eventsNear(events.filter(e=>e.kind==='local'&&dayKey(e.endsAt)>=todayKey),area.point);
     return near.length?near.map(e=>card(e,e.km)):<Card>
      <Text style={[styles.body,{color:c.text,fontWeight:'700'}]}>No events near you yet</Text>
      <Text style={[styles.body,{color:c.muted}]}>These sample events are around Atlanta. Check back when you’re nearby, or browse professional events.</Text>
      <Button label="See professional events" variant="secondary" onPress={()=>open('professional')}/>
     </Card>;
    })()}
   </>}

   {catalog.state.status==='ready'&&section==='professional'&&<>
    <View style={{gap:4}}><Text style={[styles.title,{color:c.text}]}>Professional events</Text><Text style={[styles.body,{color:c.muted}]}>Hackathons, founder meetups, and career events.</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>
     {CATEGORIES.map(category=><Pressable key={category} onPress={()=>setFilter(category)} accessibilityRole="button" accessibilityState={{selected:filter===category}} style={[styles.filter,{backgroundColor:filter===category?c.tint:c.surface,borderColor:c.border}]}><Text style={{color:filter===category?c.onTint:c.text,fontWeight:'600'}}>{category}</Text></Pressable>)}
    </ScrollView>
    {events.filter(e=>e.kind==='professional'&&(filter==='All'||e.category===filter)).map(e=>card(e))}
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
      <Card highlight><Text style={{color:c.text,fontWeight:'700'}}>{eventDate(selected.startsAt)} · {eventTime(selected.startsAt)}–{eventTime(selected.endsAt)} ET</Text><Text style={[styles.body,{color:c.text}]}>{selected.location}{area.status==='ready'?` · ${milesLabel(eventsNear([selected],area.point,Infinity)[0].km)}`:''}</Text></Card>
      <Text style={[styles.body,{color:c.text}]}>{selected.description}</Text>
      <Text style={[styles.title,{color:c.text}]}>What to expect</Text>
      {selected.agenda.map((item,i)=><View key={item} style={styles.row}><Text style={{color:c.ai,fontWeight:'700'}}>0{i+1}</Text><Text style={[styles.body,{color:c.text,flex:1}]}>{item}</Text></View>)}
      <Text style={[styles.title,{color:c.text}]}>Are you going?</Text>
      <RsvpPicker value={rsvps[selected.id]} disabled={busy} onChange={(s)=>choose(selected,s)}/>
      {error&&<Text accessibilityRole="alert" style={{color:c.danger}}>{error}</Text>}
      <Text style={[styles.small,{color:c.muted,textAlign:'center'}]}>{isPlanned(rsvps[selected.id])?'On your calendar. ':''}This is a sample event. No ticket or real registration is created.</Text>
     </ScrollView>}
    </View>
   </View>
  </Modal>
 </>;
}
const styles=StyleSheet.create({
 container:{padding:20,gap:18,paddingBottom:100,maxWidth:640,width:'100%',alignSelf:'center'},
 hero:{borderRadius:26,padding:26,gap:14},eyebrow:{color:'#B6C9FA',fontSize:10,fontWeight:'700',letterSpacing:2},
 heroTitle:{color:'#FFFFFF',fontSize:31,lineHeight:37,fontWeight:'700',letterSpacing:-1},heroBody:{color:'#D3DEF2',fontSize:15,lineHeight:23},
 title:{fontSize:20,fontWeight:'700',letterSpacing:-0.4},body:{fontSize:15,lineHeight:23},small:{fontSize:12,lineHeight:18,flexShrink:1},
 row:{flexDirection:'row',alignItems:'center',gap:12},date:{padding:12,borderRadius:16},
 segments:{flexDirection:'row',borderRadius:16,padding:4,gap:4},
 segment:{flex:1,minHeight:44,borderRadius:12,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'transparent',paddingHorizontal:4},
 filter:{borderWidth:1,borderRadius:22,paddingHorizontal:16,minHeight:44,justifyContent:'center'},
 planRow:{flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderRadius:16,padding:12},
 bar:{width:4,alignSelf:'stretch',borderRadius:2},
 backdrop:{flex:1,backgroundColor:'#0B173A66',justifyContent:'flex-end'},sheet:{maxHeight:'90%',borderTopLeftRadius:30,borderTopRightRadius:30,width:'100%',maxWidth:640,alignSelf:'center'},
});
