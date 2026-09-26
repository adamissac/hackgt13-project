import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { ConstellationMark } from '@/components/Brand';
import { Button, Card, Chip, useColors } from '@/components/ui';
import { ErrorState, Loading } from '@/components/States';
import { eventCatalog, eventDate, eventTime, type NetworkingEvent } from '@/features/events/catalog';
import { useAsync } from '@/lib/useAsync';
import { useAuth } from '@/lib/auth';

export default function EventsScreen() {
 const c=useColors(); const insets=useSafeAreaInsets(); const {session}=useAuth();
 const scope=session?.user.id ?? 'demo';
 const catalog=useAsync(async()=>({events:await eventCatalog.list(),saved:await eventCatalog.registrations(scope)}),[scope]);
 const [selected,setSelected]=useState<NetworkingEvent|null>(null);
 const [filter,setFilter]=useState('All'); const [saved,setSaved]=useState<{scope:string;ids:string[]}|null>(null);
 const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
 const registrations=saved?.scope===scope ? saved.ids : catalog.state.status==='ready' ? catalog.state.data.saved : [];
 const toggle=async(event:NetworkingEvent)=>{
  if(busy)return; setBusy(true);setError(null);
  const ids=registrations.includes(event.id)?registrations.filter(id=>id!==event.id):[...registrations,event.id];
  try { await eventCatalog.save(scope,ids);setSaved({scope,ids}); }
  catch {setError('Could not save your RSVP. Please try again.');} finally {setBusy(false);}
 };
 return <>
  <ScrollView style={{backgroundColor:c.background}} contentContainerStyle={styles.container}>
   <View style={[styles.hero,{backgroundColor:c.tint}]}>
    <ConstellationMark color="#B6C9FA" size={44}/>
    <Text style={styles.eyebrow}>ATLANTA, GEORGIA</Text>
    <Text style={styles.heroTitle}>Make room for
a new connection.</Text>
    <Text style={styles.heroBody}>Shared interests. Real conversations. Your next reason to get together.</Text>
   </View>
   <View style={{gap:4}}><Text style={[styles.title,{color:c.text}]}>Around your orbit</Text><Text style={[styles.body,{color:c.muted}]}>Sample events · RSVPs are saved on this device, not sent to organizers.</Text></View>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>
    {['All','Hackathon','Founders','Careers','Tech meetup'].map(category=><Pressable key={category} onPress={()=>setFilter(category)} accessibilityRole="button" accessibilityState={{selected:filter===category}} style={[styles.filter,{backgroundColor:filter===category?c.tint:c.surface,borderColor:c.border}]}><Text style={{color:filter===category?c.onTint:c.text,fontWeight:'600'}}>{category}</Text></Pressable>)}
   </ScrollView>
   {catalog.state.status==='loading'&&<Loading label="Finding opportunities…"/>}
   {catalog.state.status==='error'&&<ErrorState message={catalog.state.message} onRetry={catalog.reload}/>}
   {catalog.state.status==='ready'&&catalog.state.data.events.filter(e=>filter==='All'||e.category===filter).map(event=><Pressable key={event.id} onPress={()=>{setSelected(event);setError(null);}} accessibilityRole="button" accessibilityLabel={`View ${event.name}`} style={({pressed})=>({opacity:pressed?0.8:1})}>
    <Card>
     <View style={styles.row}><View style={[styles.date,{backgroundColor:c.tintSoft}]}><Text style={{color:c.tint,fontSize:16,fontWeight:'700'}}>{eventDate(event.startsAt)}</Text></View><View style={{flex:1,gap:6}}><Chip label={event.category} tone="ai"/><Text style={[styles.title,{color:c.text}]}>{event.name}</Text></View></View>
     <Text style={[styles.body,{color:c.muted}]}>{event.description}</Text>
     <View style={styles.row}><AppIcon name="event" size={18}/><Text style={[styles.small,{color:c.muted}]}>{eventTime(event.startsAt)} ET · {event.location}</Text></View>
     <View style={[styles.footer,{borderTopColor:c.border}]}><Text style={{color:registrations.includes(event.id)?c.success:c.muted,fontSize:13}}>{registrations.includes(event.id)?'RSVP saved on this device':'Meet people who share your curiosity'}</Text><Text style={{color:c.tint,fontWeight:'700'}}>View</Text></View>
    </Card>
   </Pressable>)}
  </ScrollView>
  <Modal visible={!!selected} transparent animationType="slide" onRequestClose={()=>setSelected(null)}>
   <View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={()=>setSelected(null)} accessibilityRole="button" accessibilityLabel="Close event"/>
    <View accessibilityViewIsModal style={[styles.sheet,{backgroundColor:c.surface,paddingBottom:Math.max(insets.bottom,20)}]}>
     {selected&&<ScrollView contentContainerStyle={{padding:24,gap:18}}>
      <View style={{alignSelf:'center',width:36,height:4,borderRadius:2,backgroundColor:c.border}}/>
      <View style={styles.row}><Chip label={selected.category} tone="ai"/><View style={{flex:1}}/><Button label="Close" variant="ghost" onPress={()=>setSelected(null)}/></View>
      <Text style={{color:c.text,fontSize:30,lineHeight:36,fontWeight:'700',letterSpacing:-0.8}}>{selected.name}</Text>
      <Text style={[styles.body,{color:c.muted}]}>Hosted by {selected.host}</Text>
      <Card highlight><Text style={{color:c.text,fontWeight:'700'}}>{eventDate(selected.startsAt)} · {eventTime(selected.startsAt)}–{eventTime(selected.endsAt)} ET</Text><Text style={[styles.body,{color:c.text}]}>{selected.location}</Text></Card>
      <Text style={[styles.body,{color:c.text}]}>{selected.description}</Text>
      <Text style={[styles.title,{color:c.text}]}>What to expect</Text>
      {selected.agenda.map((item,i)=><View key={item} style={styles.row}><Text style={{color:c.ai,fontWeight:'700'}}>0{i+1}</Text><Text style={[styles.body,{color:c.text,flex:1}]}>{item}</Text></View>)}
      {error&&<Text accessibilityRole="alert" style={{color:c.danger}}>{error}</Text>}
      <Button label={registrations.includes(selected.id)?'Cancel sample RSVP':'RSVP to sample event'} loading={busy} onPress={()=>toggle(selected)}/>
      <Text style={[styles.small,{color:c.muted,textAlign:'center'}]}>{registrations.includes(selected.id)?'You’re on your local guest list. ':''}This is a sample event. No ticket or real registration is created.</Text>
     </ScrollView>}
    </View>
   </View>
  </Modal>
 </>;
}
const styles=StyleSheet.create({
 container:{padding:20,gap:18,paddingBottom:32,maxWidth:640,width:'100%',alignSelf:'center'},
 hero:{borderRadius:26,padding:26,gap:14},eyebrow:{color:'#B6C9FA',fontSize:10,fontWeight:'700',letterSpacing:2},
 heroTitle:{color:'#FFFFFF',fontSize:31,lineHeight:37,fontWeight:'700',letterSpacing:-1},heroBody:{color:'#D3DEF2',fontSize:15,lineHeight:23},
 title:{fontSize:20,fontWeight:'700',letterSpacing:-0.4},body:{fontSize:15,lineHeight:23},small:{fontSize:12,lineHeight:18,flexShrink:1},
 row:{flexDirection:'row',alignItems:'center',gap:12},date:{padding:12,borderRadius:16},
 filter:{borderWidth:1,borderRadius:22,paddingHorizontal:16,minHeight:44,justifyContent:'center'},
 footer:{borderTopWidth:1,paddingTop:14,gap:12,flexDirection:'row',justifyContent:'space-between',flexWrap:'wrap'},
 backdrop:{flex:1,backgroundColor:'#0B173A66',justifyContent:'flex-end'},sheet:{maxHeight:'90%',borderTopLeftRadius:30,borderTopRightRadius:30,width:'100%',maxWidth:640,alignSelf:'center'},
});
