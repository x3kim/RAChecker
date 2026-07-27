import { useState, useEffect, Suspense, lazy } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useFonts, PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { VT323_400Regular } from '@expo-google-fonts/vt323';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, applyThemeToColors, loadThemeId } from './src/theme';
import { I18nProvider, useI18n, loadLang, langChosen, Lang } from './src/i18n';
import { LanguageGate } from './src/screens/LanguageGate';

// Shell (and its screens' StyleSheets) is imported lazily AFTER the saved theme
// palette has been applied, so every StyleSheet captures the chosen theme's
// colors. Changing theme persists + reloads the app to re-run this with the new
// palette.
const Shell = lazy(() => import('./src/Shell'));

const Loading = () => (
  <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
    <ActivityIndicator color={colors.cyan} />
  </View>
);

function AppInner({ needGate }: { needGate: boolean }) {
  const { setLang } = useI18n();
  const [gate, setGate] = useState(needGate);
  if (gate) return <LanguageGate onPick={(l) => { setLang(l); setGate(false); }} />;
  return (
    <Suspense fallback={<Loading />}>
      <Shell />
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

  useEffect(() => {
    (async () => {
      applyThemeToColors(await loadThemeId());
      setLangInit(await loadLang());
      setNeedGate(!(await langChosen()));
      setReady(true);
    })();
  }, []);

  if (!fontsLoaded || !ready) return <Loading />;
  return (
    <SafeAreaProvider>
      <I18nProvider initial={lang}>
        <AppInner needGate={needGate} />
      </I18nProvider>
    </SafeAreaProvider>
  );
}
