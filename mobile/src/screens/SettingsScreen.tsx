import { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Alert, Pressable, Linking, Switch } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, space, radius, PALETTES, THEME_LIST, loadThemeId, saveThemeId } from '../theme';
import { Panel, Display, Mono, Body, SectionHeader, Btn, Input } from '../ui';
import { getCreds, setCreds, clearCreds } from '../storage';
import { getUserProfile } from '../ra/api';
import { dbStats, clearDb, libraryStats, clearLibrary } from '../db';
import { shareCollectionCsv } from '../export';
import { useI18n, Lang } from '../i18n';
import { APP_VERSION, REPO_URL, DOCS_URL, RA_KEY_URL } from '../version';
import { checkUpdate, downloadAndInstall, autoCheckEnabled, setAutoCheck, UpdateInfo } from '../update';
import { ChangelogModal } from './ChangelogModal';
import { RegionPriorityPanel } from '../components/RegionPriorityPanel';

const DESKTOP_URL = `${REPO_URL}/releases`;

export function SettingsScreen({ onConnected }: { onConnected: () => void }) {
  const { t, lang, setLang } = useI18n();
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'busy'; msg: string } | null>(null);

  const [theme, setTheme] = useState('cyan');
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const [data, setData] = useState<{ hashes: number; games: number; collection: number }>({ hashes: 0, games: 0, collection: 0 });
  const [changelog, setChangelog] = useState(false);

  // updates
  const [autoUpd, setAutoUpd] = useState(true);
  const [updState, setUpdState] = useState<{ kind: 'idle' | 'checking' | 'none' | 'found' | 'downloading' | 'error'; msg?: string; info?: UpdateInfo; pct?: number }>({ kind: 'idle' });

  const refreshData = useCallback(async () => {
    const d = await dbStats();
    const l = await libraryStats();
    setData({ hashes: d.hashes, games: d.games, collection: l.total });
  }, []);

  useEffect(() => {
    (async () => {
      const c = await getCreds();
      if (c) { setUsername(c.username); setHasKey(true); }
      else { const u = await AsyncStorage.getItem('ra_user'); if (u) setUsername(u); }
      setTheme(await loadThemeId());
      setAutoUpd(await autoCheckEnabled());
      await refreshData();
    })();
  }, [refreshData]);

  const pickTheme = async (id: string) => {
    setTheme(id);
    await saveThemeId(id);
    Alert.alert(t('set.themeSaved'), t('set.themeSavedBody'));
  };

  const exportCsv = async () => {
    setCsvMsg(t('set.preparing'));
    const r = await shareCollectionCsv();
    setCsvMsg(r.ok ? t('set.exportOk', { n: r.count }) : (r.error || t('set.exportFail')));
    setTimeout(() => setCsvMsg(null), 5000);
  };

  const confirmClear = (title: string, fn: () => Promise<void>) =>
    Alert.alert(title, t('set.cannotUndo'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => { await fn(); await refreshData(); } },
    ]);

  const save = async () => {
    if (!username.trim() || !apiKey.trim()) { setStatus({ kind: 'err', msg: t('set.enterBoth') }); return; }
    setStatus({ kind: 'busy', msg: t('set.verifying') });
    try {
      await setCreds(username, apiKey);
      const p = await getUserProfile({ username: username.trim(), apiKey: apiKey.trim() });
      setStatus({ kind: 'ok', msg: t('set.connectedAs', { u: p.User || username }) });
      setHasKey(true);
      setApiKey('');
      onConnected();
    } catch (e: any) {
      setStatus({ kind: 'err', msg: String(e?.message || e) });
    }
  };

  const disconnect = async () => {
    await clearCreds();
    setUsername(''); setApiKey(''); setHasKey(false);
    setStatus({ kind: 'ok', msg: t('set.disconnected') });
  };

  const runCheck = async () => {
    setUpdState({ kind: 'checking' });
    try {
      const info = await checkUpdate();
      if (info) setUpdState({ kind: 'found', info });
      else setUpdState({ kind: 'none' });
    } catch (e: any) {
      setUpdState({ kind: 'error', msg: String(e?.message || e) });
    }
  };
  const runInstall = async (info: UpdateInfo) => {
    setUpdState({ kind: 'downloading', info, pct: 0 });
    try {
      await downloadAndInstall(info, (p) => setUpdState((s) => ({ ...s, pct: p })));
      setUpdState({ kind: 'found', info });
    } catch (e: any) {
      setUpdState({ kind: 'error', msg: String(e?.message || e) });
    }
  };
  const toggleAuto = async (on: boolean) => { setAutoUpd(on); await setAutoCheck(on); };

  const statusColor = status?.kind === 'err' ? colors.red : status?.kind === 'ok' ? colors.green : colors.inkMid;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Panel style={{ gap: space.md }}>
        <SectionHeader title={t('set.account')} />
        <Body size={13} color={colors.inkDim}>{t('set.keyHelp')}</Body>
        <Pressable onPress={() => Linking.openURL(RA_KEY_URL)}><Body size={13} color={colors.cyan} weight="semibold">{t('set.keyLink')}</Body></Pressable>
        <Input label={t('set.username')} value={username} onChangeText={setUsername} placeholder={t('set.keyPlaceholderUser')} />
        <Input label={hasKey ? t('set.keyStored') : t('set.key')} value={apiKey} onChangeText={setApiKey} placeholder={hasKey ? t('set.keyStoredPh') : t('set.keyPh')} secure />
        <View style={styles.row}>
          <Btn label={status?.kind === 'busy' ? t('set.verifying') : t('set.saveConnect')} variant="primary" onPress={save} disabled={status?.kind === 'busy'} style={{ flex: 1 }} />
          {hasKey && <Btn label={t('set.disconnect')} variant="danger" onPress={disconnect} />}
        </View>
        {status && <Body size={13} color={statusColor}>{status.msg}</Body>}
      </Panel>

      <Panel style={{ marginTop: space.lg }}>
        <SectionHeader title={t('set.language')} color={colors.blue} />
        <Body size={12} color={colors.inkDim} style={{ marginBottom: space.md }}>{t('set.langHelp')}</Body>
        <View style={styles.langRow}>
          {(['en', 'de'] as Lang[]).map((l) => (
            <Pressable key={l} onPress={() => setLang(l)} style={[styles.langBtn, lang === l && styles.langOn]}>
              <Display size={13} color={lang === l ? colors.cyan : colors.inkDim}>{l === 'en' ? 'EN' : 'DE'}</Display>
              <Body size={12} color={lang === l ? colors.inkHi : colors.inkMid} style={{ marginTop: 2 }}>{l === 'en' ? 'English' : 'Deutsch'}</Body>
            </Pressable>
          ))}
        </View>
      </Panel>

      <Panel style={{ marginTop: space.lg }}>
        <SectionHeader title={t('set.appearance')} color={colors.magenta} />
        <Body size={12} color={colors.inkDim} style={{ marginBottom: space.md }}>{t('set.themeHelp')}</Body>
        <View style={styles.themes}>
          {THEME_LIST.map((tm) => {
            const p = PALETTES[tm.id];
            const on = theme === tm.id;
            return (
              <Pressable key={tm.id} onPress={() => pickTheme(tm.id)} style={[styles.swatch, { backgroundColor: p.bg, borderColor: on ? p.cyan : colors.line }]}>
                <View style={[styles.dot, { backgroundColor: p.cyan }]} />
                <View style={[styles.dot, { backgroundColor: p.green }]} />
                <View style={[styles.dot, { backgroundColor: p.magenta }]} />
                <Body size={11} color={on ? colors.inkHi : colors.inkMid} style={{ marginLeft: 6 }}>{tm.name}</Body>
              </Pressable>
            );
          })}
        </View>
      </Panel>

      <RegionPriorityPanel />

      <Panel style={{ marginTop: space.lg }}>
        <SectionHeader title={t('set.data')} color={colors.green} />
        <View style={styles.stats}>
          <Stat label={t('set.hashes')} value={data.hashes} />
          <Stat label={t('set.dbGames')} value={data.games} />
          <Stat label={t('set.collection')} value={data.collection} />
        </View>
        <View style={styles.row}>
          <Btn label={t('set.clearHash')} variant="danger" onPress={() => confirmClear(t('set.clearHashQ'), clearDb)} style={{ flex: 1 }} />
          <Btn label={t('set.clearCol')} variant="danger" onPress={() => confirmClear(t('set.clearColQ'), clearLibrary)} style={{ flex: 1 }} />
        </View>
        <View style={{ marginTop: space.sm }}>
          <Btn label={t('set.exportCsv')} onPress={exportCsv} />
          {csvMsg && <Body size={12} color={colors.inkMid} style={{ marginTop: space.sm }}>{csvMsg}</Body>}
        </View>
      </Panel>

      <Panel style={{ marginTop: space.lg }}>
        <SectionHeader title={t('upd.section')} color={colors.amber} />
        <View style={styles.switchRow}>
          <Body size={13} color={colors.inkMid} style={{ flex: 1 }}>{t('upd.auto')}</Body>
          <Switch value={autoUpd} onValueChange={toggleAuto} trackColor={{ true: colors.green, false: colors.line }} thumbColor={colors.inkHi} />
        </View>
        {updState.kind === 'found' && updState.info ? (
          <View style={{ marginTop: space.sm, gap: space.sm }}>
            <Body size={13} color={colors.green}>{t('upd.available', { v: updState.info.version })}</Body>
            <Btn label={t('upd.download')} variant="primary" onPress={() => runInstall(updState.info!)} />
          </View>
        ) : updState.kind === 'downloading' ? (
          <Body size={13} color={colors.inkMid} style={{ marginTop: space.sm }}>{t('upd.downloading', { p: Math.round((updState.pct ?? 0) * 100) })}</Body>
        ) : (
          <View style={{ marginTop: space.sm }}>
            <Btn label={updState.kind === 'checking' ? t('upd.checking') : t('upd.check')} onPress={runCheck} disabled={updState.kind === 'checking'} />
            {updState.kind === 'none' && <Body size={13} color={colors.inkDim} style={{ marginTop: space.sm }}>{t('upd.upToDate', { v: APP_VERSION })}</Body>}
            {updState.kind === 'error' && <Body size={13} color={colors.red} style={{ marginTop: space.sm }}>{t('upd.failed', { e: updState.msg ?? '' })}</Body>}
          </View>
        )}
      </Panel>

      <Panel style={{ marginTop: space.lg }}>
        <SectionHeader title={t('set.about')} color={colors.purple} />
        <Body size={13} color={colors.inkMid}>{t('set.disclaimer')}</Body>
        <Body size={13} color={colors.inkMid} style={{ marginTop: space.md }}>{t('set.desktopNote')}</Body>
        <Pressable onPress={() => Linking.openURL(DESKTOP_URL)} style={{ marginTop: space.sm }}><Body size={13} color={colors.cyan} weight="semibold">{t('set.desktopLink')}</Body></Pressable>
        <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.md, flexWrap: 'wrap' }}>
          <Pressable onPress={() => Linking.openURL(REPO_URL)}><Body size={13} color={colors.cyan} weight="semibold">{t('set.github')}</Body></Pressable>
          <Pressable onPress={() => Linking.openURL(DOCS_URL)}><Body size={13} color={colors.cyan} weight="semibold">{t('set.docs')}</Body></Pressable>
          <Pressable onPress={() => setChangelog(true)}><Body size={13} color={colors.cyan} weight="semibold">{t('set.changelog')}</Body></Pressable>
        </View>
        <Display size={11} color={colors.inkDim} style={{ marginTop: space.md }}>{t('set.versionMobile', { v: APP_VERSION })}</Display>
      </Panel>

      {changelog && <ChangelogModal onClose={() => setChangelog(false)} />}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Mono size={22} color={colors.cyan}>{value.toLocaleString()}</Mono>
      <Body size={11} color={colors.inkDim} weight="medium" style={{ marginTop: 2 }}>{label}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'stretch', marginTop: space.md },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm, marginTop: space.md },
  stat: { flex: 1, alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, paddingVertical: space.md },
  themes: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 3 },
  langRow: { flexDirection: 'row', gap: space.sm },
  langBtn: { flex: 1, alignItems: 'center', paddingVertical: space.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface },
  langOn: { borderColor: colors.cyan, backgroundColor: colors.panel },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
