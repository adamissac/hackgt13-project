import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useColors } from './ui';

export function ConstellationMark({ size = 36, color = '#172D50' }: { size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 40 40">
    <Path d="M30 8 L16 6 L7 19 L14 32 L30 29 M16 6 L20 20 L14 32 M7 19 L20 20 L30 29" stroke={color} strokeWidth="1.3" fill="none" opacity={0.6} />
    {[[30,8,3],[16,6,2.5],[7,19,3],[14,32,2.5],[30,29,3],[20,20,2]].map(([x,y,r],i)=><Circle key={i} cx={x} cy={y} r={r} fill={color}/>)}
  </Svg>;
}
export function Brand() {
 const c=useColors();
 return <View style={{flexDirection:'row',alignItems:'center',gap:8}}><ConstellationMark size={30}/><Text style={{color:c.text,fontSize:20,fontWeight:'700',letterSpacing:-0.7}}>Constellation</Text></View>;
}
// SVG works on every supported platform and remains recognizable at tab size.
export function ChatMark({ color = '#172D50', size = 24 }: { color?: string; size?: number }) {
 return <Svg width={size} height={size} viewBox="0 0 24 24">
  <Path d="M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9l-6 3V5a2 2 0 0 1 2-2Z" fill="none" stroke={color} strokeWidth="1.7" strokeLinejoin="round"/>
  <Path d="m7 13 4-6 6 5-5 3" fill="none" stroke={color} strokeWidth="1"/>
  {[[7,13],[11,7],[17,12],[12,15]].map(([x,y],i)=><Circle key={i} cx={x} cy={y} r="1.3" fill={color}/>)}
 </Svg>;
}
