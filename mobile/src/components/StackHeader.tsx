/**
 * Header for pushed screens: back link pinned at the top-left, large title beneath it

 * Import directly from '@/components/StackHeader' (kept out of the barrel: expo-router in jest).
 * (QA review 1: "Back must sit at the top"). Android hardware back uses expo-router as usual.
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { hit, space } from '../theme/tokens';
import { tap } from '../utils/haptics';
import { Icon } from './Icon';
import { Text } from './Text';

export function StackHeader({
  backLabel,
  title,
  subtitle,
  right,
  onBack,
}: {
  backLabel: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onBack?: () => void;
}) {
  const back = () => {
    tap();
    if (onBack) onBack();
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <View style={{ marginBottom: space.l }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: hit,
        }}
      >
        <Pressable
          onPress={back}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${backLabel}`}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: hit, marginLeft: -space.xs }}
        >
          <Icon name="chevron-back" size={24} color="tint" />
          <Text variant="body" color="tint">
            {backLabel}
          </Text>
        </Pressable>
        {right}
      </View>
      <Text variant="largeTitle" accessibilityRole="header" style={{ marginTop: space.xs }}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="subheadline" color="secondaryLabel" style={{ marginTop: space.xxs }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
