import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../backend/supabase';
import { EditorialImage } from '../ui/EditorialImage';
import { ActivityComposer, ActivityResponse } from './ActivityActions';
import ExternalFeed from './ExternalFeed';
import { features } from '../backend/features';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

export type CommunityCategory = 'Trips' | 'Jobs' | 'Events';
type CommunityKind = 'trip' | 'job' | 'event';
type Detail = {
  destination?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  venue_name?: string | null;
  capacity?: number | null;
  company_name?: string | null;
  compensation_text?: string | null;
  workplace_mode?: string | null;
};
type Entry = {
  id: string;
  owner: string;
  title: string;
  description: string;
  city: string;
  price_cents: number;
  created_at: string;
  // Jobs, Trips and Events are published only after Stuora moderators approve them.
  // Other students never receive pending or rejected posts; only their author does.
  review: 'pending' | 'approved' | 'rejected';
  details: Detail;
};

const KIND: Record<CommunityCategory, CommunityKind> = { Trips: 'trip', Jobs: 'job', Events: 'event' };
const DETAIL: Record<CommunityCategory, 'trip_details' | 'job_details' | 'event_details'> = {
  Trips: 'trip_details',
  Jobs: 'job_details',
  Events: 'event_details',
};
const MAX_PAGE = 24;
function safeLike(input: string) { return input.replace(/[\\%_]/g, '\\$&'); }
function formatDate(value: string | null | undefined) {
  if (!value) return 'Date not provided';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(date)
    : 'Date unavailable';
}
function ReviewNotice({ review }: { review: Entry['review'] }) {
  if (review === 'approved') return null;
  return <Text accessibilityRole="text" style={styles.reviewNotice}>
    {review === 'pending'
      ? 'Awaiting Stuora review. Only you can see this until a moderator approves it.'
      : 'Not approved. Only you can see this. Check your Stuora notices for the reason.'}
  </Text>;
}
function normalize(row: Record<string, unknown>, table: 'trip_details' | 'job_details' | 'event_details'): Entry | null {
  if (typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.city !== 'string') return null;
  const candidate = row[table];
  const details = (Array.isArray(candidate) ? candidate[0] : candidate) as Detail | undefined | null;
  return {
    id: row.id,
    owner: typeof row.owner_id === 'string' ? row.owner_id : '',
    title: row.title,
    city: row.city,
    description: typeof row.description === 'string' ? row.description : '',
    price_cents: typeof row.price_cents === 'number' ? row.price_cents : 0,
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    review: row.review_status === 'pending' || row.review_status === 'rejected' ? row.review_status : 'approved',
    details: details || {},
  };
}

export default function CommunityCatalog({ category, search: searchInput, preferredCity = '', onSignIn, onHousing }: {
  category: CommunityCategory;
  search: string;
  preferredCity?: string;
  onHousing: () => void;
  onSignIn: () => void;
}) {
  const [plannerError, setPlannerError] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [pages, setPages] = useState(1);
  const [more, setMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [cityInput, setCity] = useState<string>('');
  const search = useDebouncedValue(searchInput, 300);
  const city = useDebouncedValue(cityInput, 300);
  useEffect(() => { setPages(1); setSelected(null); }, [category, search, city]);

  useEffect(() => {
    const ac = new AbortController();
    setBusy(true);
    setError(false);
    setEntries([]);
    const timeout = setTimeout(() => { if (!ac.signal.aborted) { setBusy(false); setError(true); ac.abort(); } }, 15000);
    const detail = DETAIL[category];
    const select = 'id,owner_id,title,description,city,price_cents,created_at,review_status,' +
      detail + '(' + (category === 'Trips' ? 'destination,starts_at,ends_at,capacity' :
        category === 'Events' ? 'venue_name,starts_at,ends_at,capacity' :
          'company_name,compensation_text,workplace_mode') + ')';
    let query = (supabase.from('listings') as any).select(select)
      .eq('kind', KIND[category]).eq('status', 'active')
      .order('created_at', { ascending: false }).order('id')
      .range(0, MAX_PAGE * pages).abortSignal(ac.signal);
    if (search.trim()) query = query.ilike('title', `%${safeLike(search.trim())}%`);
    if (city.trim()) query = query.ilike('city', `%${safeLike(city.trim())}%`);
    void Promise.resolve(query).then((result: any) => {
      if (ac.signal.aborted) return;
      if (result.error) { setError(true); return; }
      const all = (Array.isArray(result.data) ? result.data : [])
        .map((value: Record<string, unknown>) => normalize(value, detail))
        .filter((value: Entry | null): value is Entry => value !== null);
      setEntries(all.slice(0, pages * MAX_PAGE));
      setMore(all.length > pages * MAX_PAGE);
      setSelected(id => id && all.some((entry: Entry) => entry.id === id) ? id : null);
    }).catch(() => { if (!ac.signal.aborted) setError(true); }).finally(() => {
      clearTimeout(timeout);
      if (!ac.signal.aborted) setBusy(false);
    });
    return () => { clearTimeout(timeout); ac.abort(); };
  }, [category, search, city, pages, revision]);

  const action = (name: string, handler: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={handler} style={styles.action}>
      <Text style={styles.actionText}>{name}</Text>
    </Pressable>
  );
  const active = !busy && !error ? entries.find(entry => entry.id === selected) : undefined;
  const fields = (item: Entry) => (
    <View style={styles.meta}>
      {category === 'Jobs' ? <>
        <Text style={styles.detailMeta}>{item.details.company_name || 'Company not specified'}</Text>
        <Text style={styles.detailMeta}>{item.details.compensation_text || 'Compensation not specified'}</Text>
        {item.details.workplace_mode ? <Text style={styles.detailMeta}>Workplace: {item.details.workplace_mode}</Text> : null}
      </> : <>
        <Text style={styles.detailMeta}>{category === 'Trips' ? item.details.destination || 'Destination not specified' : item.details.venue_name || 'Venue not specified'}</Text>
        <Text style={styles.detailMeta}>Start: {formatDate(item.details.starts_at)}</Text>
        {item.details.ends_at ? <Text style={styles.detailMeta}>End: {formatDate(item.details.ends_at)}</Text> : null}
        {typeof item.details.capacity === 'number' ? <Text style={styles.detailMeta}>Capacity: {item.details.capacity}</Text> : null}
      </>}
    </View>
  );

  if (active) return <View style={styles.panel}>
    {action(`Back to ${category}`, () => setSelected(null))}
    <Text style={styles.title}>{active.title}</Text>
    <ReviewNotice review={active.review} />
    <Text style={styles.detailMeta}>{active.city}</Text>
    {fields(active)}
    <Text style={styles.description}>{active.description || 'No description provided.'}</Text>
    <ActivityResponse key={active.id} id={active.id} owner={active.owner} category={category} onSignIn={onSignIn}
      onClosed={() => { setSelected(null); setRevision(v => v + 1); }} />
  </View>;

  return <View style={styles.list}>
    {category === 'Trips' ? <View style={styles.info}>
      <Text style={styles.sectionTitle}>Train journeys</Text>
      <Pressable accessibilityRole="link" onPress={async () => {
        setPlannerError(false);
        try { await Linking.openURL('https://int.bahn.de/en'); }
        catch { setPlannerError(true); }
      }} style={styles.action}>
        <Text style={styles.actionText}>Plan a journey with Deutsche Bahn ↗</Text>
      </Pressable>
      {plannerError ? <Text accessibilityRole="alert">The journey planner could not open. Try again.</Text> : null}
    </View> : null}
    {features.externalFeeds && category !== 'Trips'
      ? <ExternalFeed kind={category === 'Jobs' ? 'jobs' : 'events'} city={city.trim() || preferredCity} search={search} refreshKey={revision} /> : null}
    <View style={styles.info}>
      <Text style={styles.sectionTitle}>Live community {category.toLowerCase()}</Text>
      <ActivityComposer category={category} city={cityInput || preferredCity} onSignIn={onSignIn} onPublished={() => setRevision(v => v + 1)} />
      <TextInput value={cityInput} onChangeText={setCity} accessibilityLabel="Filter listings by city" placeholder="Filter by city" placeholderTextColor="#646B80" style={styles.cityInput} />
      {cityInput.trim() ? action('Clear city filter', () => setCity('')) : null}
      {action('Refresh listings', () => setRevision(v => v + 1))}
    </View>
    {busy ? <ActivityIndicator accessibilityLabel={`Loading ${category.toLowerCase()}`} />
      : error ? <View style={styles.panel}>
        <Text accessibilityRole="alert">Could not load {category.toLowerCase()} from Stuora. Check your connection and retry.</Text>
        {action('Retry listings', () => setRevision(v => v + 1))}
      </View>
      : !entries.length ? <View style={styles.empty}>
      <EditorialImage kind={category} style={styles.emptyPhoto} label={`Promotional ${category.toLowerCase()} image; no actual listings available`} />
      <Text style={styles.sectionTitle}>No {category.toLowerCase()} listings found.</Text>
      <Text style={styles.muted}>When community members publish real listings, they will appear here. Nothing is simulated.</Text>
      {action('Browse Housing instead', onHousing)}
    </View> : <View style={styles.grid}>{entries.map(item =>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.title}`} key={item.id}
        onPress={() => setSelected(item.id)} style={styles.card}>
        <Text style={styles.title}>{item.title}</Text>
        <ReviewNotice review={item.review} />
        <Text style={styles.detailMeta}>{item.city}</Text>
        {fields(item)}
        <Text numberOfLines={2} style={styles.muted}>{item.description}</Text>
        <Text style={styles.link}>View details →</Text>
      </Pressable>)}</View>}
    {!busy && !error && more ? action('Load more listings', () => setPages(v => v + 1)) : null}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: 14 },
  reviewNotice: { alignSelf: 'flex-start', color: '#5B3A00', backgroundColor: '#FFF4D6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '700' },
  panel: { backgroundColor: '#FFFFFF', padding: 22, borderRadius: 18, borderWidth: 1, borderColor: '#E9EAF1', gap: 12 },
  info: { backgroundColor: '#FFFFFF', padding: 17, borderRadius: 18, borderWidth: 1, borderColor: '#E9EAF1', gap: 10, alignItems: 'flex-start' },
  cityInput: { width: '100%', maxWidth: 320, borderRadius: 12, borderWidth: 1, borderColor: '#DDDDEA', paddingHorizontal: 13, paddingVertical: 11, backgroundColor: '#FFFFFF', color: '#11162F' },
  empty: { padding: 25, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', borderRadius: 18, alignItems: 'center', gap: 12 },
  emptyPhoto: { width: 222, height: 110, borderRadius: 16, backgroundColor: '#F4F1FF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexGrow: 1, flexBasis: 245, maxWidth: 450, padding: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', borderRadius: 18, gap: 8 },
  title: { color: '#11162F', fontSize: 18, fontWeight: '900' },
  sectionTitle: { color: '#11162F', fontSize: 16, fontWeight: '900' },
  description: { color: '#252B4A', fontSize: 14, lineHeight: 22 },
  detailMeta: { color: '#646A80', fontSize: 12, fontWeight: '600', lineHeight: 18 },
  meta: { gap: 4 },
  muted: { color: '#757D91', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  disclosure: { color: '#6245B1', fontSize: 12, backgroundColor: '#F1EDFF', borderRadius: 10, padding: 12, lineHeight: 18 },
  action: { backgroundColor: '#7048FF', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  actionText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  link: { color: '#7048FF', fontWeight: '800', fontSize: 12 },
});
