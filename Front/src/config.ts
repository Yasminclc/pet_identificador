/**
 * Endereço da API Flask (backend/).
 *
 * Definido no arquivo .env (veja .env.example), com o IP do PC na rede Wi-Fi:
 *   EXPO_PUBLIC_API_URL=http://192.168.0.18:5000
 *
 * Depois de mudar o .env, reinicie o Metro com `npx expo start -c`.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

/** Tempo máximo de espera por resposta da API (a primeira análise pode demorar mais). */
export const TIMEOUT_MS = 30_000;

/** Largura para a qual a foto é reduzida antes do envio (o modelo usa 224x224). */
export const LARGURA_FOTO = 1024;
