import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icone, type NomeIcone } from '@/components/icone';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TituloSecao } from '@/components/titulo-secao';
import {
  BottomTabInset,
  LarguraDesktop,
  MaxContentWidth,
  Nunito,
  Spacing,
  TopTabInset,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { verificarStatus, type InfoModelo, type StatusApi } from '@/services/api';

/**
 * Dados do modelo em uso (backend/modelo/modelo_info.json, gerado pelo
 * notebooks/treinamento_colab.py). A tela usa o que vem do /api/status; esta cópia só
 * aparece enquanto a API não responde. Atualize junto quando treinar de novo.
 */
const MODELO_PADRAO: InfoModelo = {
  rede: 'EfficientNetV2-B0',
  tamanho_imagem: 224,
  racas: 120,
  datasets: ['Stanford Dogs', 'Tsinghua Dogs'],
  limiar_sugerido: 40,
  teste_stanford: { acerto: 0.8941, top3: 0.9828 },
  teste_tsinghua: { acerto: 0.8931, top3: 0.9769 },
  tabela_limiar: [
    { limiar: 20, cobertura: 1.0, acerto: 0.8941 },
    { limiar: 40, cobertura: 0.9878, acerto: 0.9016 },
    { limiar: 50, cobertura: 0.9631, acerto: 0.914 },
    { limiar: 60, cobertura: 0.9069, acerto: 0.9373 },
    { limiar: 70, cobertura: 0.8562, acerto: 0.954 },
  ],
};

/** Linhas mostradas da tabela de limiares (mais a do limiar em uso, se for outro). */
const LIMIARES_EXIBIDOS = [20, 40, 50, 60, 70];

/** 0.8941 -> "89,4%" */
function porcentagem(valor: number) {
  return `${(valor * 100).toFixed(1).replace('.', ',')}%`;
}

function etapas(rede: string, lado: number, detector: boolean) {
  const lista: { icone: NomeIcone; titulo: string; texto: string }[] = [
    {
      icone: 'galeria',
      titulo: 'Envio da foto',
      texto: 'O app reduz a imagem para até 1024 px e envia em JPEG para a API (Flask).',
    },
  ];
  if (detector) {
    lista.push({
      icone: 'lupa',
      titulo: 'Tem cachorro na foto?',
      texto:
        'Um segundo modelo confere se há um cachorro na imagem. Se não houver, a resposta é "Não parece um cachorro", sem chutar uma raça.',
    });
  }
  lista.push(
    {
      icone: 'chip',
      titulo: 'Análise pelo modelo',
      texto: `A API redimensiona para ${lado}×${lado} e a rede ${rede} calcula a probabilidade de cada uma das raças.`,
    },
    {
      icone: 'escudo',
      titulo: 'Limiar de confiança',
      texto:
        'Se a raça mais provável não atingir a confiança mínima, a resposta é "Não reconhecido", em vez de um palpite arriscado.',
    },
    {
      icone: 'relogio',
      titulo: 'Histórico',
      texto: 'Cada consulta é salva em um banco SQLite, separada por aparelho, sem precisar de login.',
    }
  );
  return lista;
}

export default function SobreScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= LarguraDesktop;
  const [status, setStatus] = useState<StatusApi | null>(null);

  useEffect(() => {
    verificarStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const sombra = { boxShadow: `0 10px 30px ${theme.shadow}` };
  const limiarAtual = status?.limiar ?? null;

  const info = status?.info_modelo ?? MODELO_PADRAO;
  const rede = info.rede ?? MODELO_PADRAO.rede!;
  const lado = info.tamanho_imagem ?? 224;
  const totalRacas = status?.racas ?? info.racas ?? 120;
  const datasets = info.datasets?.length ? info.datasets : MODELO_PADRAO.datasets!;
  const temTsinghua = datasets.some((d) => d.toLowerCase().includes('tsinghua'));
  const detector = status?.detector_cachorro ?? true;
  const linhasLimiar = (info.tabela_limiar ?? []).filter(
    (linha) => LIMIARES_EXIBIDOS.includes(linha.limiar) || linha.limiar === limiarAtual
  );
  const resumoTestes = [
    info.teste_stanford && { nome: 'Stanford Dogs', ...info.teste_stanford },
    info.teste_tsinghua && { nome: 'Tsinghua Dogs', ...info.teste_tsinghua },
  ].filter((t): t is { nome: string; acerto: number; top3: number } => Boolean(t));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={desktop ? [] : ['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={[styles.conteudo, desktop && styles.conteudoDesktop]}>
          <View style={styles.cabecalho}>
            <View style={[styles.etiqueta, { backgroundColor: theme.primarySoft }]}>
              <Icone nome="chapeu" cor={theme.primary} tamanho={16} />
              <ThemedText type="smallBold" style={[styles.textoEtiqueta, { color: theme.primary }]}>
                PROJETO ACADÊMICO
              </ThemedText>
            </View>
            <ThemedText style={[styles.titulo, desktop && styles.tituloDesktop, { color: theme.primary }]}>
              Sobre o PetMatch
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.descricao}>
              Sistema que identifica a raça de um cachorro a partir de uma foto, usando uma rede
              neural treinada com {totalRacas} raças, usando fotos do {datasets.join(' e do ')}.
            </ThemedText>
          </View>

          <View style={[styles.colunas, desktop && styles.colunasDesktop]}>
            <ThemedView type="backgroundElement" style={[styles.cartao, styles.coluna, sombra]}>
              <TituloSecao icone="raio" titulo="Como a análise funciona" />
              {etapas(rede, lado, detector).map((etapa, indice) => (
                <View key={etapa.titulo} style={styles.etapa}>
                  <View style={[styles.numeroEtapa, { backgroundColor: theme.primary }]}>
                    <ThemedText type="smallBold" style={{ color: theme.textOnPrimary }}>
                      {indice + 1}
                    </ThemedText>
                  </View>
                  <View style={styles.flex}>
                    <ThemedText type="smallBold">{etapa.titulo}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {etapa.texto}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </ThemedView>

            <ThemedView type="backgroundElement" style={[styles.cartao, styles.coluna, sombra]}>
              <TituloSecao icone="escudo" titulo="Resultados nos testes" />
              <ThemedText type="small" themeColor="textSecondary">
                Medidos em fotos que o modelo não viu durante o treino
                {temTsinghua
                  ? ': 15% de cada raça do Stanford Dogs e a validação oficial do Tsinghua Dogs.'
                  : ': 15% de cada raça do Stanford Dogs.'}{' '}
                Top-3: a raça certa está entre os 3 palpites mostrados.
              </ThemedText>

              {resumoTestes.length > 0 && (
                <View style={styles.resumo}>
                  {resumoTestes.map((teste) => (
                    <View
                      key={teste.nome}
                      style={[styles.itemResumo, { backgroundColor: theme.primarySoft }]}>
                      <ThemedText type="small" themeColor="textSecondary">
                        {teste.nome}
                      </ThemedText>
                      <ThemedText style={[styles.numeroResumo, { color: theme.primary }]}>
                        {porcentagem(teste.acerto)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        de acerto · top-3 {porcentagem(teste.top3)}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              )}

              <ThemedText type="small" themeColor="textSecondary">
                Na tabela (teste do Stanford Dogs), cobertura são as fotos que recebem uma raça e
                acerto, quantas dessas estão certas.
              </ThemedText>

              <View style={[styles.tabela, { borderColor: theme.backgroundSelected }]}>
                <View style={[styles.linhaTabela, { backgroundColor: theme.primarySoft }]}>
                  <ThemedText type="smallBold" style={styles.celula}>
                    Confiança mínima
                  </ThemedText>
                  <ThemedText type="smallBold" style={styles.celula}>
                    Cobertura
                  </ThemedText>
                  <ThemedText type="smallBold" style={styles.celula}>
                    Acerto
                  </ThemedText>
                </View>
                {linhasLimiar.map((linha) => {
                  const atual = linha.limiar === limiarAtual;
                  return (
                    <View
                      key={linha.limiar}
                      style={[
                        styles.linhaTabela,
                        { borderTopColor: theme.backgroundSelected },
                        styles.bordaLinha,
                        atual && { backgroundColor: `${theme.accent}1A` },
                      ]}>
                      <ThemedText type={atual ? 'smallBold' : 'small'} style={styles.celula}>
                        {linha.limiar}%{atual ? ' (em uso)' : ''}
                      </ThemedText>
                      <ThemedText type={atual ? 'smallBold' : 'small'} style={styles.celula}>
                        {porcentagem(linha.cobertura)}
                      </ThemedText>
                      <ThemedText type={atual ? 'smallBold' : 'small'} style={styles.celula}>
                        {porcentagem(linha.acerto)}
                      </ThemedText>
                    </View>
                  );
                })}
              </View>

              <View style={[styles.aviso, { backgroundColor: theme.background }]}>
                <ThemedText type="smallBold">Limitações</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  O Stanford Dogs faz parte do ImageNet, usado no pré-treino da {rede}, então o
                  teste nele tende a ser otimista
                  {temTsinghua ? '; o do Tsinghua Dogs, com fotos de fora do ImageNet, é mais realista' : ''}.
                  Em fotos reais o acerto pode ser menor, principalmente em closes do rosto, raças
                  muito parecidas e cães sem raça definida.
                </ThemedText>
              </View>
            </ThemedView>
          </View>

          <ThemedView type="backgroundElement" style={[styles.cartao, sombra]}>
            <TituloSecao icone="chip" titulo="Ficha técnica" />
            <View style={styles.ficha}>
              <ItemFicha rotulo="Modelo" valor={`${rede} (transfer learning do ImageNet)`} />
              <ItemFicha
                rotulo="Dataset"
                valor={
                  temTsinghua
                    ? `${totalRacas} raças: Stanford Dogs (70% / 15% / 15%) + Tsinghua Dogs`
                    : `Stanford Dogs: ${totalRacas} raças, divisão 70% / 15% / 15%`
                }
              />
              <ItemFicha rotulo="Formato do modelo" valor="ONNX, executado com onnxruntime" />
              <ItemFicha rotulo="Entrada" valor={`Imagem RGB ${lado}×${lado}`} />
              {detector && (
                <ItemFicha rotulo="Filtro de cachorro" valor="MobileNetV2 do ImageNet (ONNX)" />
              )}
              <ItemFicha rotulo="Backend" valor="Python, Flask e SQLite" />
              <ItemFicha rotulo="Aplicativo" valor="Expo (React Native), para celular e navegador" />
            </View>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ItemFicha({ rotulo, valor }: { rotulo: string; valor: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.itemFicha, { borderColor: theme.backgroundSelected }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {rotulo}
      </ThemedText>
      <ThemedText type="smallBold">{valor}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
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
  conteudo: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingTop: TopTabInset + Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  conteudoDesktop: {
    gap: Spacing.five,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.five,
  },
  cabecalho: {
    gap: Spacing.three,
    maxWidth: 760,
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
  descricao: {
    fontSize: 17,
    lineHeight: 26,
  },
  colunas: {
    gap: Spacing.four,
  },
  colunasDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  coluna: {
    flex: 1,
  },
  cartao: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: 24,
  },
  etapa: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  numeroEtapa: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  itemResumo: {
    flexGrow: 1,
    flexBasis: 140,
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: 14,
  },
  numeroResumo: {
    fontFamily: Nunito.black,
    fontSize: 26,
    lineHeight: 32,
  },
  tabela: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  linhaTabela: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
  },
  bordaLinha: {
    borderTopWidth: 1,
  },
  celula: {
    flex: 1,
  },
  aviso: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: 14,
  },
  ficha: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  itemFicha: {
    flexGrow: 1,
    flexBasis: 260,
    gap: Spacing.half,
    paddingLeft: Spacing.three,
    borderLeftWidth: 3,
  },
});
