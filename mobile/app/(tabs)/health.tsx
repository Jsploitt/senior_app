import { useRouter } from 'expo-router';
import { HealthScreen } from '@/features/health/HealthScreen';

export default function HealthTab() {
  const router = useRouter();
  return <HealthScreen onConnect={() => router.push('/connect')} />;
}
