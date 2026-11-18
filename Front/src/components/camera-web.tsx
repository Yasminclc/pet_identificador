/**
 * No celular a câmera é aberta pelo expo-image-picker (câmera nativa).
 * A câmera ao vivo existe só no navegador: ver camera-web.web.tsx.
 */
export const CAMERA_AO_VIVO = false;

export type CameraWebProps = {
  /** identificar = true quando a captura foi automática (a raça já se confirmou ao vivo). */
  onCapturar: (uri: string, largura: number, identificar: boolean) => void;
  onFechar: () => void;
  onErro: (mensagem: string) => void;
};

export function CameraWeb(_props: CameraWebProps) {
  return null;
}
