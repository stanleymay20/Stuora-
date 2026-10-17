import React, { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useAuth } from '../account/AuthProvider';
import { supabase } from '../backend/supabase';
import { Icon } from '../ui/Brand';
import { CategoryArtwork } from '../ui/CategoryArtwork';
import type { Database } from '../backend/database.types';

type Row = Database['public']['Tables']['listings']['Row'];
type Housing = Database['public']['Tables']['housing_details']['Row'];
type Market = Database['public']['Tables']['marketplace_details']['Row'];
type Media = { id: string; listing_id: string; object_path: string; sort_order: number; created_at: string };
type Item = Row & { housing_details: Housing | null; marketplace_details: Market | null; listing_media: Media[] };
type Kind = 'housing' | 'marketplace';
type Condition = Database['public']['Enums']['marketplace_condition'];
type Draft = { title: string; description: string; city: string; price: string; housingType: string; furnished: boolean; bills: boolean; condition: Condition };

const PAGE_SIZE = 24;
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const blank = (): Draft => ({ title: '', description: '', city: 'Berlin', price: '', housingType: 'room', furnished: false, bills: false, condition: 'good' });
const money = (cents: number | null) => `€${((cents ?? 0) / 100).toFixed(2)}`;

function normalizeItem(raw: unknown): Item {
  const item = raw as Item;
  return { ...item, listing_media: [...(item.listing_media ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)) };
}
function mediaUrl(path: string) {
  return supabase.storage.from('listing-media').getPublicUrl(path).data.publicUrl;
}
function imageMime(asset: ImagePicker.ImagePickerAsset, responseType: string | null) {
  const direct = asset.mimeType?.toLowerCase();
  if (direct) return direct;
  const header = responseType?.split(';')[0]?.trim().toLowerCase();
  if (header) return header;
  const name = (asset.fileName ?? asset.uri).toLowerCase();
  if (/\.jpe?g($|\?)/.test(name)) return 'image/jpeg';
  if (/\.png($|\?)/.test(name)) return 'image/png';
  if (/\.webp($|\?)/.test(name)) return 'image/webp';
  return '';
}
function extensionFor(mime: string) {
  return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
}
function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[s.button, disabled && s.disabled]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}
function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return <View><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} multiline={multiline} style={[s.input, multiline && s.description]} /></View>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <View style={s.row}><Text>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onChange} /></View>;
}
function Photo({ media, title, index, removable, disabled, onRemove }: { media: Media; title: string; index: number; removable?: boolean; disabled?: boolean; onRemove?: () => void }) {
  return <View style={s.photoWrap}>
    <Image source={{ uri: mediaUrl(media.object_path) }} accessibilityLabel={`${title} photo ${index + 1}`} style={s.photo} resizeMode="cover" />
    {removable && onRemove ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${index + 1}`} disabled={disabled} onPress={onRemove} style={[s.removePhoto, disabled && s.disabled]}><Text style={s.removePhotoText}>Remove</Text></Pressable> : null}
  </View>;
}

export default function ListingWorkspace({ category, mode = 'browse', search = '', preview = false, onAccount, onMessage, onCreate, onClearSearch }: { category: 'Housing' | 'Marketplace'; mode?: 'browse' | 'create'; search?: string; preview?: boolean; onAccount: () => void; onMessage?: () => void; onCreate?: () => void; onClearSearch?: () => void }) {
  const { session, profile, profileLoading, initializing, error: profileError } = useAuth();
  const { width } = useWindowDimensions();
  const compactWideEmpty = preview && width >= 760;
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
    const ac = new AbortController();
    setLoading(true); setError(''); setItems([]);
    const timeout = setTimeout(() => {
      setError('Could not load listings. Check your connection and retry.');
      setLoading(false);
      ac.abort();
    }, 15000);
    let query = (supabase.from('listings') as any)
      .select('*,housing_details(*),marketplace_details(*),listing_media(id,listing_id,object_path,sort_order,created_at)')
      .eq('kind', kind)
      .order('created_at', { ascending: false })
      .order('id')
      .range(0, pages * PAGE_SIZE)
      .abortSignal(ac.signal);
    query = own && userId ? query.eq('owner_id', userId) : query.eq('status', 'active');
    if (search.trim()) query = query.ilike('title', `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`);
    void Promise.resolve(query).then((result: any) => {
      if (ac.signal.aborted) return;
      if (result.error) setError('Could not load listings. Check your connection and retry.');
      else {
        const rows = (result.data ?? []).map(normalizeItem);
        setItems(rows.slice(0, pages * PAGE_SIZE));
        setMore(rows.length > pages * PAGE_SIZE);
      }
      setLoading(false);
    }).catch(() => {
      if (!ac.signal.aborted) { setError('Could not load listings. Check your connection and retry.'); setLoading(false); }
    }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); ac.abort(); };
  }, [kind, userId, own, revision, pages, search, mode]);

  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(d => ({ ...d, [key]: value }));
  function replaceItem(item: Item) {
    setSelected(item);
    setItems(rows => rows.map(row => row.id === item.id ? item : row));
  }
  async function fetchItem(id: string) {
    const { data, error: issue } = await (supabase.from('listings') as any)
      .select('*,housing_details(*),marketplace_details(*),listing_media(id,listing_id,object_path,sort_order,created_at)')
      .eq('id', id)
      .single();
    if (issue || !data) throw issue ?? new Error('Listing not found');
    return normalizeItem(data);
  }
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
      const { data: savedId, error: issue } = await supabase.rpc('save_student_listing', { p_id: editing ? selected!.id : null, p_kind: kind, p_title: draft.title.trim(), p_description: draft.description.trim(), p_city: draft.city.trim(), p_price_cents: cents, p_housing_type: draft.housingType, p_furnished: draft.furnished, p_bills_included: draft.bills, p_condition: draft.condition });
      if (issue || !savedId) throw issue ?? new Error('Missing listing id');
      setDraft(blank()); setEditing(false); setRevision(v => v + 1);
      try {
        const item = await fetchItem(savedId);
        replaceItem(item);
        setNotice('Listing saved. Add up to six real photos below.');
      } catch {
        setSelected(null);
        setNotice('Listing saved. Refresh My listings to add photos.');
      }
    } catch {
      setActionError('Could not save. Your input is preserved. Check your connection and account, then retry.');
    } finally { setBusy(false); }
  }

  async function addPhoto() {
    if (!selected || !userId || selected.owner_id !== userId || selected.status !== 'active') return;
    if (selected.listing_media.length >= MAX_PHOTOS) return setActionError(`A listing can have up to ${MAX_PHOTOS} photos.`);
    setActionError(''); setNotice('');
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) return setActionError('Photo-library permission is required to add a listing photo.');
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.85 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) return setActionError('Choose an image no larger than 5 MB.');
      setBusy(true);
      const response = await fetch(asset.uri);
      if (!response.ok && Platform.OS === 'web') throw new Error('Could not read selected image');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_PHOTO_BYTES) return setActionError('Choose an image no larger than 5 MB.');
      const mime = imageMime(asset, response.headers.get('content-type'));
      if (!ALLOWED_IMAGE_TYPES.has(mime)) return setActionError('Choose a JPEG, PNG or WebP image.');
      const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const path = `${userId}/${selected.id}/${token}.${extensionFor(mime)}`;
      const { error: uploadIssue } = await supabase.storage.from('listing-media').upload(path, bytes, { contentType: mime, upsert: false, cacheControl: '3600' });
      if (uploadIssue) throw uploadIssue;
      const nextSort = selected.listing_media.reduce((max, media) => Math.max(max, media.sort_order), -1) + 1;
      const { data: inserted, error: metadataIssue } = await (supabase.from('listing_media') as any)
        .insert({ listing_id: selected.id, object_path: path, sort_order: nextSort })
        .select('id,listing_id,object_path,sort_order,created_at')
        .single();
      if (metadataIssue || !inserted) {
        await supabase.storage.from('listing-media').remove([path]);
        throw metadataIssue ?? new Error('Could not save photo metadata');
      }
      const updated = normalizeItem({ ...selected, listing_media: [...selected.listing_media, inserted] });
      replaceItem(updated);
      setNotice('Photo uploaded and attached to this listing.');
    } catch {
      setActionError('Could not upload the photo. Your listing was not changed. Check the image and connection, then retry.');
    } finally { setBusy(false); }
  }

  async function removePhoto(media: Media) {
    if (!selected || !userId || selected.owner_id !== userId) return;
    setBusy(true); setActionError(''); setNotice('');
    try {
      const { error: metadataIssue } = await (supabase.from('listing_media') as any).delete().eq('id', media.id).eq('listing_id', selected.id);
      if (metadataIssue) throw metadataIssue;
      const { error: storageIssue } = await supabase.storage.from('listing-media').remove([media.object_path]);
      const updated = { ...selected, listing_media: selected.listing_media.filter(item => item.id !== media.id) };
      replaceItem(updated);
      if (storageIssue) setNotice('Photo removed from the listing. Storage cleanup needs a later retry.');
      else setNotice('Photo removed.');
    } catch {
      setActionError('Could not remove the photo. Refresh and retry.');
    } finally { setBusy(false); }
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

  async function messageOwner() {
    if (!selected) return;
    setActionError(''); setNotice('');
    if (!session || !profile || profileError) { onAccount(); return; }
    if (selected.owner_id === userId || selected.status !== 'active') return;
    setBusy(true);
    try {
      const { error: issue } = await (supabase.rpc as any)('start_listing_conversation', { p_listing_id: selected.id });
      if (issue) throw issue;
      setNotice('Conversation ready. Opening Messages…');
      onMessage?.();
    } catch {
      setActionError('Could not start a secure conversation. Check that the listing is still active, then retry.');
    } finally { setBusy(false); }
  }

  const form = (mode === 'create' && !selected) || editing;
  return <View style={s.workspace}>
    {!preview ? <Text style={s.hint}>{category} listings are saved to Stuora. No student posting or application fee.</Text> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text> : null}
    {actionError ? <Text accessibilityRole="alert" style={s.error}>{actionError}</Text> : null}

    {form ? initializing || profileLoading ? <ActivityIndicator accessibilityLabel="Loading account" /> : !session || !profile || profileError ? <View style={s.card}><Text style={s.text}>Sign in and complete your profile to publish a listing.</Text><Button title="Open account" onPress={onAccount} /></View> : <View style={s.card}>
      <Text style={s.title}>{editing ? 'Edit listing' : `Publish ${category.toLowerCase()} listing`}</Text>
      <Text style={s.hint}>Publish the listing first, then attach up to six JPEG, PNG or WebP photos (5 MB each).</Text>
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
      <Text style={s.title}>{selected.title}</Text>
      <View style={s.photoGrid}>{selected.listing_media.map((media, index) => <Photo key={media.id} media={media} title={selected.title} index={index} removable={selected.owner_id === userId} disabled={busy} onRemove={() => void removePhoto(media)} />)}</View>
      {!selected.listing_media.length ? <View style={s.detailPlaceholder}><Icon name={kind === 'housing' ? 'housing' : 'marketplace'} size={48} color="#7048FF" /><Text style={s.hint}>No photos yet</Text></View> : null}
      <Text style={s.price}>{money(selected.price_cents)}{kind === 'housing' ? ' / month' : ''}</Text><Text>{selected.city} · {selected.status}</Text>
      <Text style={s.text}>{selected.description || 'No description provided.'}</Text>
      {selected.housing_details ? <Text>{selected.housing_details.housing_type} · {selected.housing_details.furnished ? 'Furnished' : 'Unfurnished'} · {selected.housing_details.bills_included ? 'Bills included' : 'Bills extra'}</Text> : null}
      {selected.marketplace_details ? <Text>Condition: {selected.marketplace_details.item_condition.replace('_', ' ')} · pickup only</Text> : null}
      {selected.owner_id === userId && selected.status === 'active' ? <Button title={busy ? 'Working…' : `Add photo (${selected.listing_media.length}/${MAX_PHOTOS})`} onPress={() => void addPhoto()} disabled={busy || selected.listing_media.length >= MAX_PHOTOS} /> : null}
      {selected.owner_id !== userId && selected.status === 'active' ? <Button title={session && profile ? 'Message owner' : 'Sign in to message owner'} onPress={() => void messageOwner()} disabled={busy} /> : null}
      {selected.owner_id === userId && selected.status === 'active' ? <><Button title="Edit listing" onPress={() => edit(selected)} disabled={busy} />{confirmArchive ? <><Text>Archive this listing? It will disappear from public discovery.</Text><Button title="Confirm archive" onPress={() => void archive()} disabled={busy} /><Button title="Keep listing" onPress={() => setConfirmArchive(false)} disabled={busy} /></> : <Button title="Archive listing" onPress={() => setConfirmArchive(true)} disabled={busy} />}</> : null}
      <Button title={mode === 'create' ? 'Create another listing' : 'Back to listings'} onPress={() => { setSelected(null); setConfirmArchive(false); setActionError(''); setNotice(''); }} disabled={busy} />
    </View> : <>
      {!preview ? <View style={s.wrap}><Button title="Refresh listings" onPress={() => setRevision(v => v + 1)} disabled={loading} />{session ? <Button title={own ? 'Browse public listings' : 'My listings'} onPress={() => setOwn(v => !v)} /> : null}</View> : null}
      <Text style={s.hint}>{own ? 'Your listings, including archived posts.' : 'Active listings from the community.'}{search ? ' Search matches titles.' : ''}</Text>
      {loading ? <ActivityIndicator accessibilityLabel="Loading listings" /> : error ? <View><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button title="Retry listings" onPress={() => setRevision(v => v + 1)} /></View> : <>
        {!items.length ? <View style={[s.emptyListings, preview && s.emptyPreview, compactWideEmpty && s.emptyPreviewWide]}>
          <CategoryArtwork category={category} width={compactWideEmpty ? 155 : preview ? 130 : 206} height={compactWideEmpty ? 82 : preview ? 72 : 103} />
          <View style={[s.emptyCopy, compactWideEmpty && s.emptyCopyWide]}>
            <Text style={[s.emptyTitle, compactWideEmpty && s.emptyTitleWide]}>No {category.toLowerCase()} listings found.</Text>
            <Text style={[s.emptyCaption, compactWideEmpty && s.emptyCaptionWide]}>{search.trim()
              ? 'No listing titles match that search. Try a different term or clear the search.'
              : own ? 'You have not posted a listing in this category yet.'
              : 'Be among the first students to share a real listing. Only published community listings appear here.'}</Text>
            {search.trim() && onClearSearch ? <Button title="Clear search" onPress={onClearSearch} /> : !search.trim() && onCreate ? <Button title={`Post ${category.toLowerCase()} listing`} onPress={onCreate} /> : null}
          </View>
        </View> : null}
        <View style={s.grid}>{(preview ? items.slice(0, 4) : items).map(item => {
          const cover = item.listing_media[0];
          return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`View ${item.title}`} onPress={() => { setSelected(item); setNotice(''); setActionError(''); }} style={s.listing}>
            <View style={s.coverWrap}>
              {cover ? <Image source={{ uri: mediaUrl(cover.object_path) }} accessibilityLabel={`${item.title} cover photo`} style={s.cardImage} resizeMode="cover" /> : <View style={s.visual}><Icon name={kind === 'housing' ? 'housing' : 'marketplace'} size={44} color="#7048FF" /><Text style={s.hint}>Photo not added yet</Text></View>}
            </View>
            <View style={s.listingDetails}>
              <Text style={s.title} numberOfLines={2}>{item.title}</Text>
              <Text style={s.price}>{money(item.price_cents)}{kind === 'housing' ? ' / month' : ''}</Text>
              <View style={s.listingMeta}><Icon name="location" size={15} color="#747B91" /><Text style={s.metaText}>{item.city} · {item.status}</Text></View>
            </View>
          </Pressable>;
        })}</View>
        {more && !preview ? <Button title="Load more listings" onPress={() => setPages(v => v + 1)} /> : null}
      </>}
    </>}
  </View>;
}

const s = StyleSheet.create({
  workspace: { gap: 16, width: '100%' },
  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 18, borderWidth: 1, borderColor: '#E9EAF1', gap: 14 },
  title: { fontSize: 18, fontWeight: '700', color: '#11162F' },
  text: { fontSize: 15, lineHeight: 23, color: '#252B4A' },
  hint: { color: '#747B91', fontSize: 13, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#252B4A', marginBottom: 7 },
  input: { borderWidth: 1, borderColor: '#D5D7E2', borderRadius: 12, padding: 12, fontSize: 16, color: '#11162F', backgroundColor: '#FFF' },
  description: { minHeight: 100, textAlignVertical: 'top' },
  button: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#7048FF', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
  disabled: { opacity: 0.48 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  choice: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#D5D7E2', backgroundColor: '#FFFFFF' },
  chosen: { borderColor: '#7048FF', backgroundColor: '#F1EDFF' },
  notice: { backgroundColor: '#EDFFF4', color: '#136B3A', padding: 12, borderRadius: 10 },
  error: { backgroundColor: '#FFF0F0', color: '#9C2D2D', padding: 12, borderRadius: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  listing: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', borderRadius: 19, overflow: 'hidden', minWidth: 220, flexGrow: 1, flexBasis: 220, maxWidth: 390, shadowColor: '#11162F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 },
  coverWrap: { backgroundColor: '#F4F1FF' },
  listingDetails: { padding: 16, gap: 8 },
  listingMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, color: '#747B91', flexShrink: 1 },
  visual: { height: 174, backgroundColor: '#F4F1FF', alignItems: 'center', justifyContent: 'center', gap: 8 },
  cardImage: { width: '100%', height: 174, backgroundColor: '#F4F1FF' },
  price: { fontWeight: '900', color: '#11162F', fontSize: 18 },
  emptyListings: { borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', paddingVertical: 27, paddingHorizontal: 22, alignItems: 'center', gap: 12 },
  emptyPreview: { paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  emptyPreviewWide: { flexDirection: 'row', justifyContent: 'center', gap: 22, minHeight: 150 },
  emptyCopy: { alignItems: 'center', gap: 8, flexShrink: 1 },
  emptyCopyWide: { alignItems: 'flex-start', maxWidth: 500 },
  emptyTitleWide: { textAlign: 'left' },
  emptyCaptionWide: { textAlign: 'left' },
  emptyIcon: { width: 64, height: 64, borderRadius: 21, backgroundColor: '#F1EDFF', justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { color: '#11162F', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyCaption: { color: '#747B91', fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 420 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrap: { width: 160, gap: 6 },
  photo: { width: 160, height: 130, borderRadius: 12, backgroundColor: '#F4F1FF' },
  removePhoto: { alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F2F3F7' },
  removePhotoText: { color: '#9C2D2D', fontWeight: '700', fontSize: 12 },
  detailPlaceholder: { minHeight: 160, borderRadius: 14, backgroundColor: '#F4F1FF', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
