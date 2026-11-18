import { TabList, TabSlot, Tabs, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View, type ViewProps } from 'react-native';

import { Icone, type NomeIcone } from '@/components/icone';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Nunito, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Abaixo desta largura a barra esconde textos secundários e mostra só os ícones dos links. */
const LARGURA_COMPACTA = 760;

/**
 * Navegação do navegador: barra superior com a marca PetMatch, os links das páginas
 * e o selo de projeto acadêmico, no lugar das abas flutuantes (NativeTabs) do celular.
 */
export default function AppTabs() {
  const theme = useTheme();

  return (
    <Tabs style={{ flex: 1, backgroundColor: theme.background }}>
      {/* O TabList precisa ser filho direto de Tabs; asChild troca a lista pela barra */}
      <TabList asChild>
        <BarraSuperior>
          <TabTrigger name="index" href="/" asChild>
            <LinkNavegacao icone="lupa" titulo="Identificar" />
          </TabTrigger>
          <TabTrigger name="historico" href="/historico" asChild>
            <LinkNavegacao icone="relogio" titulo="Histórico" />
          </TabTrigger>
          <TabTrigger name="sobre" href="/sobre" asChild>
            <LinkNavegacao icone="info" titulo="Sobre o projeto" />
          </TabTrigger>
        </BarraSuperior>
      </TabList>
      {/* flex: 1 limita as páginas à altura da janela; sem isso elas crescem até o tamanho
          do conteúdo e a rolagem (ScrollView) nunca é ativada */}
      <TabSlot style={{ flex: 1 }} />
    </Tabs>
  );
}

/** Barra do topo: marca à esquerda, links (children) no meio e selo à direita. */
function BarraSuperior({ children, style, ...props }: ViewProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const compacto = width < LARGURA_COMPACTA;

  return (
    <ThemedView
      {...props}
      style={[
        style,
        styles.barra,
        { borderBottomColor: theme.backgroundSelected, boxShadow: `0 2px 16px ${theme.shadow}` },
      ]}>
      <View style={[styles.barraConteudo, compacto && styles.barraCompacta]}>
        <View style={styles.marca}>
          <Icone nome="pata" cor={theme.accent} tamanho={compacto ? 30 : 38} />
          <View>
            <ThemedText style={[styles.nomeMarca, { color: theme.primary }]}>PetMatch</ThemedText>
            {!compacto && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.slogan}>
                Identificador inteligente de raças
              </ThemedText>
            )}
          </View>
        </View>

        {!compacto && <View style={[styles.divisor, { backgroundColor: theme.backgroundSelected }]} />}

        <View style={[styles.links, compacto && styles.linksCompactos]}>{children}</View>

        {width >= 1100 && (
          <View style={[styles.selo, { backgroundColor: theme.primarySoft }]}>
            <Icone nome="chapeu" cor={theme.primary} tamanho={18} />
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              Projeto acadêmico
            </ThemedText>
          </View>
        )}
      </View>
    </ThemedView>
  );
}

type LinkNavegacaoProps = TabTriggerSlotProps & { icone: NomeIcone; titulo: string };

const LinkNavegacao = forwardRef<ComponentRef<typeof View>, LinkNavegacaoProps>(function LinkNavegacao(
  { icone, titulo, isFocused, ...props },
  ref
) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const soIcone = width < LARGURA_COMPACTA;
  const cor = isFocused ? theme.textOnPrimary : theme.text;

  return (
    <Pressable
      ref={ref}
      accessibilityLabel={titulo}
      {...props}
      style={({ hovered }) => [
        styles.link,
        soIcone && styles.linkSoIcone,
        isFocused
          ? { backgroundColor: theme.primary, boxShadow: `0 4px 12px ${theme.shadow}` }
          : hovered && { backgroundColor: theme.primarySoft },
      ]}>
      <Icone nome={icone} cor={cor} tamanho={18} />
      {!soIcone && (
        <ThemedText type="smallBold" style={[styles.textoLink, { color: cor }]}>
          {titulo}
        </ThemedText>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  barra: {
    borderBottomWidth: 1,
    zIndex: 10,
  },
  barraConteudo: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    height: 76,
  },
  barraCompacta: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    height: 64,
    justifyContent: 'space-between',
  },
  marca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.one,
  },
  nomeMarca: {
    fontFamily: Nunito.black,
    fontSize: 28,
    lineHeight: 30,
  },
  slogan: {
    fontSize: 13,
    lineHeight: 16,
  },
  divisor: {
    width: 1,
    height: 36,
  },
  links: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
  },
  linksCompactos: {
    flex: 0,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three + Spacing.one,
    paddingVertical: Spacing.two + Spacing.half,
    borderRadius: 999,
  },
  linkSoIcone: {
    paddingHorizontal: Spacing.three,
  },
  textoLink: {
    fontSize: 15,
  },
  selo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three + Spacing.one,
    paddingVertical: Spacing.two + Spacing.half,
    borderRadius: 999,
  },
});
