import { File } from 'expo-file-system';

/**
 * Converte a foto (URI local) no arquivo enviado no multipart.
 * No SDK 57 o fetch global é o expo/fetch, que não aceita o formato antigo
 * { uri, name, type } do React Native — o arquivo precisa ser um File do expo-file-system.
 * No navegador o Metro usa arquivo.web.ts no lugar deste.
 */
export async function arquivoParaUpload(uri: string): Promise<Blob> {
  return new File(uri);
}
