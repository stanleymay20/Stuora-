import React, { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

type Tab = 'home' | 'explore' | 'create' | 'messages' | 'profile';
type Category = 'Housing' | 'Marketplace' | 'Trips' | 'Jobs' | 'Events' | 'People';

type Listing = {
  id: string;
  category: Category;
  emoji: string;
  title: string;
  subtitle: string;
  detail: string;
  price?: string;
  badge?: string;
};

const BRAND = {
  ink: '#10162F',
  muted: '#667085',
  line: '#E8EAF1',
  soft: '#F7F7FB',
  purple: '#6D4AFF',
  cyan: '#1BB8F6',
  green: '#16A36A',
  white: '#FFFFFF',
};

const categories: { name: Category; emoji: string }[] = [
  { name: 'Housing', emoji: '🏠' },
  { name: 'Marketplace', emoji: '🛍️' },
  { name: 'Trips', emoji: '🧳' },
  { name: 'Jobs', emoji: '💼' },
  { name: 'Events', emoji: '🎟️' },
  { name: 'People', emoji: '👥' },
];

const seedListings: Listing[] = [
  {
    id: 'h1',
    category: 'Housing',
    emoji: '🛏️',
    title: 'Bright room in shared apartment',
    subtitle: 'Prenzlauer Berg, Berlin',
    detail: 'Available 1 Nov · Furnished · 20 m²',
    price: '€620 / month',
    badge: 'Verified host',
  },
  {
    id: 'm1',
    category: 'Marketplace',
    emoji: '🪑',
    title: 'IKEA desk — excellent condition',
    subtitle: 'Kreuzberg · 1.2 km away',
    detail: 'Pickup available this weekend',
    price: '€40',
    badge: 'Student seller',
  },
  {
    id: 't1',
    category: 'Trips',
    emoji: '🏰',
    title: 'Berlin → Prague weekend',
    subtitle: '23–25 Oct · 4 going',
    detail: 'Train + hostel · 2 spaces left',
    price: '~€125',
    badge: 'Trip group',
  },
  {
    id: 'j1',
    category: 'Jobs',
    emoji: '🤖',
    title: 'Working Student — Data & AI',
    subtitle: 'TechStart GmbH · Berlin · Hybrid',
    detail: '16–20 hours/week · Python · SQL',
    price: '€20/hour',
    badge: 'Verified employer',
  },
  {
    id: 'e1',
    category: 'Events',
    emoji: '⚽',
    title: 'Student football tonight',
    subtitle: 'Tempelhofer Feld · 18:30',
    detail: '7 of 12 spots filled',
    price: 'Free',
    badge: 'Open event',
  },
  {
    id: 'p1',
    category: 'People',
    emoji: '👩🏽‍💻',
    title: 'Maya — Computer Science',
    subtitle: 'New to Berlin · speaks EN / DE',
    detail: 'AI · hiking · photography',
    badge: 'Student verified',
  },
  {
    id: 'h2',
    category: 'Housing',
    emoji: '🏡',
    title: 'Room in Neukölln WG',
    subtitle: 'Neukölln, Berlin',
    detail: 'Available now · Bills included',
    price: '€570 / month',
    badge: 'Roommate wanted',
  },
  {
    id: 'm2',
    category: 'Marketplace',
    emoji: '🚲',
    title: 'City bike',
    subtitle: 'Friedrichshain · 2.4 km away',
    detail: 'Recently serviced · lock included',
    price: '€120',
    badge: 'Good condition',
  },
];

const threads = [
  { name: 'Emma L.', message: 'Is the room still available?', time: '10:24', emoji: '👩🏻' },
  { name: 'Berlin → Prague', message: 'Lukas: See you all at 10!', time: '09:41', emoji: '🧳' },
  { name: 'Max K.', message: 'Sounds good!', time: 'Yesterday', emoji: '👨🏽' },
  { name: 'Housing Berlin', message: 'You: Thanks!', time: 'Mon', emoji: '🏠' },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brandRow}>
      <View style={[styles.logoMark, compact && styles.logoMarkCompact]}>
        <Text style={[styles.logoLetter, compact && styles.logoLetterCompact]}>S</Text>
      </View>
      {!compact && <Text style={styles.brandName}>Stuora</Text>}
    </View>
  );
}

function Pill({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <View style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{children}</Text>
    </View>
  );
}

function ListingCard({ item }: { item: Listing }) {
  return (
    <Pressable style={({ pressed }) => [styles.listingCard, pressed && styles.pressed]}>
      <View style={styles.listingVisual}>
        <Text style={styles.listingEmoji}>{item.emoji}</Text>
      </View>
      <View style={styles.listingBody}>
        <View style={styles.rowBetween}>
          <Pill>{item.category}</Pill>
          <Text style={styles.heart}>♡</Text>
        </View>
        <Text style={styles.listingTitle}>{item.title}</Text>
        <Text style={styles.listingSubtitle}>{item.subtitle}</Text>
        <Text style={styles.listingDetail}>{item.detail}</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.listingPrice}>{item.price ?? ''}</Text>
          {item.badge ? <Text style={styles.badge}>{item.badge}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const [tab, setTab] = useState<Tab>('home');
  const [category, setCategory] = useState<Category>('Housing');
  const [listings, setListings] = useState(seedListings);
  const [search, setSearch] = useState('');
  const [draftType, setDraftType] = useState<Category>('Marketplace');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSubtitle, setDraftSubtitle] = useState('');
  const [draftPrice, setDraftPrice] = useState('');
  const [published, setPublished] = useState(false);

  const filteredListings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter((item) => {
      const inCategory = item.category === category;
      const matches = !q || `${item.title} ${item.subtitle} ${item.detail}`.toLowerCase().includes(q);
      return inCategory && matches;
    });
  }, [category, listings, search]);

  const goToCategory = (next: Category) => {
    setCategory(next);
    setSearch('');
    setTab('explore');
  };

  const publish = () => {
    if (!draftTitle.trim() || !draftSubtitle.trim()) return;
    const categoryEmoji = categories.find((item) => item.name === draftType)?.emoji ?? '✨';
    setListings((current) => [
      {
        id: `user-${Date.now()}`,
        category: draftType,
        emoji: categoryEmoji,
        title: draftTitle.trim(),
        subtitle: draftSubtitle.trim(),
        detail: 'Posted just now',
        price: draftPrice.trim() || undefined,
        badge: 'Your listing',
      },
      ...current,
    ]);
    setCategory(draftType);
    setDraftTitle('');
    setDraftSubtitle('');
    setDraftPrice('');
    setPublished(true);
    setTimeout(() => setPublished(false), 2200);
    setTab('explore');
  };

  const navItems: { key: Tab; label: string }[] = [
    { key: 'home', label: 'Home' },
    { key: 'explore', label: 'Explore' },
    { key: 'create', label: 'Create' },
    { key: 'messages', label: 'Messages' },
    { key: 'profile', label: 'You' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={BRAND.white} />
      <View style={styles.appShell}>
        <View style={[styles.topBar, isDesktop && styles.topBarDesktop]}>
          <BrandMark />
          {isDesktop ? (
            <View style={styles.desktopNav}>
              {navItems.map((item) => (
                <Pressable key={item.key} onPress={() => setTab(item.key)} style={styles.desktopNavButton}>
                  <Text style={[styles.desktopNavText, tab === item.key && styles.desktopNavTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.locationPill}>
              <Text style={styles.locationText}>📍 Berlin</Text>
            </View>
          )}
        </View>

        <View style={[styles.contentFrame, isDesktop && styles.contentFrameDesktop]}>
          {tab === 'home' && (
            <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
              <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
                <View style={styles.heroCopy}>
                  <Text style={styles.eyebrow}>STUDENT LIFE, CONNECTED</Text>
                  <Text style={styles.heroTitle}>Find your people. Find your place.</Text>
                  <Text style={styles.heroText}>
                    Housing, marketplace, trips, jobs and student communities — without depending on your university.
                  </Text>
                </View>
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeEmoji}>🎓</Text>
                  <Text style={styles.heroBadgeText}>Berlin MVP</Text>
                </View>
              </View>

              <View style={styles.searchBox}>
                <Text style={styles.searchIcon}>⌕</Text>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  onSubmitEditing={() => setTab('explore')}
                  placeholder="Search housing, jobs, trips, people…"
                  placeholderTextColor="#98A2B3"
                  style={styles.searchInput}
                />
              </View>

              <Text style={styles.sectionTitle}>Explore Stuora</Text>
              <View style={styles.categoryGrid}>
                {categories.map((item) => (
                  <Pressable
                    key={item.name}
                    onPress={() => goToCategory(item.name)}
                    style={({ pressed }) => [styles.categoryCard, pressed && styles.pressed]}
                  >
                    <Text style={styles.categoryEmoji}>{item.emoji}</Text>
                    <Text style={styles.categoryName}>{item.name}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>For you in Berlin</Text>
                <Pressable onPress={() => setTab('explore')}>
                  <Text style={styles.linkText}>See all</Text>
                </Pressable>
              </View>
              <View style={styles.cardsGrid}>
                {listings.slice(0, isDesktop ? 6 : 4).map((item) => (
                  <View key={item.id} style={isDesktop ? styles.desktopCardWrap : undefined}>
                    <ListingCard item={item} />
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {tab === 'explore' && (
            <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
              <Text style={styles.pageTitle}>Explore</Text>
              <Text style={styles.pageSubtitle}>Useful things happening around student life in Berlin.</Text>
              <View style={styles.searchBox}>
                <Text style={styles.searchIcon}>⌕</Text>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={`Search ${category.toLowerCase()}…`}
                  placeholderTextColor="#98A2B3"
                  style={styles.searchInput}
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {categories.map((item) => (
                  <Pressable key={item.name} onPress={() => setCategory(item.name)}>
                    <Pill active={category === item.name}>{`${item.emoji} ${item.name}`}</Pill>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.resultHeader}>
                <Text style={styles.sectionTitle}>{category}</Text>
                <Text style={styles.resultCount}>{filteredListings.length} results</Text>
              </View>
              <View style={styles.cardsGrid}>
                {filteredListings.map((item) => (
                  <View key={item.id} style={isDesktop ? styles.desktopCardWrap : undefined}>
                    <ListingCard item={item} />
                  </View>
                ))}
              </View>
              {filteredListings.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyEmoji}>🔎</Text>
                  <Text style={styles.emptyTitle}>Nothing matches yet</Text>
                  <Text style={styles.emptyText}>Try another search or create the first listing in this category.</Text>
                </View>
              ) : null}
            </ScrollView>
          )}

          {tab === 'create' && (
            <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
              <Text style={styles.pageTitle}>Create</Text>
              <Text style={styles.pageSubtitle}>If it is visible in Stuora, it should work. Start with a real listing.</Text>
              <Text style={styles.formLabel}>What are you posting?</Text>
              <View style={styles.wrapRow}>
                {categories.filter((item) => item.name !== 'People').map((item) => (
                  <Pressable key={item.name} onPress={() => setDraftType(item.name)}>
                    <Pill active={draftType === item.name}>{`${item.emoji} ${item.name}`}</Pill>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.formLabel}>Title</Text>
              <TextInput
                value={draftTitle}
                onChangeText={setDraftTitle}
                placeholder="e.g. Desk for sale"
                placeholderTextColor="#98A2B3"
                style={styles.field}
              />
              <Text style={styles.formLabel}>Location or short description</Text>
              <TextInput
                value={draftSubtitle}
                onChangeText={setDraftSubtitle}
                placeholder="e.g. Neukölln · pickup only"
                placeholderTextColor="#98A2B3"
                style={styles.field}
              />
              <Text style={styles.formLabel}>Price / compensation (optional)</Text>
              <TextInput
                value={draftPrice}
                onChangeText={setDraftPrice}
                placeholder="e.g. €35"
                placeholderTextColor="#98A2B3"
                style={styles.field}
              />
              <Pressable
                onPress={publish}
                disabled={!draftTitle.trim() || !draftSubtitle.trim()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (!draftTitle.trim() || !draftSubtitle.trim()) && styles.primaryButtonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>Publish to Stuora</Text>
              </Pressable>
              {published ? <Text style={styles.successText}>✓ Published successfully</Text> : null}
              <View style={styles.noteCard}>
                <Text style={styles.noteTitle}>MVP rule</Text>
                <Text style={styles.noteText}>
                  Photos, payments and identity verification will only appear after their complete backend flows exist.
                </Text>
              </View>
            </ScrollView>
          )}

          {tab === 'messages' && (
            <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
              <Text style={styles.pageTitle}>Messages</Text>
              <Text style={styles.pageSubtitle}>Conversations stay tied to the thing you are doing.</Text>
              {threads.map((thread, index) => (
                <Pressable key={`${thread.name}-${index}`} style={({ pressed }) => [styles.thread, pressed && styles.pressed]}>
                  <View style={styles.avatar}><Text style={styles.avatarEmoji}>{thread.emoji}</Text></View>
                  <View style={styles.threadBody}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.threadName}>{thread.name}</Text>
                      <Text style={styles.threadTime}>{thread.time}</Text>
                    </View>
                    <Text style={styles.threadMessage}>{thread.message}</Text>
                  </View>
                </Pressable>
              ))}
              <View style={styles.demoConversation}>
                <Text style={styles.conversationTitle}>Room enquiry · Emma L.</Text>
                <View style={styles.bubbleIncoming}><Text style={styles.bubbleText}>Hey! Is the room still available?</Text></View>
                <View style={styles.bubbleOutgoing}><Text style={styles.bubbleTextOutgoing}>Yes — would you like to arrange a viewing?</Text></View>
                <View style={styles.bubbleIncoming}><Text style={styles.bubbleText}>Thursday at 5pm would be great.</Text></View>
              </View>
            </ScrollView>
          )}

          {tab === 'profile' && (
            <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
              <View style={styles.profileHeader}>
                <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>S</Text></View>
                <View style={styles.profileCopy}>
                  <Text style={styles.pageTitle}>Your Stuora Passport</Text>
                  <Text style={styles.pageSubtitle}>Portable trust across housing, marketplace, trips and work.</Text>
                </View>
              </View>
              <View style={styles.verifiedCard}>
                <View>
                  <Text style={styles.verifiedTitle}>Student profile</Text>
                  <Text style={styles.verifiedText}>Berlin · Data & AI · English / German</Text>
                </View>
                <Pill active>✓ Verified demo</Pill>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statCard}><Text style={styles.statNumber}>4.9</Text><Text style={styles.statLabel}>Rating</Text></View>
                <View style={styles.statCard}><Text style={styles.statNumber}>12</Text><Text style={styles.statLabel}>Connections</Text></View>
                <View style={styles.statCard}><Text style={styles.statNumber}>3</Text><Text style={styles.statLabel}>Listings</Text></View>
              </View>
              {['My listings', 'Saved', 'My trips', 'Job applications', 'Privacy & safety', 'Settings'].map((label) => (
                <Pressable key={label} style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}>
                  <Text style={styles.menuText}>{label}</Text><Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        {!isDesktop && (
          <View style={styles.bottomNav}>
            {navItems.map((item) => (
              <Pressable key={item.key} onPress={() => setTab(item.key)} style={styles.navButton}>
                <Text style={[styles.navLabel, tab === item.key && styles.navLabelActive]}>{item.label}</Text>
                {tab === item.key ? <View style={styles.navDot} /> : null}
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BRAND.white },
  appShell: { flex: 1, backgroundColor: BRAND.soft },
  topBar: {
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: BRAND.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarDesktop: { paddingHorizontal: 32, minHeight: 72 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center' },
  logoMarkCompact: { width: 30, height: 30, borderRadius: 9 },
  logoLetter: { color: BRAND.white, fontSize: 24, fontWeight: '900', fontStyle: 'italic' },
  logoLetterCompact: { fontSize: 18 },
  brandName: { color: BRAND.ink, fontSize: 25, fontWeight: '900', letterSpacing: -0.7 },
  locationPill: { backgroundColor: BRAND.soft, borderWidth: 1, borderColor: BRAND.line, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  locationText: { color: BRAND.ink, fontSize: 13, fontWeight: '700' },
  desktopNav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  desktopNavButton: { paddingHorizontal: 12, paddingVertical: 10 },
  desktopNavText: { color: BRAND.muted, fontWeight: '700' },
  desktopNavTextActive: { color: BRAND.purple },
  contentFrame: { flex: 1 },
  contentFrameDesktop: { width: '100%', maxWidth: 1180, alignSelf: 'center' },
  page: { padding: 18, paddingBottom: 110, gap: 14 },
  hero: { backgroundColor: BRAND.ink, borderRadius: 24, padding: 22, gap: 20 },
  heroDesktop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 34 },
  heroCopy: { flex: 1, maxWidth: 680 },
  eyebrow: { color: '#B7A9FF', fontSize: 12, fontWeight: '900', letterSpacing: 1.2, marginBottom: 8 },
  heroTitle: { color: BRAND.white, fontSize: 34, lineHeight: 38, fontWeight: '900', letterSpacing: -1.2 },
  heroText: { color: '#D5D8E5', marginTop: 10, fontSize: 15, lineHeight: 22 },
  heroBadge: { alignSelf: 'flex-start', backgroundColor: '#1B2347', borderRadius: 18, padding: 16, minWidth: 120, alignItems: 'center' },
  heroBadgeEmoji: { fontSize: 32 },
  heroBadgeText: { color: BRAND.white, marginTop: 6, fontWeight: '800' },
  searchBox: { backgroundColor: BRAND.white, borderWidth: 1, borderColor: BRAND.line, borderRadius: 16, paddingHorizontal: 14, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchIcon: { fontSize: 22, color: BRAND.muted },
  searchInput: { flex: 1, color: BRAND.ink, fontSize: 15, outlineStyle: Platform.OS === 'web' ? 'none' : undefined } as any,
  sectionTitle: { color: BRAND.ink, fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  pageTitle: { color: BRAND.ink, fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  pageSubtitle: { color: BRAND.muted, fontSize: 15, lineHeight: 22, marginTop: -7 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryCard: { minWidth: 104, flexGrow: 1, backgroundColor: BRAND.white, borderWidth: 1, borderColor: BRAND.line, borderRadius: 18, padding: 15, alignItems: 'center', gap: 7 },
  categoryEmoji: { fontSize: 26 },
  categoryName: { color: BRAND.ink, fontWeight: '800', fontSize: 13 },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  desktopCardWrap: { width: '48.8%' },
  listingCard: { backgroundColor: BRAND.white, borderWidth: 1, borderColor: BRAND.line, borderRadius: 20, overflow: 'hidden', flexDirection: 'row', minHeight: 156, width: '100%' },
  listingVisual: { width: 100, backgroundColor: '#EEEAFE', alignItems: 'center', justifyContent: 'center' },
  listingEmoji: { fontSize: 42 },
  listingBody: { flex: 1, padding: 14, gap: 5 },
  listingTitle: { color: BRAND.ink, fontSize: 16, fontWeight: '900', lineHeight: 20 },
  listingSubtitle: { color: BRAND.muted, fontSize: 13 },
  listingDetail: { color: '#7B8194', fontSize: 12, lineHeight: 17 },
  listingPrice: { color: BRAND.ink, fontSize: 15, fontWeight: '900' },
  badge: { color: BRAND.green, fontSize: 11, fontWeight: '800' },
  heart: { color: BRAND.muted, fontSize: 22 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pill: { alignSelf: 'flex-start', backgroundColor: '#F0F1F5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginRight: 7, marginBottom: 7 },
  pillActive: { backgroundColor: '#EAE5FF' },
  pillText: { color: BRAND.muted, fontSize: 11, fontWeight: '800' },
  pillTextActive: { color: BRAND.purple },
  linkText: { color: BRAND.purple, fontWeight: '800' },
  chipsRow: { paddingVertical: 2 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultCount: { color: BRAND.muted, fontSize: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 38 },
  emptyTitle: { color: BRAND.ink, fontSize: 18, fontWeight: '900', marginTop: 10 },
  emptyText: { color: BRAND.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  formLabel: { color: BRAND.ink, fontWeight: '800', marginTop: 4 },
  field: { backgroundColor: BRAND.white, color: BRAND.ink, borderWidth: 1, borderColor: BRAND.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, outlineStyle: Platform.OS === 'web' ? 'none' : undefined } as any,
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap' },
  primaryButton: { marginTop: 6, backgroundColor: BRAND.purple, minHeight: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryButtonText: { color: BRAND.white, fontSize: 15, fontWeight: '900' },
  successText: { color: BRAND.green, textAlign: 'center', fontWeight: '800' },
  noteCard: { marginTop: 10, padding: 16, backgroundColor: '#FFF9E8', borderRadius: 16, borderWidth: 1, borderColor: '#F4E7AF' },
  noteTitle: { color: BRAND.ink, fontWeight: '900', marginBottom: 5 },
  noteText: { color: BRAND.muted, lineHeight: 20 },
  thread: { backgroundColor: BRAND.white, borderWidth: 1, borderColor: BRAND.line, borderRadius: 17, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1EEFF', alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 22 },
  threadBody: { flex: 1, gap: 3 },
  threadName: { color: BRAND.ink, fontWeight: '900' },
  threadTime: { color: BRAND.muted, fontSize: 11 },
  threadMessage: { color: BRAND.muted, fontSize: 13 },
  demoConversation: { backgroundColor: BRAND.white, borderWidth: 1, borderColor: BRAND.line, borderRadius: 20, padding: 16, marginTop: 8, gap: 10 },
  conversationTitle: { color: BRAND.ink, fontWeight: '900', marginBottom: 4 },
  bubbleIncoming: { alignSelf: 'flex-start', backgroundColor: '#F0F1F5', padding: 11, borderRadius: 14, maxWidth: '82%' },
  bubbleOutgoing: { alignSelf: 'flex-end', backgroundColor: BRAND.purple, padding: 11, borderRadius: 14, maxWidth: '82%' },
  bubbleText: { color: BRAND.ink, lineHeight: 19 },
  bubbleTextOutgoing: { color: BRAND.white, lineHeight: 19 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileAvatar: { width: 68, height: 68, borderRadius: 24, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { color: BRAND.white, fontSize: 31, fontWeight: '900' },
  profileCopy: { flex: 1 },
  verifiedCard: { backgroundColor: BRAND.white, borderRadius: 18, borderWidth: 1, borderColor: BRAND.line, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  verifiedTitle: { color: BRAND.ink, fontWeight: '900', fontSize: 16 },
  verifiedText: { color: BRAND.muted, marginTop: 4, fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: BRAND.white, borderRadius: 16, borderWidth: 1, borderColor: BRAND.line, padding: 15, alignItems: 'center' },
  statNumber: { color: BRAND.ink, fontSize: 22, fontWeight: '900' },
  statLabel: { color: BRAND.muted, fontSize: 11, marginTop: 3 },
  menuRow: { backgroundColor: BRAND.white, borderBottomWidth: 1, borderBottomColor: BRAND.line, paddingHorizontal: 15, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  menuText: { color: BRAND.ink, fontWeight: '700' },
  chevron: { color: BRAND.muted, fontSize: 22 },
  bottomNav: { backgroundColor: BRAND.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BRAND.line, paddingHorizontal: 8, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 18 : 10, flexDirection: 'row' },
  navButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, gap: 5 },
  navLabel: { color: BRAND.muted, fontSize: 11, fontWeight: '800' },
  navLabelActive: { color: BRAND.purple },
  navDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: BRAND.purple },
  pressed: { opacity: 0.72 },
});
