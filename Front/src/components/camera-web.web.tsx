import { useEffect, useRef, useState } from 'react';

import { Nunito } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { analisarQuadro, ErroApi, type AnaliseRapida } from '@/services/api';

/**
 * No navegador do PC o expo-image-picker só abre o seletor de arquivos.
 * Esta versão abre a webcam ao vivo (getUserMedia) e vai identificando a raça
 * sozinha: analisa um quadro a cada instante e, quando a mesma raça é reconhecida
 * em quadros seguidos, captura a foto e devolve para a tela já identificar.
 */
export const CAMERA_AO_VIVO = true;

export type CameraWebProps = {
  /** identificar = true quando a captura foi automática (a raça já se confirmou ao vivo). */
  onCapturar: (uri: string, largura: number, identificar: boolean) => void;
  onFechar: () => void;
  onErro: (mensagem: string) => void;
};

/** Intervalo entre análises ao vivo (fora o tempo de resposta da API). */
const INTERVALO_MS = 600;
/** Largura dos quadros ao vivo: pequena para responder rápido (o modelo usa 224px). */
const LARGURA_QUADRO = 480;
/** Quantas análises seguidas com a mesma raça para capturar sozinho. */
const CONFIRMACOES = 2;

function mensagemDeErro(erro: unknown) {
  const nome = erro instanceof DOMException ? erro.name : '';
  if (nome === 'NotAllowedError') {
    return 'Permissão da câmera negada. Clique no ícone ao lado do endereço do site e permita a câmera.';
  }
  if (nome === 'NotFoundError') return 'Nenhuma câmera foi encontrada neste computador.';
  if (nome === 'NotReadableError') return 'A câmera está sendo usada por outro programa. Feche-o e tente de novo.';
  return 'Não foi possível abrir a câmera. Tente a opção Galeria.';
}

/** Copia o quadro atual do vídeo para um JPEG (sem espelhamento) e devolve a URL. */
function capturarQuadro(video: HTMLVideoElement, larguraMaxima?: number) {
  const escala = larguraMaxima ? Math.min(1, larguraMaxima / video.videoWidth) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * escala);
  canvas.height = Math.round(video.videoHeight * escala);
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise<{ uri: string; largura: number } | null>((resolver) =>
    canvas.toBlob(
      (blob) => resolver(blob ? { uri: URL.createObjectURL(blob), largura: canvas.width } : null),
      'image/jpeg',
      0.9
    )
  );
}

function formatarConfianca(confianca: number) {
  return `${Math.round(confianca)}%`;
}

export function CameraWeb({ onCapturar, onFechar, onErro }: CameraWebProps) {
  const theme = useTheme();
  const video = useRef<HTMLVideoElement>(null);
  const [pronta, setPronta] = useState(false);
  const [espelhar, setEspelhar] = useState(true);
  const [analise, setAnalise] = useState<AnaliseRapida | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Guarda o callback mais recente sem reiniciar a análise ao vivo a cada render da tela
  const onCapturarRef = useRef(onCapturar);
  useEffect(() => {
    onCapturarRef.current = onCapturar;
  }, [onCapturar]);

  // Abre a webcam
  useEffect(() => {
    let fluxo: MediaStream | null = null;
    let cancelado = false;

    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then(async (stream) => {
        if (cancelado) {
          stream.getTracks().forEach((faixa) => faixa.stop());
          return;
        }
        fluxo = stream;
        // Câmera traseira (celular) não deve aparecer espelhada; a webcam do PC sim, como um espelho
        setEspelhar(stream.getVideoTracks()[0]?.getSettings().facingMode !== 'environment');
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
          setPronta(true);
        }
      })
      .catch((erro) => {
        if (!cancelado) onErro(mensagemDeErro(erro));
      });

    // Desliga a câmera (e a luz da webcam) ao fechar
    return () => {
      cancelado = true;
      fluxo?.getTracks().forEach((faixa) => faixa.stop());
    };
  }, [onErro]);

  // Identificação ao vivo: um quadro por vez (o próximo só sai depois da resposta)
  useEffect(() => {
    if (!pronta) return;
    let ativo = true;
    let timer: ReturnType<typeof setTimeout>;
    let ultimaRaca: string | null = null;
    let seguidas = 0;

    async function analisarProximo() {
      const v = video.current;
      if (!ativo || !v) return;

      const quadro = await capturarQuadro(v, LARGURA_QUADRO);
      if (!quadro) return agendar();
      try {
        const resultado = await analisarQuadro(quadro.uri);
        if (!ativo) return;
        setAnalise(resultado);
        setAviso(null);

        seguidas = resultado.reconhecido && resultado.raca === ultimaRaca ? seguidas + 1 : 1;
        ultimaRaca = resultado.reconhecido ? resultado.raca : null;

        if (resultado.reconhecido && seguidas >= CONFIRMACOES) {
          // Raça confirmada: foto em resolução cheia, que vai para o histórico
          ativo = false;
          const final = await capturarQuadro(v);
          if (final) onCapturarRef.current(final.uri, final.largura, true);
          return;
        }
      } catch (e) {
        if (ativo) setAviso(e instanceof ErroApi ? e.message : 'Falha ao analisar. Tentando de novo…');
      } finally {
        URL.revokeObjectURL(quadro.uri);
      }
      agendar();
    }

    function agendar() {
      if (ativo) timer = setTimeout(analisarProximo, INTERVALO_MS);
    }

    agendar();
    return () => {
      ativo = false;
      clearTimeout(timer);
    };
  }, [pronta]);

  async function capturarAgora() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const quadro = await capturarQuadro(v);
    if (quadro) onCapturar(quadro.uri, quadro.largura, false);
  }

  const reconhecido = analise?.reconhecido ?? false;
  const textoAoVivo = !pronta
    ? 'Abrindo a câmera…'
    : aviso
      ? aviso
      : !analise
        ? 'Analisando…'
        : reconhecido
          ? `${analise.raca} · ${formatarConfianca(analise.confianca)} · confirmando…`
          : 'Procurando um cachorro… aproxime ou ajuste a imagem';

  const botaoBase: React.CSSProperties = {
    flex: 1,
    minHeight: 52,
    border: 'none',
    borderRadius: 18,
    fontFamily: Nunito.bold,
    fontSize: 15,
    cursor: 'pointer',
  };

  return (
    <div
      role="dialog"
      aria-label="Câmera"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(10, 6, 3, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}>
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          background: theme.backgroundElement,
          borderRadius: 28,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxShadow: `0 12px 40px ${theme.shadow}`,
        }}>
        <div
          style={{
            position: 'relative',
            aspectRatio: '4 / 3',
            borderRadius: 20,
            overflow: 'hidden',
            background: '#000',
            outline: reconhecido ? `4px solid ${theme.success}` : 'none',
            outlineOffset: -4,
            transition: 'outline-color 200ms',
          }}>
          <video
            ref={video}
            muted
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: espelhar ? 'scaleX(-1)' : undefined,
            }}
          />
          {/* Resultado ao vivo, por cima do vídeo */}
          <span
            aria-live="polite"
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              bottom: 12,
              padding: '10px 14px',
              borderRadius: 14,
              background: reconhecido ? theme.success : 'rgba(0, 0, 0, 0.6)',
              color: '#fff',
              fontFamily: reconhecido ? Nunito.extraBold : Nunito.bold,
              fontSize: reconhecido ? 17 : 14,
              textAlign: 'center',
            }}>
            {textoAoVivo}
          </span>
        </div>
        <span style={{ color: theme.textSecondary, fontFamily: Nunito.medium, fontSize: 14, textAlign: 'center' }}>
          Aponte para o cachorro: a raça é identificada sozinha. Usando uma foto no celular? Aumente o
          brilho da tela e evite reflexos.
        </span>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={onFechar}
            style={{ ...botaoBase, background: theme.backgroundSelected, color: theme.text }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={capturarAgora}
            disabled={!pronta}
            style={{
              ...botaoBase,
              background: theme.primary,
              color: theme.textOnPrimary,
              opacity: pronta ? 1 : 0.55,
            }}>
            Capturar agora
          </button>
        </div>
      </div>
    </div>
  );
}
