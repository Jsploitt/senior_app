import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, Text, type IconName } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';

export function EnrollStep({
  n,
  icon,
  title,
  active,
  children,
}: {
  n: number;
  icon: IconName;
  title: string;
  active?: boolean;
  children?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: t.c.surface, borderColor: active ? t.c.tint : 'transparent' }]}
      accessible={!children}
      accessibilityLabel={`Step ${n}. ${title}`}
    >
      <View style={styles.head}>
        <View style={[styles.num, { backgroundColor: t.c.tintFill }]} accessibilityElementsHidden>
          <Text variant="headline" color="onTint" tabular>
            {n}
          </Text>
        </View>
        <Text variant="headline" style={{ flex: 1 }} accessibilityRole={children ? 'header' : undefined}>
          {title}
        </Text>
        <Icon name={icon} size={26} color="tint" />
      </View>
      {children ? (
        <View style={{ marginTop: space.m, alignItems: 'center', gap: space.m }}>{children}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.l, borderRadius: radius.l, borderWidth: 2, alignSelf: 'stretch' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  num: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
