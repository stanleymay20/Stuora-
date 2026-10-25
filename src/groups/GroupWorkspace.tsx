import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../backend/supabase';
import { useAuth } from '../account/AuthProvider';
import type { Database } from '../backend/database.types';
import ReportButton from '../moderation/ReportButton';

/** A stable per-group pseudonym, so members can tell authors apart without
 * exposing account ids or linking the same student across groups. */
function memberTag(groupId: string, authorId: string): string {
  let h = 0x811c9dc5;
  for (const ch of groupId + ':' + authorId) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0').slice(0, 6).toUpperCase();
}

type Group = Database['public']['Tables']['student_groups']['Row'];
type GroupMessage = Database['public']['Tables']['student_group_messages']['Row'];
type GroupMember = Pick<Database['public']['Tables']['student_group_members']['Row'], 'user_id' | 'joined_at'>;
type GroupBan = Pick<Database['public']['Tables']['student_group_bans']['Row'], 'user_id' | 'banned_at'>;
const TOPICS = ['Study', 'University', 'Housing', 'Career', 'Travel', 'Culture', 'Hobbies', 'Other'] as const;
const PAGE = 24;
function escapedLike(value: string) { return value.replace(/[\\%_]/g, '\\$&'); }

function Action({ name, onPress, disabled = false, secondary = false, label }: {
  name: string; onPress: () => void; disabled?: boolean; secondary?: boolean; label?: string;
}) {
  return <Pressable
    accessibilityRole="button" accessibilityLabel={label ?? name}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, secondary && styles.actionSecondary, disabled && styles.disabled, pressed && styles.pressed]}
  ><Text style={[styles.actionText, secondary && styles.actionSecondaryText]}>{name}</Text></Pressable>;
}

function Field({ label, value, onChange, placeholder, maxLength, multiline = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength: number; multiline?: boolean;
}) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange}
      placeholder={placeholder} placeholderTextColor="#9399A9" maxLength={maxLength}
      multiline={multiline} style={[styles.input, multiline && styles.multiline]} />
  </View>;
}

export default function GroupWorkspace({ onAccount }: { onAccount: () => void }) {
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [topic, setTopic] = useState('');
  const [pages, setPages] = useState(1);
  const [messagePages, setMessagePages] = useState(1);
  const [more, setMore] = useState(false);
  const [moreMessages, setMoreMessages] = useState(false);
  const [revision, setRevision] = useState(0);
  const [messagesRevision, setMessagesRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [issue, setIssue] = useState('');
  const [messageIssue, setMessageIssue] = useState('');
  const [actionIssue, setActionIssue] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ownerMembers, setOwnerMembers] = useState<GroupMember[]>([]);
  const [ownerBans, setOwnerBans] = useState<GroupBan[]>([]);
  const [moderationRevision, setModerationRevision] = useState(0);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [moderationIssue, setModerationIssue] = useState('');
  const [confirmRemoveUser, setConfirmRemoveUser] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupCity, setGroupCity] = useState('');
  const [groupTopic, setGroupTopic] = useState<(typeof TOPICS)[number]>('Study');
  const [draft, setDraft] = useState('');
  const chosen = groups.find(group => group.id === selectedId);
  const joined = Boolean(selectedId && memberIds.includes(selectedId));
  const owner = Boolean(chosen && userId === chosen.owner_id);

  useEffect(() => { setPages(1); setSelectedId(null); }, [search, city, topic]);
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true); setIssue('');
    const timer = setTimeout(() => { if (!ac.signal.aborted) { setIssue('Groups took too long to load.'); setLoading(false); ac.abort(); } }, 15000);
    async function load() {
      try {
        let query = supabase.from('student_groups')
          .select('id,owner_id,name,description,city,topic,created_at,updated_at')
          .order('created_at', { ascending: false }).order('id')
          .range(0, pages * PAGE).abortSignal(ac.signal);
        if (search.trim()) query = query.ilike('name', `%${escapedLike(search.trim())}%`);
        if (city.trim()) query = query.ilike('city', `%${escapedLike(city.trim())}%`);
        if (topic) query = query.eq('topic', topic);
        const [data, membership] = await Promise.all([
          query,
          userId ? supabase.from('student_group_members').select('group_id').eq('user_id', userId).abortSignal(ac.signal)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (ac.signal.aborted) return;
        if (data.error || membership.error) { setIssue('Could not load groups. Please retry.'); return; }
        const rows = data.data ?? [];
        setGroups(rows.slice(0, pages * PAGE));
        setMore(rows.length > pages * PAGE);
        setMemberIds((membership.data ?? []).map(row => row.group_id));
        setSelectedId(current => current && rows.some(g => g.id === current) ? current : null);
      } catch { if (!ac.signal.aborted) setIssue('Could not load groups. Please retry.'); }
      finally { clearTimeout(timer); if (!ac.signal.aborted) setLoading(false); }
    }
    void load();
    return () => { clearTimeout(timer); ac.abort(); };
  }, [search, city, topic, pages, revision, userId]);

  useEffect(() => {
    setMessagePages(1); setMessages([]); setDraft(''); setMessageIssue('');
  }, [selectedId, userId]);
  useEffect(() => {
    if (!selectedId || !joined || !userId) { setMessages([]); setLoadingMessages(false); return; }
    const ac = new AbortController();
    setLoadingMessages(true); setMessageIssue('');
    const timer = setTimeout(() => { if (!ac.signal.aborted) { setMessageIssue('Discussion took too long to load.'); setLoadingMessages(false); ac.abort(); } }, 15000);
    void Promise.resolve(supabase.from('student_group_messages').select('id,group_id,author_id,body,created_at')
      .eq('group_id', selectedId).order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(0, messagePages * PAGE).abortSignal(ac.signal)).then(({ data, error }) => {
        if (ac.signal.aborted) return;
        if (error) { setMessageIssue('Could not load the group discussion.'); setMessages([]); return; }
        setMoreMessages((data?.length ?? 0) > messagePages * PAGE);
        setMessages((data ?? []).slice(0, messagePages * PAGE).reverse());
      }).catch(() => { if (!ac.signal.aborted) setMessageIssue('Could not load the group discussion.'); })
      .finally(() => { clearTimeout(timer); if (!ac.signal.aborted) setLoadingMessages(false); });
    return () => { clearTimeout(timer); ac.abort(); };
  }, [selectedId, joined, userId, messagePages, messagesRevision]);

  // Membership records and ban list are owner-only; no private student profile
  // fields are requested. Clear cached moderator state when the group changes.
  useEffect(() => {
    setOwnerMembers([]); setOwnerBans([]); setModerationIssue('');
    setConfirmRemoveUser(null);
    if (!selectedId || !owner || !userId) { setModerationLoading(false); return; }
    const ac = new AbortController();
    setModerationLoading(true);
    void Promise.all([
      supabase.from('student_group_members').select('user_id,joined_at').eq('group_id', selectedId).abortSignal(ac.signal),
      supabase.from('student_group_bans').select('user_id,banned_at').eq('group_id', selectedId).abortSignal(ac.signal),
    ]).then(([members, bans]) => {
      if (ac.signal.aborted) return;
      if (members.error || bans.error) {
        setModerationIssue('Could not load group moderation data.');
        return;
      }
      setOwnerMembers(members.data ?? []);
      setOwnerBans(bans.data ?? []);
    }).catch(() => {
      if (!ac.signal.aborted) setModerationIssue('Could not load group moderation data.');
    }).finally(() => { if (!ac.signal.aborted) setModerationLoading(false); });
    return () => ac.abort();
  }, [selectedId, owner, userId, moderationRevision]);

  async function removeGroupMember(memberId: string) {
    if (!chosen || !owner || !userId || memberId === userId || confirmRemoveUser !== memberId || busy) return;
    setBusy(true); setActionIssue(''); setNotice('');
    try {
      const { error } = await supabase.rpc('remove_student_group_member', {
        p_group_id: chosen.id, p_user_id: memberId,
      });
      if (error) throw error;
      setNotice('Student removed. They cannot rejoin unless you restore access.');
      setConfirmRemoveUser(null); setModerationRevision(v => v + 1);
    } catch {
      setActionIssue('Could not remove this member. Retry or contact support.');
    } finally { setBusy(false); }
  }

  async function restoreGroupMember(memberId: string) {
    if (!chosen || !owner || !userId || busy) return;
    setBusy(true); setActionIssue(''); setNotice('');
    try {
      const { error } = await supabase.rpc('restore_student_group_member', {
        p_group_id: chosen.id, p_user_id: memberId,
      });
      if (error) throw error;
      setNotice('Access restored. The student must choose to join again.');
      setModerationRevision(v => v + 1);
    } catch {
      setActionIssue('Could not restore membership eligibility.');
    } finally { setBusy(false); }
  }

  function openCreate() {
    if (!userId || !profile) { onAccount(); return; }
    setName(''); setDescription(''); setGroupCity(profile.city?.trim() || ''); setGroupTopic('Study');
    setActionIssue(''); setNotice(''); setShowCreate(true); setEditing(false);
  }
  function editGroup(group: Group) {
    setName(group.name); setDescription(group.description); setGroupCity(group.city);
    setGroupTopic(TOPICS.includes(group.topic as (typeof TOPICS)[number]) ? group.topic as (typeof TOPICS)[number] : 'Other');
    setActionIssue(''); setNotice(''); setEditing(true); setShowCreate(true);
  }
  function closeDetails() { setSelectedId(null); setConfirmDelete(false); setActionIssue(''); setNotice(''); }

  async function saveGroup() {
    if (busy || !userId || !profile) { onAccount(); return; }
    if (name.trim().length < 3 || groupCity.trim().length < 2 || description.length > 1000) {
      setActionIssue('Add a group name and city.'); return;
    }
    setBusy(true); setActionIssue(''); setNotice('');
    try {
      if (editing && chosen && owner) {
        const { data, error } = await supabase.from('student_groups')
          .update({ name: name.trim(), description: description.trim(), city: groupCity.trim(), topic: groupTopic })
          .eq('id', chosen.id).eq('owner_id', userId).select('id').single();
        if (error || !data) throw error ?? new Error('Group update denied');
        setNotice('Group updated.');
      } else if (!editing) {
        const { data, error } = await supabase.rpc('create_student_group', {
          p_name: name.trim(), p_description: description.trim(), p_city: groupCity.trim(), p_topic: groupTopic,
        });
        if (error || !data) throw error ?? new Error('Group creation unavailable');
        setSelectedId(data); setNotice('Your group was created.');
      }
      setShowCreate(false); setRevision(n => n + 1);
    } catch (err) {
      setActionIssue(err instanceof Error && /limit reached/i.test(err.message)
        ? 'Group creation limit reached. Try again later.' : 'Could not save the group. Check your account and retry.');
    } finally { setBusy(false); }
  }

  async function changeMembership(join: boolean) {
    if (!chosen || busy) return;
    if (!userId || !profile) { onAccount(); return; }
    if (!join && owner) { setActionIssue('Group creators cannot leave. Delete your group instead.'); return; }
    setBusy(true); setActionIssue(''); setNotice('');
    try {
      const result = join
        ? await supabase.from('student_group_members').insert({ group_id: chosen.id, user_id: userId })
        : await supabase.from('student_group_members').delete().eq('group_id', chosen.id).eq('user_id', userId);
      if (result.error) throw result.error;
      if (join) setMemberIds(ids => ids.includes(chosen.id) ? ids : [...ids, chosen.id]);
      else { setMemberIds(ids => ids.filter(id => id !== chosen.id)); setMessages([]); }
      setNotice(join ? 'You joined the group.' : 'You left the group.');
      setRevision(n => n + 1);
    } catch { setActionIssue(join ? 'Could not join this group.' : 'Could not leave this group.'); }
    finally { setBusy(false); }
  }

  async function sendMessage() {
    if (!userId || !chosen || !joined || !draft.trim() || busy) return;
    setBusy(true); setActionIssue(''); setNotice('');
    try {
      const { data, error } = await supabase.rpc('send_student_group_message', { p_group_id: chosen.id, p_body: draft.trim() });
      if (error || !data) throw error ?? new Error('Message not saved');
      setDraft(''); setMessagesRevision(v => v + 1);
    } catch { setActionIssue('Message could not be sent. Verify membership and retry.'); }
    finally { setBusy(false); }
  }

  async function removeMessage(item: GroupMessage) {
    if (!userId || !(owner || item.author_id === userId) || busy) return;
    setBusy(true); setActionIssue('');
    const { error } = await supabase.from('student_group_messages').delete().eq('id', item.id).eq('group_id', item.group_id);
    if (error) setActionIssue('Could not remove that message.');
    else setMessagesRevision(v => v + 1);
    setBusy(false);
  }

  async function deleteGroup() {
    if (!chosen || !owner || !userId || !confirmDelete || busy) return;
    setBusy(true); setActionIssue('');
    const { data, error } = await supabase.from('student_groups').delete()
      .eq('id', chosen.id).eq('owner_id', userId).select('id').single();
    if (error || !data) { setActionIssue('Could not delete this group.'); setBusy(false); return; }
    closeDetails(); setRevision(v => v + 1); setBusy(false);
  }

  return <View style={styles.root}>
    <View style={styles.topRow}>
      <View style={styles.intro}>
        <Text style={styles.title}>Student Groups</Text>
        <Text style={styles.muted}>Create a public community, find your people and discuss shared interests. No invented groups.</Text>
      </View>
      <Action name="Create a group" onPress={openCreate} />
    </View>
    {actionIssue ? <Text accessibilityRole="alert" style={styles.issue}>{actionIssue}</Text> : null}
    {notice ? <Text style={styles.success}>{notice}</Text> : null}
    {showCreate ? <View style={styles.panel}>
      <Text style={styles.subtitle}>{editing ? 'Edit your group' : 'Start a student group'}</Text>
      <Field label="Group name" value={name} onChange={setName} maxLength={80} placeholder="e.g. Campus study circle" />
      <Field label="Group description" value={description} onChange={setDescription} maxLength={1000} multiline placeholder="Tell students what you plan to do together" />
      <Field label="Group city" value={groupCity} onChange={setGroupCity} maxLength={120} />
      <Text style={styles.fieldLabel}>Topic</Text>
      <View style={styles.topics}>{TOPICS.map(t => <Pressable key={t} accessibilityRole="button" accessibilityLabel={`Topic ${t}`}
        accessibilityState={{ selected: groupTopic === t }} onPress={() => setGroupTopic(t)}
        style={[styles.topic, groupTopic === t && styles.topicActive]}><Text style={groupTopic === t ? styles.topicSelectedText : styles.topicText}>{t}</Text></Pressable>)}</View>
      <View style={styles.actions}>
        <Action name={editing ? 'Save group changes' : 'Publish group'} disabled={busy} onPress={() => void saveGroup()} />
        <Action name="Cancel group form" secondary disabled={busy} onPress={() => { setShowCreate(false); setActionIssue(''); }} />
      </View>
      {!editing ? <Text style={styles.muted}>Groups are public and searchable. Student membership is required to read or write discussion messages. Up to 3 new groups per 24 hours and 10 active groups per creator.</Text> : null}
    </View> : null}
    {chosen ? <View style={styles.panel}>
      <Action name="Back to all groups" secondary onPress={closeDetails} />
      <Text style={styles.title}>{chosen.name}</Text>
      <Text style={styles.meta}>{chosen.topic} · {chosen.city}</Text>
      <Text style={styles.body}>{chosen.description || 'The creator has not added a description.'}</Text>
      <View style={styles.actions}>
        {owner ? <>
          <Text style={styles.ownerLabel}>You created this group.</Text>
          <Action name="Edit group" secondary onPress={() => editGroup(chosen)} />
          <View style={styles.moderationPanel}>
            <Text style={styles.subtitle}>Member moderation</Text>
            <Text style={styles.muted}>Removing a student blocks rejoining until you restore access. Leaving voluntarily does not block rejoining.</Text>
            <Action name="Refresh group members" secondary disabled={busy} onPress={() => setModerationRevision(v => v + 1)} />
            {moderationLoading ? <ActivityIndicator accessibilityLabel="Loading group members" /> : null}
            {moderationIssue ? <Text accessibilityRole="alert" style={styles.issue}>{moderationIssue}</Text> : null}
            {moderationIssue ? <Action name="Retry group moderation" secondary onPress={() => setModerationRevision(v => v + 1)} /> : null}
            {!moderationIssue && !moderationLoading ? <>
              {ownerMembers.filter(member => member.user_id !== userId).length === 0
                ? <Text style={styles.muted}>No other members yet.</Text> : null}
              {ownerMembers.filter(member => member.user_id !== userId).map(member =>
                <View key={member.user_id} style={styles.moderationRow}>
                  <Text style={styles.muted}>Student · {member.user_id.slice(0, 8)}</Text>
                  {confirmRemoveUser === member.user_id ? <>
                    <Text style={styles.issue}>Remove this student and block rejoining?</Text>
                    <Action name="Confirm remove member" label={`Confirm remove member ${member.user_id}`}
                      disabled={busy} onPress={() => void removeGroupMember(member.user_id)} />
                    <Action name="Cancel member removal" secondary
                      onPress={() => setConfirmRemoveUser(null)} />
                  </> : <Action name="Remove member" label={`Remove member ${member.user_id}`}
                    secondary disabled={busy} onPress={() => setConfirmRemoveUser(member.user_id)} />}
                </View>)}
              {ownerBans.length ? <Text style={styles.subtitle}>Removed students</Text> : null}
              {ownerBans.map(ban => <View key={ban.user_id} style={styles.moderationRow}>
                <Text style={styles.muted}>Student · {ban.user_id.slice(0, 8)} · rejoining blocked</Text>
                <Action name="Restore access" label={`Restore group access ${ban.user_id}`}
                  secondary disabled={busy} onPress={() => void restoreGroupMember(ban.user_id)} />
              </View>)}
            </> : null}
          </View>
          {confirmDelete ? <>
            <Text style={styles.issue}>Deleting the group also removes memberships and discussions.</Text>
            <Action name="Confirm delete group" disabled={busy} onPress={() => void deleteGroup()} />
            <Action name="Cancel group deletion" secondary onPress={() => setConfirmDelete(false)} />
          </> : <Action name="Delete group" secondary onPress={() => setConfirmDelete(true)} />}
        </> : joined ? <Action name="Leave group" secondary disabled={busy} onPress={() => void changeMembership(false)} />
          : <Action name={userId ? 'Join group' : 'Sign in to join group'} disabled={busy} onPress={() => void changeMembership(true)} />}
      </View>
      <Text style={styles.muted}>Open group: any signed-in student can join and read the discussion. Do not share phone numbers, addresses or other private details here.</Text>
      <Text style={styles.subtitle}>Group discussion</Text>
      {!userId ? <Text style={styles.muted}>Sign in and join to participate in the discussion.</Text>
        : !joined ? <Text style={styles.muted}>Join this group to read and post messages. Discussions are private to members.</Text>
          : <>
            {loadingMessages ? <ActivityIndicator accessibilityLabel="Loading group discussion" /> : null}
            {messageIssue ? <View style={styles.panel}><Text accessibilityRole="alert" style={styles.issue}>{messageIssue}</Text><Action name="Retry group discussion" onPress={() => setMessagesRevision(v => v + 1)} /></View> : null}
            {!loadingMessages && !messageIssue && !messages.length ? <Text style={styles.muted}>No messages yet. Start the discussion.</Text> : null}
            {messages.map(m => <View key={m.id} testID="student-group-message" style={styles.message}>
              <View style={styles.messageBody}>
                <Text style={styles.messageAuthor}>{m.author_id === userId ? 'You' : m.author_id === chosen.owner_id ? 'Group creator' : `Member · ${memberTag(chosen.id, m.author_id)}`}</Text>
                <Text style={styles.body}>{m.body}</Text>
                <Text style={styles.muted}>{new Date(m.created_at).toLocaleString()}</Text>
              </View>
              {owner || m.author_id === userId ? <Action name="Remove" label={`Remove group message ${m.id}`} secondary disabled={busy} onPress={() => void removeMessage(m)} /> : null}
              {owner && m.author_id !== userId ? (confirmRemoveUser === m.author_id
                ? <><Action name="Confirm remove author" label={`Confirm removing the author of message ${m.id}`} disabled={busy} onPress={() => void removeGroupMember(m.author_id)} /><Action name="Cancel" secondary onPress={() => setConfirmRemoveUser(null)} /></>
                : <Action name="Remove author" label={`Remove the author of message ${m.id} from the group`} secondary disabled={busy} onPress={() => setConfirmRemoveUser(m.author_id)} />) : null}
              {m.author_id !== userId ? <ReportButton kind="group_message" targetId={m.id} label="Report" compact /> : null}
            </View>)}
            {moreMessages ? <Action name="Load older group messages" secondary onPress={() => setMessagePages(v => v + 1)} /> : null}
            <Field label="Message to group" value={draft} onChange={setDraft} maxLength={1000} multiline placeholder="Write to your group…" />
            <Action name="Send group message" disabled={busy || !draft.trim()} onPress={() => void sendMessage()} />
            <Action name="Refresh group discussion" secondary onPress={() => setMessagesRevision(v => v + 1)} />
          </>}
    </View> : <>
      <View style={styles.filters}>
        <Field label="Search groups" value={search} onChange={setSearch} maxLength={100} placeholder="Find a group by name" />
        <Field label="Filter groups by city" value={city} onChange={setCity} maxLength={120} placeholder="All cities" />
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Topic filter</Text>
          <View style={styles.topics}>
            <Pressable accessibilityRole="button" accessibilityLabel="Topic All" accessibilityState={{ selected: !topic }} onPress={() => setTopic('')} style={[styles.topic, !topic && styles.topicActive]}><Text style={!topic ? styles.topicSelectedText : styles.topicText}>All</Text></Pressable>
            {TOPICS.map(t => <Pressable key={t} accessibilityRole="button" accessibilityLabel={`Filter topic ${t}`} accessibilityState={{ selected: topic === t }} onPress={() => setTopic(t)}
              style={[styles.topic, topic === t && styles.topicActive]}><Text style={topic === t ? styles.topicSelectedText : styles.topicText}>{t}</Text></Pressable>)}
          </View>
        </View>
        <Action name="Refresh groups" secondary onPress={() => setRevision(v => v + 1)} />
      </View>
      {loading ? <ActivityIndicator accessibilityLabel="Loading student groups" /> : issue
        ? <View style={styles.panel}><Text accessibilityRole="alert" style={styles.issue}>{issue}</Text><Action name="Retry groups" onPress={() => setRevision(v => v + 1)} /></View>
        : !groups.length ? <View style={styles.panel}><Text style={styles.subtitle}>No student groups found.</Text>
          <Text style={styles.muted}>Be the first to create one or try another search. Stuora doesn't show fictional communities.</Text></View>
          : <View style={styles.groupGrid}>{groups.map(g => <Pressable key={g.id} accessibilityRole="button"
            accessibilityLabel={`Open group ${g.name}`} onPress={() => { setSelectedId(g.id); setConfirmDelete(false); setNotice(''); setActionIssue(''); }}
            style={({ pressed }) => [styles.groupCard, pressed && styles.pressed]}>
            <Text style={styles.subtitle}>{g.name}</Text>
            <Text style={styles.meta}>{g.topic} · {g.city}</Text>
            <Text numberOfLines={3} style={styles.body}>{g.description || 'A public student group.'}</Text>
            <Text style={styles.linkText}>{g.owner_id === userId ? 'Your group' : memberIds.includes(g.id) ? 'Joined' : 'View group'} →</Text>
          </Pressable>)}</View>}
      {more ? <Action name="Load more groups" secondary onPress={() => setPages(v => v + 1)} /> : null}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: 16, width: '100%' },
  topRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14 },
  intro: { flex: 1, minWidth: 200, gap: 5 },
  title: { color: '#11162F', fontSize: 24, fontWeight: '900' },
  subtitle: { color: '#11162F', fontSize: 17, fontWeight: '900' },
  muted: { color: '#737B90', fontSize: 12, lineHeight: 19 },
  meta: { color: '#7048FF', fontSize: 12, fontWeight: '800' },
  body: { color: '#252B4A', fontSize: 14, lineHeight: 21 },
  panel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', borderRadius: 20, padding: 19, gap: 14 },
  filters: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', borderRadius: 17, padding: 14, gap: 12 },
  groupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  groupCard: { flexGrow: 1, flexBasis: 230, maxWidth: 480, minHeight: 146, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', borderRadius: 18, padding: 17, gap: 8 },
  linkText: { color: '#7048FF', fontSize: 12, fontWeight: '900' },
  field: { flexGrow: 1, gap: 6 },
  fieldLabel: { fontSize: 12, color: '#252B4A', fontWeight: '800' },
  input: { borderWidth: 1, borderColor: '#D9DAE6', borderRadius: 12, backgroundColor: '#FAFAFD', color: '#11162F', padding: 12, minHeight: 46, fontSize: 14 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  topic: { borderWidth: 1, borderColor: '#E5E2F5', backgroundColor: '#F6F6FB', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  topicActive: { borderColor: '#7048FF', backgroundColor: '#EEE9FF' },
  topicText: { color: '#555C72', fontSize: 12, fontWeight: '800' },
  topicSelectedText: { color: '#7048FF', fontSize: 12, fontWeight: '900' },
  action: { minHeight: 40, backgroundColor: '#7048FF', borderRadius: 11, alignSelf: 'flex-start', paddingHorizontal: 15, paddingVertical: 11, justifyContent: 'center' },
  actionSecondary: { backgroundColor: '#EEE9FF' },
  actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  actionSecondaryText: { color: '#7048FF' },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 9 },
  ownerLabel: { color: '#1B8E65', fontSize: 12, fontWeight: '800' },
  moderationPanel: { borderWidth: 1, borderColor: '#E4E4F4', borderRadius: 15, padding: 13, gap: 9 },
  moderationRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#EDEDF6' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
  message: { borderWidth: 1, borderColor: '#E9EAF1', backgroundColor: '#FAFAFD', borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  messageBody: { flex: 1, minWidth: 0, gap: 4 },
  messageAuthor: { color: '#11162F', fontWeight: '900', fontSize: 12 },
  issue: { color: '#9A213B', fontWeight: '800', fontSize: 12 },
  success: { color: '#197B56', fontWeight: '800', fontSize: 12 },
});
