import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../account/AuthProvider';
import { supabase } from '../backend/supabase';
import type { Database } from '../backend/database.types';
type Person = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'display_name' | 'city' | 'bio'>;
export default function PeopleDirectory({ search, onAccount }: { search: string; onAccount: () => void }) {
  const { session, initializing } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState(false);
  const [pages, setPages] = useState(1);
  const [more, setMore] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => { setPages(1); }, [search]);
  useEffect(() => {
    if (!session) { setPeople([]); setLoading(false); return; }
    const ac = new AbortController(); setLoading(true); setIssue(false); setPeople([]);
    const timeout = setTimeout(() => { setIssue(true); setLoading(false); ac.abort(); }, 15000);
    async function load() {
      try {
        let query = supabase.from('profiles').select('id,display_name,city,bio').eq('is_discoverable', true).order('created_at', { ascending: false }).order('id').range(0, pages * 24).abortSignal(ac.signal);
        if (search.trim()) query = query.ilike('display_name', `%${search.trim()}%`);
        const { data, error } = await query;
        if (ac.signal.aborted) return;
        if (error) { setIssue(true); return; }
        setMore((data?.length ?? 0) > pages * 24); setPeople((data ?? []).slice(0, pages * 24));
      } catch { if (!ac.signal.aborted) setIssue(true); }
      finally { clearTimeout(timeout); if (!ac.signal.aborted) setLoading(false); }
    }
    void load(); return () => { clearTimeout(timeout); ac.abort(); };
  }, [session?.user.id, search, pages, revision]);
  const button = (label: string, action: () => void) => <Pressable accessibilityRole="button" onPress={action} style={s.button}><Text style={s.buttonText}>{label}</Text></Pressable>;
  if (initializing) return <ActivityIndicator accessibilityLabel="Loading account" />;
  if (!session) return <View style={s.card}><Text>Sign in to discover students who have opted to share their profile.</Text>{button('Open account', onAccount)}</View>;
  return <View style={s.list}>
    {loading ? <ActivityIndicator accessibilityLabel="Loading people" /> : issue ? <View style={s.card}><Text accessibilityRole="alert">Could not load people. Check your connection and retry.</Text>{button('Retry people', () => setRevision(v => v + 1))}</View> : <>
      {button('Refresh people', () => setRevision(v => v + 1))}
      {!people.length ? <Text>No discoverable profiles found.</Text> : people.map(person => <View key={person.id} style={s.card}><Text style={s.title}>{person.display_name}</Text><Text>{person.city}</Text>{person.bio ? <Text>{person.bio}</Text> : null}</View>)}
      {more ? button('Load more people', () => setPages(v => v + 1)) : null}
    </>}
  </View>;
}
const s = StyleSheet.create({ list: { gap: 16 }, card: { padding: 20, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', gap: 12 }, title: { fontSize: 18, fontWeight: '700', color: '#11162F' }, button: { backgroundColor: '#7048FF', borderRadius: 12, padding: 12, alignItems: 'center' }, buttonText: { color: '#FFFFFF', fontWeight: '700' } });
