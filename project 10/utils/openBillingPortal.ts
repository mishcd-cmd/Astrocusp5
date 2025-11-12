// project10/utils/openBillingPortal.ts
import { supabase } from '@/utils/supabase';
import { Linking, Platform } from 'react-native';

const BASE =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function openBillingPortal() {
  if (!BASE) throw new Error('Missing Supabase URL config');

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message || 'Auth error');
  const token = data?.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  // Your actual function name is "swift-api"
  const res = await fetch(`${BASE}/functions/v1/swift-api`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'omit',
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `stripe-portal error ${res.status}`);
  }

  const json = await res.json().catch(() => ({}));
  const portalUrl = json?.url as string | undefined;
  if (!portalUrl) throw new Error('Portal URL missing');

  if (Platform.OS === 'web') {
    window.location.assign(portalUrl);
  } else {
    await Linking.openURL(portalUrl);
  }
}
