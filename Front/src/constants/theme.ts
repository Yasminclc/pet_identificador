/**
 * Identidade visual do PetMatch: fundo marfim, verde-escuro (primary), verde suave
 * (primarySoft / highlight) e detalhes em coral (accent), nos modos claro e escuro.
 * As telas usam sempre estas chaves (via useTheme), nunca cores soltas.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1D3324',
    background: '#FAF6EE',
    backgroundElement: '#FFFDF8',
    backgroundSelected: '#E6EBDC',
    textSecondary: '#5C6A5E',
    primary: '#1F4D2C',
    primarySoft: '#E3ECD3',
    highlight: '#6E9A3E',
    accent: '#EE7457',
    textOnPrimary: '#FFFFFF',
    success: '#2D7A45',
    warning: '#A86605',
    danger: '#C2452F',
    shadow: 'rgba(31, 77, 44, 0.09)',
  },
  dark: {
    text: '#EDF2E6',
    background: '#111A14',
    backgroundElement: '#19251D',
    backgroundSelected: '#29372D',
    textSecondary: '#A5B4A5',
    primary: '#9CCB7F',
    primarySoft: '#23331F',
    highlight: '#B4D58A',
    accent: '#FF8B6E',
    textOnPrimary: '#0E1A11',
    success: '#5CC784',
    warning: '#F0AE45',
    danger: '#F27E6B',
    shadow: 'rgba(0, 0, 0, 0.45)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** Família Nunito por peso (carregada no _layout.tsx). */
export const Nunito = {
  medium: 'Nunito_500Medium',
  bold: 'Nunito_700Bold',
  extraBold: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
/** Espaço para abas que flutuam sobre o conteúdo (no navegador a barra superior já ocupa o espaço). */
export const TopTabInset = 0;
/** Largura máxima do conteúdo: mais larga no navegador, onde a tela usa duas colunas. */
export const MaxContentWidth = Platform.select({ web: 1180 }) ?? 800;
/** A partir desta largura de janela as telas usam o layout de duas colunas. */
export const LarguraDesktop = 900;
