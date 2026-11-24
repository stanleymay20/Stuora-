import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useAuth } from '../account/AuthProvider';
import { supabase } from '../backend/supabase';
import { Icon } from '../ui/Brand';
import { EditorialImage } from '../ui/EditorialImage';
import ReportButton from '../moderation/ReportButton';

type SafetyState = { closed: boolean; blocked_by_me: boolean; other_member_left: boolean };
const POLL_MS = 20000;

type Conversation = { id: string; title: string; created_at: string };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
const MESSAGES_PAGE_SIZE = 50;

function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[s.button, disabled && s.disabled]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}

export default function MessageWorkspace({ onAccount, preferredConversationId }: { onAccount: () => void; preferredConversationId?: string | null }) {
  const { session, profile, profileLoading, initializing, error: profileError } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 760;
  const userId = session?.user.id;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const consumedPreferredId = useRef<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [messagePages, setMessagePages] = useState(1);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [threadIssue, setThreadIssue] = useState('');
  const [messageIssue, setMessageIssue] = useState('');
  const [sendIssue, setSendIssue] = useState('');
  const [revision, setRevision] = useState(0);
  const [liveTick, setLiveTick] = useState(0);
  const silentReload = useRef(false);
  const [safety, setSafety] = useState<SafetyState | null>(null);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [safetyTick, setSafetyTick] = useState(0);
  const selected = useMemo(() => conversations.find(item => item.id === selectedId) ?? null, [conversations, selectedId]);
  // Ignore late send completions after a conversation or account switch.
  const activeChat = useRef({ selectedId, userId });
  activeChat.current = { selectedId, userId };

  useEffect(() => {
    if (!userId || !profile) { setConversations([]); setSelectedId(null); return; }
    const ac = new AbortController();
    setLoadingThreads(true); setThreadIssue('');
    const timeout = setTimeout(() => { setThreadIssue('Could not load conversations. Check your connection and retry.'); setLoadingThreads(false); ac.abort(); }, 15000);
    const query = supabase.from('conversations').select('id,title,created_at').order('created_at', { ascending: false }).order('id').limit(50).abortSignal(ac.signal);
    void Promise.resolve(query).then(({ data, error }) => {
      if (ac.signal.aborted) return;
      if (error) setThreadIssue('Could not load conversations. Check your connection and retry.');
      else {
        const rows = (data ?? []) as Conversation[];
        setConversations(rows);
        // Honor the listing handoff once. Subsequent send/refresh must not override a thread manually selected by the student.
        const applyHandoff = Boolean(preferredConversationId && consumedPreferredId.current !== preferredConversationId);
        if (applyHandoff) consumedPreferredId.current = preferredConversationId!;
        setSelectedId(current => applyHandoff ? (rows.some(row => row.id === preferredConversationId) ? preferredConversationId! : null) : current && rows.some(row => row.id === current) ? current : rows[0]?.id ?? null);
      }
      setLoadingThreads(false);
    }).catch(() => { if (!ac.signal.aborted) { setThreadIssue('Could not load conversations. Check your connection and retry.'); setLoadingThreads(false); } }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); ac.abort(); };
  }, [userId, profile, revision, preferredConversationId]);

  // Never reuse unsent text from another conversation or show the previous member's messages.
  useEffect(() => { setDraft(''); setMessages([]); setMessagePages(1); setHasOlderMessages(false); setMessageIssue(''); setSendIssue(''); }, [selectedId, userId]);

  // Gen-3 audit D-07: closed-thread state and blocking for the open conversation.
  useEffect(() => {
    setSafety(null);
    if (!selectedId || !userId) return;
    let alive = true;
    void supabase.rpc('conversation_safety_state', { p_conversation: selectedId }).then(({ data, error }) => {
      if (alive && !error && data && typeof data === 'object') setSafety(data as SafetyState);
    }, () => { /* Unknown state: the server still enforces closure and blocks. */ });
    return () => { alive = false; };
  }, [selectedId, userId, revision, safetyTick]);

  // Live updates: Realtime (RLS-filtered) with a polling fallback.
  useEffect(() => {
    if (!selectedId || !userId) return;
    let subscribed = false;
    const bump = () => { silentReload.current = true; setLiveTick(v => v + 1); };
    const channel = supabase.channel(`messages:${selectedId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedId}` }, bump)
      .subscribe(status => { subscribed = status === 'SUBSCRIBED'; });
    const poll = setInterval(() => { if (!subscribed) bump(); }, POLL_MS);
    return () => { clearInterval(poll); void supabase.removeChannel(channel); };
  }, [selectedId, userId]);

  useEffect(() => {
    if (!selectedId || !userId) { setMessages([]); setHasOlderMessages(false); return; }
    const ac = new AbortController();
    const quiet = silentReload.current;
    silentReload.current = false;
    if (!quiet) setLoadingMessages(true);
    setMessageIssue('');
    const timeout = setTimeout(() => { setMessageIssue('Could not load messages. Check your connection and retry.'); setLoadingMessages(false); ac.abort(); }, 15000);
    // Fetch the NEWEST messages, then display them chronologically. Older messages are explicitly pageable.
    const pageLimit = messagePages * MESSAGES_PAGE_SIZE;
    const query = supabase.from('messages').select('id,conversation_id,sender_id,body,created_at').eq('conversation_id', selectedId)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(0, pageLimit).abortSignal(ac.signal);
    void Promise.resolve(query).then(({ data, error }) => {
      if (ac.signal.aborted) return;
      if (error) {
        setMessages([]); setHasOlderMessages(false);
        setMessageIssue('Could not load messages. Check your connection and retry.');
      } else {
        const recent = (data ?? []) as Message[];
        setHasOlderMessages(recent.length > pageLimit);
        setMessages(recent.slice(0, pageLimit).reverse());
      }
      setLoadingMessages(false);
    }).catch(() => { if (!ac.signal.aborted) { setMessageIssue('Could not load messages. Check your connection and retry.'); setLoadingMessages(false); } }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); ac.abort(); };
  }, [selectedId, userId, revision, messagePages, liveTick]);

  async function send() {
    if (sending) return;
    const body = draft.trim();
    setSendIssue('');
    if (!userId || !selectedId || !body) return;
    if (body.length > 4000) return setSendIssue('Messages must be 4,000 characters or fewer.');
    const sendingTo = selectedId;
    const sendingAs = userId;
    setSending(true);
    try {
      const { error } = await supabase.from('messages').insert({ conversation_id: sendingTo, sender_id: sendingAs, body });
      if (error) {
        if (activeChat.current.selectedId === sendingTo) {
          if (error.code === '42501') { setSafetyTick(v => v + 1); setSendIssue('You cannot send messages in this conversation. Your text is preserved.'); return; }
          if (error.code === 'P0001') { setSendIssue('You are sending messages very quickly. Wait a moment and try again.'); return; }
        }
        throw error;
      }
      if (activeChat.current.selectedId === sendingTo && activeChat.current.userId === sendingAs) {
        setDraft(current => current.trim() === body ? '' : current);
        setRevision(value => value + 1);
      }
    } catch {
      if (activeChat.current.selectedId === sendingTo && activeChat.current.userId === sendingAs) {
        setSendIssue('Could not send your message. Your text is preserved; check your connection and retry.');
      }
    } finally { setSending(false); }
  }

  async function toggleBlock() {
    if (!selectedId || !safety || safetyBusy) return;
    setSafetyBusy(true);
    const next = !safety.blocked_by_me;
    const { error } = await supabase.rpc('set_conversation_block', { p_conversation: selectedId, p_block: next });
    setSafetyBusy(false);
    if (error) { setSendIssue(next ? 'Could not block this person. Please retry.' : 'Could not unblock this person. Please retry.'); return; }
    setSafety({ ...safety, blocked_by_me: next });
  }
  const composerLocked = !!safety && (safety.closed || safety.other_member_left);

  if (initializing || profileLoading) return <View style={s.center}><ActivityIndicator accessibilityLabel="Loading messages account" /></View>;
  if (!session || !profile || profileError) return <View style={s.page}><Text style={s.pageTitle}>Messages</Text><View style={s.empty}><Icon name="messages" size={42} color="#7048FF" /><Text style={s.emptyTitle}>Sign in to use secure messaging</Text><Text style={s.muted}>Conversations are private to their members and are backed by Stuora's access policies.</Text><Button title="Open account" onPress={onAccount} /></View></View>;

  return <View style={s.page}>
    <View style={s.header}><View><Text style={s.pageTitle}>Messages</Text><Text style={s.muted}>Private listing conversations · persisted in Stuora.</Text></View><Button title="Refresh messages" onPress={() => setRevision(value => value + 1)} disabled={loadingThreads || loadingMessages} /></View>
    <View style={[s.shell, !isDesktop && s.shellMobile]}>
      <View style={[s.threadPane, !isDesktop && s.threadPaneMobile]}>
        {loadingThreads ? <ActivityIndicator accessibilityLabel="Loading conversations" /> : threadIssue ? <View style={s.stack}><Text accessibilityRole="alert" style={s.error}>{threadIssue}</Text><Button title="Retry conversations" onPress={() => setRevision(value => value + 1)} /></View> : !conversations.length ? <View style={s.emptyCompact}><EditorialImage kind="EmptyMessages" style={s.emptyImage} cover={false} label="Decorative Stuora illustration for an empty inbox, not a real message" /><Text style={s.emptyTitle}>No conversations yet</Text><Text style={s.muted}>Open an active Housing or Marketplace listing and choose Message owner.</Text></View> : <ScrollView contentContainerStyle={s.threadList}>{conversations.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open conversation ${item.title}`} onPress={() => setSelectedId(item.id)} style={[s.thread, item.id === selectedId && s.threadActive]}><View style={s.threadIcon}><Icon name="messages" size={20} color="#7048FF" /></View><View style={s.threadCopy}><Text numberOfLines={1} style={s.threadTitle}>{item.title || 'Stuora conversation'}</Text><Text style={s.threadDate}>{new Date(item.created_at).toLocaleDateString()}</Text></View></Pressable>)}</ScrollView>}
      </View>
      <View style={[s.conversationPane, !isDesktop && s.conversationPaneMobile]}>
        {!selected ? <View style={s.empty}><Text style={s.muted}>{preferredConversationId && !loadingThreads ? 'This listing conversation is not accessible. Refresh Messages or return to the listing.' : 'Select a conversation.'}</Text></View> : <>
          <View style={s.conversationHeader}><Icon name="messages" size={22} color="#7048FF" /><View><Text style={s.conversationTitle}>{selected.title || 'Stuora conversation'}</Text><Text style={s.threadDate}>Only conversation members can read or send messages.</Text></View>
            {safety && !safety.other_member_left ? <View style={s.headerActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={safety.blocked_by_me ? 'Unblock this person' : 'Block this person'} disabled={safetyBusy} onPress={() => void toggleBlock()} style={s.safetyButton}><Text style={s.safetyText}>{safety.blocked_by_me ? 'Unblock' : 'Block'}</Text></Pressable>
            </View> : null}
          </View>
          {safety?.closed ? <Text testID="conversation-closed" style={s.banner}>This listing has been closed, so the conversation is closed. You can still read earlier messages.</Text> : null}
          {safety?.other_member_left ? <Text style={s.banner}>The other person has left this conversation.</Text> : null}
          {safety?.blocked_by_me ? <Text style={s.banner}>You blocked this person. They cannot start new conversations with you.</Text> : null}
          <ScrollView contentContainerStyle={s.messageList}>
            {loadingMessages ? <ActivityIndicator accessibilityLabel="Loading conversation messages" /> : messageIssue ? null : <>
              {hasOlderMessages ? <Button title="Load older messages" onPress={() => setMessagePages(value => value + 1)} /> : null}
              {!messages.length ? <Text style={s.muted}>No messages yet. Say hello.</Text> : messages.map(message => { const own = message.sender_id === userId; return <View key={message.id} style={[s.bubble, own ? s.bubbleOwn : s.bubbleOther]}><Text style={own ? s.bubbleOwnText : s.bubbleText}>{message.body}</Text><View style={s.bubbleMeta}><Text style={[s.messageTime, own && s.messageTimeOwn]}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>{!own ? <ReportButton kind="message" targetId={message.id} compact /> : null}</View></View>; })}
            </>}
          </ScrollView>
          {messageIssue ? <Text accessibilityRole="alert" style={s.error}>{messageIssue}</Text> : null}
          {sendIssue ? <Text accessibilityRole="alert" style={s.error}>{sendIssue}</Text> : null}
          <View style={s.composer}><TextInput accessibilityLabel="Message" value={draft} onChangeText={setDraft} editable={!composerLocked} placeholder={composerLocked ? 'This conversation is closed' : 'Write a message…'} placeholderTextColor="#646B80" multiline maxLength={4000} style={s.input} /><Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={sending || !draft.trim() || composerLocked} onPress={() => void send()} style={[s.send, (sending || !draft.trim() || composerLocked) && s.disabled]}><Icon name="send" size={18} color="#FFFFFF" /></Pressable></View>
        </>}
      </View>
    </View>
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, width: '100%', padding: 16, gap: 14, backgroundColor: '#FAFAFD' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }, pageTitle: { color: '#11162F', fontSize: 29, fontWeight: '900' }, muted: { color: '#555C72', fontSize: 13, lineHeight: 19 }, shell: { flex: 1, minHeight: 540, flexDirection: 'row', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', borderRadius: 20, overflow: 'hidden' }, shellMobile: { flexDirection: 'column', minHeight: 0 }, threadPane: { width: 330, borderRightWidth: 1, borderRightColor: '#E9EAF1', padding: 12 }, threadPaneMobile: { width: '100%', maxHeight: 180, borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: '#E9EAF1' }, threadList: { gap: 6 }, thread: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 13 }, threadActive: { backgroundColor: '#EEE9FF' }, threadIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F4F1FF', alignItems: 'center', justifyContent: 'center' }, threadCopy: { flex: 1 }, threadTitle: { color: '#11162F', fontSize: 12, fontWeight: '800' }, threadDate: { color: '#646B80', fontSize: 10, marginTop: 2 }, conversationPane: { flex: 1, backgroundColor: '#FCFCFE' }, conversationPaneMobile: { minHeight: 0 }, conversationHeader: { minHeight: 64, padding: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E9EAF1', flexDirection: 'row', alignItems: 'center', gap: 10 }, conversationTitle: { color: '#11162F', fontSize: 13, fontWeight: '900' }, messageList: { flexGrow: 1, padding: 16, gap: 10, justifyContent: 'flex-end' }, bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 15, gap: 4 }, bubbleOwn: { alignSelf: 'flex-end', backgroundColor: '#7048FF' }, bubbleOther: { alignSelf: 'flex-start', backgroundColor: '#EFF0F4' }, bubbleText: { color: '#11162F', fontSize: 13, lineHeight: 19 }, bubbleOwnText: { color: '#FFFFFF', fontSize: 13, lineHeight: 19 }, messageTime: { color: '#555C72', fontSize: 9 }, messageTimeOwn: { color: '#DDD6FF' }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E9EAF1' }, input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: '#D5D7E2', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#11162F', backgroundColor: '#FFFFFF' }, send: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#7048FF', alignItems: 'center', justifyContent: 'center' }, button: { backgroundColor: '#7048FF', minHeight: 42, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 }, disabled: { opacity: 0.45 }, error: { color: '#B42318', padding: 10, fontSize: 12 }, empty: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 }, emptyCompact: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 24 }, emptyImage: { width: 154, height: 103, borderRadius: 13 }, emptyTitle: { color: '#11162F', fontSize: 17, fontWeight: '900' }, stack: { gap: 10 }, headerActions: { marginLeft: 'auto', flexDirection: 'row', gap: 6 }, safetyButton: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E9EAF1', justifyContent: 'center' }, safetyText: { color: '#8A1C3A', fontWeight: '800', fontSize: 12 }, banner: { backgroundColor: '#FFF4D6', color: '#5A3E00', fontSize: 12, padding: 10 }, bubbleMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
});