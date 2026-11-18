import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** Barra horizontal de 0 a 100%: verde (alta), amarela (média) ou vermelha (não reconhecido). */
export function BarraConfianca({ confianca, reconhecido }: { confianca: number; reconhecido: boolean }) {
  const theme = useTheme();
  const cor = !reconhecido ? theme.danger : confianca >= 80 ? theme.success : theme.warning;
  const largura = Math.max(0, Math.min(100, confianca));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(largura) }}
      style={[styles.trilho, { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.preenchimento, { width: `${largura}%`, backgroundColor: cor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  trilho: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  preenchimento: {
    height: '100%',
    borderRadius: 5,
  },
});
