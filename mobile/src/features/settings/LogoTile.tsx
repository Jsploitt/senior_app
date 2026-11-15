import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';

/** M010 wordmark tile with a barrier-arm stripe. Five quick taps unlock presenter mode. */
export function LogoTile({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      testID="about-logo"
      onPress={onPress}
      accessibilityRole="image"
      accessibilityLabel="M010 logo"
      style={[styles.tile, { backgroundColor: t.c.tintFill }]}
    >
      <Text variant="title1" color="onTint" weight="800" style={{ letterSpacing: 1 }}>
        M010
      </Text>
      <View style={styles.arm}>
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: i % 2 === 0 ? t.c.armStripeA : t.c.armStripeB }} />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
    alignSelf: 'center',
  },
  arm: { flexDirection: 'row', width: 64, height: 8, borderRadius: 4, overflow: 'hidden' },
});
