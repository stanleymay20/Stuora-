import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useAuth } from '../account/AuthProvider';
import { supabase } from '../backend/supabase';
import { Icon } from '../ui/Brand';
import { EditorialImage } from '../ui/EditorialImage';
import type { Database } from '../backend/database.types';
import ReportButton from '../moderation/ReportButton';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

type Row = Database['public']['Tables']['listings']['Row'];
type Housing = Database['public']['Tables']['housing_details']['Row'];
type Market = Database['public']['Tables']['marketplace_details']['Row'];
type Media = { id: string; listing_id: string; object_path: string; sort_order: number; created_at: string };
type Item = Row & { housing_details: Housing | null; marketplace_details: Market | null; listing_media: Media[] };
type Kind = 'housing' | 'marketplace';
type Condition = Database['public']['Enums']['marketplace_condition'];
type Draft = { title: string; description: string; city: string; price: string; housingType: string; furnished: boolean; bills: boolean; condition: Condition };

const PAGE_SIZE = 24;
const blank = (): Draft => ({ title: '', description: '', city: '', price: '', housingType: 'room', furnished: false, bills: false, condition: 'good' });
const money = (cents: number | null) => `€${((cents ?? 0) / 100).toFixed(2)}`;

function normalizeItem(raw: unknown): Item {
  const item = raw as Item;
  return { ...item, listing_media: [...(item.listing_media ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)) };
}
function mediaUrl(path: string) {
  return supabase.storage.from('listing-media').getPublicUrl(path).data.publicUrl;
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

export default function ListingWorkspace({ category, mode = 'browse', search: searchInput = '', preferredCity = '', preview = false, onAccount, onMessage, onCreate, onClearSearch }: { category: 'Housing' | 'Marketplace'; mode?: 'browse' | 'create'; search?: string; preferredCity?: string; preview?: boolean; onAccount: () => void; onMessage?: (conversationId: string) => void; onCreate?: () => void; onClearSearch?: () => void }) {
  const { session, profile, profileLoading, initializing, error: profileError } = useAuth();
  const { width } = useWindowDimensions();
  const compactWideEmpty = preview && width >= 760;
  const kind: Kind = category === 'Housing' ? 'housing' : 'marketplace';
  const userId = session?.user.id;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [own, setOwn] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [savedState, setSavedState] = useState<'idle' | 'loading' | 'saved' | 'unsaved' | 'error'>('idle');
  const [savedRevision, setSavedRevision] = useState(0);
  const [cityFilter, setCityFilter] = useState(preferredCity);
  useEffect(() => { setCityFilter(preferredCity); }, [preferredCity]);
  const [maxPrice, setMaxPrice] = useState('');
  const hasListingFilters = Boolean(cityFilter.trim() || maxPrice.trim());
  // Debounce typed search and filters so each keystroke is not a database query.
  const search = useDebouncedValue(searchInput, 300);
  const cityQuery = useDebouncedValue(cityFilter, 300);
  const priceQuery = useDebouncedValue(maxPrice, 300);
  const [revision, setRevision] = useState(0);
  const [pages, setPages] = useState(1);
  const [more, setMore] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => blank());
  useEffect(() => {
    // Suggested city comes from real profile/selection; never silently assume Berlin.
    if (mode === 'create' && !editing && !draft.city.trim()) {
      const candidate = preferredCity || profile?.city?.trim() || '';
      if (candidate) setDraft(current => ({ ...current, city: candidate }));
    }
  }, [mode, editing, draft.city, preferredCity, profile?.city]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    // Never carry another account's saved-only filter across identity changes.
    setSavedOnly(false);
    setSavedState('idle');
  }, [userId]);

  useEffect(() => {
    if (!selected || !userId || selected.owner_id === userId || selected.status !== 'active') {
      setSavedState('idle');
      return;
    }
    let current = true;
    setSavedState('loading');
    void Promise.resolve(supabase.from('saved_listings').select('listing_id')
      .eq('user_id', userId).eq('listing_id', selected.id).maybeSingle())
      .then(({ data, error: issue }) => {
        if (current) setSavedState(issue ? 'error' : data ? 'saved' : 'unsaved');
      }).catch(() => { if (current) setSavedState('error'); });
    return () => { current = false; };
  }, [selected?.id, selected?.status, selected?.owner_id, userId, savedRevision]);

  async function toggleSaved() {
    if (!selected || !userId || busy || !['saved', 'unsaved'].includes(savedState)) return;
    if (selected.status !== 'active' || selected.owner_id === userId) return;
    const itemId = selected.id;
    const wasSaved = savedState === 'saved';
    setBusy(true); setActionError(''); setNotice('');
    try {
      if (wasSaved) {
        const { error: issue } = await supabase.from('saved_listings')
          .delete().eq('user_id', userId).eq('listing_id', itemId);
        if (issue) throw issue;
      } else {
        const { error: issue } = await supabase.from('saved_listings').upsert(
          { user_id: userId, listing_id: itemId },
          { onConflict: 'user_id,listing_id', ignoreDuplicates: true }
        );
        if (issue) throw issue;
      }
      setSavedState(wasSaved ? 'unsaved' : 'saved');
      setSavedRevision(v => v + 1);
      if (wasSaved && savedOnly) setSelected(null);
      setRevision(v => v + 1);
      setNotice(wasSaved ? 'Listing removed from saved items.' : 'Listing saved to your account.');
    } catch {
      setActionError('Could not update saved listings. Nothing was changed locally. Please retry.');
      setSavedRevision(v => v + 1);
    } finally { setBusy(false); }
  }

  useEffect(() => {
    setPages(1); setSelected(null); setEditing(false); setDraft(blank()); setNotice(''); setActionError(''); setConfirmArchive(false);
  }, [kind, mode, userId, own, search, cityQuery, priceQuery]);

  useEffect(() => {
    if (mode === 'create') { setLoading(false); return; }
    const ac = new AbortController();
    setLoading(true); setError(''); setItems([]);
    const timeout = setTimeout(() => {
      setError('Could not load listings. Check your connection and retry.');
      setLoading(false);
      ac.abort();
    }, 15000);
    // The saved view joins through the user's RLS-scoped saved_listings rows.
    // Never fetch everyone's saved records and filter them on the client.
    const embedded = savedOnly && !!userId;
    const detailSelect = '*,housing_details(*),marketplace_details(*),listing_media(id,listing_id,object_path,sort_order,created_at)';
    let query: any = embedded
      ? (supabase.from('saved_listings') as any)
        .select('listing_id,listings!inner(' + detailSelect + ')')
        .eq('user_id', userId)
        .eq('listings.kind', kind)
        .eq('listings.status', 'active')
        .order('created_at', { ascending: false })
        .range(0, pages * PAGE_SIZE)
        .abortSignal(ac.signal)
      : (supabase.from('listings') as any)
        .select(detailSelect)
        .eq('kind', kind)
        .order('created_at', { ascending: false })
        .order('id')
        .range(0, pages * PAGE_SIZE)
        .abortSignal(ac.signal);
    if (!embedded) query = own && userId ? query.eq('owner_id', userId) : query.eq('status', 'active');
    const field = (name: string) => embedded ? 'listings.' + name : name;
    if (search.trim()) query = query.ilike(field('title'), '%' + search.trim().replace(/[\\%_]/g, '\\$&') + '%');
    if (cityQuery.trim()) query = query.ilike(field('city'), '%' + cityQuery.trim().replace(/[\\%_]/g, '\\$&') + '%');
    if (priceQuery.trim()) query = query.lte(field('price_cents'), Math.round(Number(priceQuery) * 100));
    void Promise.resolve(query).then((result: any) => {
      if (ac.signal.aborted) return;
      if (result.error) setError('Could not load listings. Check your connection and retry.');
      else {
        const rows = (result.data ?? []).map((raw: any) => normalizeItem(embedded ? raw.listings : raw));
        setItems(rows.slice(0, pages * PAGE_SIZE));
        setMore(rows.length > pages * PAGE_SIZE);
      }
      setLoading(false);
    }).catch(() => {
      if (!ac.signal.aborted) { setError('Could not load listings. Check your connection and retry.'); setLoading(false); }
    }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); ac.abort(); };
  }, [kind, userId, own, savedOnly, revision, pages, search, cityQuery, priceQuery, mode]);

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
        setNotice('Listing saved. Photo uploads are temporarily paused while Stuora completes secure processing.');
      } catch {
        setSelected(null);
        setNotice('Listing saved. Refresh My listings to manage this listing.');
      }
    } catch {
      setActionError('Could not save. Your input is preserved. Check your connection and account, then retry.');
    } finally { setBusy(false); }
  }

  // Client-side raw Storage uploads were removed. Any future image creation
  // must use the verified, authenticated server-side decoder and RLS cutover.

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
      const { data: conversationId, error: issue } = await (supabase.rpc as any)('start_listing_conversation', { p_listing_id: selected.id });
      if (issue || typeof conversationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(conversationId)) {
        throw issue ?? new Error('Conversation reference missing');
      }
      setNotice('Conversation ready. Opening Messages…');
      onMessage?.(conversationId);
    } catch {
      setActionError('Could not start a secure conversation. Check that the listing is still active, then retry.');
    } finally { setBusy(false); }
  }

  const form = (mode === 'create' && !selected) || editing;
  return <View style={s.workspace}>
    {!preview && form ? <Text style={s.hint}>Publish your own listing for free. Stuora does not charge a student posting fee.</Text> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text> : null}
    {actionError ? <Text accessibilityRole="alert" style={s.error}>{actionError}</Text> : null}

    {form ? initializing || profileLoading ? <ActivityIndicator accessibilityLabel="Loading account" /> : !session || !profile || profileError ? <View style={s.card}><Text style={s.text}>Sign in and complete your profile to publish a listing.</Text><Button title="Open account" onPress={onAccount} /></View> : <View style={s.card}>
      <Text style={s.title}>{editing ? 'Edit listing' : `Publish ${category.toLowerCase()} listing`}</Text>
      <Text style={s.hint}>You can publish a text-only listing now. Photo uploads are temporarily paused while Stuora qualifies secure image processing. Existing public photo URLs may remain accessible until the underlying file is removed. Do not include documents, addresses or identifying details in listing content.</Text>
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
      {selected.owner_id === userId && selected.status === 'active' ? <Text style={s.hint}>Photo uploads are temporarily paused while Stuora completes secure processing.</Text> : null}
      {selected.owner_id !== userId && selected.status === 'active' ? <>
        <Button title={session && profile && !profileError ? 'Message owner' : 'Sign in to message owner'} onPress={() => void messageOwner()} disabled={busy} />
        {!session || !profile || profileError
          ? <Button title="Sign in to save listing" onPress={onAccount} />
          : savedState === 'error'
            ? <><Text accessibilityRole="alert" style={s.error}>Could not check saved status.</Text><Button title="Retry saved status" onPress={() => setSavedRevision(v => v + 1)} /></>
            : <Button title={savedState === 'saved' ? 'Remove from saved' : savedState === 'loading' ? 'Checking saved status…' : 'Save listing'}
                onPress={() => void toggleSaved()} disabled={busy || savedState === 'loading' || savedState === 'idle'} />}
        {session && profile && !profileError ? <ReportButton kind="listing" targetId={selected.id} label="Report listing" /> : null}
      </> : null}
      {selected.owner_id === userId && selected.status === 'active' ? <><Button title="Edit listing" onPress={() => edit(selected)} disabled={busy} />{confirmArchive ? <><Text>Archive this listing? It will disappear from public discovery.</Text><Button title="Confirm archive" onPress={() => void archive()} disabled={busy} /><Button title="Keep listing" onPress={() => setConfirmArchive(false)} disabled={busy} /></> : <Button title="Archive listing" onPress={() => setConfirmArchive(true)} disabled={busy} />}</> : null}
      <Button title={mode === 'create' ? 'Create another listing' : 'Back to listings'} onPress={() => { setSelected(null); setConfirmArchive(false); setActionError(''); setNotice(''); }} disabled={busy} />
    </View> : <>
      {!preview ? (
        <View style={s.filters}>
          <View style={s.filtersHeading}>
            <View style={s.filtersTitleGroup}>
              <Text style={s.filtersTitle}>Refine your search</Text>
              <Text style={s.hint}>Filters apply to real {category.toLowerCase()} listings.</Text>
            </View>
            <View style={s.filterActions}>
              <Button title="Refresh listings" onPress={() => setRevision(v => v + 1)} disabled={loading} />
              {session ? <>
                <Button title={own || savedOnly ? 'Browse public listings' : 'My listings'} onPress={() => {
                  if (own || savedOnly) { setOwn(false); setSavedOnly(false); }
                  else { setOwn(true); setSavedOnly(false); }
                }} />
                <Button title={savedOnly ? 'Show all listings' : 'Saved listings'} onPress={() => {
                  if (savedOnly) { setSavedOnly(false); setOwn(false); }
                  else { setOwn(false); setSavedOnly(true); }
                }} />
              </> : null}
            </View>
          </View>
          <View style={s.filterFields}>
            <View style={s.filterField}>
              <Text style={s.filterLabel}>City</Text>
              <TextInput accessibilityLabel="Filter listings by city" value={cityFilter} onChangeText={setCityFilter} placeholder="All cities" placeholderTextColor="#646B80" style={s.filterInput} />
            </View>
            <View style={s.filterField}>
              <Text style={s.filterLabel}>Maximum {kind === 'housing' ? 'monthly rent' : 'price'} (EUR)</Text>
              <TextInput accessibilityLabel="Maximum listing price (EUR)" inputMode="decimal" value={maxPrice} onChangeText={value => { if (/^\d{0,7}(\.\d{0,2})?$/.test(value)) setMaxPrice(value); }} placeholder="No maximum" placeholderTextColor="#646B80" style={s.filterInput} />
            </View>
          </View>
          {hasListingFilters ? <View style={s.clearFilters}><Button title="Clear listing filters" onPress={() => { setCityFilter(''); setMaxPrice(''); }} /></View> : null}
        </View>
      ) : null}
      <View style={s.resultsHeading}>
        <Text style={s.resultsTitle}>{savedOnly ? 'Saved listings' : own ? 'My listings' : 'Available listings'}</Text>
        {!loading && !error ? <Text style={s.resultsCaption}>{items.length} shown{more ? ' · More available' : ''}</Text> : null}
      </View>
      {loading ? <ActivityIndicator accessibilityLabel="Loading listings" /> : error ? <View><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button title="Retry listings" onPress={() => setRevision(v => v + 1)} /></View> : <>
        {!items.length ? <View style={[s.emptyListings, preview && s.emptyPreview, compactWideEmpty && s.emptyPreviewWide]}>
          <EditorialImage kind={search.trim() ? 'EmptySearch' : category === 'Housing' ? 'EmptyHousing' : 'Marketplace'} style={[s.emptyArt, compactWideEmpty && s.emptyArtWide]} cover={false} label="Stuora decorative illustration for an empty category; not a real listing" />
          <View style={[s.emptyCopy, compactWideEmpty && s.emptyCopyWide]}>
            <Text style={[s.emptyTitle, compactWideEmpty && s.emptyTitleWide]}>No {category.toLowerCase()} listings found.</Text>
            <Text style={[s.emptyCaption, compactWideEmpty && s.emptyCaptionWide]}>{search.trim()
              ? 'No listing titles match that search. Try a different term or clear the search.'
              : savedOnly ? (hasListingFilters
                ? 'No saved active listings match these filters. Clear or adjust the city and price.'
                : 'No saved active listings in this category. Save an available listing to find it here later.')
              : hasListingFilters ? 'No real listings match these filters. Clear the filters or adjust the city and maximum price.'
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
              <View style={s.listingMeta}><Icon name="location" size={15} color="#555C72" /><Text style={s.metaText}>{item.city} · {item.status}</Text></View>
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
  filters: { backgroundColor: '#FFFFFF', borderColor: '#E9EAF1', borderWidth: 1, borderRadius: 17, padding: 17, gap: 13 },
  filtersHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  filtersTitleGroup: { flexGrow: 1, gap: 2 },
  filtersTitle: { fontSize: 16, color: '#11162F', fontWeight: '900' },
  filterActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  filterFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  clearFilters: { alignSelf: 'flex-start' },
  resultsHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 9 },
  resultsTitle: { color: '#11162F', fontWeight: '900', fontSize: 17 },
  resultsCaption: { color: '#555C72', fontWeight: '700', fontSize: 12 },
  filterField: { flexGrow: 1, flexBasis: 180, minWidth: 150, gap: 7 },
  filterLabel: { fontSize: 12, fontWeight: '800', color: '#252B4A' },
  filterInput: { backgroundColor: '#FAFAFD', borderColor: '#D5D7E2', borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: '#11162F' },
  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 18, borderWidth: 1, borderColor: '#E9EAF1', gap: 14 },
  title: { fontSize: 18, fontWeight: '700', color: '#11162F' },
  text: { fontSize: 15, lineHeight: 23, color: '#252B4A' },
  hint: { color: '#555C72', fontSize: 13, lineHeight: 20 },
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
  metaText: { fontSize: 12, color: '#555C72', flexShrink: 1 },
  visual: { height: 174, backgroundColor: '#F4F1FF', alignItems: 'center', justifyContent: 'center', gap: 8 },
  cardImage: { width: '100%', height: 174, backgroundColor: '#F4F1FF' },
  price: { fontWeight: '900', color: '#11162F', fontSize: 18 },
  emptyListings: { borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', paddingVertical: 27, paddingHorizontal: 22, alignItems: 'center', gap: 12 },
  emptyPreview: { paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  emptyArt: { width: 160, height: 95, borderRadius: 12 },
  emptyArtWide: { width: 155, height: 82 },
  emptyPreviewWide: { flexDirection: 'row', justifyContent: 'center', gap: 22, minHeight: 150 },
  emptyCopy: { alignItems: 'center', gap: 8, flexShrink: 1 },
  emptyCopyWide: { alignItems: 'flex-start', maxWidth: 500 },
  emptyTitleWide: { textAlign: 'left' },
  emptyCaptionWide: { textAlign: 'left' },
  emptyIcon: { width: 64, height: 64, borderRadius: 21, backgroundColor: '#F1EDFF', justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { color: '#11162F', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyCaption: { color: '#555C72', fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 420 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrap: { width: 160, gap: 6 },
  photo: { width: 160, height: 130, borderRadius: 12, backgroundColor: '#F4F1FF' },
  removePhoto: { alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F2F3F7' },
  removePhotoText: { color: '#9C2D2D', fontWeight: '700', fontSize: 12 },
  detailPlaceholder: { minHeight: 160, borderRadius: 14, backgroundColor: '#F4F1FF', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
