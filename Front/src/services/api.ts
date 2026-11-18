import { API_URL, TIMEOUT_MS } from '@/config';
import { arquivoParaUpload } from '@/services/arquivo';
import { obterDeviceId } from '@/services/dispositivo';

/** Uma das raças mais prováveis segundo o modelo (mesmo abaixo do limiar). */
export type Alternativa = { raca: string; confianca: number };

/** Uma consulta, no formato devolvido por /api/prever e /api/historico. */
export type Predicao = {
  id: number;
  raca: string;
  confianca: number;
  reconhecido: boolean;
  imagem_url: string;
  data_hora: string;
  /** Só vem logo após a análise (/api/prever); o histórico não guarda. */
  alternativas?: Alternativa[];
  /** Por que não reconheceu: confiança baixa ou nenhum cachorro na foto (detector). */
  motivo?: 'baixa_confianca' | 'nao_cachorro' | null;
};

export type StatusApi = {
  status: string;
  modelo: 'onnx' | 'simulado';
  /** Quantas raças o modelo reconhece (5 no modelo original, 120 no ampliado). */
  racas: number;
  /** Confiança mínima (%) para a API responder uma raça em vez de "Não reconhecido". */
  limiar: number;
  /** Se a API filtra fotos sem cachorro (modelo_cachorro.onnx). */
  detector_cachorro?: boolean;
  /** Conteúdo do backend/modelo/modelo_info.json gerado no treino (null no modo simulado). */
  info_modelo?: InfoModelo | null;
};

/** Uma linha da tabela "confiança mínima x cobertura x acerto" medida no teste. */
export type LinhaLimiar = { limiar: number; cobertura: number; acerto: number };

export type InfoModelo = {
  rede?: string;
  tamanho_imagem?: number;
  racas?: number;
  datasets?: string[];
  limiar_sugerido?: number;
  /** Acerto (top-1) e top-3 de 0 a 1, nas fotos de teste do Stanford Dogs. */
  teste_stanford?: { acerto: number; top3: number };
  /** Idem, na validação oficial do Tsinghua Dogs (fotos que não entraram no treino). */
  teste_tsinghua?: { acerto: number; top3: number };
  tabela_limiar?: LinhaLimiar[];
};

/** Erro com mensagem pronta para mostrar ao usuário. */
export class ErroApi extends Error {}

async function requisitar<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  if (!API_URL) {
    throw new ErroApi('Endereço da API não configurado. Defina EXPO_PUBLIC_API_URL no arquivo .env.');
  }

  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);

  let resposta: Response;
  try {
    resposta = await fetch(`${API_URL}${caminho}`, {
      ...opcoes,
      headers: { 'X-Device-Id': await obterDeviceId(), ...opcoes.headers },
      signal: controle.signal,
    });
  } catch (erro) {
    // Mostra o erro real no terminal do Metro (a mensagem ao usuário é genérica)
    console.warn(`[api] Falha em ${opcoes.method ?? 'GET'} ${caminho}:`, erro);
    throw new ErroApi(
      controle.signal.aborted
        ? 'O servidor demorou demais para responder. Tente novamente.'
        : 'Não foi possível conectar ao servidor. Confira se a API está rodando e se o celular está na mesma rede Wi-Fi do PC.'
    );
  } finally {
    clearTimeout(timer);
  }

  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new ErroApi(dados?.erro ?? `Erro inesperado do servidor (código ${resposta.status}).`);
  }
  return dados as T;
}

export function verificarStatus() {
  return requisitar<StatusApi>('/api/status');
}

export async function preverRaca(uriFoto: string) {
  const formulario = new FormData();
  // Celular: File do expo-file-system; navegador: File comum (ver arquivo.ts / arquivo.web.ts)
  formulario.append('imagem', await arquivoParaUpload(uriFoto));

  // Não definir Content-Type: o fetch gera o boundary do multipart sozinho
  return requisitar<Predicao>('/api/prever', { method: 'POST', body: formulario });
}

/** Resultado rápido da câmera ao vivo (não fica no histórico). */
export type AnaliseRapida = Pick<
  Predicao,
  'raca' | 'confianca' | 'reconhecido' | 'alternativas' | 'motivo'
>;

/** Analisa um quadro da câmera sem salvar foto nem histórico (?salvar=0). */
export async function analisarQuadro(uriFoto: string) {
  const formulario = new FormData();
  formulario.append('imagem', await arquivoParaUpload(uriFoto));
  return requisitar<AnaliseRapida>('/api/prever?salvar=0', { method: 'POST', body: formulario });
}

export function buscarHistorico(limite = 30) {
  return requisitar<Predicao[]>(`/api/historico?limite=${limite}`);
}
