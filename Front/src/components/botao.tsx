import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Icone, type NomeIcone } from '@/components/icone';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type BotaoProps = {
  titulo: string;
  onPress: () => void;
  variante?: 'primario' | 'secundario';
  icone?: NomeIcone;
  desabilitado?: boolean;
  carregando?: boolean;
};

export function Botao({
  titulo,
  onPress,
  variante = 'primario',
  icone,
  desabilitado,
  carregando,
}: BotaoProps) {
  const theme = useTheme();
  const primario = variante === 'primario';
  const inativo = desabilitado || carregando;
  // Primário: verde-escuro preenchido. Secundário: contorno verde, fundo transparente.
  const corTexto = primario ? theme.textOnPrimary : theme.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inativo, busy: carregando }}
      disabled={inativo}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.botao,
        primario
          ? { backgroundColor: theme.primary, boxShadow: `0 6px 16px ${theme.shadow}` }
          : [
              styles.contorno,
              { borderColor: theme.primary, backgroundColor: hovered ? theme.primarySoft : 'transparent' },
            ],
        pressed && styles.pressionado,
        inativo && styles.atenuado,
      ]}>
      {carregando ? (
        <ActivityIndicator color={corTexto} />
      ) : (
        <>
          {icone && <Icone nome={icone} cor={corTexto} />}
          <ThemedText type="smallBold" style={[styles.texto, { color: corTexto }]}>
            {titulo}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  botao: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contorno: {
    borderWidth: 1.5,
  },
  texto: {
    fontSize: 15,
  },
  pressionado: {
    transform: [{ scale: 0.98 }],
  },
  atenuado: {
    opacity: 0.55,
  },
});
