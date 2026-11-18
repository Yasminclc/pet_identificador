import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, Nunito, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  // fontFamily já define o peso: fontWeight junto com fonte customizada quebra no Android
  small: {
    fontFamily: Nunito.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  smallBold: {
    fontFamily: Nunito.bold,
    fontSize: 14,
    lineHeight: 20,
  },
  default: {
    fontFamily: Nunito.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontFamily: Nunito.extraBold,
    fontSize: 48,
    lineHeight: 52,
  },
  subtitle: {
    fontFamily: Nunito.extraBold,
    fontSize: 30,
    lineHeight: 38,
  },
  link: {
    fontFamily: Nunito.medium,
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    fontFamily: Nunito.bold,
    lineHeight: 30,
    fontSize: 14,
    color: '#1F4D2C',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
