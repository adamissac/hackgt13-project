import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useColors } from './ui';
const names: Record<string, SymbolViewProps['name']> = {
 qr: {ios:'qrcode',android:'qr_code',web:'qr_code'},
 bell: {ios:'bell',android:'notifications',web:'notifications'},
 people: {ios:'person.2',android:'people',web:'people'},
 chart: {ios:'chart.xyaxis.line',android:'show_chart',web:'show_chart'},
 document: {ios:'doc.text',android:'description',web:'description'},
 code: {ios:'chevron.left.forwardslash.chevron.right',android:'code',web:'code'},
 check: {ios:'checkmark',android:'check',web:'check'},
 chat: {ios:'bubble.left',android:'chat',web:'chat'},
 event: {ios:'calendar',android:'event',web:'event'},
 mail: {ios:'envelope',android:'mail',web:'mail'},
 phone: {ios:'iphone',android:'smartphone',web:'smartphone'},
};
export function AppIcon({ name, color, size = 22 }: {name:string;color?:string;size?:number}) {
 const c = useColors(); // default follows light/dark
 return <SymbolView name={names[name] ?? {ios:'circle',android:'circle',web:'circle'}} tintColor={color ?? c.tabIconSelected} size={size}/>;
}
