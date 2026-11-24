import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../account/AuthProvider';
import { isPlausibleCity } from '../ai/botCore';
import { loadExternalFeed, ServiceError, type FeedReply } from '../backend/externalData';
import { externalFeedOutcome, type FeedKind } from '../backend/externalFeedReply';

type RequestState = { phase: 'loading' | 'disabled' } | { phase: 'error'; message: string } | { phase: 'ready'; reply: FeedReply };

/** Third-party jobs/events, fetched and cached server-side. */
export default function ExternalFeed({ kind, city, search }: { kind: FeedKind; city: string; search: string }) {
  const { session } = useAuth();
  const cityName = city.trim();
  const query = search.trim().slice(0, 60);
  return (
    <View style={styles.panel} testID={`external-${kind}`}>
      <Text accessibilityRole="header" style={styles.title}>More {kind} from external sources</Text>
      <Text style={styles.muted}>These come from the providers named on each entry, not from Stuora students. Opening one takes you to the provider’s site.</Text>
      {!session ? <Text style={styles.muted}>Sign in to see external {kind}.</Text>
        : !isPlausibleCity(cityName) ? <Text style={styles.muted}>Choose a city to see external {kind}.</Text>
        : <ExternalFeedRequest key={JSON.stringify([session.user.id, kind, cityName, query])} kind={kind} city={cityName} query={query} />}
    </View>
  );
}

function ExternalFeedRequest({ kind, city, query }: { kind: FeedKind; city: string; query: string }) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<RequestState>({ phase: 'loading' });
  const [linkError, setLinkError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setState({ phase: 'loading' });
    setLinkError(false);
    loadExternalFeed(kind, city, query, controller.signal).then(reply => {
      if (!controller.signal.aborted) setState({ phase: 'ready', reply });
    }, error => {
      if (controller.signal.aborted) return;
      if (error instanceof ServiceError && error.code === 'FEATURE_DISABLED') {
        setState({ phase: 'disabled' });
        return;
      }
      setState({ phase: 'error', message: error instanceof ServiceError ? error.message : 'External listings are unavailable right now.' });
    });
    return () => controller.abort();
  }, [kind, city, query, revision]);

  const retry = () => setRevision(n => n + 1);
  const openProvider = async (url: string) => {
    setLinkError(false);
    try { await Linking.openURL(url); } catch { setLinkError(true); }
  };
  const reply = state.phase === 'ready' ? state.reply : null;
  const outcome = reply ? externalFeedOutcome(reply) : null;
  return (
    <>
      {state.phase === 'loading' ? <ActivityIndicator accessibilityLabel={`Loading external ${kind}`} /> : null}
      {state.phase === 'disabled' ? <Text style={styles.muted}>External {kind} aren’t enabled yet. Stuora listings are separate.</Text> : null}
      {state.phase === 'error' ? <Text accessibilityRole="alert" style={styles.error}>{state.message}</Text> : null}
      {outcome === 'unavailable' ? <Text accessibilityRole="alert" style={styles.error}>External {kind} couldn’t be checked. Try again shortly.</Text> : null}
      {outcome === 'partial' ? <Text accessibilityRole="alert" style={styles.error}>Some external sources are unavailable. Results may be incomplete.</Text> : null}
      {outcome === 'empty' ? <Text style={styles.muted}>No external {kind} found for {city}.</Text> : null}
      {state.phase === 'error' || state.phase === 'disabled' || outcome === 'unavailable' || outcome === 'partial' ? (
        <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}>
          <Text style={styles.itemSource}>Retry external {kind}</Text>
        </Pressable>
      ) : null}
      {linkError ? <Text accessibilityRole="alert" style={styles.error}>The provider’s website couldn’t be opened.</Text> : null}
      {reply?.items.map(item => (
        <Pressable key={item.id} accessibilityRole="link" accessibilityLabel={`${item.title}, from ${item.source}, opens external site`}
          onPress={() => void openProvider(item.url)} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <Text style={styles.itemMeta}>{[item.subtitle, item.location, item.startsAt ? new Date(item.startsAt).toLocaleString() : null].filter(Boolean).join(' · ')}</Text>
          <Text style={styles.itemSource}>Source: {reply.sources.find(src => src.id === item.source)?.label ?? item.source} ↗</Text>
        </Pressable>
      ))}
      {reply?.sources.length ? (
        <View style={styles.attribution}>
          {reply.sources.map(src => (
            <Pressable key={src.id} accessibilityRole="link" onPress={() => void openProvider(src.url)}>
              <Text style={styles.attributionText}>{src.status === 'ok' ? src.label : `${src.label} (unavailable)`}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E9EAF1', padding: 16, gap: 10 },
  title: { fontSize: 16, fontWeight: '900', color: '#11162F' },
  muted: { fontSize: 12, color: '#555C72', lineHeight: 18 },
  error: { fontSize: 12, color: '#A3123A' },
  item: { borderTopWidth: 1, borderTopColor: '#E9EAF1', paddingTop: 10, gap: 3, minHeight: 44 },
  pressed: { opacity: 0.7 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  itemTitle: { fontSize: 14, fontWeight: '800', color: '#11162F' },
  itemMeta: { fontSize: 12, color: '#3D4459' },
  itemSource: { fontSize: 11, color: '#4325C9', fontWeight: '700' },
  attribution: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, borderTopWidth: 1, borderTopColor: '#E9EAF1', paddingTop: 8 },
  attributionText: { fontSize: 11, color: '#555C72', textDecorationLine: 'underline', paddingVertical: 6 },
});
