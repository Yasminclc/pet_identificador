import {
  Nunito_500Medium,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
  useFonts,
} from '@expo-google-fonts/nunito';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { Colors } from '@/constants/theme';

// Mantém a splash na tela até a fonte carregar (evita o texto "piscar" com a fonte padrão)
SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [fontesCarregadas, erroFontes] = useFonts({
    Nunito_500Medium,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
  });
  // Se a fonte falhar, segue com a fonte do sistema em vez de travar na splash
  const pronto = fontesCarregadas || erroFontes != null;

  useEffect(() => {
    if (pronto) SplashScreen.hideAsync();
  }, [pronto]);

  if (!pronto) return null;

  const escuro = colorScheme === 'dark';
  const base = escuro ? DarkTheme : DefaultTheme;
  const cores = Colors[escuro ? 'dark' : 'light'];

  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: cores.primary,
          background: cores.background,
          card: cores.background,
        },
      }}>
      <AppTabs />
    </ThemeProvider>
  );
}
