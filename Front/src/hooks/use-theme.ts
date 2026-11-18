/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  // Sem preferência do sistema (null no SDK 58), usa o tema claro
  const theme = scheme === 'dark' ? 'dark' : 'light';

  return Colors[theme];
}
