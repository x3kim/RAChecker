import { useState, useEffect, ReactNode } from 'react';
import { View, StyleSheet, Platform, StatusBar as RNStatusBar, Pressable, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius } from './theme';
import { Display, Body } from './ui';
import { ScanScreen } from './screens/ScanScreen';
import { GamesScreen } from './screens/GamesScreen';
import { DiscoverScreen } from './screens/DiscoverScreen';
import { SyncScreen } from './screens/SyncScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { OnboardingModal } from './screens/OnboardingModal';
import { isOnboarded } from './storage';

const TOP_INSET = Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) : 0;

type Tab = 'scan' | 'games' | 'discover' | 'sync' | 'profile' | 'settings';
const TABS: { key: Tab; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'scan', label: 'Scan', icon: 'search' },
  { key: 'games', label: 'Games', icon: 'grid' },
  { key: 'discover', label: 'Discover', icon: 'compass' },
  { key: 'sync', label: 'Sync', icon: 'database' },
  { key: 'profile', label: 'Profile', icon: 'user' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

export default function Shell() {
  const [tab, setTab] = useState<Tab>('scan');
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set<Tab>(['scan']));
  const show = (t: Tab) => { setTab(t); setVisited((v) => (v.has(t) ? v : new Set(v).add(t))); };
  const [onboarding, setOnboarding] = useState(false);
  useEffect(() => { isOnboarded().then((v) => setOnboarding(!v)); }, []);

  const pane = (t: Tab, node: ReactNode) =>
    visited.has(t) ? <View key={t} style={[styles.pane, { display: tab === t ? 'flex' : 'none' }]}>{node}</View> : null;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View style={styles.logoMark}><Display size={16} color={colors.cyan}>RA</Display></View>
        <View>
          <Display size={15} color={colors.inkHi}>RACHECKER</Display>
          <Body size={11} color={colors.inkDim} style={{ marginTop: 2 }}>ROM ⇄ Achievement Scanner</Body>
        </View>
      </View>

      <View style={styles.body}>
        {pane('scan', <ScanScreen />)}
        {pane('games', <GamesScreen onGoSync={() => show('sync')} />)}
        {pane('discover', <DiscoverScreen onGoSettings={() => show('settings')} />)}
        {pane('sync', <SyncScreen onGoSettings={() => show('settings')} />)}
        {pane('profile', <ProfileScreen onGoSettings={() => show('settings')} />)}
        {pane('settings', <SettingsScreen onConnected={() => show('profile')} />)}
      </View>

      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => show(t.key)}>
              <Feather name={t.icon} size={19} color={active ? colors.cyan : colors.inkDim} />
              <Body size={10} color={active ? colors.cyan : colors.inkDim} weight={active ? 'semibold' : undefined} numberOfLines={1} style={{ marginTop: 3 }}>{t.label}</Body>
            </Pressable>
          );
        })}
      </View>

      {onboarding && <OnboardingModal onDone={() => setOnboarding(false)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: TOP_INSET },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.bg2,
  },
  logoMark: {
    width: 40, height: 40, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.cyan,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  body: { flex: 1 },
  pane: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tabBar: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line,
    backgroundColor: colors.bg2, paddingVertical: space.sm,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space.xs },
});
