import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type BenefitCategory = 'Food' | 'Mobility' | 'Housing' | 'Study';

type Benefit = {
  id: string;
  category: BenefitCategory;
  emoji: string;
  title: string;
  sponsor: string;
  normalPrice: number;
  studentPrice: number;
  unit: string;
  eligibility: string;
  validUntil: string;
};

const benefits: Benefit[] = [
  {
    id: 'benefit-food-1',
    category: 'Food',
    emoji: '🥗',
    title: 'Student lunch menu',
    sponsor: 'Stuora Demo Partner',
    normalPrice: 12.5,
    studentPrice: 8.5,
    unit: 'per meal',
    eligibility: 'Verified student profile',
    validUntil: '31 Dec 2026',
  },
  {
    id: 'benefit-mobility-1',
    category: 'Mobility',
    emoji: '🚲',
    title: 'Monthly bike membership',
    sponsor: 'Stuora Demo Partner',
    normalPrice: 24,
    studentPrice: 16,
    unit: 'per month',
    eligibility: 'Verified student profile',
    validUntil: '31 Dec 2026',
  },
  {
    id: 'benefit-housing-1',
    category: 'Housing',
    emoji: '📦',
    title: 'Moving starter package',
    sponsor: 'Stuora Demo Partner',
    normalPrice: 49,
    studentPrice: 29,
    unit: 'one-time',
    eligibility: 'Student moving within Berlin',
    validUntil: '30 Nov 2026',
  },
  {
    id: 'benefit-study-1',
    category: 'Study',
    emoji: '🖨️',
    title: 'Print & copy credit',
    sponsor: 'Stuora Demo Partner',
    normalPrice: 15,
    studentPrice: 10,
    unit: 'credit pack',
    eligibility: 'Verified student profile',
    validUntil: '31 Jan 2027',
  },
];

const redeemedSavings = [12.4, 8, 7.5, 14.9];

function euro(value: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

export default function StudentSavingsOverlay() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<BenefitCategory | 'All'>('All');

  const monthlySavings = redeemedSavings.reduce((sum, value) => sum + value, 0);
  const visibleBenefits = useMemo(
    () => benefits.filter((benefit) => category === 'All' || benefit.category === category),
    [category],
  );

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Student Savings"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.floatingButton, pressed && styles.pressed]}
      >
        <Text style={styles.floatingIcon}>€</Text>
        <View>
          <Text style={styles.floatingLabel}>Student Savings</Text>
          <Text style={styles.floatingValue}>{euro(monthlySavings)} saved</Text>
        </View>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>STUORA SAVINGS</Text>
              <Text style={styles.title}>Student life for less.</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Savings this month</Text>
              <Text style={styles.summaryValue}>{euro(monthlySavings)}</Text>
              <Text style={styles.summaryNote}>
                This is a savings total, not a cash balance. Stuora does not hold this money.
              </Text>
            </View>

            <View style={styles.integrityCard}>
              <Text style={styles.integrityTitle}>✓ Transparent student pricing</Text>
              <Text style={styles.integrityText}>
                Every production benefit must show who funds it, the normal price, the student price, eligibility,
                validity and terms. The offers below are seeded demo offers until partner verification is live.
              </Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {(['All', 'Food', 'Mobility', 'Housing', 'Study'] as const).map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setCategory(item)}
                  style={[styles.filterPill, category === item && styles.filterPillActive]}
                >
                  <Text style={[styles.filterText, category === item && styles.filterTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.sectionTitle}>Verified-benefit format</Text>
            {visibleBenefits.map((benefit) => {
              const saving = benefit.normalPrice - benefit.studentPrice;
              const percent = Math.round((saving / benefit.normalPrice) * 100);
              return (
                <View key={benefit.id} style={styles.benefitCard}>
                  <View style={styles.benefitTopRow}>
                    <View style={styles.iconBox}><Text style={styles.icon}>{benefit.emoji}</Text></View>
                    <View style={styles.benefitHeading}>
                      <Text style={styles.benefitCategory}>{benefit.category}</Text>
                      <Text style={styles.benefitTitle}>{benefit.title}</Text>
                      <Text style={styles.sponsor}>Funded by {benefit.sponsor}</Text>
                    </View>
                    <View style={styles.discountBadge}><Text style={styles.discountText}>-{percent}%</Text></View>
                  </View>

                  <View style={styles.priceRow}>
                    <View>
                      <Text style={styles.priceLabel}>Normal</Text>
                      <Text style={styles.normalPrice}>{euro(benefit.normalPrice)}</Text>
                    </View>
                    <Text style={styles.arrow}>→</Text>
                    <View>
                      <Text style={styles.priceLabel}>Student</Text>
                      <Text style={styles.studentPrice}>{euro(benefit.studentPrice)}</Text>
                    </View>
                    <View style={styles.saveBox}>
                      <Text style={styles.saveLabel}>Save</Text>
                      <Text style={styles.saveValue}>{euro(saving)}</Text>
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>🎓 {benefit.eligibility}</Text>
                    <Text style={styles.metaText}>📅 Until {benefit.validUntil}</Text>
                    <Text style={styles.metaText}>ℹ️ {benefit.unit}</Text>
                  </View>
                </View>
              );
            })}

            <View style={styles.policyCard}>
              <Text style={styles.policyTitle}>Stuora student-first rule</Text>
              <Text style={styles.policyText}>
                Core participation stays free or low-cost for students. Employers, verified commercial providers,
                partners and sponsors fund the platform before ordinary students do.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F7FB' },
  floatingButton: {
    position: 'absolute',
    right: 16,
    bottom: Platform.OS === 'web' ? 22 : 82,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#10162F',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 7,
  },
  floatingIcon: { color: '#FFFFFF', fontWeight: '900', fontSize: 19 },
  floatingLabel: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
  floatingValue: { color: '#B7A9FF', fontWeight: '800', fontSize: 11, marginTop: 1 },
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
