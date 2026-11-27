import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const opportunities = [
  {
    id: 'erasmus-traineeship',
    title: 'Erasmus+ traineeship abroad',
    details: 'For an internship abroad related to your degree. Enrolled master’s students at universities with an Erasmus Charter can apply through their international office.',
    terms: 'Ask your university about available places, the grant amount and its deadline. A funded GISMA place has yet to be confirmed.',
    url: 'https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/traineeships-abroad-for-students',
  },
  {
    id: 'fes-international',
    title: 'Friedrich-Ebert-Stiftung scholarship',
    details: 'For international students from eligible countries studying in Germany. The foundation considers grades, civic engagement and German language skills (B2).',
    terms: 'Monthly funding of €992. For master’s students, apply before or at the start of the first semester, by 30 November for winter or 31 May for summer.',
    url: 'https://www.fes.de/studienfoerderung/stipendium/grundfoerderung-fuer-auslaender-innen',
  },
];

type Progress = 'Saved' | 'Applied' | null;

function FundingCard({ award, userId }: { award: typeof opportunities[number]; userId: string }) {
  const key = 'funding:' + userId + ':' + award.id;
  const [progress, setProgress] = useState<Progress>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const writing = useRef(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key).then(value => {
      if (active) { setProgress(value === 'Saved' || value === 'Applied' ? value : null); setReady(true); }
    }).catch(() => { if (active) setError('Could not read your tracker. Reopen Funding to retry.'); });
    return () => { active = false; };
  }, [key]);
  async function update(value: Progress) {
    if (!ready || writing.current) return;
    writing.current = true;
    try {
      if (value) await AsyncStorage.setItem(key, value);
      else await AsyncStorage.removeItem(key);
      setProgress(value); setError('');
    } catch { setError('Could not save your update. Please retry.'); }
    finally { writing.current = false; }
  }
  return <View style={styles.card}>
    <Text style={styles.title}>{award.title}</Text>
    <Text>{award.details}</Text><Text>{award.terms}</Text>
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(award.url).catch(() => setError('Could not open the programme website.'))}>
      <Text style={styles.action}>Official programme details</Text>
    </Pressable>
    {progress && <Text>My status: {progress}</Text>}
    <View style={styles.row}>
      {progress === null && <Pressable accessibilityRole="button" disabled={!ready} onPress={() => update('Saved')}><Text style={styles.action}>Save opportunity</Text></Pressable>}
      {progress !== 'Applied' && <Pressable accessibilityRole="button" disabled={!ready} onPress={() => update('Applied')}><Text style={styles.action}>Mark as applied</Text></Pressable>}
      {progress && <Pressable accessibilityRole="button" onPress={() => update(null)}><Text style={styles.action}>Clear status</Text></Pressable>}
    </View>
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
  </View>;
}

export default function StudentFunding({ userId }: { userId: string }) {
  return <View style={styles.list}>
    <Text>Apply with the provider. You can track your progress on this device.</Text>
    {opportunities.map(award => <FundingCard key={userId + award.id} userId={userId} award={award} />)}
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  title: { color: '#10162F', fontSize: 19, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  list: { gap: 14 },
  action: { color: '#4325C9', fontWeight: '700', paddingVertical: 12 },
});
