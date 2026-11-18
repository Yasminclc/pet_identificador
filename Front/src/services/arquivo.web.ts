/**
 * Versão do navegador: o expo-file-system só existe em Android e iOS.
 * A URI da foto (blob: ou data:) é lida com fetch e vira um File comum.
 */
export async function arquivoParaUpload(uri: string): Promise<Blob> {
  const blob = await (await fetch(uri)).blob();
  // O nome com extensão é obrigatório: a API recusa arquivos sem .jpg/.png
  return new File([blob], 'foto.jpg', { type: 'image/jpeg' });
}
