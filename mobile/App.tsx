import { useState, useEffect, Suspense, lazy } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useFonts, PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { VT323_400Regular } from '@expo-google-fonts/vt323';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, applyThemeToColors, loadThemeId } from './src/theme';
import { I18nProvider, useI18n, loadLang, langChosen, Lang } from './src/i18n';
import { getStartTab, DEFAULT_START_TAB, StartTab } from './src/storage';

// Shell AND LanguageGate (and every StyleSheet they pull in, incl. ui.tsx) are
// imported lazily AFTER the saved theme palette has been applied, so every
// module-level StyleSheet.create captures the chosen theme's colors. Importing
// LanguageGate eagerly used to drag ui.tsx in before applyThemeToColors ran,
// freezing Panel/Btn/Input at the default cyan palette — which is why some boxes
// stayed blue after switching theme. Changing theme persists + reloads the app.
const Shell = lazy(() => import('./src/Shell'));
const LanguageGate = lazy(() =>
  import('./src/screens/LanguageGate').then((m) => ({ default: m.LanguageGate })));

const Loading = () => (
  <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
    <ActivityIndicator color={colors.cyan} />
  </View>
);

function AppInner({ needGate, startTab }: { needGate: boolean; startTab: StartTab }) {
  const { setLang } = useI18n();
  const [gate, setGate] = useState(needGate);
  return (
    <Suspense fallback={<Loading />}>
      {gate
        ? <LanguageGate onPick={(l) => { setLang(l); setGate(false); }} />
        : <Shell startTab={startTab} />}
    </Suspense>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PressStart2P_400Regular,
    VT323_400Regular,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });
  const [ready, setReady] = useState(false);
  const [lang, setLangInit] = useState<Lang>('en');
  const [needGate, setNeedGate] = useState(false);
  // Read here rather than inside Shell so the first tab is right on the first
  // paint — no flash of another screen.
  const [startTab, setStartTab] = useState<StartTab>(DEFAULT_START_TAB);

  useEffect(() => {
    (async () => {
      applyThemeToColors(await loadThemeId());
      setLangInit(await loadLang());
      setNeedGate(!(await langChosen()));
      setStartTab(await getStartTab());
      setReady(true);
    })();
  }, []);

  if (!fontsLoaded || !ready) return <Loading />;
  return (
    <SafeAreaProvider>
      <I18nProvider initial={lang}>
        <AppInner needGate={needGate} startTab={startTab} />
      </I18nProvider>
    </SafeAreaProvider>
  );
}
