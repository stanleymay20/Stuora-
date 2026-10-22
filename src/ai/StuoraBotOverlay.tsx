import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { supabase } from '../backend/supabase';
import { useAuth } from '../account/AuthProvider';
import { features } from '../backend/features';
import { invokeFunction, ServiceError } from '../backend/externalData';
import { botGuidance, botWelcome, euroFromCents, parseBotIntent, safeLike, type BotDomain } from './botCore';

type BotResult = { id: string; title: string; description: string; domain: BotDomain };
type BotReply = { prompt: string; answer: string; results: BotResult[]; domain: BotDomain | null; sourceLabel: string };
type AssistantReply = { sourceLabel: string; answer: string; results: BotResult[]; intent: { domain: BotDomain } | null };
type Category = 'Housing' | 'Marketplace' | 'Trips' | 'Jobs' | 'Events' | 'Groups';
const PAGE_SIZE = 6;
const resultCategories: Record<BotDomain, Category> = {
  housing: 'Housing', marketplace: 'Marketplace', jobs: 'Jobs',
  events: 'Events', trips: 'Trips', groups: 'Groups',
};
const listKinds: Record<Exclude<BotDomain, 'groups'>, 'housing'|'marketplace'|'job'|'event'|'trip'> = {
  housing: 'housing', marketplace: 'marketplace', jobs: 'job', events: 'event', trips: 'trip',
};

/** Server-side assistant: an LLM only parses intent; results still come from Stuora under RLS. */
async function askAssistant(prompt: string, preferredCity: string): Promise<BotReply> {
  const reply = await invokeFunction<AssistantReply>('stuora-assistant', { query: prompt, selectedCity: preferredCity || null });
  const results = Array.isArray(reply.results) ? reply.results.slice(0, PAGE_SIZE) : [];
  return { prompt, answer: String(reply.answer ?? ''), results, domain: reply.intent?.domain ?? null, sourceLabel: String(reply.sourceLabel ?? 'Stuora') };
}

async function searchStuora(prompt: string, signal: AbortSignal, preferredCity = ''): Promise<BotReply> {
  const intent = parseBotIntent(prompt);
  const city = intent.city || preferredCity.trim();
  if (!intent.domain) return { prompt, answer: botGuidance(), results: [], domain: null, sourceLabel: 'Keyword search' };
  let results: BotResult[] = [];
  if (intent.domain === 'groups') {
    let query = supabase.from('student_groups')
      .select('id,name,city,topic,description')
      .order('created_at', { ascending: false }).order('id').limit(PAGE_SIZE)
      .abortSignal(signal);
    if (city) query = query.ilike('city', '%' + safeLike(city) + '%');
    if (intent.search) query = query.ilike('name', '%' + safeLike(intent.search) + '%');
    const { data, error } = await query;
    if (error) throw error;
    results = (data ?? []).map(group => ({
      id: group.id, title: group.name, domain: 'groups',
      description: group.topic + ' · ' + group.city + (group.description ? ' · ' + group.description.slice(0, 100) : ''),
    }));
  } else {
    let query = supabase.from('listings')
      .select('id,kind,title,city,price_cents,currency')
      .eq('kind', listKinds[intent.domain]).eq('status', 'active')
      .order('created_at', { ascending: false }).order('id').limit(PAGE_SIZE)
      .abortSignal(signal);
    if (city) query = query.ilike('city', '%' + safeLike(city) + '%');
    if (intent.maxPriceCents !== null) query = query.lte('price_cents', intent.maxPriceCents);
    if (intent.search) query = query.ilike('title', '%' + safeLike(intent.search) + '%');
    const { data, error } = await query;
    if (error) throw error;
    results = (data ?? []).map(listing => ({
      id: listing.id, title: listing.title, domain: intent.domain!,
      description: listing.city + (intent.domain === 'housing' || intent.domain === 'marketplace'
        ? ' · ' + euroFromCents(listing.price_cents, listing.currency) : ''),
    }));
  }
  const area = city ? ' in ' + city : '';
  const budget = intent.maxPriceCents !== null ? ' within your maximum price' : '';
  const plural = resultCategories[intent.domain].toLowerCase();
  return {
    prompt, results, domain: intent.domain, sourceLabel: 'Keyword search',
    answer: results.length
      ? 'Here are ' + results.length + ' real ' + plural + ' results' + area + budget + ' returned by Stuora. Open the category for the full details. Results can change.'
      : 'No matching ' + plural + ' were returned' + area + budget + '. Try another city or broader search. I will not invent results.',
  };
}

function Action({ title, onPress, subtle = false, disabled = false }: {
  title: string; onPress: () => void; subtle?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, subtle && styles.subtle, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text style={[styles.actionText, subtle && styles.subtleText]}>{title}</Text>
  </Pressable>;
}

export default function StuoraBotOverlay({ open, preferredCity = '', onClose, onNavigate }: {
  open: boolean; preferredCity?: string; onClose: () => void; onNavigate: (category: Category) => void;
}) {
  const { width } = useWindowDimensions();
  const desktop = width >= 960;
  const { session } = useAuth();
  const useAssistant = features.aiAssistant && !!session;
  const [input, setInput] = useState('');
  const [replies, setReplies] = useState<BotReply[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const requests = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (open) return;
    controller.current?.abort();
    controller.current = null;
    setBusy(false); setInput(''); setFailure(''); setReplies([]);
    requests.current = 0;
  }, [open]);

  async function submit(prompt = input) {
    const text = prompt.trim().slice(0, 200);
    if (!text || busy) return;
    if (requests.current >= 15) {
      setFailure('You have reached the current session search limit. Close and reopen Stuora Bot to continue.');
      return;
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12000);
    controller.current = ac;
    requests.current += 1; setBusy(true); setFailure('');
    try {
      let reply: BotReply;
      if (useAssistant) {
        try { reply = await askAssistant(text, preferredCity); }
        catch (error) {
          if (error instanceof ServiceError && error.code === 'RATE_LIMIT') { setFailure(error.message); return; }
          // Any other assistant failure falls back to the on-device keyword search.
          reply = await searchStuora(text, ac.signal, preferredCity);
        }
      } else reply = await searchStuora(text, ac.signal, preferredCity);
      if (ac.signal.aborted) return;
      setReplies(old => [...old.slice(-9), reply]); setInput('');
    } catch {
      if (!ac.signal.aborted) setFailure('Stuora search could not be completed. Check your connection and try again.');
      else setFailure('The search timed out. Please try again.');
    } finally {
      clearTimeout(timer);
      if (controller.current === ac) controller.current = null;
      setBusy(false);
    }
  }

  const navigate = (domain: BotDomain) => { onClose(); onNavigate(resultCategories[domain]); };
  const suggestions = [
    preferredCity ? `Housing in ${preferredCity}` : 'Browse housing',
    preferredCity ? `Working-student jobs in ${preferredCity}` : 'Working-student jobs',
    preferredCity ? `Study groups in ${preferredCity}` : 'Study groups',
  ];
  return <Modal visible={open} animationType={desktop ? 'fade' : 'slide'} transparent={desktop} onRequestClose={onClose}>
    <View style={[styles.modalHost, desktop && styles.desktopModalHost]}>
      {desktop ? <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss assistant backdrop"
        onPress={onClose}
        style={styles.desktopBackdropButton}
      /> : null}
      <SafeAreaView testID="stuora-bot-panel" style={[styles.safeArea, desktop && styles.desktopPanel]}>
      <View style={styles.header}>
        <Image source={require('../../assets/stuora-bot.webp')} style={styles.avatar}
          accessibilityLabel="Stuora Bot smiling robot mascot" />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Stuora Bot</Text>
          <Text style={styles.eyebrow}>Connected search beta · Read-only</Text>
        </View>
        <Action title="Close Stuora Bot" subtle onPress={onClose} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} style={styles.scroll}>
        <Text style={styles.welcome}>{botWelcome()}</Text>
        {!replies.length ? <View style={styles.suggestionBox}>
          <Text style={styles.sectionTitle}>Try a search</Text>
          {suggestions.map(t => <Action key={t} title={t} subtle disabled={busy} onPress={() => void submit(t)} />)}
        </View> : null}
        {replies.map((reply, index) => <View key={index} style={styles.exchange}>
          <Text style={styles.question}>{reply.prompt}</Text>
          <Text style={styles.answer}>{reply.answer}</Text>
          <Text style={styles.source}>Answered by: {reply.sourceLabel}</Text>
          {reply.results.map(r => <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`Open ${resultCategories[r.domain]}: ${r.title}`}
            onPress={() => navigate(r.domain)} style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
            <Text style={styles.resultTitle}>{r.title}</Text>
            <Text style={styles.resultDescription}>{r.description}</Text>
          </Pressable>)}
          {reply.domain ? <Action title={'Explore ' + resultCategories[reply.domain]} onPress={() => navigate(reply.domain!)} /> : null}
        </View>)}
        {failure ? <Text style={styles.error} accessibilityRole="alert">{failure}</Text> : null}
        {busy ? <ActivityIndicator accessibilityLabel="Searching Stuora" /> : null}
        <Text style={styles.disclaimer}>{useAssistant
          ? 'Stuora Bot searches real Stuora data. Your question (never your name, email or messages) is sent to an AI service only to understand what you are looking for; results always come from Stuora. It never publishes, applies or makes purchases.'
          : 'Stuora Bot currently searches real public data. It does not use generative AI, cannot see private messages, and never publishes, applies or makes purchases.'}</Text>
      </ScrollView>
      <View style={styles.composer}>
        <TextInput accessibilityLabel="Ask Stuora Bot" value={input} onChangeText={setInput}
          placeholder="Ask about housing, jobs or groups…" placeholderTextColor="#646B80"
          maxLength={200} style={styles.input} multiline />
        <Action title="Ask Stuora Bot" onPress={() => void submit()} disabled={busy || !input.trim()} />
      </View>
      </SafeAreaView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  modalHost: { flex: 1 },
  desktopModalHost: {
    alignItems: 'flex-end', justifyContent: 'flex-end', padding: 26,
    backgroundColor: 'rgba(17,22,47,0.24)',
  },
  safeArea: { flex: 1, backgroundColor: '#F8F8FC' },
  desktopBackdropButton: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 0 },
  desktopPanel: {
    position: 'relative', zIndex: 1, flex: 1, minHeight: 0,
    width: 480, maxWidth: '100%', maxHeight: 780,
    borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#E3E3EF',
    shadowColor: '#11162F', shadowOpacity: 0.22,
    shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 16,
  },
  header: { backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 10,
    borderBottomWidth: 1, borderBottomColor: '#E8E8F1', padding: 14 },
  avatar: { width: 49, height: 49, borderRadius: 16, backgroundColor: '#EEE9FF' },
  headerCopy: { flex: 1, minWidth: 60, gap: 2 },
  title: { fontSize: 20, fontWeight: '900', color: '#11162F' },
  eyebrow: { fontSize: 10, color: '#555C72' },
  source: { fontSize: 11, color: '#555C72', fontWeight: '700' },
  scroll: { flex: 1 },
  body: { width: '100%', maxWidth: 750, alignSelf: 'center', padding: 16, paddingBottom: 40, gap: 15 },
  welcome: { color: '#252B4A', fontSize: 14, lineHeight: 22, padding: 14, borderRadius: 15, backgroundColor: '#EEE9FF' },
  suggestionBox: { gap: 8, paddingVertical: 8 },
  sectionTitle: { fontSize: 15, color: '#11162F', fontWeight: '900' },
  exchange: { gap: 10, padding: 15, backgroundColor: '#FFFFFF', borderRadius: 17, borderWidth: 1, borderColor: '#E8E8F1' },
  question: { color: '#7048FF', fontWeight: '900', fontSize: 14 },
  answer: { color: '#252B4A', lineHeight: 21, fontSize: 13 },
  result: { backgroundColor: '#FAFAFD', borderRadius: 12, padding: 12, gap: 4 },
  resultTitle: { fontWeight: '900', color: '#11162F', fontSize: 13 },
  resultDescription: { color: '#555C72', fontSize: 12, lineHeight: 18 },
  disclaimer: { color: '#555C72', fontSize: 12, lineHeight: 19 },
  composer: { borderTopWidth: 1, borderTopColor: '#E8E8F1', backgroundColor: '#FFFFFF', padding: 12, gap: 9 },
  input: { width: '100%', minHeight: 47, maxHeight: 94, borderRadius: 13, borderWidth: 1,
    borderColor: '#DEDEE9', backgroundColor: '#FFFFFF', padding: 11, color: '#11162F', fontSize: 14 },
  action: { minHeight: 43, borderRadius: 11, backgroundColor: '#7048FF', paddingVertical: 11, paddingHorizontal: 14,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  subtle: { backgroundColor: '#EEE9FF' },
  actionText: { fontSize: 12, color: '#FFFFFF', fontWeight: '800' },
  subtleText: { color: '#7048FF' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  error: { color: '#B21F44', fontWeight: '700', fontSize: 12 },
});
