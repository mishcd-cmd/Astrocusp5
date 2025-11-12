// project 10/utils/openBillingPortal.native.ts
import { supabase } from './supabase';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export async function openBillingPortal() {
  const returnPath = '/settings'; // window is not reliable in native

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Please sign in to manage your subscription.');

  const res = await fetch('/.netlify/functions/portal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ returnPath }),
  });

  if (!res.ok) {
    const j = await res.json().catch(() => ({} as any));
    throw new Error(j?.error || `Portal failed (${res.status})`);
  }

  const data = await res.json();
  const url: string | undefined = data?.url;
  if (!url) throw new Error('No portal URL');

  const isNativeIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

  if (isNativeIOS) {
    // Open in system Safari to avoid WKWebView oddities
    await Browser.open({ url });
    return;
  }

  // Fallback for native Android or dev web
  if (typeof window !== 'undefined') {
    window.location.href = url;
  }
}
