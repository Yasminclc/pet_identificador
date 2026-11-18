import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';

const CHAVE = 'device_id';

let cache: string | null = null;

/**
 * Identificador deste aparelho, enviado no header X-Device-Id.
 * Gerado na primeira execução e guardado no AsyncStorage, para o histórico
 * continuar o mesmo depois de fechar o app (não há login).
 */
export async function obterDeviceId(): Promise<string> {
  if (cache) return cache;

  let id = await AsyncStorage.getItem(CHAVE);
  if (!id) {
    id = randomUUID();
    await AsyncStorage.setItem(CHAVE, id);
  }
  cache = id;
  return id;
}
