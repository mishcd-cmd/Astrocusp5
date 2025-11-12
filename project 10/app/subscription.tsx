// project10/app/subscription.tsx
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function SubscriptionRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/settings/subscription');
  }, [router]);
  return null;
}
