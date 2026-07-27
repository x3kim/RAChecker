// RAChecker mobile theme. Mirrors the desktop's CRT themes. `colors` is a single
// mutable palette object: switching theme Object.assigns a new palette into it,
// and the app reloads so every module's StyleSheet picks up the new values (the
// low-risk alternative to threading a theme context through every component).
import { TextStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Palette = {
  bg: string; bg2: string; panel: string; panel2: string; surface: string; line: string; line2: string;
  cyan: string; magenta: string; green: string; amber: string; red: string; purple: string; blue: string;
  inkHi: string; inkMid: string; inkDim: string;
};

export const PALETTES: Record<string, Palette> = {
  cyan: {
    bg: '#080b12', bg2: '#0a0e17', panel: '#111827', panel2: '#18203221', surface: '#131b2c', line: '#243049', line2: '#2f3d5e',
    cyan: '#22e0ff', magenta: '#ff3ca6', green: '#39ff8b', amber: '#ffb648', red: '#ff4d5e', purple: '#9d6bff', blue: '#4d8bff',
    inkHi: '#e8f0ff', inkMid: '#9fb0d0', inkDim: '#5d6e90',
  },
  amber: {
    bg: '#0d0a05', bg2: '#100c06', panel: '#1b1408', panel2: '#1b140821', surface: '#1f1709', line: '#3b2c12', line2: '#4d3a17',
    cyan: '#ffb000', magenta: '#ff7a18', green: '#7dff5a', amber: '#ffd25e', red: '#ff5a3c', purple: '#ffae00', blue: '#ffc24d',
    inkHi: '#ffe9c2', inkMid: '#c9a86a', inkDim: '#7d6233',
  },
  synthwave: {
    bg: '#140a24', bg2: '#160b28', panel: '#20123a', panel2: '#20123a21', surface: '#271546', line: '#3c2160', line2: '#51307e',
    cyan: '#2bd9ff', magenta: '#ff2e97', green: '#36f9b3', amber: '#ffcf4a', red: '#ff5d73', purple: '#b66dff', blue: '#7a8cff',
    inkHi: '#f4e9ff', inkMid: '#b79fd6', inkDim: '#7a679e',
  },
  green: {
    bg: '#04100a', bg2: '#06140d', panel: '#0a1f15', panel2: '#0a1f1521', surface: '#0c2419', line: '#15402b', line2: '#1d5639',
    cyan: '#39ff8b', magenta: '#b6ff3c', green: '#57ff9a', amber: '#d6ff5e', red: '#ff6b5e', purple: '#38ffd0', blue: '#5effa0',
    inkHi: '#d6ffe6', inkMid: '#7fc79e', inkDim: '#4a7d62',
  },
  gameboy: {
    bg: '#0b1f0b', bg2: '#0f280f', panel: '#16361a', panel2: '#16361a21', surface: '#1b401f', line: '#2c5e2c', line2: '#3a7a37',
    cyan: '#9bbc0f', magenta: '#8bac0f', green: '#9bbc0f', amber: '#c6de8c', red: '#d06b4f', purple: '#8bac0f', blue: '#6b9b2f',
    inkHi: '#d7e89b', inkMid: '#8bac0f', inkDim: '#5a7a2f',
  },
  light: {
    bg: '#eef2f8', bg2: '#e6ebf4', panel: '#ffffff', panel2: '#f4f7fc', surface: '#f7f9fd', line: '#d2dbeb', line2: '#b9c6dd',
    cyan: '#0a8aab', magenta: '#c01f74', green: '#128a4e', amber: '#b9740a', red: '#cc2b3c', purple: '#6a3fd0', blue: '#2a64c8',
    inkHi: '#14223a', inkMid: '#41526e', inkDim: '#5b6e8c',
  },
};

export const THEME_LIST: { id: string; name: string }[] = [
  { id: 'cyan', name: 'CRT Cyan' },
  { id: 'amber', name: 'Amber' },
  { id: 'synthwave', name: 'Synthwave' },
  { id: 'green', name: 'Matrix' },
  { id: 'gameboy', name: 'Game Boy' },
  { id: 'light', name: 'Light' },
];

// The single live palette every component reads. Mutated in place on theme change.
export const colors: Palette = { ...PALETTES.cyan };

export function applyThemeToColors(id: string): void {
  Object.assign(colors, PALETTES[id] || PALETTES.cyan);
}

const THEME_KEY = 'ra_theme';
export async function loadThemeId(): Promise<string> {
  const v = await AsyncStorage.getItem(THEME_KEY);
  return v && PALETTES[v] ? v : 'cyan';
}
export async function saveThemeId(id: string): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, id);
}

export const fonts = {
  display: 'PressStart2P_400Regular',
  mono: 'VT323_400Regular',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
};

export function textGlow(color: string, radius = 12): TextStyle {
  return { textShadowColor: color, textShadowRadius: radius, textShadowOffset: { width: 0, height: 0 } };
}

export function glow(color: string, radius = 16, opacity = 0.5) {
  return { shadowColor: color, shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height: 0 }, elevation: 6 } as const;
}

export const radius = { sm: 6, md: 10, lg: 14, xl: 18 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
