import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useAuth } from '../account/AuthProvider';
import { supabase } from '../backend/supabase';
import { Icon } from '../ui/Brand';
import type { Database } from '../backend/database.types';

type Row = Database['public']['Tables']['listings']['Row'];
type Housing = Database['public']['Tables']['housing_details']['Row'];
type Market = Database['public']['Tables']['marketplace_details']['Row'];
type Item = Row & { housing_details: Housing | null; marketplace_details: Market | null };
type Kind = 'housing' | 'marketplace';
type Condition = Database['public']['Enums']['marketplace_condition'];
type Draft = { title: string; description: string; city: string; price: string; housingType: string; furnished: boolean; bills: boolean; condition: Condition };
const blank = (): Draft => ({ title: '', description: '', city: 'Berlin', price: '', housingType: 'room', furnished: false, bills: false, condition: 'good' });
const money = (cents: number | null) => `€${((cents ?? 0) / 100).toFixed(2)}`;
function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[s.button, disabled && s.disabled]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}
function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return <View><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} multiline={multiline} style={[s.input, multiline && s.description]} /></View>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <View style={s.row}><Text>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onChange} /></View>;
}

export default function ListingWorkspace({ category, mode = 'browse', search = '', preview = false, onAccount }: { category: 'Housing' | 'Marketplace'; mode?: 'browse' | 'create'; search?: string; preview?: boolean; onAccount: () => void }) {
  const { session, profile, profileLoading, initializing, error: profileError } = useAuth();
  const kind: Kind = category === 'Housing' ? 'housing' : 'marketplace';
  const userId = session?.user.id;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [own, setOwn] = useState(false);
  const [revision, setRevision] = useState(0);
  const [pages, setPages] = useState(1);
  const [more, setMore] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [actionError, setActionError] = useState('');
  useEffect(() => {
    setPages(1); setSelected(null); setEditing(false); setDraft(blank()); setNotice(''); setActionError(''); setConfirmArchive(false);
  }, [kind, mode, userId, own, search]);
  useEffect(() => {
    if (mode === 'create') { setLoading(false); return; }
    let active = true;
    setLoading(true); setError(''); setItems([]);
    let query = supabase.from('listings').select('*,housing_details(*),marketplace_details(*)').eq('kind', kind).order('created_at', { ascending: false }).order('id').range(0, pages * 24);
    query = own && userId ? query.eq('owner_id', userId) : query.eq('status', 'active');
    // Search only titles; escape LIKE wildcards so user input remains literal.
    if (search.trim()) query = query.ilike('title', `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`);
    void Promise.resolve(query).then(({ data, error: issue }) => {
      if (!active) return;
      if (issue) setError('Could not load listings. Check your connection and retry.');
      else { setItems((data ?? []).slice(0, pages * 24)); setMore((data?.length ?? 0) > pages * 24); }
      setLoading(false);
    }).catch(() => { if (active) { setError('Could not load listings. Check your connection and retry.'); setLoading(false); } });
    return () => { active = false; };
  }, [kind, userId, own, revision, pages, search, mode]);
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(d => ({ ...d, [key]: value }));
  function edit(item: Item) {
    setDraft({ title: item.title, description: item.description, city: item.city, price: ((item.price_cents ?? 0) / 100).toFixed(2), housingType: item.housing_details?.housing_type ?? 'room', furnished: item.housing_details?.furnished ?? false, bills: item.housing_details?.bills_included ?? false, condition: item.marketplace_details?.item_condition ?? 'good' });
    setEditing(true); setActionError(''); setNotice('');
  }
  async function save() {
    setActionError(''); setNotice('');
    if (draft.title.trim().length < 3 || draft.title.trim().length > 140) return setActionError('Title must be between 3 and 140 characters.');
    if (draft.city.trim().length < 2 || draft.city.trim().length > 120) return setActionError('City must be between 2 and 120 characters.');
    if (draft.description.trim().length > 4000) return setActionError('Description must be at most 4000 characters.');
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(draft.price.trim())) return setActionError('Enter a EUR price from 0 to 9999999.99, with up to two decimal places.');
    const cents = Math.round(Number(draft.price.trim()) * 100);
    setBusy(true);
    try {
      const { error: issue } = await supabase.rpc('save_student_listing', { p_id: editing ? selected!.id : null, p_kind: kind, p_title: draft.title.trim(), p_description: draft.description.trim(), p_city: draft.city.trim(), p_price_cents: cents, p_housing_type: draft.housingType, p_furnished: draft.furnished, p_bills_included: draft.bills, p_condition: draft.condition });
      if (issue) throw issue;
      setNotice(editing ? 'Changes saved.' : 'Listing published and saved to your account.');
      setDraft(blank()); setEditing(false); setSelected(null); setRevision(v => v + 1);
    } catch { setActionError('Could not save. Your input is preserved. Check your connection and account, then retry.'); }
    finally { setBusy(false); }
  }
  async function archive() {
    if (!selected || !userId) return;
    setBusy(true); setActionError('');
    try {
      const { error: issue } = await supabase.from('listings').update({ status: 'closed' }).eq('id', selected.id).eq('owner_id', userId).eq('status', 'active').select('id').single();
      if (issue) throw issue;
      setSelected(null); setConfirmArchive(false); setNotice('Listing archived. It is no longer publicly discoverable.'); setRevision(v => v + 1);
    } catch { setActionError('Could not archive. Refresh to check its status, then retry.'); }
    finally { setBusy(false); }
  }
  const form = mode === 'create' || editing;
  return <View style={s.workspace}>
    {!preview ? <Text style={s.hint}>{category} listings are saved to Stuora. No student posting or application fee.</Text> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text> : null}
    {actionError ? <Text accessibilityRole="alert" style={s.error}>{actionError}</Text> : null}
    {form ? initializing || profileLoading ? <ActivityIndicator accessibilityLabel="Loading account" /> : !session || !profile || profileError ? <View style={s.card}><Text style={s.text}>Sign in and complete your profile to publish a listing.</Text><Button title="Open account" onPress={onAccount} /></View> : <View style={s.card}>
      <Text style={s.title}>{editing ? 'Edit listing' : `Publish ${category.toLowerCase()} listing`}</Text>
      <Text style={s.hint}>Public text listing · photos and messaging are not available yet.</Text>
      <Field label="Listing title" value={draft.title} onChange={v => change('title', v)} />
      <Field label="Listing description" value={draft.description} onChange={v => change('description', v)} multiline />
      <Field label="Listing city" value={draft.city} onChange={v => change('city', v)} />
      <Field label={kind === 'housing' ? 'Monthly rent (EUR)' : 'Price (EUR)'} value={draft.price} onChange={v => change('price', v)} />
      <Text style={s.label}>{kind === 'housing' ? 'Housing type' : 'Item condition'}</Text>
      <View style={s.wrap}>{(kind === 'housing' ? ['room', 'wg', 'studio', 'apartment', 'sublet', 'temporary'] : ['new', 'like_new', 'good', 'fair']).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value} accessibilityState={{ selected: value === (kind === 'housing' ? draft.housingType : draft.condition) }} onPress={() => kind === 'housing' ? change('housingType', value) : change('condition', value as Condition)} style={[s.choice, value === (kind === 'housing' ? draft.housingType : draft.condition) && s.chosen]}><Text>{value.replace('_', ' ')}</Text></Pressable>)}</View>
      {kind === 'housing' ? <><Toggle label="Furnished" value={draft.furnished} onChange={v => change('furnished', v)} /><Toggle label="Bills included" value={draft.bills} onChange={v => change('bills', v)} /></> : <Text style={s.hint}>One item · pickup only.</Text>}
      <Button title={busy ? 'Saving listing…' : editing ? 'Save listing changes' : 'Publish listing'} onPress={() => void save()} disabled={busy} />
      {editing ? <Button title="Cancel editing" onPress={() => { setEditing(false); setActionError(''); }} disabled={busy} /> : null}
    </View> : selected ? <View style={s.card}>
      <Text style={s.title}>{selected.title}</Text><Text style={s.price}>{money(selected.price_cents)}{kind === 'housing' ? ' / month' : ''}</Text><Text>{selected.city} · {selected.status}</Text>
      <Text style={s.text}>{selected.description || 'No description provided.'}</Text>
      {selected.housing_details ? <Text>{selected.housing_details.housing_type} · {selected.housing_details.furnished ? 'Furnished' : 'Unfurnished'} · {selected.housing_details.bills_included ? 'Bills included' : 'Bills extra'}</Text> : null}
      {selected.marketplace_details ? <Text>Condition: {selected.marketplace_details.item_condition.replace('_', ' ')} · pickup only</Text> : null}
      <Text style={s.hint}>Photos and messaging are not available yet.</Text>
      {selected.owner_id === userId && selected.status === 'active' ? <><Button title="Edit listing" onPress={() => edit(selected)} disabled={busy} />{confirmArchive ? <><Text>Archive this listing? It will disappear from public discovery.</Text><Button title="Confirm archive" onPress={() => void archive()} disabled={busy} /><Button title="Keep listing" onPress={() => setConfirmArchive(false)} disabled={busy} /></> : <Button title="Archive listing" onPress={() => setConfirmArchive(true)} disabled={busy} />}</> : null}
      <Button title="Back to listings" onPress={() => { setSelected(null); setConfirmArchive(false); setActionError(''); }} disabled={busy} />
    </View> : <>
      {!preview ? <View style={s.wrap}><Button title="Refresh listings" onPress={() => setRevision(v => v + 1)} disabled={loading} />{session ? <Button title={own ? 'Browse public listings' : 'My listings'} onPress={() => setOwn(v => !v)} /> : null}</View> : null}
      <Text style={s.hint}>{own ? 'Your listings, including archived posts.' : 'Active listings from the community.'}{search ? ' Search matches titles.' : ''}</Text>
      {loading ? <ActivityIndicator accessibilityLabel="Loading listings" /> : error ? <View><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button title="Retry listings" onPress={() => setRevision(v => v + 1)} /></View> : <>
        {!items.length ? <Text style={s.text}>No {category.toLowerCase()} listings found.</Text> : null}
        <View style={s.grid}>{(preview ? items.slice(0, 4) : items).map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`View ${item.title}`} onPress={() => { setSelected(item); setNotice(''); }} style={s.listing}><View style={s.visual}><Icon name={kind === "housing" ? "housing" : "marketplace"} size={44} color="#7048FF" /><Text style={s.hint}>No photo</Text></View><Text style={s.title}>{item.title}</Text><Text style={s.price}>{money(item.price_cents)}{kind === 'housing' ? ' / month' : ''}</Text><Text>{item.city} · {item.status}</Text></Pressable>)}</View>
        {more && !preview ? <Button title="Load more listings" onPress={() => setPages(v => v + 1)} /> : null}
      </>}
    </>}
  </View>;
}
const s = StyleSheet.create({
  workspace: { gap: 16, width: '100%' }, card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 18, borderWidth: 1, borderColor: '#E9EAF1', gap: 14 },
  title: { fontSize: 18, fontWeight: '700', color: '#11162F' }, text: { fontSize: 15, lineHeight: 23, color: '#252B4A' }, hint: { color: '#747B91', fontSize: 13, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#252B4A', marginBottom: 7 }, input: { borderWidth: 1, borderColor: '#D5D7E2', borderRadius: 12, padding: 12, fontSize: 16, color: '#11162F', backgroundColor: '#FFF' }, description: { minHeight: 100, textAlignVertical: 'top' },
  button: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#7048FF', alignItems: 'center' }, buttonText: { color: '#FFF', fontWeight: '700', fontSize: 14 }, disabled: { opacity: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { padding: 10, borderRadius: 10, backgroundColor: '#F7F7FB', borderWidth: 1, borderColor: '#E9EAF1' }, chosen: { backgroundColor: '#EEE9FF', borderColor: '#7048FF' },
  notice: { color: '#116B49', padding: 12, backgroundColor: '#EAF9F2', borderRadius: 12 }, error: { color: '#B42318', padding: 12 }, price: { fontSize: 18, fontWeight: '700', color: '#7048FF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, listing: { flexGrow: 1, flexBasis: 250, maxWidth: 520, padding: 16, gap: 10, borderRadius: 18, backgroundColor: '#FFF', borderColor: '#E9EAF1', borderWidth: 1 }, visual: { backgroundColor: '#EEE9FF', minHeight: 170, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, icon: { fontSize: 36 },
});
