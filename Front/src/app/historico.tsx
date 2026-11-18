import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icone } from '@/components/icone';
import { CartaoHistorico, ItemHistorico } from '@/components/resultado-predicao';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  BottomTabInset,
  LarguraDesktop,
  MaxContentWidth,
  Nunito,
  Spacing,
  TopTabInset,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buscarHistorico, ErroApi, type Predicao } from '@/services/api';

/** Totais mostrados no topo do histórico. */
function resumir(itens: Predicao[]) {
  const reconhecidas = itens.filter((item) => item.reconhecido);
  const contagem = new Map<string, number>();
  reconhecidas.forEach((item) => contagem.set(item.raca, (contagem.get(item.raca) ?? 0) + 1));
  const [maisFrequente] = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  return {
    total: itens.length,
    percentualReconhecidas: itens.length ? Math.round((reconhecidas.length / itens.length) * 100) : 0,
    maisFrequente: maisFrequente?.[0] ?? '—',
  };
}

export default function HistoricoScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= LarguraDesktop;
  // Grade de cartões no navegador; lista compacta no celular
  const colunas = width >= 1100 ? 3 : width >= 720 ? 2 : 1;

  const [itens, setItens] = useState<Predicao[] | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setItens(await buscarHistorico());
      setErro(null);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Erro inesperado ao carregar o histórico.');
    }
  }, []);

  // Recarrega sempre que a aba é aberta (inclui consultas feitas na outra aba)
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  async function puxarParaAtualizar() {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={desktop ? [] : ['top']} style={styles.safeArea}>
        <FlatList
          // numColumns não pode mudar sem recriar a lista
          key={colunas}
          numColumns={colunas}
          data={completarGrade(itens ?? [], colunas)}
          keyExtractor={(item, indice) => (item ? String(item.id) : `vazio-${indice}`)}
          renderItem={({ item }) =>
            // Espaços vazios mantêm os cartões da última linha do mesmo tamanho dos outros
            !item ? (
              <View style={styles.espacoVazio} />
            ) : colunas > 1 ? (
              <CartaoHistorico predicao={item} />
            ) : (
              <ItemHistorico predicao={item} />
            )
          }
          columnWrapperStyle={colunas > 1 ? styles.linhaGrade : undefined}
          contentContainerStyle={[styles.lista, desktop && styles.listaDesktop]}
          refreshControl={
            <RefreshControl refreshing={atualizando} onRefresh={puxarParaAtualizar} tintColor={theme.primary} />
          }
          ListHeaderComponent={
            <View style={styles.cabecalho}>
              <View style={[styles.etiqueta, { backgroundColor: theme.primarySoft }]}>
                <Icone nome="relogio" cor={theme.primary} tamanho={16} />
                <ThemedText type="smallBold" style={[styles.textoEtiqueta, { color: theme.primary }]}>
                  SUAS CONSULTAS
                </ThemedText>
              </View>
              <ThemedText style={[styles.titulo, desktop && styles.tituloDesktop, { color: theme.primary }]}>
                Histórico
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                {desktop
                  ? 'Suas últimas consultas neste dispositivo.'
                  : 'Suas últimas consultas. Puxe para baixo para atualizar.'}
              </ThemedText>
              {itens && itens.length > 0 && <Resumo itens={itens} />}
              {erro && (
                <ThemedText type="small" style={{ color: theme.danger }}>
                  {erro}
                </ThemedText>
              )}
            </View>
          }
          ListEmptyComponent={
            itens === null && !erro ? (
              <ActivityIndicator color={theme.primary} />
            ) : !erro ? (
              <View style={styles.vazio}>
                <View style={[styles.circuloIcone, { backgroundColor: theme.primarySoft }]}>
                  <Icone nome="relogio" cor={theme.primary} tamanho={44} />
                </View>
                <ThemedText type="smallBold">Nenhuma consulta ainda</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.centralizado}>
                  Identifique uma raça na aba Identificar e ela aparece aqui.
                </ThemedText>
              </View>
            ) : undefined
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

/** Completa a última linha da grade com espaços vazios (null). */
function completarGrade(itens: Predicao[], colunas: number): (Predicao | null)[] {
  const sobra = itens.length % colunas;
  return sobra === 0 ? itens : [...itens, ...Array<null>(colunas - sobra).fill(null)];
}

function Resumo({ itens }: { itens: Predicao[] }) {
  const theme = useTheme();
  const { total, percentualReconhecidas, maisFrequente } = resumir(itens);
  const blocos = [
    { valor: String(total), rotulo: 'consultas' },
    { valor: `${percentualReconhecidas}%`, rotulo: 'com raça identificada' },
    { valor: maisFrequente, rotulo: 'raça mais frequente' },
  ];

  return (
    <View style={styles.resumo}>
      {blocos.map((bloco) => (
        <ThemedView
          key={bloco.rotulo}
          type="backgroundElement"
          style={[styles.blocoResumo, { boxShadow: `0 4px 14px ${theme.shadow}` }]}>
          <ThemedText style={[styles.valorResumo, { color: theme.primary }]} numberOfLines={1}>
            {bloco.valor}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {bloco.rotulo}
          </ThemedText>
        </ThemedView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  listaDesktop: {
    paddingTop: Spacing.five + Spacing.three,
    paddingBottom: Spacing.five,
  },
  linhaGrade: {
    gap: Spacing.three,
  },
  espacoVazio: {
    flex: 1,
  },
  etiqueta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
  },
  textoEtiqueta: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1,
  },
  titulo: {
    fontFamily: Nunito.black,
    fontSize: 34,
    lineHeight: 40,
  },
  tituloDesktop: {
    fontSize: 48,
    lineHeight: 56,
  },
  resumo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  blocoResumo: {
    flexGrow: 1,
    flexBasis: 160,
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: 16,
  },
  valorResumo: {
    fontFamily: Nunito.black,
    fontSize: 24,
    lineHeight: 30,
  },
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  lista: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: TopTabInset + Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  cabecalho: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  vazio: {
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.six,
    paddingHorizontal: Spacing.five,
  },
  circuloIcone: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  centralizado: {
    textAlign: 'center',
  },
});
