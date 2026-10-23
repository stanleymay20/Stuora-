import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../backend/supabase';
import type { Database } from '../backend/database.types';

type Item = Database['public']['Functions']['moderation_queue']['Returns'][number];
type Notice = Database['public']['Tables']['moderation_notices']['Row'];
type Action = 'dismiss' | 'remove_content' | 'suspend_user';
const actionLabels: Record<Action, string> = { dismiss: 'Dismiss', remove_content: 'Remove content', suspend_user: 'Suspend account' };

/** Moderator-only queue. The server refuses every call from non-moderators. */
export function ModerationQueue() {
  const [items, setItems] = useState<Item[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    setState('loading');
    const { data, error } = await supabase.rpc('moderation_queue', { p_status: 'open', p_limit: 50 });
    if (error) { setState('error'); return; }
    setItems(data ?? []); setState('ready');
  }, []);
  useEffect(() => { void load(); }, [load]);
  const decide = async (item: Item, action: Action) => {
    const reason = (reasons[item.id] ?? '').trim();
    if (reason.length < 10) { setMessage('Write a reason of at least 10 characters. The student will see it.'); return; }
    const { error } = await supabase.rpc('moderate_report', { p_report: item.id, p_action: action, p_reason: reason });
    if (error) { setMessage(error.message.length < 160 ? error.message : 'The decision could not be saved.'); return; }
    setMessage(`${actionLabels[action]} recorded.`);
    setItems(current => current.filter(i => i.id !== item.id));
  };
  return (
    <View style={styles.card} testID="moderation-queue">
      <Text accessibilityRole="header" style={styles.title}>Moderation queue</Text>
      <Text style={styles.hint}>Reporter identities are never shown. Every decision needs a reason the affected student will read.</Text>
      {message ? <Text accessibilityRole="alert" style={styles.status}>{message}</Text> : null}
      {state === 'loading' ? <Text style={styles.hint}>Loading reports…</Text> : null}
      {state === 'error' ? <Text style={styles.error}>The queue could not be loaded.</Text> : null}
      {state === 'ready' && !items.length ? <Text style={styles.hint}>No open reports.</Text> : null}
      {items.map(item => (
        <View key={item.id} style={styles.item}>
          <Text style={styles.meta}>{item.target_kind.replace('_', ' ')} · {item.reason} · {new Date(item.created_at).toLocaleString()} · {item.prior_reports} earlier report(s)</Text>
          {item.content_snapshot ? <Text style={styles.snapshot} selectable>{item.content_snapshot}</Text> : null}
          {item.details ? <Text style={styles.details}>Reporter note: {item.details}</Text> : null}
          <TextInput accessibilityLabel="Reason for decision" value={reasons[item.id] ?? ''} maxLength={1000}
            onChangeText={text => setReasons(r => ({ ...r, [item.id]: text }))}
            placeholder="Reason shown to the student" placeholderTextColor="#6B7287" style={styles.input} />
          <View style={styles.actions}>
            {(Object.keys(actionLabels) as Action[]).filter(a => !(a === 'remove_content' && item.target_kind === 'user')).map(action => (
              <Pressable key={action} accessibilityRole="button" onPress={() => void decide(item, action)}
                style={[styles.button, action === 'suspend_user' && styles.danger]}>
                <Text style={[styles.buttonText, action === 'suspend_user' && styles.dangerText]}>{actionLabels[action]}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.button}><Text style={styles.buttonText}>Refresh</Text></Pressable>
    </View>
  );
}

/** The signed-in student's moderation notices (outcomes of reports, removals, suspensions). */
export function ModerationNotices({ userId }: { userId: string }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    let alive = true;
    void supabase.from('moderation_notices').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => { if (alive && data) setNotices(data); });
    return () => { alive = false; };
  }, [userId]);
  const markRead = async (id: string) => {
    const readAt = new Date().toISOString();
    const { error } = await supabase.from('moderation_notices').update({ read_at: readAt }).eq('id', id);
    if (!error) setNotices(list => list.map(n => n.id === id ? { ...n, read_at: readAt } : n));
  };
  if (!notices.length) return null;
  return (
    <View style={styles.card} testID="moderation-notices">
      <Text accessibilityRole="header" style={styles.title}>Notices from Stuora</Text>
      {notices.map(n => (
        <View key={n.id} style={[styles.item, !n.read_at && styles.unread]}>
          <Text style={styles.meta}>{new Date(n.created_at).toLocaleString()}</Text>
          <Text style={styles.details}>{n.message}</Text>
          {!n.read_at ? (
            <Pressable accessibilityRole="button" onPress={() => void markRead(n.id)} style={styles.button}><Text style={styles.buttonText}>Mark as read</Text></Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E9EAF1', padding: 16, gap: 10 },
  title: { fontSize: 18, fontWeight: '900', color: '#11162F' },
  hint: { fontSize: 13, color: '#4A5166' },
  status: { fontSize: 13, color: '#0E6B45' },
  error: { fontSize: 13, color: '#A3123A' },
  item: { borderTopWidth: 1, borderTopColor: '#E9EAF1', paddingTop: 10, gap: 6 },
  unread: { borderLeftWidth: 3, borderLeftColor: '#5635E7', paddingLeft: 8 },
  meta: { fontSize: 12, color: '#4A5166', fontWeight: '700' },
  snapshot: { fontSize: 13, color: '#11162F', backgroundColor: '#F6F6FA', padding: 10, borderRadius: 10 },
  details: { fontSize: 13, color: '#3D4459', lineHeight: 19 },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#D8DAE5', borderRadius: 10, paddingHorizontal: 10, fontSize: 13, color: '#11162F' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, backgroundColor: '#EEE9FF', alignSelf: 'flex-start' },
  buttonText: { color: '#4325C9', fontWeight: '800', fontSize: 12 },
  danger: { backgroundColor: '#FCE8EE' },
  dangerText: { color: '#8A1C3A' },
});
