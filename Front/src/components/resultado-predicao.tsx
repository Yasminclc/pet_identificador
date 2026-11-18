import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { BarraConfianca } from '@/components/barra-confianca';
import { Icone } from '@/components/icone';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Nunito, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Predicao } from '@/services/api';

/** "2026-10-09T14:30:00" -> "09/10/2026 14:30" */
export function formatarDataHora(iso: string) {
  const [data, hora = ''] = iso.split('T');
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano} ${hora.slice(0, 5)}`;
}

function formatarConfianca(confianca: number) {
  return `${confianca.toFixed(1).replace('.', ',')}%`;
}

/** Mesma regra de cores da BarraConfianca: verde (alta), amarela (média), vermelha (não reconhecido). */
function useCorConfianca(predicao: Predicao) {
  const theme = useTheme();
  if (!predicao.reconhecido) return theme.danger;
  return predicao.confianca >= 80 ? theme.success : theme.warning;
}

/**
 * Conteúdo do painel de resultado (sem cartão em volta): raça prevista, confiança,
 * raças semelhantes e, se for o caso, a explicação de "Não reconhecido".
 */
export function ResultadoPredicao({
  predicao,
  totalRacas,
  limiar,
}: {
  predicao: Predicao;
  /** Vem do /api/status; null se o status ainda não respondeu. */
  totalRacas: number | null;
  /** Limiar de confiança da API (/api/status). */
  limiar: number | null;
}) {
  const theme = useTheme();
  const cor = useCorConfianca(predicao);
  const naoCachorro = predicao.motivo === 'nao_cachorro';

  if (naoCachorro) {
    return (
      <View style={styles.resultado}>
        <View style={styles.topo}>
          <View style={[styles.selo, { backgroundColor: `${theme.danger}1F` }]}>
            <Icone nome="info" cor={theme.danger} tamanho={28} />
          </View>
          <View style={styles.flex}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.rotulo}>
              NENHUM CACHORRO DETECTADO
            </ThemedText>
            <ThemedText type="subtitle" style={styles.nomeRaca}>
              Não parece um cachorro
            </ThemedText>
          </View>
        </View>
        <View
          style={[
            styles.aviso,
            { borderColor: `${theme.danger}55`, backgroundColor: `${theme.danger}12` },
          ]}>
          <ThemedText type="small">
            O detector não encontrou um cachorro nesta imagem, então nenhuma raça foi indicada.
            Envie uma foto em que o cachorro apareça inteiro e ocupe boa parte do quadro.
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.resultado}>
      <View style={styles.topo}>
        <View
          style={[
            styles.selo,
            { backgroundColor: predicao.reconhecido ? theme.primarySoft : `${theme.danger}1F` },
          ]}>
          <Icone
            nome={predicao.reconhecido ? 'pata' : 'info'}
            cor={predicao.reconhecido ? theme.primary : theme.danger}
            tamanho={28}
          />
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.rotulo}>
            {predicao.reconhecido ? 'RAÇA PREVISTA' : 'NENHUMA RAÇA RECONHECIDA'}
          </ThemedText>
          <ThemedText type="subtitle" style={styles.nomeRaca}>
            {predicao.raca}
          </ThemedText>
        </View>
      </View>

      <View style={[styles.blocoConfianca, { backgroundColor: theme.background }]}>
        <View style={styles.linhaConfianca}>
          <ThemedText type="smallBold">Confiança da análise</ThemedText>
          <ThemedText style={[styles.percentual, { color: cor }]}>
            {formatarConfianca(predicao.confianca)}
          </ThemedText>
        </View>
        <BarraConfianca confianca={predicao.confianca} reconhecido={predicao.reconhecido} />
      </View>

      {!predicao.reconhecido && (
        <View
          style={[
            styles.aviso,
            { borderColor: `${theme.danger}55`, backgroundColor: `${theme.danger}12` },
          ]}>
          <ThemedText type="small">
            A confiança ficou abaixo do mínimo{limiar ? ` de ${limiar}%` : ''}, então o sistema
            preferiu não arriscar uma raça
            {totalRacas ? ` (o modelo conhece ${totalRacas} raças)` : ''}. Tente outra foto, com o
            cachorro inteiro, de frente e bem iluminado.
          </ThemedText>
        </View>
      )}

      <MaisProvaveis predicao={predicao} />
    </View>
  );
}

/**
 * As raças mais prováveis (3, vindas da API), em ordem e com a probabilidade de cada uma.
 * Com 120 raças várias são parecidas: ver o 2º e o 3º palpite ajuda quando o modelo está
 * em dúvida (ou quando respondeu "Não reconhecido").
 */
function MaisProvaveis({ predicao }: { predicao: Predicao }) {
  const theme = useTheme();
  const lista = predicao.alternativas ?? [];
  if (lista.length === 0) return null;

  return (
    <View style={styles.semelhantes}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.rotulo}>
        {predicao.reconhecido
          ? `AS ${lista.length} RAÇAS MAIS PROVÁVEIS`
          : 'PALPITES MAIS PRÓXIMOS (ABAIXO DO MÍNIMO)'}
      </ThemedText>
      {lista.map((alternativa, indice) => {
        // Só a 1ª ganha destaque, e só quando a API de fato indicou essa raça
        const destaque = indice === 0 && predicao.reconhecido;
        return (
          <View
            key={alternativa.raca}
            style={[
              styles.alternativa,
              { backgroundColor: destaque ? theme.primarySoft : theme.background },
            ]}>
            <View
              style={[
                styles.posicao,
                { backgroundColor: destaque ? theme.primary : theme.backgroundSelected },
              ]}>
              <ThemedText
                type="smallBold"
                style={[styles.textoPosicao, { color: destaque ? theme.textOnPrimary : theme.text }]}>
                {indice + 1}º
              </ThemedText>
            </View>
            <View style={styles.corpoAlternativa}>
              <View style={styles.linhaConfianca}>
                <ThemedText
                  type={destaque ? 'smallBold' : 'small'}
                  style={styles.flex}
                  numberOfLines={1}>
                  {alternativa.raca}
                </ThemedText>
                <ThemedText
                  type="smallBold"
                  style={{ color: destaque ? theme.primary : theme.textSecondary }}>
                  {formatarConfianca(alternativa.confianca)}
                </ThemedText>
              </View>
              <View style={[styles.trilhoAlternativa, { backgroundColor: theme.backgroundSelected }]}>
                <View
                  style={[
                    styles.preenchimentoAlternativa,
                    {
                      width: `${Math.max(2, Math.min(100, alternativa.confianca))}%`,
                      backgroundColor: destaque ? theme.primary : theme.highlight,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Linha compacta, usada na lista do histórico no celular. */
export function ItemHistorico({ predicao }: { predicao: Predicao }) {
  const theme = useTheme();
  const cor = useCorConfianca(predicao);

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.item, { boxShadow: `0 4px 14px ${theme.shadow}` }]}>
      <Image source={{ uri: predicao.imagem_url }} style={styles.miniatura} contentFit="cover" />
      <View style={styles.itemTexto}>
        <View style={styles.linhaConfianca}>
          <ThemedText type="smallBold" style={styles.flex} numberOfLines={1}>
            {predicao.raca}
          </ThemedText>
          <SeloConfianca cor={cor} confianca={predicao.confianca} />
        </View>
        <BarraConfianca confianca={predicao.confianca} reconhecido={predicao.reconhecido} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.data}>
          {formatarDataHora(predicao.data_hora)}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

/** Cartão com foto grande, usado na grade do histórico no navegador. */
export function CartaoHistorico({ predicao }: { predicao: Predicao }) {
  const theme = useTheme();
  const cor = useCorConfianca(predicao);

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.cartaoGrade, { boxShadow: `0 6px 20px ${theme.shadow}` }]}>
      {/* O contêiner define a altura: com aspectRatio direto na imagem ela fica com 0 px
          no navegador e o carregamento "lazy" nunca dispara */}
      <View style={styles.fotoGrade}>
        <Image source={{ uri: predicao.imagem_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
      </View>
      <View style={styles.textoGrade}>
        <View style={styles.linhaConfianca}>
          <ThemedText type="smallBold" style={[styles.flex, styles.nomeGrade]} numberOfLines={1}>
            {predicao.raca}
          </ThemedText>
          <SeloConfianca cor={cor} confianca={predicao.confianca} />
        </View>
        <BarraConfianca confianca={predicao.confianca} reconhecido={predicao.reconhecido} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.data}>
          {formatarDataHora(predicao.data_hora)}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

/** Fundo translúcido da própria cor: legível no modo claro e no escuro. */
function SeloConfianca({ cor, confianca }: { cor: string; confianca: number }) {
  return (
    <View style={[styles.seloConfianca, { backgroundColor: `${cor}26` }]}>
      <ThemedText type="smallBold" style={[styles.textoSelo, { color: cor }]}>
        {formatarConfianca(confianca)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  resultado: {
    gap: Spacing.three,
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  selo: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotulo: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
  },
  nomeRaca: {
    fontSize: 30,
    lineHeight: 38,
  },
  blocoConfianca: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 16,
  },
  linhaConfianca: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  percentual: {
    fontFamily: Nunito.black,
    fontSize: 24,
    lineHeight: 30,
  },
  aviso: {
    padding: Spacing.three,
    borderRadius: 14,
    borderWidth: 1,
  },
  semelhantes: {
    gap: Spacing.two + Spacing.one,
  },
  alternativa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two + Spacing.one,
    borderRadius: 14,
  },
  posicao: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoPosicao: {
    fontSize: 13,
    lineHeight: 16,
  },
  corpoAlternativa: {
    flex: 1,
    gap: Spacing.one + Spacing.half,
  },
  trilhoAlternativa: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  preenchimentoAlternativa: {
    height: '100%',
    borderRadius: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 20,
  },
  miniatura: {
    width: 76,
    height: 76,
    borderRadius: 16,
  },
  itemTexto: {
    flex: 1,
    gap: Spacing.two,
  },
  cartaoGrade: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  fotoGrade: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  textoGrade: {
    gap: Spacing.two,
    padding: Spacing.three,
  },
  nomeGrade: {
    fontSize: 16,
    lineHeight: 22,
  },
  seloConfianca: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 999,
  },
  textoSelo: {
    fontSize: 12,
    lineHeight: 16,
  },
  data: {
    fontSize: 12,
    lineHeight: 16,
  },
});
