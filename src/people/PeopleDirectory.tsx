import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useAuth } from '../account/AuthProvider';
import { supabase } from '../backend/supabase';
import { EditorialImage } from '../ui/EditorialImage';
import type { Database } from '../backend/database.types';
import ReportButton from '../moderation/ReportButton';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

type Person = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'display_name' | 'city' | 'bio'>;
const PER_PAGE = 24;
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

export default function PeopleDirectory({ search: searchInput, onAccount }: { search: string; onAccount: () => void }) {
  const { session, initializing } = useAuth();
  const { width } = useWindowDimensions();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState(false);
  const [pages, setPages] = useState(1);
  const [more, setMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const [cityInput, setCity] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const city = useDebouncedValue(cityInput, 300);
  const [selected, setSelected] = useState<Person | null>(null);

  useEffect(() => { setPages(1); setSelected(null); }, [search, city]);
  useEffect(() => {
    if (!session) { setPeople([]); setSelected(null); setLoading(false); return; }
    const ac = new AbortController();
    setLoading(true); setIssue(false); setPeople([]);
    const timeout = setTimeout(() => { setIssue(true); setLoading(false); ac.abort(); }, 15000);
    async function load() {
      try {
        // Fetch only opt-in public fields. Do not use select('*') for profiles.
        let query = supabase.from('profiles')
          .select('id,display_name,city,bio')
          .eq('is_discoverable', true)
          // Gen-3 R-04: only profiles whose owner confirmed discovery.
          .not('discoverable_consented_at', 'is', null)
          .order('created_at', { ascending: false })
          .order('id')
          .range(0, pages * PER_PAGE)
          .abortSignal(ac.signal);
        if (search.trim()) query = query.ilike('display_name', `%${escapeLike(search.trim())}%`);
        if (city.trim()) query = query.ilike('city', `%${escapeLike(city.trim())}%`);
        const { data, error } = await query;
        if (ac.signal.aborted) return;
        if (error) { setIssue(true); return; }
        setMore((data?.length ?? 0) > pages * PER_PAGE);
        const profiles = (data ?? []).slice(0, pages * PER_PAGE);
        setPeople(profiles);
        setSelected(current => current ? profiles.find(profile => profile.id === current.id) ?? null : null);
      } catch { if (!ac.signal.aborted) setIssue(true); }
      finally { clearTimeout(timeout); if (!ac.signal.aborted) setLoading(false); }
    }
    void load();
    return () => { clearTimeout(timeout); ac.abort(); };
  }, [session?.user.id, search, city, pages, revision]);

  const button = (label: string, action: () => void) =>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={action} style={styles.button}><Text style={styles.buttonText}>{label}</Text></Pressable>;

  if (initializing) return <ActivityIndicator accessibilityLabel="Loading account" />;
  if (!session) return <View style={styles.panel}><Text style={styles.description}>Sign in to discover students who have opted to share their profile.</Text>{button('Open account', onAccount)}</View>;

  return <View style={styles.list}>
    {selected && !loading && !issue ? <View style={styles.detail}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to people" onPress={() => setSelected(null)}>
        <Text style={styles.link}>← Back to people</Text>
      </Pressable>
      <View style={styles.detailHeading}>
        <View style={styles.avatarLarge}><Text style={styles.avatarLetter}>{selected.display_name.trim().charAt(0).toUpperCase() || '?'}</Text></View>
        <View style={styles.detailText}>
          <Text style={styles.detailName}>{selected.display_name}</Text>
          <Text style={styles.city}>{selected.city}</Text>
          <Text style={styles.consentNote}>Shared publicly with signed-in Stuora members</Text>
        </View>
      </View>
      <Text style={styles.subheading}>About</Text>
      <Text style={styles.description}>{selected.bio?.trim() || 'This student has not added a public bio.'}</Text>
      <Text style={styles.contactNote}>Private conversations currently begin from real marketplace or housing listings.</Text>
      {selected.id !== session?.user.id ? <ReportButton kind="user" targetId={selected.id} label="Report profile" /> : null}
    </View> : <>
      <View style={styles.filters}>
        <View style={styles.filterCopy}>
          <Text style={styles.subheading}>Meet your community</Text>
          <Text style={styles.muted}>Only students who explicitly opt in appear here.</Text>
        </View>
        <TextInput
          accessibilityLabel="Filter people by city"
          placeholder="Filter by city"
          placeholderTextColor="#9198AB"
          value={cityInput}
          onChangeText={setCity}
          style={styles.cityInput}
        />
        {city ? button('Clear city filter', () => setCity('')) : null}
      </View>
      {loading ? <ActivityIndicator accessibilityLabel="Loading people" /> : issue ? <View style={styles.panel}>
        <Text accessibilityRole="alert">Could not load people. Check your connection and retry.</Text>
        {button('Retry people', () => setRevision(v => v + 1))}
      </View> : <>
        <View style={styles.actions}>{button('Refresh people', () => setRevision(v => v + 1))}</View>
        {!people.length ? <View style={styles.empty}><EditorialImage kind="People" style={styles.emptyPhoto} label="Editorial artwork for Stuora student community; not real public profile data" /><Text style={styles.subheading}>No discoverable profiles found.</Text>
          <Text style={styles.muted}>Try another name or city. Private profiles are never shown.</Text>
        </View> : <View style={styles.grid}>
          {people.map(person => <Pressable key={person.id} accessibilityRole="button" accessibilityLabel={`View ${person.display_name} profile`} onPress={() => setSelected(person)} style={[styles.person, width >= 960 && styles.personDesktop]}>
            <View style={styles.avatar}><Text style={styles.avatarLetter}>{person.display_name.trim().charAt(0).toUpperCase() || '?'}</Text></View>
            <Text style={styles.name}>{person.display_name}</Text>
            <Text style={styles.city}>{person.city}</Text>
            <Text numberOfLines={2} style={styles.bio}>{person.bio || 'No public bio added yet.'}</Text>
            <Text style={styles.link}>View public profile →</Text>
          </Pressable>)}
        </View>}
        {more ? button('Load more people', () => setPages(v => v + 1)) : null}
      </>}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: 16, width: '100%' },
  filters: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', borderRadius: 18 },
  filterCopy: { flex: 1, minWidth: 185, gap: 4 },
  cityInput: { minWidth: 140, flexGrow: 1, flexBasis: 150, borderRadius: 12, borderWidth: 1, borderColor: '#DDDDEA', paddingHorizontal: 13, paddingVertical: 11, color: '#11162F', backgroundColor: '#FFFFFF', fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  person: { flexGrow: 1, flexBasis: 210, maxWidth: 430, padding: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', borderRadius: 19, alignItems: 'flex-start', gap: 8 },
  personDesktop: { flexBasis: '30%' },
  avatar: { width: 55, height: 55, borderRadius: 20, backgroundColor: '#EDE6FF', alignItems: 'center', justifyContent: 'center' },
  avatarLarge: { width: 85, height: 85, borderRadius: 29, backgroundColor: '#EDE6FF', alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#7048FF', fontWeight: '900', fontSize: 29 },
  name: { fontSize: 17, fontWeight: '900', color: '#11162F' },
  bio: { color: '#626A80', fontSize: 13, lineHeight: 19 },
  city: { color: '#555C72', fontWeight: '700', fontSize: 12 },
  link: { color: '#7048FF', fontWeight: '800', fontSize: 12 },
  muted: { color: '#555C72', fontSize: 12, lineHeight: 19 },
  description: { color: '#252B4A', fontSize: 14, lineHeight: 22 },
  panel: { padding: 20, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', gap: 12 },
  empty: { padding: 28, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', alignItems: 'center', gap: 10 },
  emptyPhoto: { width: 210, height: 116, borderRadius: 16, backgroundColor: '#F4F1FF' },
  button: { backgroundColor: '#7048FF', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 15, alignItems: 'center' },
  actions: { alignSelf: 'flex-start' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  detail: { padding: 22, borderRadius: 21, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', gap: 17 },
  detailHeading: { flexDirection: 'row', gap: 17, alignItems: 'center' },
  detailText: { flex: 1, gap: 5 },
  detailName: { fontSize: 23, fontWeight: '900', color: '#11162F' },
  consentNote: { fontSize: 11, color: '#555C72' },
  subheading: { fontSize: 18, fontWeight: '900', color: '#11162F' },
  contactNote: { padding: 12, borderRadius: 12, backgroundColor: '#F3F0FF', color: '#57458B', fontSize: 12, lineHeight: 18 },
});
