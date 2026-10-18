import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from './backend/supabase';
import type { Database } from './backend/database.types';
type Benefit = Database['public']['Tables']['student_benefits']['Row'];
function euro(cents: number, currency: string) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(cents / 100); }
function date(value: string | null) { return value ? new Date(value).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : 'No end date specified'; }
export default function StudentSavingsOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState(false);
  const [revision, setRevision] = useState(0);
  const [pages, setPages] = useState(1);
  const [more, setMore] = useState(false);
  useEffect(() => { if (!open) setPages(1); }, [open]);
  useEffect(() => {
    if (!open) return;
    const ac = new AbortController(); setLoading(true); setIssue(false); setBenefits([]);
    const timeout = setTimeout(() => { setIssue(true); setLoading(false); ac.abort(); }, 15000);
    async function load() {
      try {
        const { data, error } = await supabase.from('student_benefits').select('*').not('verified_at', 'is', null).order('created_at', { ascending: false }).order('id').range(0, pages * 24).abortSignal(ac.signal);
        if (ac.signal.aborted) return;
        if (error) { setIssue(true); return; }
        setMore((data?.length ?? 0) > pages * 24); setBenefits((data ?? []).slice(0, pages * 24));
      } catch { if (!ac.signal.aborted) setIssue(true); }
      finally { clearTimeout(timeout); if (!ac.signal.aborted) setLoading(false); }
    }
    void load(); return () => { clearTimeout(timeout); ac.abort(); };
  }, [open, pages, revision]);
  return <>
    <Modal visible={open} animationType="slide" onRequestClose={() => onOpenChange(false)}><SafeAreaView style={styles.safeArea}>
      <View style={styles.header}><View><Text style={styles.eyebrow}>STUORA SAVINGS</Text><Text style={styles.title}>Student life for less.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close Student Savings" onPress={() => onOpenChange(false)} style={styles.closeButton}><Text style={styles.closeText}>Close</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.integrityCard}><Text style={styles.integrityTitle}>Verified partner benefits</Text><Text style={styles.integrityText}>Only verified, currently valid offers from Stuora are shown. Personal redemption accounting is not available yet. Stuora does not hold money or show a cash balance.</Text></View>
        {loading ? <ActivityIndicator accessibilityLabel="Loading benefits" /> : issue ? <View><Text accessibilityRole="alert">Could not load benefits. Check your connection and retry.</Text><Pressable accessibilityRole="button" onPress={() => setRevision(v => v + 1)}><Text style={styles.closeText}>Retry benefits</Text></Pressable></View> : <>
          <Pressable accessibilityRole="button" onPress={() => setRevision(v => v + 1)}><Text style={styles.closeText}>Refresh benefits</Text></Pressable>
          {!benefits.length ? <Text>No verified benefits available yet.</Text> : benefits.map(benefit => {
            const priced = benefit.original_price_cents !== null && benefit.student_price_cents !== null;
            const saving = priced ? benefit.original_price_cents! - benefit.student_price_cents! : null;
            return <View key={benefit.id} style={styles.benefitCard}><Text style={styles.benefitTitle}>{benefit.title}</Text><Text style={styles.sponsor}>Funded by {benefit.sponsor_name}</Text><Text>{benefit.description}</Text><Text>Verification: verified</Text>
              {priced ? <View style={styles.priceRow}><View><Text style={styles.priceLabel}>Normal</Text><Text style={styles.normalPrice}>{euro(benefit.original_price_cents!, benefit.currency)}</Text></View><View><Text style={styles.priceLabel}>Student</Text><Text style={styles.studentPrice}>{euro(benefit.student_price_cents!, benefit.currency)}</Text></View><View><Text style={styles.priceLabel}>Save</Text><Text style={styles.saveValue}>{euro(saving!, benefit.currency)}{benefit.original_price_cents! > 0 ? ` (${Math.round(saving! / benefit.original_price_cents! * 100)}%)` : ''}</Text></View></View> : <Text>Price comparison not provided by the sponsor.</Text>}
              <Text>Eligibility: {benefit.eligibility_text || 'Not provided'}</Text><Text>Valid from: {benefit.starts_at ? date(benefit.starts_at) : 'No start date specified'}</Text><Text>Valid until: {date(benefit.ends_at)}</Text><Text selectable>Terms: {benefit.terms_url || 'No terms link provided'}</Text>{benefit.sponsor_url ? <Text selectable>Source: {benefit.sponsor_url}</Text> : null}
              <Text>Redemption is not available in Stuora yet.</Text>
            </View>;
          })}
          {more ? <Pressable accessibilityRole="button" onPress={() => setPages(v => v + 1)}><Text style={styles.closeText}>Load more benefits</Text></Pressable> : null}
        </>}
      </ScrollView>
    </SafeAreaView></Modal>
  </>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F7FB' },
  pressed: { opacity: 0.72 },
  header: {
    minHeight: 76,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EAF1',
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: { color: '#6D4AFF', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#10162F', fontSize: 24, fontWeight: '900', letterSpacing: -0.6, marginTop: 2 },
  closeButton: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 12, backgroundColor: '#F0F1F5' },
  closeText: { color: '#10162F', fontWeight: '800' },
  page: { width: '100%', maxWidth: 860, alignSelf: 'center', padding: 18, paddingBottom: 60, gap: 14 },
  summaryCard: { backgroundColor: '#10162F', borderRadius: 22, padding: 20 },
  summaryLabel: { color: '#D5D8E5', fontWeight: '700' },
  summaryValue: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', marginTop: 3, letterSpacing: -1 },
  summaryNote: { color: '#B7A9FF', marginTop: 7, lineHeight: 19, fontSize: 12 },
  integrityCard: { backgroundColor: '#EDFBF5', borderWidth: 1, borderColor: '#BCEBD4', borderRadius: 16, padding: 15 },
  integrityTitle: { color: '#0C724A', fontWeight: '900' },
  integrityText: { color: '#45655A', lineHeight: 20, marginTop: 5, fontSize: 13 },
  filters: { paddingVertical: 2 },
  filterPill: { backgroundColor: '#F0F1F5', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, marginRight: 8 },
  filterPillActive: { backgroundColor: '#EAE5FF' },
  filterText: { color: '#667085', fontWeight: '800', fontSize: 12 },
  filterTextActive: { color: '#6D4AFF' },
  sectionTitle: { color: '#10162F', fontSize: 19, fontWeight: '900', marginTop: 2 },
  benefitCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EAF1', borderRadius: 20, padding: 16, gap: 14 },
  benefitTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  iconBox: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#F1EEFF', alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 24 },
  benefitHeading: { flex: 1 },
  benefitCategory: { color: '#6D4AFF', fontWeight: '900', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  benefitTitle: { color: '#10162F', fontWeight: '900', fontSize: 16, marginTop: 2 },
  sponsor: { color: '#667085', fontSize: 11, marginTop: 3 },
  discountBadge: { backgroundColor: '#EDFBF5', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  discountText: { color: '#0C724A', fontWeight: '900', fontSize: 11 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: '#F7F7FB', borderRadius: 15, padding: 12 },
  priceLabel: { color: '#667085', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  normalPrice: { color: '#667085', fontWeight: '800', textDecorationLine: 'line-through', marginTop: 2 },
  studentPrice: { color: '#10162F', fontWeight: '900', fontSize: 18, marginTop: 1 },
  arrow: { color: '#98A2B3', fontSize: 18 },
  saveBox: { alignItems: 'flex-end' },
  saveLabel: { color: '#0C724A', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  saveValue: { color: '#0C724A', fontWeight: '900', marginTop: 2 },
  metaRow: { gap: 5 },
  metaText: { color: '#667085', fontSize: 12, lineHeight: 17 },
  policyCard: { backgroundColor: '#FFF9E8', borderWidth: 1, borderColor: '#F4E7AF', borderRadius: 16, padding: 16 },
  policyTitle: { color: '#10162F', fontWeight: '900' },
  policyText: { color: '#667085', lineHeight: 20, marginTop: 5, fontSize: 13 },
});