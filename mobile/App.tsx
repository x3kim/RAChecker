import { useState, useEffect, Suspense, lazy } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useFonts, PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { VT323_400Regular } from '@expo-google-fonts/vt323';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { colors, applyThemeToColors, loadThemeId } from './src/theme';

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

export default function App() {
  const [fontsLoaded] = useFonts({
    PressStart2P_400Regular,
    VT323_400Regular,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });
  const [themeReady, setThemeReady] = useState(false);
  useEffect(() => { loadThemeId().then((id) => { applyThemeToColors(id); setThemeReady(true); }); }, []);

  if (!fontsLoaded || !themeReady) return <Loading />;
  return (
    <Suspense fallback={<Loading />}>
      <Shell />
    </Suspense>
  );
}
