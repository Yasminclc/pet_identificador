import { useState, type DragEvent, type ReactNode } from 'react';

export type ZonaSoltarProps = {
  /** Recebe se há um arquivo sendo arrastado por cima, para destacar a área. */
  children: (arrastando: boolean) => ReactNode;
  onArquivo: (uri: string, largura: number) => void;
  onErro: (mensagem: string) => void;
  desabilitada?: boolean;
};

const TIPOS_ACEITOS = ['image/jpeg', 'image/png'];

/** Lê a largura real da imagem (o prepararFoto só reduz se for maior que 1024 px). */
function larguraDaImagem(uri: string) {
  return new Promise<number>((resolver, rejeitar) => {
    const imagem = new window.Image();
    imagem.onload = () => resolver(imagem.naturalWidth);
    imagem.onerror = rejeitar;
    imagem.src = uri;
  });
}

/** Área que aceita uma imagem JPG/PNG arrastada do computador. */
export function ZonaSoltar({ children, onArquivo, onErro, desabilitada }: ZonaSoltarProps) {
  const [arrastando, setArrastando] = useState(false);

  function aoArrastar(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    if (!desabilitada) setArrastando(true);
  }

  async function aoSoltar(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    setArrastando(false);
    if (desabilitada) return;

    const arquivo = evento.dataTransfer.files[0];
    if (!arquivo) return;
    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      onErro('Formato inválido. Envie apenas imagens JPG ou PNG.');
      return;
    }
    const uri = URL.createObjectURL(arquivo);
    try {
      onArquivo(uri, await larguraDaImagem(uri));
    } catch {
      onErro('Não foi possível abrir essa imagem. Tente outro arquivo.');
    }
  }

  return (
    <div
      onDragOver={aoArrastar}
      onDragEnter={aoArrastar}
      onDragLeave={() => setArrastando(false)}
      onDrop={aoSoltar}
      style={{ display: 'flex', flexDirection: 'column' }}>
      {children(arrastando)}
    </div>
  );
}
