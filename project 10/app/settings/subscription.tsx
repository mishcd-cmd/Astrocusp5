// project10/app/settings/subscription.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Crown, CreditCard, ArrowLeft, CheckCircle, XCircle } from 'lucide-react-native';

import {
  subscribeMonthly,
  subscribeYearly,
  buyOneOffReading,
  upgradeToYearly,
  getSubscriptionStatus,
  isStripeConfigured,
} from '@/utils/billing';

import { openBillingPortal } from '@/utils/openBillingPortal';

type SubStatus = {
  active: boolean;
  plan?: 'monthly' | 'yearly' | null;
  renewsAt?: string | null;
  customerId?: string | null;
  price_id?: string | null;
  status?: string;
  email?: string | null;
} | null;

export default function SubscriptionScreen() {
  const router = useRouter();

  const [status, setStatus] = useState<SubStatus>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'monthly' | 'yearly' | 'oneoff' | 'portal' | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const s = await getSubscriptionStatus();
      setStatus(s);
    } catch (err: any) {
      console.error('[subscription] refresh error', err?.message || err);
      Alert.alert('Subscription', 'Could not load subscription status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onMonthly = async () => {
    try {
      setBusy('monthly');
      await subscribeMonthly();
    } catch (e: any) {
      Alert.alert('Subscribe Monthly', e?.message || 'Could not start checkout.');
    } finally {
      setBusy(null);
    }
  };

  const onYearly = async () => {
    try {
      setBusy('yearly');
      await subscribeYearly();
    } catch (e: any) {
      Alert.alert('Subscribe Yearly', e?.message || 'Could not start checkout.');
    } finally {
      setBusy(null);
    }
  };

  const onOneOff = async () => {
    try {
      setBusy('oneoff');
      await buyOneOffReading();
    } catch (e: any) {
      Alert.alert('One-off Reading', e?.message || 'Could not start checkout.');
    } finally {
      setBusy(null);
    }
  };

  const onPortal = async () => {
    try {
      setBusy('portal');
      await openBillingPortal();
    } catch (e: any) {
      Alert.alert('Billing Portal', e?.message || 'Could not open portal.');
    } finally {
      setBusy(null);
    }
  };

  const activeBadge = status?.active ? (
    <View style={styles.badgeActive}>
      <CheckCircle size={16} color="#0f5132" />
      <Text style={styles.badgeActiveText}>Active</Text>
    </View>
  ) : (
    <View style={styles.badgeInactive}>
      <XCircle size={16} color="#842029" />
      <Text style={styles.badgeInactiveText}>Inactive</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <ArrowLeft size={22} color="#8b9dc3" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Astral Plane</Text>
          <Text style={styles.subtitle}>Manage your premium access and payments</Text>

          <View style={styles.card}>
            <LinearGradient
              colors={['rgba(139,157,195,0.2)', 'rgba(139,157,195,0.08)']}
              style={styles.cardGradient}
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Status</Text>
                  {loading ? (
                    <ActivityIndicator />
                  ) : (
                    <>
                      {activeBadge}
                      <View style={{ height: 6 }} />
                      <Text style={styles.detailLine}>
                        Plan: <Text style={styles.detailValue}>{status?.plan || 'None'}</Text>
                      </Text>
                      <Text style={styles.detailLine}>
                        Renews: <Text style={styles.detailValue}>{status?.renewsAt || 'N/A'}</Text>
                      </Text>
                      <Text style={styles.detailLine}>
                        Email: <Text style={styles.detailValue}>{status?.email || 'N/A'}</Text>
                      </Text>
                      <Text style={styles.detailLine}>
                        Price: <Text style={styles.detailValue}>{status?.price_id || 'N/A'}</Text>
                      </Text>
                      <Text style={styles.detailLine}>
                        Raw status: <Text style={styles.detailValue}>{status?.status || 'unknown'}</Text>
                      </Text>
                    </>
                  )}
                </View>
                <Crown size={28} color="#d4af37" />
              </View>
            </LinearGradient>
          </View>

          {!isStripeConfigured() ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                Stripe prices are not configured. Please set EXPO_PUBLIC_STRIPE_PRICE_MONTHLY,
                EXPO_PUBLIC_STRIPE_PRICE_YEARLY, and EXPO_PUBLIC_STRIPE_PRICE_ONEOFF in Netlify.
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, busy === 'monthly' && styles.buttonBusy]}
              disabled={busy !== null}
              onPress={onMonthly}
            >
              <LinearGradient
                colors={['rgba(212,175,55,0.25)', 'rgba(212,175,55,0.10)']}
                style={styles.buttonGradient}
              >
                <CreditCard size={20} color="#d4af37" />
                <Text style={styles.buttonText}>
                  {busy === 'monthly' ? 'Starting...' : 'Subscribe Monthly'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, busy === 'yearly' && styles.buttonBusy]}
              disabled={busy !== null}
              onPress={onYearly}
            >
              <LinearGradient
                colors={['rgba(212,175,55,0.25)', 'rgba(212,175,55,0.10)']}
                style={styles.buttonGradient}
              >
                <CreditCard size={20} color="#d4af37" />
                <Text style={styles.buttonText}>
                  {busy === 'yearly' ? 'Starting...' : 'Subscribe Yearly'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, busy === 'oneoff' && styles.buttonBusy]}
              disabled={busy !== null}
              onPress={onOneOff}
            >
              <LinearGradient
                colors={['rgba(139,157,195,0.25)', 'rgba(139,157,195,0.10)']}
                style={styles.buttonGradient}
              >
                <CreditCard size={20} color="#8b9dc3" />
                <Text style={styles.buttonText}>
                  {busy === 'oneoff' ? 'Starting...' : 'Buy One-off Reading'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, busy === 'portal' && styles.buttonBusy]}
              disabled={busy !== null}
              onPress={onPortal}
            >
              <LinearGradient
                colors={['rgba(139,157,195,0.25)', 'rgba(139,157,195,0.10)']}
                style={styles.buttonGradient}
              >
                <CreditCard size={20} color="#8b9dc3" />
                <Text style={styles.buttonText}>
                  {busy === 'portal' ? 'Opening...' : 'Manage Billing'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={refresh} disabled={loading} style={styles.refreshLink}>
            <Text style={styles.refreshText}>{loading ? 'Loading...' : 'Refresh status'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  back: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 8 },
  backText: { marginLeft: 8, color: '#8b9dc3', fontSize: 16, fontFamily: 'Inter-Medium' },
  title: { fontSize: 34, color: '#e8e8e8', textAlign: 'center', marginTop: 8, fontFamily: 'Vazirmatn-Bold' },
  subtitle: { fontSize: 16, color: '#8b9dc3', textAlign: 'center', marginBottom: 22, fontFamily: 'Inter-Regular' },
  card: { borderRadius: 16, overflow: 'hidden', marginBottom: 18 },
  cardGradient: { padding: 18, borderWidth: 1, borderColor: 'rgba(139,157,195,0.3)', borderRadius: 16 },
  cardTitle: { color: '#e8e8e8', fontSize: 18, marginBottom: 10, fontFamily: 'Inter-SemiBold' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLine: { color: '#8b9dc3', fontSize: 14, marginTop: 2, fontFamily: 'Inter-Regular' },
  detailValue: { color: '#e8e8e8', fontFamily: 'Inter-Medium' },

  badgeActive: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, backgroundColor: '#d1e7dd' },
  badgeActiveText: { color: '#0f5132', marginLeft: 6, fontFamily: 'Inter-SemiBold' },
  badgeInactive: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, backgroundColor: '#f8d7da' },
  badgeInactiveText: { color: '#842029', marginLeft: 6, fontFamily: 'Inter-SemiBold' },

  actions: { marginTop: 8, gap: 12 },
  button: { borderRadius: 14, overflow: 'hidden' },
  buttonBusy: { opacity: 0.6 },
  buttonGradient: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18, borderWidth: 1, borderColor: 'rgba(139,157,195,0.35)', borderRadius: 14, gap: 10 },
  buttonText: { color: '#e8e8e8', fontSize: 16, fontFamily: 'Inter-SemiBold' },

  notice: { marginTop: 8, marginBottom: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255, 200, 120, 0.35)', backgroundColor: 'rgba(255, 200, 120, 0.08)' },
  noticeText: { color: '#e8e8e8', fontSize: 14, lineHeight: 18, fontFamily: 'Inter-Regular' },

  refreshLink: { alignSelf: 'center', marginTop: 14 },
  refreshText: { color: '#8b9dc3', textDecorationLine: 'underline', fontFamily: 'Inter-Medium' },
});
