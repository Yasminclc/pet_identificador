import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { LARGURA_FOTO } from '@/config';

/**
 * Reduz a foto para LARGURA_FOTO px de largura e salva em JPEG.
 * Fotos de celular têm de 3 a 12 MB (o limite da API é 5 MB) e o iPhone
 * pode gerar HEIC, que a API não aceita — o JPEG resolve os dois casos.
 */
export async function prepararFoto(uri: string, largura: number): Promise<string> {
  const contexto = ImageManipulator.manipulate(uri);
  if (largura > LARGURA_FOTO) {
    contexto.resize({ width: LARGURA_FOTO }); // altura proporcional
  }
  const imagem = await contexto.renderAsync();
  const resultado = await imagem.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return resultado.uri;
}
