import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, type IconName } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { tap } from '../../utils/haptics';

export function ModeCard({
  icon,
  title,
  detail,
  selected,
  disabled,
  onPress,
  testID,
}: {
  icon: IconName;
  title: string;
  detail: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={title}
      accessibilityHint={detail}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[
        styles.card,
        {
          backgroundColor: t.c.surface,
          borderColor: selected ? t.c.tint : t.c.separator,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: t.c.tintWash }]}>
        <Icon name={icon} size={26} color="tint" />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="headline">{title}</Text>
        <Text variant="subheadline" color="secondaryLabel" style={{ marginTop: space.xxs }}>
          {detail}
        </Text>
      </View>
      <Icon
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={26}
        color={selected ? 'tint' : 'tertiaryLabel'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.l,
    borderRadius: radius.l,
    borderWidth: 2,
    minHeight: 76,
  },
  icon: { width: 48, height: 48, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center' },
});
