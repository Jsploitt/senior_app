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
  unavailable,
  onPress,
  testID,
}: {
  icon: IconName;
  title: string;
  detail: string;
  selected: boolean;
  /** Why this option cannot be chosen on this build; shown inside the card. */
  unavailable?: string;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const disabled = !!unavailable;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={title}
      accessibilityHint={unavailable ? `Unavailable. ${unavailable}` : detail}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[
        styles.card,
        {
          backgroundColor: selected ? t.c.tintWash : t.c.surface,
          borderColor: selected ? t.c.tint : t.c.separator,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: disabled ? t.c.fill : t.c.tintWash }]}>
        <Icon name={icon} size={26} color={disabled ? 'secondaryLabel' : 'tint'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="headline" color={disabled ? 'secondaryLabel' : 'label'}>
          {title}
        </Text>
        <Text variant="subheadline" color="secondaryLabel" style={{ marginTop: space.xxs }}>
          {detail}
        </Text>
        {unavailable ? (
          <View
            style={[styles.tag, { backgroundColor: t.c.fill }]}
            testID={testID ? `${testID}-unavailable` : undefined}
          >
            <Icon name="lock-closed" size={14} color="secondaryLabel" />
            <Text variant="footnote" weight="600" color="secondaryLabel" style={{ flexShrink: 1 }}>
              {unavailable}
            </Text>
          </View>
        ) : null}
      </View>
      {disabled ? null : (
        <Icon
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={26}
          color={selected ? 'tint' : 'secondaryLabel'}
        />
      )}
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
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    marginTop: space.s,
    paddingHorizontal: space.s,
    paddingVertical: space.xs,
    borderRadius: radius.s,
  },
  icon: { width: 48, height: 48, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center' },
});
