// Path: project10/utils/openBillingPortal.ts
// Opens the Stripe Billing Portal securely via your Supabase Edge Function.

import { supabase } from '@/utils/supabase';
import { Linking, Platform } from 'react-native';

// Prefer env var, fall back to your Supabase project URL so it never throws
const BASE =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://fulzqbwojvrripsuoreh.supabase.co'; // <-- your Supabase URL

/**
 * Calls your Supabase Edge Function (named "swift-api") to create a Stripe
 * Billing Portal session, then opens the returned URL on web or native.
 */
export async function openBillingPortal(): Promise<void> {
  try {
    // Get the user’s JWT from Supabase
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw new Error(error.message || 'Auth error');
    }
    const token = data?.session?.access_token;
    if (!token) {
      throw new Error('Not authenticated');
    }

    // Optional: add a timeout so the UI is not stuck on network issues
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    // Call your deployed Edge Function path: /functions/v1/swift-api
    const res = await fetch(`${BASE}/functions/v1/swift-api`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'omit', // no cookies, keeps CORS simple
      body: JSON.stringify({}),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(txt || `swift-api error ${res.status}`);
    }

    // Expect { url: string }
    const json = (await res.json().catch(() => ({}))) as { url?: string };
    const portalUrl = json?.url;
    if (!portalUrl) {
      throw new Error('Portal URL missing');
    }

    // Open in place on web, external on native
    if (Platform.OS === 'web') {
      window.location.assign(portalUrl);
    } else {
      const canOpen = await Linking.canOpenURL(portalUrl);
      if (!canOpen) {
        throw new Error('Cannot open portal URL on this device');
      }
      await Linking.openURL(portalUrl);
    }
  } catch (err: any) {
    console.error('[openBillingPortal] failed:', err);
    throw new Error(err?.message || 'Failed to open billing portal');
  }
}
