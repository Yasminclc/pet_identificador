import { Image } from 'expo-image';
import { Link } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao } from '@/components/botao';
import { CAMERA_AO_VIVO, CameraWeb } from '@/components/camera-web';
import { Icone, type NomeIcone } from '@/components/icone';
import { ResultadoPredicao } from '@/components/resultado-predicao';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TituloSecao } from '@/components/titulo-secao';
import { ZonaSoltar } from '@/components/zona-soltar';
import {
  BottomTabInset,
  LarguraDesktop,
  MaxContentWidth,
  Nunito,
  Spacing,
  TopTabInset,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ErroApi, preverRaca, verificarStatus, type Predicao, type StatusApi } from '@/services/api';
import { prepararFoto } from '@/services/imagem';

type SituacaoServidor = 'verificando' | 'online' | 'offline';

const ILUSTRACAO_CACHORRO = require('@/assets/images/cachorro.svg');

export default function IdentificarScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= LarguraDesktop;

  const [servidor, setServidor] = useState<SituacaoServidor>('verificando');
  const [status, setStatus] = useState<StatusApi | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Predicao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [cameraAberta, setCameraAberta] = useState(false);

  // Consulta a API ao abrir o app: avisa cedo se o servidor não está acessível
  useEffect(() => {
    verificarStatus()
      .then((resposta) => {
        setServidor('online');
        setStatus(resposta);
      })
      .catch(() => setServidor('offline'));
  }, []);

  async function escolherFoto(origem: 'camera' | 'galeria') {
    setErro(null);

    // No navegador do PC o image picker só abriria o seletor de arquivos: usa a webcam ao vivo
    if (origem === 'camera' && CAMERA_AO_VIVO) {
      setCameraAberta(true);
      return;
    }

    const permissao =
      origem === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      setErro(
        origem === 'camera'
          ? 'Permissão da câmera negada. Libere o acesso nas configurações do celular.'
          : 'Permissão da galeria negada. Libere o acesso nas configurações do celular.'
      );
      return;
    }

    const opcoes: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const escolha =
      origem === 'camera'
        ? await ImagePicker.launchCameraAsync(opcoes)
        : await ImagePicker.launchImageLibraryAsync(opcoes);
    if (escolha.canceled) return;

    const asset = escolha.assets[0];
    await usarFoto(asset.uri, asset.width);
  }

  /** Prepara a foto e mostra na prévia. Devolve a URI pronta para envio (ou null se falhou). */
  async function usarFoto(uri: string, largura: number) {
    setErro(null);
    setPreparando(true);
    try {
      const pronta = await prepararFoto(uri, largura);
      setFoto(pronta);
      setResultado(null);
      return pronta;
    } catch {
      setErro('Não foi possível processar a foto. Tente outra imagem.');
      return null;
    } finally {
      setPreparando(false);
    }
  }

  async function fotoDaCamera(uri: string, largura: number, identificarJa: boolean) {
    setCameraAberta(false);
    const pronta = await usarFoto(uri, largura);
    // Captura automática: a raça já se confirmou ao vivo, então envia direto (e salva no histórico)
    if (pronta && identificarJa) await identificar(pronta);
  }

  const erroDaCamera = useCallback((mensagem: string) => {
    setCameraAberta(false);
    setErro(mensagem);
  }, []);

  async function identificar(uri = foto) {
    if (!uri) return;
    setErro(null);
    setEnviando(true);
    try {
      setResultado(await preverRaca(uri));
      setServidor('online');
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Erro inesperado. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  function novaAnalise() {
    setFoto(null);
    setResultado(null);
    setErro(null);
  }

  const ocupado = preparando || enviando;
  const sombra = { boxShadow: `0 10px 30px ${theme.shadow}` };

  const cartaoEnvio = (
    <ThemedView type="backgroundElement" style={[styles.cartao, sombra]}>
      <TituloSecao icone="galeria" titulo="Envie uma foto do cachorro" />

      <ZonaSoltar onArquivo={usarFoto} onErro={setErro} desabilitada={ocupado}>
        {(arrastando) => (
          // Clique na área vazia também abre a galeria
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Escolher imagem do cachorro"
            disabled={ocupado || foto !== null}
            onPress={() => escolherFoto('galeria')}
            style={({ hovered }) => [
              styles.zona,
              foto
                ? { backgroundColor: '#000' }
                : [
                    styles.zonaVazia,
                    {
                      backgroundColor: arrastando ? theme.primarySoft : `${theme.primarySoft}88`,
                      borderColor: arrastando || hovered ? theme.primary : theme.highlight,
                    },
                  ],
            ]}>
            {preparando ? (
              <ActivityIndicator color={theme.primary} size="large" />
            ) : foto ? (
              <Image source={{ uri: foto }} style={styles.imagem} contentFit="contain" transition={250} />
            ) : (
              <View style={styles.vazio}>
                <View>
                  <Icone nome="galeria" cor={theme.primary} tamanho={64} />
                  <View style={[styles.seloUpload, { backgroundColor: theme.accent }]}>
                    <Icone nome="upload" cor="#FFFFFF" tamanho={16} />
                  </View>
                </View>
                <ThemedText style={styles.centralizado}>
                  {arrastando ? (
                    <ThemedText type="smallBold">Solte a imagem aqui</ThemedText>
                  ) : CAMERA_AO_VIVO ? (
                    <>
                      Arraste uma imagem ou{' '}
                      <ThemedText style={[styles.destaque, { color: theme.primary }]}>
                        escolha um arquivo
                      </ThemedText>
                    </>
                  ) : (
                    <ThemedText style={[styles.destaque, { color: theme.primary }]}>
                      Toque para escolher uma foto
                    </ThemedText>
                  )}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  JPG ou PNG • Até 5 MB
                </ThemedText>
              </View>
            )}
          </Pressable>
        )}
      </ZonaSoltar>

      <View style={styles.linhaBotoes}>
        <Botao
          titulo={foto ? 'Trocar imagem' : 'Escolher imagem'}
          icone="galeria"
          desabilitado={ocupado}
          onPress={() => escolherFoto('galeria')}
        />
        <Botao
          titulo={CAMERA_AO_VIVO ? 'Abrir câmera' : 'Tirar foto'}
          icone="camera"
          variante="secundario"
          desabilitado={ocupado}
          onPress={() => escolherFoto('camera')}
        />
      </View>

      {foto && !resultado && (
        <Animated.View entering={FadeIn.duration(250)} style={styles.linhaBotoes}>
          <Botao
            titulo="Identificar raça"
            icone="lupa"
            carregando={enviando}
            desabilitado={preparando}
            onPress={() => identificar()}
          />
        </Animated.View>
      )}

      {erro && (
        <Animated.View entering={FadeInDown.duration(300)}>
          <View
            accessibilityRole="alert"
            style={[styles.erro, { borderColor: theme.danger, backgroundColor: `${theme.danger}14` }]}>
            <Icone nome="info" cor={theme.danger} tamanho={18} />
            <ThemedText type="small" style={[styles.flex, { color: theme.danger }]}>
              {erro}
            </ThemedText>
          </View>
        </Animated.View>
      )}
    </ThemedView>
  );

  const cartaoResultado = (
    <ThemedView type="backgroundElement" style={[styles.cartao, styles.cartaoResultado, sombra]}>
      <TituloSecao icone="pata" titulo="Resultado da identificação" />

      {enviando ? (
        <View style={styles.estadoCentral}>
          <ActivityIndicator color={theme.primary} size="large" />
          <ThemedText type="smallBold" style={styles.tituloEstado}>
            Analisando a imagem…
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centralizado}>
            O modelo está comparando a foto com {status?.racas ?? 'as'} raças cadastradas.
          </ThemedText>
        </View>
      ) : resultado ? (
        <Animated.View entering={FadeInDown.duration(400)} key={resultado.id} style={styles.blocoResultado}>
          <ResultadoPredicao
            predicao={resultado}
            totalRacas={status?.racas ?? null}
            limiar={status?.limiar ?? null}
          />
          <View style={styles.linhaBotoes}>
            <Botao titulo="Nova análise" icone="upload" variante="secundario" onPress={novaAnalise} />
          </View>
        </Animated.View>
      ) : (
        <View style={styles.estadoCentral}>
          <View style={[styles.nuvem, { backgroundColor: `${theme.primarySoft}AA` }]}>
            <Image source={ILUSTRACAO_CACHORRO} style={styles.ilustracaoPequena} contentFit="contain" />
          </View>
          <ThemedText style={[styles.tituloEstado, { color: theme.primary }]}>
            Seu resultado aparecerá aqui
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centralizado}>
            Envie uma foto para descobrir as raças mais parecidas.
          </ThemedText>
        </View>
      )}
    </ThemedView>
  );

  return (
    <ThemedView style={styles.container}>
      {cameraAberta && (
        <CameraWeb
          onCapturar={fotoDaCamera}
          onFechar={() => setCameraAberta(false)}
          onErro={erroDaCamera}
        />
      )}

      {/* Patinhas decorativas nas bordas (só no computador) */}
      {desktop && (
        <>
          <Icone nome="pata" cor={theme.highlight} tamanho={110} style={[styles.pataFundo, styles.pataEsquerda]} />
          <Icone nome="pata" cor={theme.highlight} tamanho={90} style={[styles.pataFundo, styles.pataDireita]} />
        </>
      )}

      <SafeAreaView edges={desktop ? [] : ['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={[styles.conteudo, desktop && styles.conteudoDesktop]}>
          {/* Seção inicial */}
          <View style={[styles.hero, desktop && styles.heroDesktop]}>
            <View style={[styles.heroTexto, desktop && styles.heroTextoDesktop]}>
              <View style={[styles.etiqueta, { backgroundColor: theme.primarySoft }]}>
                <Icone nome="chip" cor={theme.primary} tamanho={16} />
                <ThemedText type="smallBold" style={[styles.textoEtiqueta, { color: theme.primary }]}>
                  INTELIGÊNCIA ARTIFICIAL PARA CÃES
                </ThemedText>
              </View>
              <ThemedText style={[styles.titulo, desktop && styles.tituloDesktop, { color: theme.primary }]}>
                Descubra a raça do seu{' '}
                <ThemedText style={[styles.titulo, desktop && styles.tituloDesktop, { color: theme.highlight }]}>
                  melhor amigo.
                </ThemedText>
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={desktop && styles.descricaoDesktop}>
                Envie uma foto do seu cachorro e receba a raça mais provável, com o nível de
                confiança da análise.
              </ThemedText>
              <View style={[styles.tracoCoral, { backgroundColor: theme.accent }]} />
              {servidor !== 'online' && <IndicadorServidor servidor={servidor} />}
            </View>

            <View style={[styles.heroImagem, desktop && styles.heroImagemDesktop]}>
              <View style={[styles.blob, { backgroundColor: theme.primarySoft }]} />
              <View style={[styles.blobMenor, { backgroundColor: `${theme.highlight}55` }]} />
              <Image
                source={ILUSTRACAO_CACHORRO}
                style={styles.ilustracaoGrande}
                contentFit="contain"
                accessibilityLabel="Ilustração de um cachorro sentado"
              />
            </View>
          </View>

          {/* Envio e resultado */}
          <View style={[styles.colunas, desktop && styles.colunasDesktop]}>
            <View style={desktop && styles.coluna}>{cartaoEnvio}</View>
            <View style={desktop && styles.coluna}>{cartaoResultado}</View>
          </View>

          {/* Informações sobre as raças e a análise */}
          <View style={[styles.faixa, desktop && styles.faixaDesktop]}>
            <ItemFaixa icone="pata" destaque={status ? String(status.racas) : '—'} texto="raças cadastradas" />
            <ItemFaixa icone="raio" texto="Análise em poucos segundos" />
            <ItemFaixa
              icone="escudo"
              texto={status ? `Raça só é indicada com ${status.limiar}% de confiança ou mais` : 'Nível de confiança estimado'}
            />
            <Link href="/sobre" asChild>
              <Pressable style={styles.itemFaixaLink}>
                <Icone nome="info" cor={theme.textSecondary} tamanho={18} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                  A identificação é uma estimativa feita por IA.{' '}
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    Saiba como funciona
                  </ThemedText>
                </ThemedText>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ItemFaixa({ icone, destaque, texto }: { icone: NomeIcone; destaque?: string; texto: string }) {
  const theme = useTheme();
  return (
    <View style={styles.itemFaixa}>
      <View style={[styles.iconeFaixa, { backgroundColor: theme.primarySoft }]}>
        <Icone nome={icone} cor={theme.primary} tamanho={24} />
      </View>
      <View style={styles.flex}>
        {destaque && <ThemedText style={[styles.destaqueFaixa, { color: theme.primary }]}>{destaque}</ThemedText>}
        <ThemedText style={styles.textoFaixa}>{texto}</ThemedText>
      </View>
    </View>
  );
}

function IndicadorServidor({ servidor }: { servidor: SituacaoServidor }) {
  const theme = useTheme();
  const config = {
    verificando: { cor: theme.textSecondary, texto: 'Conectando ao servidor…' },
    online: { cor: theme.success, texto: 'Servidor online' },
    offline: { cor: theme.danger, texto: 'Servidor indisponível. Confira se a API está rodando.' },
  }[servidor];

  return (
    <View style={[styles.indicador, { backgroundColor: `${config.cor}1F` }]}>
      <View style={[styles.ponto, { backgroundColor: config.cor }]} />
      <ThemedText type="smallBold" style={[styles.textoIndicador, { color: config.cor }]}>
        {config.texto}
      </ThemedText>
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
    overflow: 'hidden',
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
  pataFundo: {
    position: 'absolute',
    opacity: 0.18,
  },
  pataEsquerda: {
    left: -24,
    top: 150,
    transform: [{ rotate: '-20deg' }],
  },
  pataDireita: {
    right: -20,
    top: 470,
    transform: [{ rotate: '25deg' }],
  },

  // Seção inicial
  hero: {
    gap: Spacing.three,
  },
  heroDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.five,
  },
  heroTexto: {
    gap: Spacing.three,
  },
  heroTextoDesktop: {
    flex: 11,
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
    fontSize: 54,
    lineHeight: 60,
  },
  descricaoDesktop: {
    fontSize: 19,
    lineHeight: 28,
    maxWidth: 560,
  },
  tracoCoral: {
    width: 72,
    height: 5,
    borderRadius: 3,
  },
  heroImagem: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImagemDesktop: {
    flex: 9,
    height: 340,
  },
  blob: {
    position: 'absolute',
    width: '86%',
    height: '92%',
    borderTopLeftRadius: 220,
    borderTopRightRadius: 140,
    borderBottomRightRadius: 200,
    borderBottomLeftRadius: 120,
    transform: [{ rotate: '-6deg' }],
  },
  blobMenor: {
    position: 'absolute',
    left: '2%',
    bottom: '4%',
    width: '38%',
    height: '45%',
    borderRadius: 999,
  },
  ilustracaoGrande: {
    width: '80%',
    height: '100%',
  },

  // Cartões
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
    gap: Spacing.four,
    padding: Spacing.four,
    borderRadius: 24,
  },
  cartaoResultado: {
    flex: 1,
  },
  zona: {
    minHeight: 220,
    aspectRatio: 16 / 10,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zonaVazia: {
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  vazio: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  seloUpload: {
    position: 'absolute',
    right: -10,
    bottom: -8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destaque: {
    fontFamily: Nunito.extraBold,
  },
  imagem: {
    width: '100%',
    height: '100%',
  },
  linhaBotoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  centralizado: {
    textAlign: 'center',
  },
  erro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 14,
    borderWidth: 1,
  },
  estadoCentral: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  nuvem: {
    width: 240,
    height: 190,
    borderRadius: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  ilustracaoPequena: {
    width: 220,
    height: 200,
  },
  tituloEstado: {
    fontFamily: Nunito.black,
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
  blocoResultado: {
    gap: Spacing.four,
  },

  // Faixa inferior
  faixa: {
    gap: Spacing.three,
  },
  faixaDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  itemFaixa: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  itemFaixaLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconeFaixa: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destaqueFaixa: {
    fontFamily: Nunito.black,
    fontSize: 28,
    lineHeight: 32,
  },
  textoFaixa: {
    fontSize: 15,
    lineHeight: 20,
  },
  indicador: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  textoIndicador: {
    fontSize: 13,
    lineHeight: 18,
  },
  ponto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
