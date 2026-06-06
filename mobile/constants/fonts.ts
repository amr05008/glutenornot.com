/* Font wiring for the V2 design system.
 *
 * @expo-google-fonts registers each weight as its own family name
 * (e.g. "HankenGrotesk_700Bold"), so RN's fontWeight prop can't select a weight
 * the way it does for system fonts. These helpers map the design tokens'
 * weights to the matching loaded family names. */
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';
// Pass to useFonts() in the root layout.
export const fontMap = {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
};

const SANS: Record<string, string> = {
  '400': 'HankenGrotesk_400Regular',
  '500': 'HankenGrotesk_500Medium',
  '600': 'HankenGrotesk_600SemiBold',
  '700': 'HankenGrotesk_700Bold',
  '800': 'HankenGrotesk_800ExtraBold',
};

const MONO: Record<string, string> = {
  '400': 'JetBrainsMono_400Regular',
  '600': 'JetBrainsMono_600SemiBold',
};

/** Hanken Grotesk family name for a given weight (defaults to 400). */
export const sans = (weight: keyof typeof SANS | string = '400'): string =>
  SANS[String(weight)] ?? SANS['400'];

/** JetBrains Mono family name for a given weight (400 or 600). */
export const mono = (weight: keyof typeof MONO | string = '400'): string =>
  MONO[String(weight)] ?? MONO['400'];
