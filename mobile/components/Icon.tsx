/* SVG marks ported from the V2 design package (gon-shared.jsx):
 *  - Icon: minimal geometric line-icon set
 *  - Reticle: corner-bracket scan frame (the new logo motif)
 *  - VerdictDots: three-dot verdict-scale mark (the only branded use of color) */
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { verdictColors } from '../constants/theme';

export type IconName =
  | 'camera'
  | 'image'
  | 'close'
  | 'arrowLeft'
  | 'arrowRight'
  | 'check'
  | 'alert'
  | 'cross'
  | 'bolt'
  | 'barcode'
  | 'message'
  | 'offline'
  | 'refresh';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
}

const PATHS: Record<IconName, (p: { color: string; stroke: number }) => React.ReactNode> = {
  camera: ({ color }) => (
    <>
      <Path d="M3 8a2 2 0 0 1 2-2h2l1.4-2h7.2L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Circle cx={12} cy={12.5} r={3.5} />
    </>
  ),
  image: () => (
    <>
      <Rect x={3} y={4} width={18} height={16} rx={2} />
      <Circle cx={8.5} cy={9.5} r={1.5} />
      <Path d="M3 16l5-4 4 3 3-2 6 5" />
    </>
  ),
  close: () => <Path d="M6 6l12 12M18 6L6 18" />,
  arrowLeft: () => <Path d="M15 5l-7 7 7 7" />,
  arrowRight: () => <Path d="M9 5l7 7-7 7" />,
  check: () => <Path d="M5 12.5l4.5 4.5L19 7" />,
  alert: () => (
    <>
      <Path d="M12 4.5L21 19.5H3z" />
      <Path d="M12 10v4.5" />
      <Path d="M12 17.4v.1" />
    </>
  ),
  cross: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
    </>
  ),
  bolt: () => <Path d="M13 3L5 13h6l-1 8 8-10h-6z" />,
  barcode: () => <Path d="M4 6v12M8 6v12M11 6v12M14 6v12M17 6v12M20 6v12" />,
  message: () => <Path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
  offline: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M6.5 6.5l11 11" />
    </>
  ),
  refresh: () => (
    <>
      <Path d="M4 12a8 8 0 0 1 13.7-5.6L20 8" />
      <Path d="M20 4v4h-4" />
      <Path d="M20 12a8 8 0 0 1-13.7 5.6L4 16" />
      <Path d="M4 20v-4h4" />
    </>
  ),
};

export function Icon({ name, size = 24, color = '#0E0E0F', stroke = 1.8 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]({ color, stroke })}
    </Svg>
  );
}

interface ReticleProps {
  size?: number;
  color?: string;
  stroke?: number;
  gap?: number;
}

/** Corner-bracket scan frame. `gap` controls bracket arm length. */
export function Reticle({ size = 22, color = '#0E0E0F', stroke = 2, gap = 6 }: ReticleProps) {
  const g = gap;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={`M3 ${3 + g}V3h${g}`} />
      <Path d={`M${21 - g} 3H21v${g}`} />
      <Path d={`M21 ${21 - g}V21h-${g}`} />
      <Path d={`M${3 + g} 21H3v-${g}`} />
    </Svg>
  );
}

interface VerdictDotsProps {
  dot?: number;
  gap?: number;
}

const DOT_ORDER: Array<keyof typeof verdictColors> = ['unsafe', 'caution', 'safe'];

/** Three-dot verdict-scale mark (red / amber / green). */
export function VerdictDots({ dot = 7, gap = 6 }: VerdictDotsProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      {DOT_ORDER.map((k) => (
        <View
          key={k}
          style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: verdictColors[k].accent }}
        />
      ))}
    </View>
  );
}
