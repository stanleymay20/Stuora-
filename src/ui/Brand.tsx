import React, { useId } from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export function StuoraMark({ size = 40 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Stuora logo">
    <Defs><LinearGradient id={`${id}blue`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#7348FF" /><Stop offset="1" stopColor="#19BAEF" /></LinearGradient><LinearGradient id={`${id}purple`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#A744F8" /><Stop offset="1" stopColor="#6645FA" /></LinearGradient></Defs>
    <Path d="M13 18L48 4Q57 1 57 11V19Q57 23 52 25L20 37Q7 40 7 28V26Q7 20 13 18Z" fill={`url(#${id}blue)`} />
    <Path d="M12 39L44 27Q57 23 57 36V40Q57 44 51 47L17 61Q7 65 7 54V47Q7 42 12 39Z" fill={`url(#${id}blue)`} />
    <Path d="M7 26Q7 18 16 21L50 34Q57 37 57 44Q57 49 49 47L15 34Q7 31 7 26Z" fill={`url(#${id}purple)`} />
  </Svg>;
}
const paths: Record<string, string> = {
  home: 'M3 10L12 3L21 10M5 9V21H9V14H15V21H19V9',
  housing: 'M3 10L12 3L21 10M5 9V21H19V9M9 21V14H15V21',
  marketplace: 'M4 8H20L19 21H5Z M8 8V6A4 4 0 0 1 16 6V8',
  trips: 'M3 12L21 4L14 21L11 14Z M11 14L21 4',
  jobs: 'M4 7H20V21H4Z M8 7V3H16V7M4 12H20M10 12V15H14V12',
  events: 'M4 5H20V21H4Z M8 3V7M16 3V7M4 10H20M8 14H10M14 14H16M8 17H10',
  messages: 'M3 4H21V17H9L4 21V17H3Z M7 9H17M7 13H14',
  search: 'M16 16L21 21',
  plus: 'M12 4V20M4 12H20',
  heart: 'M12 21L3 12C-2 4 7 0 12 6C17 0 26 4 21 12Z',
  location: 'M12 22C12 22 4 14 4 9A8 8 0 1 1 20 9C20 14 12 22 12 22Z',
  arrow: 'M5 12H19M13 6L19 12L13 18',
  close: 'M5 5L19 19M19 5L5 19',
  send: 'M3 11L21 3L13 21L10 14L3 11ZM10 14L21 3',
};
export function Icon({ name, size = 22, color = '#555C72' }: { name: string; size?: number; color?: string }) {
  const key = name.toLowerCase();
  return <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <G fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {key === 'search' ? <Circle cx="10.5" cy="10.5" r="6.5" /> : null}
      {key === 'location' ? <Circle cx="12" cy="9" r="2.5" /> : null}
      {key === 'profile' || key === 'people' ? <><Circle cx="12" cy="7" r="4" /><Path d="M4 21V19A8 8 0 0 1 20 19V21" />{key === 'people' ? <Path d="M20 4A3 3 0 0 1 22 9M22 13V18" /> : null}</> : key === 'photo' ? <><Rect x="3" y="3" width="18" height="18" rx="3" /><Circle cx="8" cy="8" r="1.5" /><Path d="M3 17L9 11L15 17L18 14L21 17" /></> : <Path d={paths[key] ?? paths.home} />}
    </G>
  </Svg>;
}