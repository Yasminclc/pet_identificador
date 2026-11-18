import type { ReactNode } from 'react';

/**
 * Arrastar e soltar imagem só existe no navegador (ver zona-soltar.web.tsx).
 * No celular apenas mostra o conteúdo.
 */
export type ZonaSoltarProps = {
  children: (arrastando: boolean) => ReactNode;
  onArquivo: (uri: string, largura: number) => void;
  onErro: (mensagem: string) => void;
  desabilitada?: boolean;
};

export function ZonaSoltar({ children }: ZonaSoltarProps) {
  return <>{children(false)}</>;
}
