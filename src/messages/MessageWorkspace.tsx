import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useAuth } from '../account/AuthProvider';
import { supabase } from '../backend/supabase';
import { Icon } from '../ui/Brand';

type Conversation = { id: string; title: string; created_at: string };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
type ReportReason = 'spam' | 'harassment' | 'fraud' | 'unsafe' | 'other';
const REPORT_REASONS: Array<[ReportReason, string]> = [['harassment', 'Harassment'], ['spam', 'Spam'], ['fraud', 'Scam or fraud'], ['unsafe', 'Unsafe'], ['other', 'Something else']];

function sendFailure(code?: string) {
  if (code === 'PT429') return 'You are sending messages too quickly. Wait a minute, then retry. Your text is preserved.';
  if (code === '42501') return 'You cannot send messages in this conversation.';
  return 'Could not send your message. Your text is preserved; check your connection and retry.';
}

function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[s.button, disabled && s.disabled]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}

export default function MessageWorkspace({ onAccount }: { onAccount: () => void }) {
  const { session, profile, profileLoading, initializing, error: profileError } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 760;
  const userId = session?.user.id;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [threadIssue, setThreadIssue] = useState('');
  const [messageIssue, setMessageIssue] = useState('');
  const [revision, setRevision] = useState(0);
  // undefined = loading, null = the other person left the conversation.
  const [counterpart, setCounterpart] = useState<string | null | undefined>(undefined);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [safetyNotice, setSafetyNotice] = useState('');
  const [safetyIssue, setSafetyIssue] = useState('');
  const selected = useMemo(() => conversations.find(item => item.id === selectedId) ?? null, [conversations, selectedId]);

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
        setSelectedId(current => current && rows.some(row => row.id === current) ? current : rows[0]?.id ?? null);
      }
      setLoadingThreads(false);
    }).catch(() => { if (!ac.signal.aborted) { setThreadIssue('Could not load conversations. Check your connection and retry.'); setLoadingThreads(false); } }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); ac.abort(); };
  }, [userId, profile, revision]);

  useEffect(() => {
    if (!selectedId || !userId) { setMessages([]); return; }
    const ac = new AbortController();
    setLoadingMessages(true); setMessageIssue('');
    const timeout = setTimeout(() => { setMessageIssue('Could not load messages. Check your connection and retry.'); setLoadingMessages(false); ac.abort(); }, 15000);
    const query = supabase.from('messages').select('id,conversation_id,sender_id,body,created_at').eq('conversation_id', selectedId).order('created_at', { ascending: true }).order('id').limit(200).abortSignal(ac.signal);
    void Promise.resolve(query).then(({ data, error }) => {
      if (ac.signal.aborted) return;
      if (error) setMessageIssue('Could not load messages. Check your connection and retry.');
      else setMessages((data ?? []) as Message[]);
      setLoadingMessages(false);
    }).catch(() => { if (!ac.signal.aborted) { setMessageIssue('Could not load messages. Check your connection and retry.'); setLoadingMessages(false); } }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); ac.abort(); };
  }, [selectedId, userId, revision]);

  useEffect(() => {
    setCounterpart(undefined); setBlockedByMe(false); setReporting(false); setSafetyNotice(''); setSafetyIssue('');
    if (!selectedId || !userId) return;
    let active = true;
    void (async () => {
      try {
        const { data: members, error } = await supabase.from('conversation_members').select('user_id').eq('conversation_id', selectedId).neq('user_id', userId).limit(1);
        if (error) throw error;
        const other = members?.[0]?.user_id ?? null;
        let blocked = false;
        if (other) {
          const { data: blocks, error: blockIssue } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', userId).eq('blocked_id', other).limit(1);
          if (blockIssue) throw blockIssue;
          blocked = !!blocks?.length;
        }
        if (!active) return;
        setCounterpart(other); setBlockedByMe(blocked);
      } catch {
        if (active) { setCounterpart(null); setSafetyIssue('Could not load safety options for this conversation. Refresh to retry.'); }
      }
    })();
    return () => { active = false; };
  }, [selectedId, userId, revision]);

  async function toggleBlock() {
    if (!userId || !counterpart) return;
    setSafetyBusy(true); setSafetyIssue(''); setSafetyNotice('');
    try {
      const { error } = blockedByMe
        ? await supabase.from('user_blocks').delete().eq('blocker_id', userId).eq('blocked_id', counterpart)
        : await supabase.from('user_blocks').insert({ blocker_id: userId, blocked_id: counterpart });
      if (error && error.code !== '23505') throw error;
      setBlockedByMe(!blockedByMe);
      setSafetyNotice(blockedByMe ? 'Unblocked. You can message each other again.' : 'Blocked. Neither of you can send messages here or start new conversations with each other.');
    } catch {
      setSafetyIssue(blockedByMe ? 'Could not unblock. Check your connection and retry.' : 'Could not block. Check your connection and retry.');
    } finally { setSafetyBusy(false); }
  }

  async function report(reason: ReportReason) {
    if (!userId || !selectedId) return;
    setSafetyBusy(true); setSafetyIssue(''); setSafetyNotice('');
    try {
      const { error } = await supabase.from('reports').insert({ reporter_id: userId, conversation_id: selectedId, reported_user_id: counterpart ?? null, reason });
      if (error) throw error;
      setReporting(false);
      setSafetyNotice('Report sent. Stuora reviews reported conversations. You can also block this person.');
    } catch (issue) {
      setSafetyIssue((issue as { code?: string })?.code === 'PT429' ? 'Report limit reached for today. Please contact Stuora support.' : 'Could not send the report. Check your connection and retry.');
    } finally { setSafetyBusy(false); }
  }

  async function send() {
    const body = draft.trim();
    setMessageIssue('');
    if (!userId || !selectedId || !body) return;
    if (body.length > 4000) return setMessageIssue('Messages must be 4,000 characters or fewer.');
    setSending(true);
    try {
      const { error } = await supabase.from('messages').insert({ conversation_id: selectedId, sender_id: userId, body });
      if (error) throw error;
      setDraft('');
      setRevision(value => value + 1);
    } catch (issue) {
      setMessageIssue(sendFailure((issue as { code?: string })?.code));
    } finally { setSending(false); }
  }

  if (initializing || profileLoading) return <View style={s.center}><ActivityIndicator accessibilityLabel="Loading messages account" /></View>;
  if (!session || !profile || profileError) return <View style={s.page}><Text style={s.pageTitle}>Messages</Text><View style={s.empty}><Icon name="messages" size={42} color="#7048FF" /><Text style={s.emptyTitle}>Sign in to use secure messaging</Text><Text style={s.muted}>Conversations are private to their members and are backed by Stuora's access policies.</Text><Button title="Open account" onPress={onAccount} /></View></View>;

  return <View style={s.page}>
    <View style={s.header}><View><Text style={s.pageTitle}>Messages</Text><Text style={s.muted}>Private listing conversations · persisted in Stuora.</Text></View><Button title="Refresh messages" onPress={() => setRevision(value => value + 1)} disabled={loadingThreads || loadingMessages} /></View>
    <View style={[s.shell, !isDesktop && s.shellMobile]}>
      <View style={[s.threadPane, !isDesktop && s.threadPaneMobile]}>
        {loadingThreads ? <ActivityIndicator accessibilityLabel="Loading conversations" /> : threadIssue ? <View style={s.stack}><Text accessibilityRole="alert" style={s.error}>{threadIssue}</Text><Button title="Retry conversations" onPress={() => setRevision(value => value + 1)} /></View> : !conversations.length ? <View style={s.emptyCompact}><Icon name="messages" size={34} color="#7048FF" /><Text style={s.emptyTitle}>No conversations yet</Text><Text style={s.muted}>Open an active Housing or Marketplace listing and choose Message owner.</Text></View> : <ScrollView contentContainerStyle={s.threadList}>{conversations.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open conversation ${item.title}`} onPress={() => setSelectedId(item.id)} style={[s.thread, item.id === selectedId && s.threadActive]}><View style={s.threadIcon}><Icon name="messages" size={20} color="#7048FF" /></View><View style={s.threadCopy}><Text numberOfLines={1} style={s.threadTitle}>{item.title || 'Stuora conversation'}</Text><Text style={s.threadDate}>{new Date(item.created_at).toLocaleDateString()}</Text></View></Pressable>)}</ScrollView>}
      </View>
      <View style={[s.conversationPane, !isDesktop && s.conversationPaneMobile]}>
        {!selected ? <View style={s.empty}><Text style={s.muted}>Select a conversation.</Text></View> : <>
          <View style={s.conversationHeader}><Icon name="messages" size={22} color="#7048FF" /><View style={s.threadCopy}><Text style={s.conversationTitle}>{selected.title || 'Stuora conversation'}</Text><Text style={s.threadDate}>Only conversation members can read or send messages.</Text></View>
            <View style={s.safetyActions}>
              {counterpart ? <Pressable accessibilityRole="button" accessibilityLabel={blockedByMe ? 'Unblock person' : 'Block person'} disabled={safetyBusy} onPress={() => void toggleBlock()} style={[s.safetyButton, safetyBusy && s.disabled]}><Text style={s.safetyText}>{blockedByMe ? 'Unblock' : 'Block'}</Text></Pressable> : null}
              <Pressable accessibilityRole="button" accessibilityLabel="Report conversation" disabled={safetyBusy} onPress={() => { setReporting(value => !value); setSafetyNotice(''); setSafetyIssue(''); }} style={[s.safetyButton, safetyBusy && s.disabled]}><Text style={s.safetyText}>Report</Text></Pressable>
            </View>
          </View>
          {reporting ? <View style={s.reportPanel}><Text style={s.reportTitle}>Why are you reporting this conversation?</Text><View style={s.reportReasons}>{REPORT_REASONS.map(([reason, label]) => <Pressable key={reason} accessibilityRole="button" accessibilityLabel={`Report reason ${label}`} disabled={safetyBusy} onPress={() => void report(reason)} style={[s.reasonButton, safetyBusy && s.disabled]}><Text style={s.reasonText}>{label}</Text></Pressable>)}</View></View> : null}
          {safetyNotice ? <Text accessibilityRole="alert" style={s.notice}>{safetyNotice}</Text> : null}
          {safetyIssue ? <Text accessibilityRole="alert" style={s.error}>{safetyIssue}</Text> : null}
          <ScrollView contentContainerStyle={s.messageList}>
            {loadingMessages ? <ActivityIndicator accessibilityLabel="Loading conversation messages" /> : !messages.length ? <Text style={s.muted}>No messages yet. Say hello.</Text> : messages.map(message => { const own = message.sender_id === userId; return <View key={message.id} style={[s.bubble, own ? s.bubbleOwn : s.bubbleOther]}><Text style={own ? s.bubbleOwnText : s.bubbleText}>{message.body}</Text><Text style={[s.messageTime, own && s.messageTimeOwn]}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></View>; })}
          </ScrollView>
          {messageIssue ? <Text accessibilityRole="alert" style={s.error}>{messageIssue}</Text> : null}
          {blockedByMe ? <Text style={s.composerNote}>You blocked this person. Unblock them to send messages.</Text> : counterpart === null && !safetyIssue ? <Text style={s.composerNote}>The other person has left this conversation.</Text> : <View style={s.composer}><TextInput accessibilityLabel="Message" value={draft} onChangeText={setDraft} placeholder="Write a message…" multiline maxLength={4000} style={s.input} /><Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={sending || !draft.trim()} onPress={() => void send()} style={[s.send, (sending || !draft.trim()) && s.disabled]}><Icon name="send" size={18} color="#FFFFFF" /></Pressable></View>}
        </>}
      </View>
    </View>
  </View>;
}

const s = StyleSheet.create({
  safetyActions: { flexDirection: 'row', gap: 6 }, safetyButton: { borderWidth: 1, borderColor: '#D5D7E2', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#FFFFFF' }, safetyText: { color: '#B42318', fontSize: 11, fontWeight: '800' },
  reportPanel: { padding: 12, gap: 8, backgroundColor: '#FFF6F5', borderBottomWidth: 1, borderBottomColor: '#F4D6D2' }, reportTitle: { color: '#11162F', fontSize: 12, fontWeight: '800' }, reportReasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, reasonButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F4D6D2' }, reasonText: { color: '#11162F', fontSize: 11, fontWeight: '700' },
  notice: { color: '#167348', padding: 10, fontSize: 12 }, composerNote: { color: '#747B91', fontSize: 12, padding: 16, textAlign: 'center', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E9EAF1' },
  page: { flex: 1, width: '100%', padding: 16, gap: 14, backgroundColor: '#FAFAFD' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }, pageTitle: { color: '#11162F', fontSize: 29, fontWeight: '900' }, muted: { color: '#747B91', fontSize: 13, lineHeight: 19 }, shell: { flex: 1, minHeight: 540, flexDirection: 'row', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EAF1', borderRadius: 20, overflow: 'hidden' }, shellMobile: { flexDirection: 'column', minHeight: 0 }, threadPane: { width: 330, borderRightWidth: 1, borderRightColor: '#E9EAF1', padding: 12 }, threadPaneMobile: { width: '100%', maxHeight: 180, borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: '#E9EAF1' }, threadList: { gap: 6 }, thread: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 13 }, threadActive: { backgroundColor: '#EEE9FF' }, threadIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F4F1FF', alignItems: 'center', justifyContent: 'center' }, threadCopy: { flex: 1 }, threadTitle: { color: '#11162F', fontSize: 12, fontWeight: '800' }, threadDate: { color: '#9AA1B5', fontSize: 10, marginTop: 2 }, conversationPane: { flex: 1, backgroundColor: '#FCFCFE' }, conversationPaneMobile: { minHeight: 0 }, conversationHeader: { minHeight: 64, padding: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E9EAF1', flexDirection: 'row', alignItems: 'center', gap: 10 }, conversationTitle: { color: '#11162F', fontSize: 13, fontWeight: '900' }, messageList: { flexGrow: 1, padding: 16, gap: 10, justifyContent: 'flex-end' }, bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 15, gap: 4 }, bubbleOwn: { alignSelf: 'flex-end', backgroundColor: '#7048FF' }, bubbleOther: { alignSelf: 'flex-start', backgroundColor: '#EFF0F4' }, bubbleText: { color: '#11162F', fontSize: 13, lineHeight: 19 }, bubbleOwnText: { color: '#FFFFFF', fontSize: 13, lineHeight: 19 }, messageTime: { color: '#747B91', fontSize: 9 }, messageTimeOwn: { color: '#DDD6FF' }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E9EAF1' }, input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: '#D5D7E2', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#11162F', backgroundColor: '#FFFFFF' }, send: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#7048FF', alignItems: 'center', justifyContent: 'center' }, button: { backgroundColor: '#7048FF', minHeight: 42, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 }, disabled: { opacity: 0.45 }, error: { color: '#B42318', padding: 10, fontSize: 12 }, empty: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 }, emptyCompact: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 24 }, emptyTitle: { color: '#11162F', fontSize: 17, fontWeight: '900' }, stack: { gap: 10 },
});