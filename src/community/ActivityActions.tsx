import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View, StyleSheet } from 'react-native';
import { supabase } from '../backend/supabase';
import { useAuth } from '../account/AuthProvider';
import type { CommunityCategory } from './CommunityCatalog';
import type { Json } from '../backend/database.types';

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.label}>{label}</Text></Pressable>;
}

function Field({ label, value, change }: { label: string; value: string; change: (value: string) => void }) {
  return <View><Text>{label}</Text><TextInput accessibilityLabel={label} style={styles.field}
    value={value} onChangeText={change} /></View>;
}

export function ActivityComposer({ category, city, onSignIn, onPublished }: {
  category: CommunityCategory; city: string; onSignIn: () => void; onPublished: () => void;
}) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string,string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const kind = category === 'Events' ? 'event' : category === 'Trips' ? 'trip' : 'job';
  const field = (name: string, label: string) => <Field label={label} value={draft[name] ?? ''}
    change={value => setDraft(old => ({ ...old, [name]: value }))} />;
  async function publish() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      let details: Json;
      if (kind === 'job') {
        details = { company_name: draft.company ?? '', compensation_text: draft.pay ?? '', workplace_mode: draft.mode || 'onsite' };
      } else {
        const date = (draft.start ?? '').trim().replace(' ', 'T');
        const start = new Date(date);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date) || !Number.isFinite(start.getTime()) || start.getTime() <= Date.now())
          throw new Error('Enter a future start date and time in the format shown.');
        details = { [kind === 'trip' ? 'destination' : 'venue_name']: draft.place ?? '', starts_at: start.toISOString(), capacity: Number(draft.capacity) };
      }
      const { error } = await supabase.rpc('publish_student_activity', { p_kind: kind, p_title: draft.title || '',
        p_city: draft.city || '', p_description: draft.description || '', p_details: details });
      if (error) throw new Error(error.code === '42501' ? 'Publishing requires an eligible confirmed GISMA student account.' :
        error.code === '22023' ? 'Check the title, city and activity details.' : 'Could not confirm publication. Refresh listings before retrying.');
      setOpen(false); setDraft({}); setMessage('Published to Stuora.'); onPublished();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not publish.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <View style={styles.panel}>
    {open ? <>
      {field('title','Title')}{field('city','City')}{field('description','Description')}
      {kind === 'job' ? <>{field('company','Company')}{field('pay','Compensation')}
        <Text>Workplace</Text>{(['onsite','hybrid','remote'] as const).map(mode => <Button key={mode}
          label={(mode === (draft.mode || 'onsite') ? '✓ ' : '') + mode} onPress={() => setDraft(old => ({ ...old, mode }))} />)}</> :
        <>{field('place',kind === 'trip' ? 'Destination' : 'Venue')}{field('start','Start in your local time (YYYY-MM-DD HH:MM)')}
          {field('capacity',kind === 'trip' ? 'Capacity (2–100)' : 'Capacity (1–100)')}</>}
      <Button label="Publish" disabled={busy} onPress={() => void publish()} />
      <Button label="Cancel" disabled={busy} onPress={() => { setOpen(false); setMessage(''); }} />
    </> : <Button label={'Post a ' + kind} onPress={() => {
      if (!session) { onSignIn(); return; }
      setDraft({city}); setMessage(''); setOpen(true);
    }} />}
    {message ? <Text accessibilityRole="alert">{message}</Text> : null}
  </View>;
}

export function ActivityResponse({ id, owner, category, onSignIn, onClosed }: {
  id: string; owner: string; category: CommunityCategory; onSignIn: () => void; onClosed: () => void;
}) {
  const { session } = useAuth();
  const [state, setState] = useState<{ joined: boolean; applied: boolean; withdrawn: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState(false);
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const own = session?.user.id === owner;
  useEffect(() => {
    if (!session || own) return;
    let active = true;
    setState(null); setMessage('');
    void Promise.resolve(supabase.rpc('student_activity_response',{p_id:id,p_action:'state'})).then(({data,error}) => {
      if (!active) return;
      if (error || !data || typeof data !== 'object' || Array.isArray(data)) setMessage('Could not load your participation.');
      else setState({joined:data.joined === true,applied:data.applied === true,withdrawn:data.withdrawn === true});
    }).catch(() => { if (active) setMessage('Could not load your participation.'); });
    return () => { active = false; };
  }, [id, session?.user.id, own, retry]);
  async function act(action: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const { error } = action === 'close' ? await supabase.rpc('close_student_activity',{p_id:id}) :
        await supabase.rpc('student_activity_response',{p_id:id,p_action:action,p_note:note.trim()});
      if (error) throw error;
      if (action === 'close') onClosed(); else setRetry(v => v + 1);
    } catch { setMessage('Action could not be confirmed. Refresh your status before retrying.'); }
    finally { setBusy(false); lock.current = false; }
  }
  if (!session) return <Button label="Sign in to participate" onPress={onSignIn} />;
  const action = category === 'Jobs' ? state?.applied ? 'withdraw' : 'apply' : state?.joined ? 'leave' : 'join';
  return <View style={styles.panel}>
    {own ? <><Button label={closing ? 'Confirm close listing' : 'Close listing'} disabled={busy}
      onPress={() => closing ? void act('close') : setClosing(true)} />
      {closing ? <Button label="Cancel" disabled={busy} onPress={() => setClosing(false)} /> : null}</> :
      state?.withdrawn ? <Text>Application withdrawn</Text> : state ? <>
        {action === 'apply' ? <Field label="Cover note (optional)" value={note} change={setNote} /> : null}
        <Button disabled={busy} label={action === 'apply' ? 'Apply for job' : action === 'withdraw' ? 'Withdraw application' :
          action === 'leave' ? 'Leave activity' : category === 'Trips' ? 'Join trip' : 'RSVP to event'} onPress={() => void act(action)} />
      </> : null}
    {message ? <><Text accessibilityRole="alert">{message}</Text>
      {!own ? <Button label="Refresh participation" onPress={() => setRetry(v => v + 1)} /> : null}</> : null}
  </View>;
}
const styles = StyleSheet.create({
  panel:{gap:10}, field:{backgroundColor:'white',borderWidth:1,borderColor:'#AAAABA',borderRadius:8,padding:10},
  button:{alignSelf:'flex-start',backgroundColor:'#4930BB',borderRadius:10,padding:12},label:{color:'white',fontWeight:'700'},
});
