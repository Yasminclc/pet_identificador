import { StyleSheet, View } from 'react-native';

import { Icone, type NomeIcone } from '@/components/icone';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Título de cartão no estilo PetMatch: ícone, título e um traço verde abaixo. */
export function TituloSecao({ icone, titulo }: { icone: NomeIcone; titulo: string }) {
  const theme = useTheme();
  return (
    <View style={styles.linha}>
      <Icone nome={icone} cor={theme.primary} tamanho={30} />
      <View style={styles.textos}>
        <ThemedText type="smallBold" style={styles.titulo}>
          {titulo}
        </ThemedText>
        <View style={[styles.traco, { backgroundColor: theme.highlight }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  textos: {
    flex: 1,
    gap: Spacing.two,
  },
  titulo: {
    fontSize: 22,
    lineHeight: 30,
  },
  traco: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
});
