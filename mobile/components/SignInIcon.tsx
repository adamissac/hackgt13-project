import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';

export function SignInIcon({ provider, color = '#FFFFFF' }: { provider: 'github' | 'google' | 'linkedin' | 'email' | 'code'; color?: string }) {
  return <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
    {provider === 'linkedin' && <><Rect x={1} y={1} width={22} height={22} rx={2} fill={color} /><SvgText x={4} y={19} fill="#1E3A8A" fontSize={19} fontWeight="bold">in</SvgText></>}
    {provider === 'github' && <Path fill={color} d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.23c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.49 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.6-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.3c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />}
    {provider === 'google' && <>
      <Path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
      <Path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z" />
      <Path fill="#FBBC05" d="M6.41 13.93a6 6 0 0 1 0-3.86V7.48H3.07a10 10 0 0 0 0 9.04l3.34-2.59Z" />
      <Path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.48l3.34 2.59A5.99 5.99 0 0 1 12 5.95Z" />
    </>}
    {provider === 'email' && <><Rect x={2} y={4} width={20} height={16} rx={3} fill="none" stroke={color} strokeWidth={1.6} /><Path d="m3 6 9 7 9-7" fill="none" stroke={color} strokeWidth={1.6} /></>}
    {provider === 'code' && <Path d="m8 6-6 6 6 6m8-12 6 6-6 6" fill="none" stroke={color} strokeWidth={1.6} />}
  </Svg>;
}
