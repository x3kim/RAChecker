import { useState, useEffect, ReactNode } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius } from './theme';
import { Display, Body } from './ui';
import { useI18n } from './i18n';
import { UpdateBanner } from './components/UpdateBanner';
import { ScanScreen } from './screens/ScanScreen';
import { GamesScreen } from './screens/GamesScreen';
import { DiscoverScreen } from './screens/DiscoverScreen';
import { SyncScreen } from './screens/SyncScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { OnboardingModal } from './screens/OnboardingModal';
import { ChangelogModal } from './screens/ChangelogModal';
import { isOnboarded, DEFAULT_START_TAB, StartTab } from './storage';
import { APP_VERSION } from './version';

// Remembers the last version the user has seen so we can show the changelog once
// after an update. First install just records the version silently (no popup).
const SEEN_VERSION_KEY = 'ra_seen_version';

type Tab = StartTab;
const TABS: { key: Tab; labelKey: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'scan', labelKey: 'nav.scan', icon: 'search' },
  { key: 'games', labelKey: 'nav.games', icon: 'grid' },
  { key: 'discover', labelKey: 'nav.discover', icon: 'compass' },
  { key: 'sync', labelKey: 'nav.sync', icon: 'database' },
  { key: 'profile', labelKey: 'nav.profile', icon: 'user' },
  { key: 'settings', labelKey: 'nav.settings', icon: 'settings' },
];

export default function Shell({ startTab = DEFAULT_START_TAB }: { startTab?: StartTab }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>(startTab);
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set<Tab>([startTab]));
  const show = (t: Tab) => { setTab(t); setVisited((v) => (v.has(t) ? v : new Set(v).add(t))); };
  const [onboarding, setOnboarding] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  useEffect(() => { isOnboarded().then((v) => setOnboarding(!v)); }, []);

  // Show the changelog once when the installed version changed since last launch.
  useEffect(() => {
    (async () => {
      const seen = await AsyncStorage.getItem(SEEN_VERSION_KEY);
      if (seen && seen !== APP_VERSION) setShowChangelog(true);
      if (seen !== APP_VERSION) await AsyncStorage.setItem(SEEN_VERSION_KEY, APP_VERSION);
    })();
  }, []);

  const pane = (t: Tab, node: ReactNode) =>
    visited.has(t) ? <View key={t} style={[styles.pane, { display: tab === t ? 'flex' : 'none' }]}>{node}</View> : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View style={styles.logoMark}><Display size={16} color={colors.cyan}>RA</Display></View>
        <View>
          <Display size={15} color={colors.inkHi}>RACHECKER</Display>
          <Body size={11} color={colors.inkDim} style={{ marginTop: 2 }}>{t('app.tagline')}</Body>
        </View>
      </View>

      <UpdateBanner />

      <View style={styles.body}>
        {pane('scan', <ScanScreen />)}
        {pane('games', <GamesScreen onGoSync={() => show('sync')} />)}
        {pane('discover', <DiscoverScreen onGoSettings={() => show('settings')} />)}
        {pane('sync', <SyncScreen onGoSettings={() => show('settings')} />)}
        {pane('profile', <ProfileScreen onGoSettings={() => show('settings')} />)}
        {pane('settings', <SettingsScreen onConnected={() => show('profile')} />)}
      </View>

      <View style={[styles.tabBar, { paddingBottom: space.sm + insets.bottom }]}>
        {TABS.map((tb) => {
          const active = tab === tb.key;
          return (
            <Pressable key={tb.key} style={styles.tab} onPress={() => show(tb.key)}>
              <Feather name={tb.icon} size={19} color={active ? colors.cyan : colors.inkDim} />
              <Body size={10} color={active ? colors.cyan : colors.inkDim} weight={active ? 'semibold' : undefined} numberOfLines={1} style={{ marginTop: 3 }}>{t(tb.labelKey)}</Body>
            </Pressable>
          );
        })}
      </View>

      {onboarding && <OnboardingModal onDone={() => setOnboarding(false)} />}
      {showChangelog && !onboarding && <ChangelogModal onClose={() => setShowChangelog(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
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
