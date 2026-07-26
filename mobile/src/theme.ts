// RAChecker mobile theme — mirrors the desktop's default "CRT Cyan" theme
// (web/src/index.css :root vars) so the app looks 1:1, mobile-optimized. Colors,
// fonts and accents are the exact desktop values.
import { TextStyle } from 'react-native';

export const colors = {
  bg: '#080b12',
  bg2: '#0a0e17',
  panel: '#111827',
  panel2: '#18203221',
  surface: '#131b2c',
  line: '#243049',
  line2: '#2f3d5e',

  cyan: '#22e0ff',
  magenta: '#ff3ca6',
  green: '#39ff8b',
  amber: '#ffb648',
  red: '#ff4d5e',
  purple: '#9d6bff',
  blue: '#4d8bff',

  inkHi: '#e8f0ff',
  inkMid: '#9fb0d0',
  inkDim: '#5d6e90',
};

// Font family names as registered by @expo-google-fonts (loaded in App.tsx).
export const fonts = {
  display: 'PressStart2P_400Regular', // headings — retro pixel
  mono: 'VT323_400Regular',           // stats / hashes
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
};

// Neon text glow (RN Text supports textShadow — real glow, unlike box-shadow).
export function textGlow(color: string, radius = 12): TextStyle {
  return { textShadowColor: color, textShadowRadius: radius, textShadowOffset: { width: 0, height: 0 } };
}

// Panel/box drop-shadow approximation (colored on iOS, depth on Android).
export function glow(color: string, radius = 16, opacity = 0.5) {
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  } as const;
}

export const radius = { sm: 6, md: 10, lg: 14, xl: 18 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
