import React, { useId } from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * A lightweight, decorative, original Stuora illustration. Runs natively on
 * Expo Web, iOS, and Android without external image hosts or fake listing data.
 * Photographic category banner candidates are maintained separately until
 * static asset ingestion is verified in the existing repository.
 */
export type ArtworkCategory = 'Housing' | 'Marketplace' | 'Trips' | 'Jobs' | 'Events' | 'People';

export function CategoryArtwork({ category, width = 160, height = 90 }: {
  category: ArtworkCategory; width?: number | string; height?: number;
}) {
  const id = useId().replace(/:/g, '');
  const bg = `${id}-bg`;
  const accent = `${id}-accent`;
  return (
    <Svg width={width as number} height={height} viewBox="0 0 320 160" accessible={false}>
      <Defs>
        <LinearGradient id={bg} x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#F9F6FF" />
          <Stop offset=".56" stopColor="#E6DFFF" />
          <Stop offset="1" stopColor="#D5F3FD" />
        </LinearGradient>
        <LinearGradient id={accent} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#884BFA" />
          <Stop offset=".58" stopColor="#7060FA" />
          <Stop offset="1" stopColor="#1ABCEF" />
        </LinearGradient>
      </Defs>
      <Rect width="320" height="160" rx="20" fill={`url(#${bg})`} />
      <Circle cx="266" cy="24" r="65" fill="#FFFFFF" opacity=".35" />
      <Circle cx="58" cy="166" r="79" fill="#FFFFFF" opacity=".24" />
      <Path d="M-8 128 Q70 69 158 123 T328 89" fill="none" stroke="#FFFFFF" strokeWidth="6" opacity=".7" />
      {category === 'Housing' && (
        <G>
          <Rect x="92" y="51" width="126" height="91" rx="11" fill="#FFFFFF" />
          <Path d="M76 67L154 16L235 67" fill="none" stroke={`url(#${accent})`} strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
          <Rect x="145" y="96" width="31" height="46" rx="6" fill={`url(#${accent})`} />
          <Rect x="108" y="78" width="25" height="25" rx="4" fill="#D5EFFF" />
          <Rect x="187" y="78" width="19" height="25" rx="4" fill="#D5EFFF" />
          <Circle cx="83" cy="130" r="22" fill="#83CAA9" /><Circle cx="239" cy="130" r="20" fill="#A3DECB" />
        </G>
      )}
      {category === 'Marketplace' && (
        <G>
          <Rect x="84" y="57" width="154" height="85" rx="14" fill="#FFFFFF" />
          <Path d="M91 68H230" stroke={`url(#${accent})`} strokeWidth="13" strokeLinecap="round" />
          <Rect x="114" y="93" width="34" height="49" rx="5" fill="#D4C5FF" />
          <Rect x="165" y="82" width="49" height="36" rx="5" fill="#DAF5FF" />
          <Path d="M102 60V50A59 59 0 0 1 220 50V60" fill="none" stroke="#8055F4" strokeWidth="9" />
          <Circle cx="189" cy="102" r="8" fill="#31BDEB" />
        </G>
      )}
      {category === 'Trips' && (
        <G>
          <Path d="M59 122L116 48L166 113L215 29L264 122Z" fill="#FFFFFF" />
          <Path d="M91 80L116 48L142 80M187 68L215 29L241 68" fill="none" stroke="#AC9CFF" strokeWidth="8" strokeLinecap="round" />
          <Path d="M61 126Q154 73 259 125" fill="none" stroke="#3BBDE9" strokeWidth="9" strokeLinecap="round" />
          <Circle cx="252" cy="38" r="15" fill="#FFC97A" />
          <Path d="M139 35L197 17L170 77L160 53Z" fill={`url(#${accent})`} />
        </G>
      )}
      {category === 'Jobs' && (
        <G>
          <Rect x="85" y="58" width="155" height="89" rx="14" fill="#FFFFFF" />
          <Path d="M124 58V42Q124 30 138 30H187Q201 30 201 42V58" stroke="#8055F4" strokeWidth="11" fill="none" />
          <Rect x="93" y="78" width="138" height="24" rx="5" fill="#D9CFFF" />
          <Path d="M94 107L137 119L188 119L230 107" fill="none" stroke="#36BCEC" strokeWidth="9" />
          <Rect x="153" y="94" width="21" height="26" rx="5" fill={`url(#${accent})`} />
          <Circle cx="236" cy="36" r="20" fill="#FFFFFF" /><Path d="M227 37L235 45L248 27" fill="none" stroke="#42BBAD" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )}
      {category === 'Events' && (
        <G>
          <Rect x="93" y="44" width="136" height="106" rx="15" fill="#FFFFFF" />
          <Rect x="93" y="44" width="136" height="33" rx="14" fill={`url(#${accent})`} />
          <Path d="M131 32V57M193 32V57" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" />
          <Circle cx="128" cy="99" r="9" fill="#9D84FB" /><Circle cx="161" cy="99" r="9" fill="#63D1F6" /><Circle cx="195" cy="99" r="9" fill="#9D84FB" />
          <Rect x="122" y="120" width="76" height="12" rx="6" fill="#D6D0F1" />
          <Path d="M66 43L72 25M252 59L267 45M253 103L271 103" stroke="#8B69FB" strokeWidth="7" strokeLinecap="round" />
        </G>
      )}
      {category === 'People' && (
        <G>
          <Circle cx="160" cy="67" r="24" fill={`url(#${accent})`} />
          <Circle cx="105" cy="79" r="19" fill="#B7A4F7" />
          <Circle cx="215" cy="79" r="19" fill="#66C9EB" />
          <Path d="M112 148V130Q112 102 160 102Q208 102 208 130V148" fill={`url(#${accent})`} />
          <Path d="M63 146V130Q63 103 105 103Q125 103 134 116" fill="#B7A4F7" />
          <Path d="M257 146V130Q257 103 215 103Q195 103 186 116" fill="#66C9EB" />
        </G>
      )}
    </Svg>
  );
}
