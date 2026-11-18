import { Image, type ImageStyle, type StyleProp } from 'react-native';

/** PNGs de uma cor só (em assets/images/icons), pintados com a cor pedida. */
const ICONES = {
  pata: require('@/assets/images/icons/pata.png'),
  relogio: require('@/assets/images/icons/relogio.png'),
  camera: require('@/assets/images/icons/camera.png'),
  galeria: require('@/assets/images/icons/galeria.png'),
  lupa: require('@/assets/images/icons/lupa.png'),
  info: require('@/assets/images/icons/info.png'),
  raio: require('@/assets/images/icons/raio.png'),
  escudo: require('@/assets/images/icons/escudo.png'),
  chapeu: require('@/assets/images/icons/chapeu.png'),
  chip: require('@/assets/images/icons/chip.png'),
  upload: require('@/assets/images/icons/upload.png'),
};

export type NomeIcone = keyof typeof ICONES;

type IconeProps = {
  nome: NomeIcone;
  cor: string;
  tamanho?: number;
  style?: StyleProp<ImageStyle>;
};

export function Icone({ nome, cor, tamanho = 20, style }: IconeProps) {
  return (
    <Image
      source={ICONES[nome]}
      style={[{ width: tamanho, height: tamanho, tintColor: cor }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
