// Launch-time update banner. Silently checks GitHub on mount (respecting the
// opt-out setting + skipped version); if a newer APK exists, offers download +
// install, "not now" (dismiss this session) or "skip this version".
import { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius } from '../theme';
import { Body, Display } from '../ui';
import { useI18n } from '../i18n';
import { checkUpdateForLaunch, downloadAndInstall, skipVersion, UpdateInfo } from '../update';

export function UpdateBanner() {
  const { t } = useI18n();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { checkUpdateForLaunch().then(setInfo).catch(() => {}); }, []);

  if (!info) return null;

  const install = async () => {
    setBusy(true); setErr(null); setPct(0);
    try { await downloadAndInstall(info, setPct); }
    catch (e: any) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  };
  const skip = async () => { await skipVersion(info.version); setInfo(null); };

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Feather name="download-cloud" size={18} color={colors.green} />
        <View style={{ flex: 1 }}>
          <Display size={11} color={colors.inkHi}>{t('upd.bannerTitle', { v: info.version })}</Display>
          <Body size={12} color={colors.inkDim} style={{ marginTop: 2 }}>
            {busy ? t('upd.downloading', { p: Math.round(pct * 100) }) : err ? t('upd.failed', { e: err }) : t('upd.bannerBody')}
          </Body>
        </View>
        {busy && <ActivityIndicator color={colors.green} />}
      </View>
      {!busy && (
        <View style={styles.actions}>
          <Pressable onPress={install} style={[styles.btn, styles.btnPrimary]}>
            <Body size={12} color="#001018" weight="bold">{t('upd.download')}</Body>
          </Pressable>
          <Pressable onPress={() => setInfo(null)} style={styles.btn}>
            <Body size={12} color={colors.inkMid}>{t('upd.notNow')}</Body>
          </Pressable>
          <Pressable onPress={skip} style={styles.btn}>
            <Body size={12} color={colors.inkDim}>{t('upd.skip')}</Body>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  actions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  btn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line },
  btnPrimary: { backgroundColor: colors.green, borderColor: colors.green },
});
