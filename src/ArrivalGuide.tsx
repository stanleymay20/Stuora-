import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const cities = {
  Berlin: 'https://service.berlin.de/dienstleistung/120686/',
  Potsdam: 'https://www.potsdam.de/de/potsdamer-werden',
  'Brandenburg an der Havel': 'https://service.stadt-brandenburg.de/dienstleistungen/-/egov-bis-detail/dienstleistung/245231/show',
};
const campuses = { Berlin: 'Donaustraße 42, 12043 Berlin', Potsdam: 'Konrad-Zuse-Ring 11, 14469 Potsdam' };
const gisma = 'https://www.gisma.com/en/contact-us';
const vbb = 'https://www.vbb.de/unterwegs-im-vbb/';
type Plan = { home: keyof typeof cities | ''; campus: keyof typeof campuses | ''; arrival: string; done: string[] };
const empty: Plan = { home: '', campus: '', arrival: '', done: [] };

function validDate(date: string) {
  if (!date) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + 'T12:00:00Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().startsWith(date);
}

function Choice({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    style={[s.choice, selected && s.selected]}><Text style={s.link}>{label}</Text></Pressable>;
}

export default function ArrivalGuide({ studentId, onSignIn }: { studentId?: string; onSignIn: () => void }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan>(empty);
  const [draftDate, setDraftDate] = useState('');
  const [help, setHelp] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(!studentId);
  const [retry, setRetry] = useState(0);
  const busy = useRef(false);
  const storageKey = 'arrival-guide:v1:' + studentId;
  useEffect(() => {
    if (!studentId || !open) return;
    let active = true;
    setReady(false);
    AsyncStorage.getItem(storageKey).then(raw => {
      if (!active) return;
      const data = raw ? JSON.parse(raw) : empty;
      if (!data || !(data.home === '' || Object.hasOwn(cities, data.home)) ||
          !(data.campus === '' || Object.hasOwn(campuses, data.campus)) ||
          typeof data.arrival !== 'string' || !validDate(data.arrival) || !Array.isArray(data.done)) throw Error();
      setPlan(data); setDraftDate(data.arrival); setReady(true); setError('');
    }).catch(() => { if (active) setError('Could not load your checklist. Try again.'); });
    return () => { active = false; };
  }, [studentId, storageKey, open, retry]);
  async function change(next: Plan) {
    if (busy.current || !ready) return;
    busy.current = true;
    try {
      if (studentId) await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      setPlan(next); setError('');
    } catch { setError('Could not save your change. Try again.'); }
    finally { busy.current = false; }
  }
  function link(url: string) { void Linking.openURL(url).catch(() => setError('Could not open the official page. Please try again.')); }
  const tasks = [
    { id: 'travel-' + plan.campus, name: 'Plan your first campus trip', body: plan.campus ? 'Enter your starting point and this destination in VBB: ' + campuses[plan.campus] : 'Choose your campus above to see the destination address.', label: 'Open VBB journey planner', url: vbb, tip: 'Check the campus address against your timetable. GISMA lists both campuses on its contact page.', contact: gisma, contactLabel: 'Check GISMA campus addresses' },
    { id: 'ticket', name: 'Find your semester ticket', body: 'Check your university inbox and spam folder for your semester ticket instructions.', label: 'Read VBB semester ticket guidance', url: 'https://www.vbb.de/en/tickets/special-tickets/semester-ticket/', tip: 'Missing the activation email? Ask Student Support through your usual university channel to check your enrolment and resend the link. GISMA’s published student guide lists potsdam.reception@gisma.com for ticket questions.', contact: 'mailto:potsdam.reception@gisma.com', contactLabel: 'Email GISMA about my ticket' },
    { id: 'register-' + plan.home, name: 'Register your home address', body: 'Anmeldung means registering where you live. Check your home city’s instructions for documents and appointment options.', label: 'Open city registration service', url: plan.home ? cities[plan.home] : '', tip: plan.home ? 'Use the contact or appointment information on your city’s registration page.' : 'Choose your home city above. If you live elsewhere, contact the Bürgeramt where you live.', contact: plan.home ? cities[plan.home] : '', contactLabel: 'Find the registration office' },
  ];
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  if (plan.arrival && plan.arrival <= today) tasks.unshift(tasks.pop()!);
  return <View style={s.box}>
    <Choice label={open ? 'Close my first 30 days' : 'My first 30 days'} onPress={() => setOpen(!open)} />
    {open && <>
      <Text style={s.heading}>Your arrival checklist</Text>
      {!studentId && <Choice label="Sign in to save progress" onPress={onSignIn} />}
      {!!error && <Text accessibilityRole="alert">{error}</Text>}
      {!ready ? (error ? <Choice label="Retry checklist" onPress={() => setRetry(retry + 1)} /> : <Text>Loading checklist…</Text>) : <>
        <Text style={s.label}>Where do you live?</Text><View style={s.row}>{(Object.keys(cities) as (keyof typeof cities)[]).map(home =>
          <Choice key={home} label={home} selected={plan.home === home} onPress={() => change({ ...plan, home })} />)}</View>
        <Text style={s.label}>Which campus do you attend?</Text><View style={s.row}>{(Object.keys(campuses) as (keyof typeof campuses)[]).map(campus =>
          <Choice key={campus} label={campus + ' campus'} selected={plan.campus === campus} onPress={() => change({ ...plan, campus })} />)}</View>
        <Text style={s.label}>Arrival date (optional)</Text><View style={s.row}><TextInput accessibilityLabel="Arrival date" placeholder="YYYY-MM-DD" maxLength={10} style={s.input} value={draftDate} onChangeText={setDraftDate} />
          <Choice label="Set arrival date" onPress={() => validDate(draftDate) ? change({ ...plan, arrival: draftDate }) : setError('Enter a valid date as YYYY-MM-DD.')} /></View>
        {tasks.map(task => <View key={task.id} style={s.card}><Text style={s.label}>{task.name}</Text><Text>{task.body}</Text>
          {!!task.url && <Choice label={task.label} onPress={() => link(task.url)} />}
          <View style={s.row}><Choice label="I’m stuck" selected={help === task.id} onPress={() => setHelp(help === task.id ? '' : task.id)} />
            {studentId && <Choice label={plan.done.includes(task.id) ? 'Done · undo' : 'Mark done'} onPress={() => change({ ...plan, done: plan.done.includes(task.id) ? plan.done.filter(id => id !== task.id) : [...plan.done, task.id] })} />}</View>
          {help === task.id && <><Text>{task.tip}</Text>{!!task.contact && <Choice label={task.contactLabel} onPress={() => link(task.contact)} />}</>}
        </View>)}
      </>}
    </>}
  </View>;
}
const s = StyleSheet.create({
  box: { gap: 10, padding: 16, backgroundColor: '#F5F3FF', borderRadius: 18 },
  heading: { fontSize: 22, fontWeight: '800', color: '#10162F' },
  label: { fontSize: 16, fontWeight: '700', color: '#10162F' },
  choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: '#FFFFFF', borderRadius: 10 },
  selected: { borderWidth: 2, borderColor: '#4325C9' },
  link: { fontWeight: '700', color: '#4325C9' },
  card: { padding: 14, gap: 8, borderRadius: 12, backgroundColor: '#FFFFFF' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { minHeight: 44, backgroundColor: '#FFFFFF', paddingHorizontal: 12, borderRadius: 8 },
});
