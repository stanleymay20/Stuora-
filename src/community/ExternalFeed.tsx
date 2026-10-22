import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../account/AuthProvider';
import { isPlausibleCity } from '../ai/botCore';
import { loadExternalFeed, ServiceError, type FeedReply } from '../backend/externalData';

/** Licensed third-party jobs/events, fetched and cached server-side. */
export default function ExternalFeed({ kind, city, search }: { kind: 'jobs' | 'events'; city: string; search: string }) {
  const { session } = useAuth();
  const [reply, setReply] = useState<FeedReply | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'disabled'>('idle');
  const [message, setMessage] = useState('');
  const cityName = city.trim();
  const query = search.trim().slice(0, 60);
  useEffect(() => {
    setReply(null); setMessage('');
    if (!session || !isPlausibleCity(cityName)) { setState('idle'); return; }
    let alive = true;
    setState('loading');
    loadExternalFeed(kind, cityName, query).then(r => { if (alive) { setReply(r); setState('ready'); } }, error => {
      if (!alive) return;
      if (error instanceof ServiceError && error.code === 'FEATURE_DISABLED') { setState('disabled'); return; }
      setMessage(error instanceof ServiceError ? error.message : 'External listings are unavailable right now.');
      setState('error');
    });
    return () => { alive = false; };
  }, [kind, cityName, query, session?.user.id]);

  if (state === 'disabled') return null;
  const label = kind === 'jobs' ? 'jobs' : 'events';
  return (
    <View style={styles.panel} testID={`external-${kind}`}>
      <Text accessibilityRole="header" style={styles.title}>More {label} from partner sources</Text>
      <Text style={styles.muted}>These come from the providers named on each entry, not from Stuora students. Opening one takes you to the provider’s site.</Text>
      {!session ? <Text style={styles.muted}>Sign in to see partner {label}.</Text> : null}
      {session && !isPlausibleCity(cityName) ? <Text style={styles.muted}>Choose a city to see partner {label}.</Text> : null}
      {state === 'loading' ? <ActivityIndicator accessibilityLabel={`Loading partner ${label}`} /> : null}
      {state === 'error' ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
      {state === 'ready' && reply && !reply.items.length ? <Text style={styles.muted}>No partner {label} found for {cityName}.</Text> : null}
      {reply?.items.map(item => (
        <Pressable key={item.id} accessibilityRole="link" accessibilityLabel={`${item.title}, from ${item.source}, opens external site`}
          onPress={() => void Linking.openURL(item.url)} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <Text style={styles.itemMeta}>{[item.subtitle, item.location, item.startsAt ? new Date(item.startsAt).toLocaleString() : null].filter(Boolean).join(' · ')}</Text>
          <Text style={styles.itemSource}>Source: {reply.sources.find(src => src.id === item.source)?.label ?? item.source} ↗</Text>
        </Pressable>
      ))}
      {reply?.sources.length ? (
        <View style={styles.attribution}>
          {reply.sources.map(src => (
            <Pressable key={src.id} accessibilityRole="link" onPress={() => void Linking.openURL(src.url)}>
              <Text style={styles.attributionText}>{src.status === 'ok' ? src.label : `${src.label} (unavailable)`}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E9EAF1', padding: 16, gap: 10 },
  title: { fontSize: 16, fontWeight: '900', color: '#11162F' },
  muted: { fontSize: 12, color: '#555C72', lineHeight: 18 },
  error: { fontSize: 12, color: '#A3123A' },
  item: { borderTopWidth: 1, borderTopColor: '#E9EAF1', paddingTop: 10, gap: 3, minHeight: 44 },
  pressed: { opacity: 0.7 },
  itemTitle: { fontSize: 14, fontWeight: '800', color: '#11162F' },
  itemMeta: { fontSize: 12, color: '#3D4459' },
  itemSource: { fontSize: 11, color: '#4325C9', fontWeight: '700' },
  attribution: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, borderTopWidth: 1, borderTopColor: '#E9EAF1', paddingTop: 8 },
  attributionText: { fontSize: 11, color: '#555C72', textDecorationLine: 'underline', paddingVertical: 6 },
});
