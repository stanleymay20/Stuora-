import React, { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useAuth } from '../account/AuthProvider';
import { supabase } from '../backend/supabase';
import { Icon } from '../ui/Brand';
import type { Database } from '../backend/database.types';
import { completePosting } from '../backend/features';
import { postingKinds, type PostingCategory, type PostingKind } from '../backend/posting.contract';

type Row = Database['public']['Tables']['listings']['Row'];
type Housing = Database['public']['Tables']['housing_details']['Row'];
type Market = Database['public']['Tables']['marketplace_details']['Row'];
type Media = { id: string; listing_id: string; object_path: string; sort_order: number; created_at: string };
type Item = Omit<Row, 'kind'> & { kind: PostingKind; housing_details: Housing | null; marketplace_details: Market | null; trip_details: Database['public']['Tables']['trip_details']['Row'] | null; event_details: Database['public']['Tables']['event_details']['Row'] | null; job_details: Database['public']['Tables']['job_details']['Row'] | null; listing_media: Media[] };
type Kind = PostingKind;
type Participation = { count: number | null; capacity?: number; joined: boolean; applied: boolean; withdrawn: boolean; application_status?: string | null };
type Application = Database['public']['Tables']['job_applications']['Row'];
type Condition = Database['public']['Enums']['marketplace_condition'];
type Draft = { title: string; description: string; city: string; price: string; housingType: string; furnished: boolean; bills: boolean; condition: Condition; startsAt: string; endsAt: string; capacity: string; destination: string; venue: string; company: string; compensation: string; workplace: 'onsite' | 'hybrid' | 'remote' };

const PAGE_SIZE = 24;
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const blank = (): Draft => ({ title: '', description: '', city: 'Berlin', price: '', housingType: 'room', furnished: false, bills: false, condition: 'good', startsAt: '', endsAt: '', capacity: '10', destination: '', venue: '', company: '', compensation: '', workplace: 'onsite' });
const money = (cents: number | null) => `€${((cents ?? 0) / 100).toFixed(2)}`;

function isRateLimit(issue: unknown) { return !!issue && typeof issue === 'object' && 'code' in issue && issue.code === 'P0001'; }
function participationState(raw: unknown): Participation {
  const value = raw as Participation | null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.joined !== 'boolean' || typeof value.applied !== 'boolean' || typeof value.withdrawn !== 'boolean' ||
    !(value.count === null || (Number.isSafeInteger(value.count) && value.count >= 0)) ||
    (value.capacity !== undefined && (!Number.isSafeInteger(value.capacity) || value.capacity < 1))) throw new Error('Invalid participation response');
  return value;
}
function localDate(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value), pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
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

export default function ListingWorkspace({ category, mode = 'browse', search = '', preview = false, onAccount, onMessage }: { category: PostingCategory; mode?: 'browse' | 'create'; search?: string; preview?: boolean; onAccount: () => void; onMessage?: () => void }) {
  const { session, profile, profileLoading, initializing, error: profileError } = useAuth();
  const kind: Kind = postingKinds[category];
  const canPublishJob = profile?.account_kind === 'employer' || profile?.account_kind === 'partner';
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
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [participationError, setParticipationError] = useState('');
  const [coverNote, setCoverNote] = useState('');
  const [applications, setApplications] = useState<Application[]>([]);
  const [publisherRequest, setPublisherRequest] = useState<string | null>(null);
  const [publisherLoading, setPublisherLoading] = useState(false);
  const [publisherError, setPublisherError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetyError, setSafetyError] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState<Database['public']['Enums']['report_reason']>('spam');
  const [reportDetails, setReportDetails] = useState('');

  useEffect(() => {
    setPublisherRequest(null); setPublisherError('');
    if (kind !== 'job' || !userId || canPublishJob) { setPublisherLoading(false); return; }
    const ac = new AbortController(); setPublisherLoading(true);
    const timeout = setTimeout(() => { ac.abort(); setPublisherError('Could not load publisher access. Retry.'); setPublisherLoading(false); }, 15000);
    void Promise.resolve(supabase.from('publisher_requests').select('status').eq('user_id', userId).abortSignal(ac.signal).maybeSingle()).then(({data,error:issue}) => {
      if(ac.signal.aborted) return;
      if(issue) setPublisherError('Could not load publisher access. Retry.'); else setPublisherRequest(data?.status ?? null);
      setPublisherLoading(false);
    }).catch(() => { if(!ac.signal.aborted) { setPublisherError('Could not load publisher access. Retry.'); setPublisherLoading(false); } }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); ac.abort(); };
  }, [kind, userId, canPublishJob, revision]);

  useEffect(() => {
    setParticipation(null); setApplications([]); setParticipationError(''); setCoverNote('');
    if (!completePosting || !selected || !userId || !['trip','event','job'].includes(kind)) return;
    const ac = new AbortController();
    const timeout = setTimeout(() => { ac.abort(); setParticipationError('Could not load participation. Retry.'); },15000);
    void Promise.resolve(supabase.rpc('listing_participation',{p_listing_id:selected.id,p_action:'state'}).abortSignal(ac.signal)).then(async ({data,error:issue}) => {
      if(ac.signal.aborted) return;
      if(issue || !data || typeof data !== 'object' || Array.isArray(data)) throw issue ?? new Error('Missing participation');
      setParticipation(participationState(data));
      if(kind==='job' && selected.owner_id===userId) {
        const result = await supabase.from('job_applications').select('*').eq('job_listing_id',selected.id).order('created_at',{ascending:false}).abortSignal(ac.signal);
        if(ac.signal.aborted) return;
        if(result.error) throw result.error; setApplications(result.data ?? []);
      }
    }).catch(() => { if(!ac.signal.aborted) setParticipationError('Could not load participation. Retry.'); }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); ac.abort(); };
  }, [selected?.id, userId, kind, revision]);

  useEffect(() => {
    setBlocked(false); setSafetyError(''); setShowReport(false); setReportDetails('');
    if(!completePosting || !selected || !userId || selected.owner_id===userId) { setSafetyLoading(false); return; }
    const ac=new AbortController(); setSafetyLoading(true);
    const timeout=setTimeout(() => { ac.abort(); setSafetyError('Could not load contact controls. Retry.'); setSafetyLoading(false); },15000);
    void Promise.resolve(supabase.from('user_blocks').select('blocked_id').eq('blocker_id',userId).eq('blocked_id',selected.owner_id).abortSignal(ac.signal).maybeSingle()).then(({data,error:issue}) => {
      if(ac.signal.aborted) return;
      if(issue) setSafetyError('Could not load contact controls. Retry.'); else setBlocked(!!data);
      setSafetyLoading(false);
    }).catch(() => { if(!ac.signal.aborted) { setSafetyError('Could not load contact controls. Retry.'); setSafetyLoading(false); } }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); ac.abort(); };
  }, [selected?.id,userId,revision]);

  async function act(action: string) {
    if(!selected || !userId) { onAccount(); return; }
    setBusy(true); setActionError(''); setNotice('');
    try {
      const {data,error:issue}=await supabase.rpc('listing_participation',{p_listing_id:selected.id,p_action:action,p_note:coverNote.trim()});
      if(issue || !data || typeof data!=='object' || Array.isArray(data)) throw issue ?? new Error('Missing participation');
      setParticipation(participationState(data));
      setNotice(action==='join' ? 'Participation confirmed. No payment has been taken.' : action==='leave' ? 'Participation cancelled.' : action==='apply' ? 'Application submitted to the publisher.' : 'Application withdrawn.');
    } catch (issue) { setActionError(isRateLimit(issue) ? 'Action limit reached. Your note is preserved; try again later.' : 'Could not complete this action. The listing may be full, started, closed or contact-restricted. Your note is preserved; retry.'); }
    finally { setBusy(false); }
  }
  async function review(applicationId: string, status: 'reviewing' | 'accepted' | 'rejected') {
    setBusy(true); setActionError('');
    try { const {error:issue}=await supabase.rpc('review_job_application',{p_application_id:applicationId,p_status:status}); if(issue) throw issue; setRevision(v=>v+1); setNotice('Application status saved.'); }
    catch { setActionError('Could not update this application. Retry.'); } finally { setBusy(false); }
  }
  async function requestPublisher() {
    if(!userId) return onAccount();
    if(draft.company.trim().length<2 || draft.description.trim().length<10) return setActionError('Enter your company and at least 10 characters about your organization.');
    setBusy(true); setActionError('');
    try { const {error:issue}=await supabase.from('publisher_requests').insert({user_id:userId,company_name:draft.company.trim(),details:draft.description.trim()}); if(issue) throw issue; setPublisherRequest('pending'); setNotice('Publisher request submitted. Publishing requires a human review.'); }
    catch { setActionError('Could not submit the publisher request. Your input is preserved; retry.'); } finally { setBusy(false); }
  }
  async function toggleBlock() {
    if(!selected || !userId) return;
    setBusy(true); setActionError('');
    try {
      const result=blocked ? await supabase.from('user_blocks').delete().eq('blocker_id',userId).eq('blocked_id',selected.owner_id).select('blocked_id') : await supabase.from('user_blocks').insert({blocker_id:userId,blocked_id:selected.owner_id}).select('blocked_id');
      if(result.error || !result.data?.length) throw result.error ?? new Error('Block not saved');
      setBlocked(!blocked); setNotice(blocked ? 'Author unblocked.' : 'Author blocked. Messaging and new participation are prevented in both directions.');
    } catch { setActionError('Could not change this block. Retry.'); } finally { setBusy(false); }
  }
  async function reportListing() {
    if(!selected || !userId) return;
    setBusy(true); setActionError('');
    try { const {error:issue}=await supabase.from('reports').insert({reporter_id:userId,listing_id:selected.id,reported_user_id:selected.owner_id,reason:reportReason,details:reportDetails.trim()}); if(issue) throw issue; setShowReport(false); setNotice('Report submitted for review. This does not automatically remove the listing.'); }
    catch { setActionError('Could not submit the report. Your text is preserved; retry.'); } finally { setBusy(false); }
  }

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
      .select('*,housing_details(*),marketplace_details(*),trip_details(*),job_details(*),event_details(*),listing_media(id,listing_id,object_path,sort_order,created_at)')
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
      .select('*,housing_details(*),marketplace_details(*),trip_details(*),job_details(*),event_details(*),listing_media(id,listing_id,object_path,sort_order,created_at)')
      .eq('id', id)
      .single();
    if (issue || !data) throw issue ?? new Error('Listing not found');
    return normalizeItem(data);
  }
  function edit(item: Item) {
    setDraft({ title: item.title, description: item.description, city: item.city, price: ((item.price_cents ?? 0) / 100).toFixed(2), housingType: item.housing_details?.housing_type ?? 'room', furnished: item.housing_details?.furnished ?? false, bills: item.housing_details?.bills_included ?? false, condition: item.marketplace_details?.item_condition ?? 'good', startsAt: localDate(item.trip_details?.starts_at ?? item.event_details?.starts_at), endsAt: localDate(item.trip_details?.ends_at ?? item.event_details?.ends_at), capacity: String(item.trip_details?.capacity ?? item.event_details?.capacity ?? 10), destination: item.trip_details?.destination ?? '', venue: item.event_details?.venue_name ?? '', company: item.job_details?.company_name ?? '', compensation: item.job_details?.compensation_text ?? '', workplace: item.job_details?.workplace_mode ?? 'onsite' });
    setEditing(true); setActionError(''); setNotice('');
  }

  async function save() {
    setActionError(''); setNotice('');
    if (draft.title.trim().length < 3 || draft.title.trim().length > 140) return setActionError('Title must be between 3 and 140 characters.');
    if (draft.city.trim().length < 2 || draft.city.trim().length > 120) return setActionError('City must be between 2 and 120 characters.');
    if (draft.description.trim().length > 4000) return setActionError('Description must be at most 4000 characters.');
    if (kind !== 'post' && kind !== 'job' && !/^\d{1,7}(\.\d{1,2})?$/.test(draft.price.trim())) return setActionError('Enter a EUR price from 0 to 9999999.99, with up to two decimal places.');
    const cents = kind === 'post' || kind === 'job' ? 0 : Math.round(Number(draft.price.trim()) * 100);
    if (kind === 'post' && !draft.description.trim()) return setActionError('Write something for your community post.');
    let startsAt: string | null = null, endsAt: string | null = null;
    if (kind === 'trip' || kind === 'event') {
      const start = new Date(draft.startsAt.replace(' ', 'T'));
      const end = draft.endsAt ? new Date(draft.endsAt.replace(' ', 'T')) : null;
      if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now() || (end && (!Number.isFinite(end.getTime()) || end < start))) return setActionError('Enter a future start date and an end date after the start.');
      if (!/^\d+$/.test(draft.capacity) || Number(draft.capacity) < (kind === 'trip' ? 2 : 1) || Number(draft.capacity) > 100) return setActionError('Capacity must be a whole number up to 100.');
      if ((kind === 'trip' ? draft.destination : draft.venue).trim().length < 2) return setActionError(kind === 'trip' ? 'Enter a destination.' : 'Enter a venue.');
      startsAt = start.toISOString(); endsAt = end?.toISOString() ?? null;
    }
    if (kind === 'job' && (!canPublishJob || draft.company.trim().length < 2 || !draft.compensation.trim())) return setActionError('Approved publisher access, company and compensation are required.');
    setBusy(true);
    try {
      const result = kind === 'housing' || kind === 'marketplace' ? await supabase.rpc('save_student_listing', { p_id: editing ? selected!.id : null, p_kind: kind, p_title: draft.title.trim(), p_description: draft.description.trim(), p_city: draft.city.trim(), p_price_cents: cents, p_housing_type: draft.housingType, p_furnished: draft.furnished, p_bills_included: draft.bills, p_condition: draft.condition }) : await supabase.rpc('save_community_listing', {
        p_id: editing ? selected!.id : null, p_kind: kind, p_title: draft.title.trim(), p_description: draft.description.trim(), p_city: draft.city.trim(), p_price_cents: cents,
        p_details: { destination: draft.destination.trim(), venue_name: draft.venue.trim(), starts_at: startsAt, ends_at: endsAt, capacity: Number(draft.capacity), company_name: draft.company.trim(), compensation_text: draft.compensation.trim(), workplace_mode: draft.workplace },
      });
      const { data: savedId, error: issue } = result;
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
    } catch (issue) {
      setActionError(isRateLimit(issue) ? 'Posting limit reached. Your input is preserved; try again later.' : 'Could not save. Your input is preserved. Check your connection and account, then retry.');
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
      const { error: issue } = await supabase.rpc('start_listing_conversation', { p_listing_id: selected.id });
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

    {form ? initializing || profileLoading ? <ActivityIndicator accessibilityLabel="Loading account" /> : !session || !profile || profileError ? <View style={s.card}><Text style={s.text}>Sign in and complete your profile to publish a listing.</Text><Button title="Open account" onPress={onAccount} /></View> : kind==='job' && !canPublishJob ? <View style={s.card}>
      <Text style={s.title}>Job publishing requires approved publisher access</Text>
      <Text style={s.hint}>Employers and partners can publish after a human review. Students can browse and apply for free.</Text>
      {publisherLoading ? <ActivityIndicator accessibilityLabel="Loading publisher access" /> : publisherError ? <><Text accessibilityRole="alert">{publisherError}</Text><Button title="Retry publisher access" onPress={()=>setRevision(v=>v+1)} /></> : publisherRequest ? <Text>Publisher request: {publisherRequest}. Your account permissions determine publishing access.</Text> : <><Field label="Company name" value={draft.company} onChange={v=>change('company',v)} /><Field label="About your organization" value={draft.description} onChange={v=>change('description',v)} multiline /><Button title="Request publisher access" onPress={()=>void requestPublisher()} disabled={busy} /></>}
    </View> : <View style={s.card}>
      <Text style={s.title}>{editing ? 'Edit listing' : `Publish ${category.toLowerCase()} listing`}</Text>
      <Text style={s.hint}>Publish the listing first, then attach up to six JPEG, PNG or WebP photos (5 MB each).</Text>
      <Field label="Listing title" value={draft.title} onChange={v => change('title', v)} />
      <Field label="Listing description" value={draft.description} onChange={v => change('description', v)} multiline />
      <Field label="Listing city" value={draft.city} onChange={v => change('city', v)} />
      {kind!=='post' && kind!=='job' ? <Field label={kind === 'housing' ? 'Monthly rent (EUR)' : 'Price (EUR)'} value={draft.price} onChange={v => change('price', v)} /> : null}
      {kind==='housing' || kind==='marketplace' ? <>
      <Text style={s.label}>{kind === 'housing' ? 'Housing type' : 'Item condition'}</Text>
      <View style={s.wrap}>{(kind === 'housing' ? ['room', 'wg', 'studio', 'apartment', 'sublet', 'temporary'] : ['new', 'like_new', 'good', 'fair']).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value} accessibilityState={{ selected: value === (kind === 'housing' ? draft.housingType : draft.condition) }} onPress={() => kind === 'housing' ? change('housingType', value) : change('condition', value as Condition)} style={[s.choice, value === (kind === 'housing' ? draft.housingType : draft.condition) && s.chosen]}><Text>{value.replace('_', ' ')}</Text></Pressable>)}</View>
      {kind === 'housing' ? <><Toggle label="Furnished" value={draft.furnished} onChange={v => change('furnished', v)} /><Toggle label="Bills included" value={draft.bills} onChange={v => change('bills', v)} /></> : <Text style={s.hint}>One item · pickup only.</Text>}
      </> : null}
      {kind==='trip' || kind==='event' ? <>
        <Field label={kind==='trip' ? 'Destination' : 'Venue'} value={kind==='trip' ? draft.destination : draft.venue} onChange={v=>kind==='trip' ? change('destination',v) : change('venue',v)} />
        <Text style={s.hint}>Dates use your local time. Enter YYYY-MM-DD HH:MM, for example 2026-12-20 18:00.</Text>
        <Field label="Start date and time" value={draft.startsAt} onChange={v=>change('startsAt',v)} />
        <Field label="End date and time (optional)" value={draft.endsAt} onChange={v=>change('endsAt',v)} />
        <Field label="Capacity" value={draft.capacity} onChange={v=>change('capacity',v)} />
        <Text style={s.hint}>Capacity counts participants, excluding the organizer. No payment or travel booking is processed by Stuora.</Text>
      </> : null}
      {kind==='job' ? <><Field label="Company name" value={draft.company} onChange={v=>change('company',v)} /><Field label="Compensation" value={draft.compensation} onChange={v=>change('compensation',v)} /><View style={s.wrap}>{(['onsite','hybrid','remote'] as const).map(value=><Button key={value} title={value} onPress={()=>change('workplace',value)} disabled={draft.workplace===value} />)}</View></> : null}
      <Button title={busy ? 'Saving listing…' : editing ? 'Save listing changes' : 'Publish listing'} onPress={() => void save()} disabled={busy} />
      {editing ? <Button title="Cancel editing" onPress={() => { setEditing(false); setActionError(''); }} disabled={busy} /> : null}
    </View> : selected ? <View style={s.card}>
      <Text style={s.title}>{selected.title}</Text>
      <View style={s.photoGrid}>{selected.listing_media.map((media, index) => <Photo key={media.id} media={media} title={selected.title} index={index} removable={selected.owner_id === userId} disabled={busy} onRemove={() => void removePhoto(media)} />)}</View>
      {!selected.listing_media.length ? <View style={s.detailPlaceholder}><Icon name={kind === 'housing' ? 'housing' : 'marketplace'} size={48} color="#7048FF" /><Text style={s.hint}>No photos yet</Text></View> : null}
      {kind!=='post' && kind!=='job' ? <Text style={s.price}>{money(selected.price_cents)}{kind === 'housing' ? ' / month' : ''}</Text> : null}<Text>{selected.city} · {selected.status}</Text>
      <Text style={s.text}>{selected.description || 'No description provided.'}</Text>
      {selected.housing_details ? <Text>{selected.housing_details.housing_type} · {selected.housing_details.furnished ? 'Furnished' : 'Unfurnished'} · {selected.housing_details.bills_included ? 'Bills included' : 'Bills extra'}</Text> : null}
      {selected.marketplace_details ? <Text>Condition: {selected.marketplace_details.item_condition.replace('_', ' ')} · pickup only</Text> : null}
      {selected.owner_id === userId && selected.status === 'active' ? <Button title={busy ? 'Working…' : `Add photo (${selected.listing_media.length}/${MAX_PHOTOS})`} onPress={() => void addPhoto()} disabled={busy || selected.listing_media.length >= MAX_PHOTOS} /> : null}
      {selected.trip_details || selected.event_details ? <Text style={s.text}>{selected.trip_details?.destination ?? selected.event_details?.venue_name} · {new Date((selected.trip_details?.starts_at ?? selected.event_details?.starts_at)!).toLocaleString()}</Text> : null}
      {selected.job_details ? <Text style={s.text}>{selected.job_details.company_name} · {selected.job_details.compensation_text} · {selected.job_details.workplace_mode}</Text> : null}
      {['trip','event','job'].includes(kind) && session ? <View style={s.card}>
        {participationError ? <><Text accessibilityRole="alert" style={s.error}>{participationError}</Text><Button title="Retry participation" onPress={()=>setRevision(v=>v+1)} /></> : !participation ? <ActivityIndicator accessibilityLabel="Loading participation" /> : kind==='job' ? selected.owner_id===userId ? <>
          <Text style={s.title}>Applications</Text>{!applications.length ? <Text>No applications yet.</Text> : applications.map(app=><View key={app.id} style={s.card}><Text>{app.cover_note || 'No cover note'} · {app.withdrawn_at ? 'withdrawn' : app.status}</Text>{!app.withdrawn_at ? <View style={s.wrap}>{(['reviewing','accepted','rejected'] as const).map(status=><Button key={status} title={`Mark ${status}`} onPress={()=>void review(app.id,status)} disabled={busy} />)}</View> : null}</View>)}
        </> : participation.applied ? <><Text>Application: {participation.withdrawn ? 'withdrawn' : participation.application_status}</Text>{!participation.withdrawn ? <Button title="Withdraw application" onPress={()=>void act('withdraw')} disabled={busy} /> : null}</> : <><Field label="Cover note (optional)" value={coverNote} onChange={setCoverNote} multiline /><Button title="Apply for job" onPress={()=>void act('apply')} disabled={busy || blocked || selected.status!=='active'} /></> : <>
          <Text>{participation.count} / {participation.capacity} participants</Text>
          {selected.owner_id!==userId ? <Button title={participation.joined ? 'Leave participation' : kind==='trip' ? 'Join trip' : 'Attend event'} onPress={()=>void act(participation.joined ? 'leave' : 'join')} disabled={busy || (!participation.joined && (blocked || selected.status!=='active'))} /> : <Text>You organize this listing.</Text>}
        </>}
      </View> : null}
      {completePosting && session && selected.owner_id!==userId ? <View style={s.card}>
        {safetyLoading ? <ActivityIndicator accessibilityLabel="Loading contact controls" /> : safetyError ? <><Text accessibilityRole="alert">{safetyError}</Text><Button title="Retry contact controls" onPress={()=>setRevision(v=>v+1)} /></> : <Button title={blocked ? 'Unblock author' : 'Block author'} onPress={()=>void toggleBlock()} disabled={busy} />}
        <Button title="Report listing" onPress={()=>setShowReport(v=>!v)} disabled={busy} />
        {showReport ? <><View style={s.wrap}>{(['spam','fraud','harassment','unsafe','prohibited','other'] as const).map(reason=><Pressable key={reason} accessibilityRole="button" accessibilityLabel={`Report reason ${reason}`} onPress={()=>setReportReason(reason)} style={[s.choice,reason===reportReason && s.chosen]}><Text>{reason}</Text></Pressable>)}</View><Field label="Report details" value={reportDetails} onChange={setReportDetails} multiline /><Button title="Submit report" onPress={()=>void reportListing()} disabled={busy} /></> : null}
      </View> : null}
      {selected.owner_id !== userId && selected.status === 'active' ? <Button title={session && profile ? 'Message owner' : 'Sign in to message owner'} onPress={() => void messageOwner()} disabled={busy || blocked || safetyLoading || !!safetyError} /> : null}
      {selected.owner_id === userId && selected.status === 'active' ? <><Button title="Edit listing" onPress={() => edit(selected)} disabled={busy} />{confirmArchive ? <><Text>Archive this listing? It will disappear from public discovery.</Text><Button title="Confirm archive" onPress={() => void archive()} disabled={busy} /><Button title="Keep listing" onPress={() => setConfirmArchive(false)} disabled={busy} /></> : <Button title="Archive listing" onPress={() => setConfirmArchive(true)} disabled={busy} />}</> : null}
      <Button title={mode === 'create' ? 'Create another listing' : 'Back to listings'} onPress={() => { setSelected(null); setConfirmArchive(false); setActionError(''); setNotice(''); }} disabled={busy} />
    </View> : <>
      {!preview ? <View style={s.wrap}><Button title="Refresh listings" onPress={() => setRevision(v => v + 1)} disabled={loading} />{session ? <Button title={own ? 'Browse public listings' : 'My listings'} onPress={() => setOwn(v => !v)} /> : null}</View> : null}
      <Text style={s.hint}>{own ? 'Your listings, including archived posts.' : 'Active listings from the community.'}{search ? ' Search matches titles.' : ''}</Text>
      {loading ? <ActivityIndicator accessibilityLabel="Loading listings" /> : error ? <View><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button title="Retry listings" onPress={() => setRevision(v => v + 1)} /></View> : <>
        {!items.length ? <Text style={s.text}>No {category.toLowerCase()} listings found.</Text> : null}
        <View style={s.grid}>{(preview ? items.slice(0, 4) : items).map(item => {
          const cover = item.listing_media[0];
          return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`View ${item.title}`} onPress={() => { setSelected(item); setNotice(''); setActionError(''); }} style={s.listing}>
            {cover ? <Image source={{ uri: mediaUrl(cover.object_path) }} accessibilityLabel={`${item.title} cover photo`} style={s.cardImage} resizeMode="cover" /> : <View style={s.visual}><Icon name={kind === 'housing' ? 'housing' : 'marketplace'} size={44} color="#7048FF" /><Text style={s.hint}>No photo</Text></View>}
            <Text style={s.title}>{item.title}</Text>{kind!=='post' && kind!=='job' ? <Text style={s.price}>{money(item.price_cents)}{kind === 'housing' ? ' / month' : ''}</Text> : null}<Text>{item.city} · {item.status}</Text>
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
  listing: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', borderRadius: 16, padding: 12, gap: 8, minWidth: 220, flexGrow: 1, flexBasis: 220, maxWidth: 420 },
  visual: { height: 150, borderRadius: 12, backgroundColor: '#F4F1FF', alignItems: 'center', justifyContent: 'center', gap: 8 },
  cardImage: { width: '100%', height: 170, borderRadius: 12, backgroundColor: '#F4F1FF' },
  price: { fontWeight: '800', color: '#11162F', fontSize: 17 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrap: { width: 160, gap: 6 },
  photo: { width: 160, height: 130, borderRadius: 12, backgroundColor: '#F4F1FF' },
  removePhoto: { alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F2F3F7' },
  removePhotoText: { color: '#9C2D2D', fontWeight: '700', fontSize: 12 },
  detailPlaceholder: { minHeight: 160, borderRadius: 14, backgroundColor: '#F4F1FF', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
