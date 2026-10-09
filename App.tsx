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
  ink: '#11162F',
  inkSoft: '#252B4A',
  muted: '#747B91',
  subtle: '#9AA1B5',
  line: '#E9EAF1',
  soft: '#F7F7FB',
  purple: '#7048FF',
  purpleSoft: '#EEE9FF',
  cyan: '#22B7F1',
  green: '#1BA56F',
  greenSoft: '#EAF9F2',
  white: '#FFFFFF',
};

const categories: { name: Category; emoji: string; tint: string }[] = [
  { name: 'Housing', emoji: '🏠', tint: '#E9F8ED' },
  { name: 'Marketplace', emoji: '🛍️', tint: '#FFF0F3' },
  { name: 'Trips', emoji: '🧳', tint: '#E9F7FF' },
  { name: 'Jobs', emoji: '💼', tint: '#FFF4E8' },
  { name: 'Events', emoji: '🎟️', tint: '#FFF0F5' },
  { name: 'People', emoji: '👥', tint: '#F1EEFF' },
];

const visualTone: Record<Category, string> = {
  Housing: '#E9E1D8',
  Marketplace: '#E7E3DE',
  Trips: '#DDECF3',
  Jobs: '#E8EAF7',
  Events: '#EEE0F0',
  People: '#E7E2F3',
};

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
        <View style={styles.logoFoldTop} />
        <View style={styles.logoFoldBottom} />
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

function CategoryTile({ item, onPress }: { item: (typeof categories)[number]; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.categoryTile, pressed && styles.pressed]}>
      <View style={[styles.categoryIcon, { backgroundColor: item.tint }]}>
        <Text style={styles.categoryEmoji}>{item.emoji}</Text>
      </View>
      <Text style={styles.categoryName}>{item.name}</Text>
    </Pressable>
  );
}

function ListingCard({ item, compact = false }: { item: Listing; compact?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [styles.listingCard, compact && styles.listingCardCompact, pressed && styles.pressed]}>
      <View style={[styles.listingVisual, { backgroundColor: visualTone[item.category] }, compact && styles.listingVisualCompact]}>
        <View style={styles.visualBadge}>
          <Text style={styles.visualBadgeText}>{item.category}</Text>
        </View>
        <Text style={[styles.listingEmoji, compact && styles.listingEmojiCompact]}>{item.emoji}</Text>
        <View style={styles.visualShine} />
        <View style={styles.favoriteButton}><Text style={styles.favoriteText}>♡</Text></View>
      </View>
      <View style={styles.listingBody}>
        <Text style={styles.listingTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.listingPrice}>{item.price ?? 'Student offer'}</Text>
        <Text style={styles.listingSubtitle} numberOfLines={1}>{item.subtitle}</Text>
        <Text style={styles.listingDetail} numberOfLines={1}>{item.detail}</Text>
        {item.badge ? (
          <View style={styles.trustRow}>
            <View style={styles.trustDot} />
            <Text style={styles.badge}>{item.badge}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function SearchField({ value, onChangeText, placeholder, onSubmit }: { value: string; onChangeText: (value: string) => void; placeholder: string; onSubmit?: () => void }) {
  return (
    <View style={styles.searchBox}>
      <Text style={styles.searchIcon}>⌕</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor="#A2A8B8"
        style={styles.searchInput}
      />
    </View>
  );
}

export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const [tab, setTab] = useState<Tab>('home');
  const [category, setCategory] = useState<Category>('Housing');
  const [listings, setListings] = useState(seedListings);
  const [search, setSearch] = useState('');
  const [draftType, setDraftType] = useState<Category>('Marketplace');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSubtitle, setDraftSubtitle] = useState('');
  const [draftPrice, setDraftPrice] = useState('');
  const [published, setPublished] = useState(false);
  const [selectedThread, setSelectedThread] = useState(0);

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
    setTimeout(() => setPublished(false), 3000);
    setTab('explore');
  };

  const bottomNav: { key: Tab; label: string; icon: string }[] = [
    { key: 'home', label: 'Home', icon: '⌂' },
    { key: 'explore', label: 'Explore', icon: '⌕' },
    { key: 'create', label: 'Create', icon: '+' },
    { key: 'messages', label: 'Messages', icon: '◫' },
    { key: 'profile', label: 'You', icon: '○' },
  ];

  const sidebarItems: { label: string; icon: string; action: () => void; active: boolean }[] = [
    { label: 'Home', icon: '⌂', action: () => setTab('home'), active: tab === 'home' },
    ...categories.map((item) => ({
      label: item.name,
      icon: item.emoji,
      action: () => goToCategory(item.name),
      active: tab === 'explore' && category === item.name,
    })),
    { label: 'Messages', icon: '◫', action: () => setTab('messages'), active: tab === 'messages' },
    { label: 'You', icon: '○', action: () => setTab('profile'), active: tab === 'profile' },
  ];

  const currentThread = threads[selectedThread] ?? threads[0];

  const content = (
    <View style={styles.contentFrame}>
      {tab === 'home' && (
        <ScrollView contentContainerStyle={[styles.page, isDesktop && styles.pageDesktop]} showsVerticalScrollIndicator={false}>
          {!isDesktop ? (
            <View style={styles.mobileWelcomeRow}>
              <View>
                <Text style={styles.greeting}>Good afternoon 👋</Text>
                <Text style={styles.mobileHeading}>Make the most of student life.</Text>
              </View>
              <View style={styles.locationChip}><Text style={styles.locationChipText}>📍 Berlin</Text></View>
            </View>
          ) : null}

          <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
            <View style={styles.heroOrbOne} />
            <View style={styles.heroOrbTwo} />
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>STUDENT LIFE, CONNECTED</Text>
              <Text style={[styles.heroTitle, isDesktop && styles.heroTitleDesktop]}>Find your people.{isDesktop ? '\n' : ' '}Find your place.</Text>
              <Text style={styles.heroText}>Housing, things, trips, jobs and student communities — all in one trusted local network.</Text>
              {isDesktop ? (
                <View style={styles.heroSearchWrap}>
                  <SearchField value={search} onChangeText={setSearch} placeholder="Search housing, jobs, trips, people…" onSubmit={() => setTab('explore')} />
                </View>
              ) : null}
            </View>
            <View style={styles.heroCityCard}>
              <Text style={styles.heroCityIcon}>🏙️</Text>
              <Text style={styles.heroCityTitle}>Berlin</Text>
              <Text style={styles.heroCitySub}>Student network</Text>
            </View>
          </View>

          {!isDesktop ? <SearchField value={search} onChangeText={setSearch} placeholder="Search people, housing, jobs, events…" onSubmit={() => setTab('explore')} /> : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Explore Stuora</Text>
            <Text style={styles.sectionHint}>Everything outside the classroom</Text>
          </View>
          <View style={styles.categoryGrid}>
            {categories.map((item) => <CategoryTile key={item.name} item={item} onPress={() => goToCategory(item.name)} />)}
          </View>

          <View style={styles.sectionHeaderInline}>
            <View>
              <Text style={styles.sectionTitle}>For you in Berlin</Text>
              <Text style={styles.sectionHint}>Fresh opportunities around you</Text>
            </View>
            <Pressable onPress={() => setTab('explore')}><Text style={styles.linkText}>See all</Text></Pressable>
          </View>
          <View style={styles.cardsGrid}>
            {listings.slice(0, isDesktop ? 6 : 4).map((item) => (
              <View key={item.id} style={isDesktop ? styles.desktopCardWrap : styles.mobileCardWrap}>
                <ListingCard item={item} compact={!isDesktop} />
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {tab === 'explore' && (
        <ScrollView contentContainerStyle={[styles.page, isDesktop && styles.pageDesktop]} showsVerticalScrollIndicator={false}>
          {published ? (
            <View style={styles.successBanner}>
              <Text style={styles.successBannerText}>✓ Your listing was published successfully.</Text>
            </View>
          ) : null}
          <View style={styles.pageHeadingRow}>
            <View>
              <Text style={styles.pageTitle}>{category}</Text>
              <Text style={styles.pageSubtitle}>Discover trusted student listings in Berlin.</Text>
            </View>
            {isDesktop ? <Pressable onPress={() => setTab('create')} style={styles.createTopButton}><Text style={styles.createTopButtonText}>＋ Create</Text></Pressable> : null}
          </View>
          <SearchField value={search} onChangeText={setSearch} placeholder={`Search ${category.toLowerCase()}…`} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {categories.map((item) => (
              <Pressable key={item.name} onPress={() => { setCategory(item.name); setSearch(''); }}>
                <Pill active={category === item.name}>{`${item.emoji} ${item.name}`}</Pill>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.resultHeader}>
            <Text style={styles.sectionTitle}>{filteredListings.length ? 'Recommended' : 'No matches'}</Text>
            <Text style={styles.resultCount}>{filteredListings.length} results</Text>
          </View>
          <View style={styles.cardsGrid}>
            {filteredListings.map((item) => (
              <View key={item.id} style={isDesktop ? styles.desktopCardWrap : styles.mobileCardWrap}>
                <ListingCard item={item} compact={!isDesktop} />
              </View>
            ))}
          </View>
          {filteredListings.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🔎</Text>
              <Text style={styles.emptyTitle}>Nothing matches yet</Text>
              <Text style={styles.emptyText}>Try another search or publish the first useful listing in this category.</Text>
              <Pressable onPress={() => setTab('create')} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Create listing</Text></Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}

      {tab === 'create' && (
        <ScrollView contentContainerStyle={[styles.page, styles.formPage]} keyboardShouldPersistTaps="handled">
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <View style={styles.formIcon}><Text style={styles.formIconText}>＋</Text></View>
              <View style={styles.formHeaderCopy}>
                <Text style={styles.pageTitle}>Create on Stuora</Text>
                <Text style={styles.pageSubtitle}>Post something useful to the student community.</Text>
              </View>
            </View>
            <Text style={styles.formLabel}>What are you posting?</Text>
            <View style={styles.wrapRow}>
              {categories.filter((item) => item.name !== 'People').map((item) => (
                <Pressable key={item.name} onPress={() => setDraftType(item.name)}>
                  <Pill active={draftType === item.name}>{`${item.emoji} ${item.name}`}</Pill>
                </Pressable>
              ))}
            </View>
            <Text style={styles.formLabel}>Title</Text>
            <TextInput value={draftTitle} onChangeText={setDraftTitle} placeholder="e.g. Desk for sale" placeholderTextColor="#A2A8B8" style={styles.field} />
            <Text style={styles.formLabel}>Location or short description</Text>
            <TextInput value={draftSubtitle} onChangeText={setDraftSubtitle} placeholder="e.g. Neukölln · pickup only" placeholderTextColor="#A2A8B8" style={styles.field} />
            <Text style={styles.formLabel}>Price / compensation (optional)</Text>
            <TextInput value={draftPrice} onChangeText={setDraftPrice} placeholder="e.g. €35" placeholderTextColor="#A2A8B8" style={styles.field} />
            <Pressable onPress={publish} disabled={!draftTitle.trim() || !draftSubtitle.trim()} style={({ pressed }) => [styles.primaryButton, (!draftTitle.trim() || !draftSubtitle.trim()) && styles.primaryButtonDisabled, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>Publish to Stuora</Text>
            </Pressable>
            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>Stuora quality rule</Text>
              <Text style={styles.noteText}>If a feature appears in the product, it must work end-to-end. Payments, production verification and media upload stay hidden until their backend flows are ready.</Text>
            </View>
          </View>
        </ScrollView>
      )}

      {tab === 'messages' && (
        <View style={[styles.messagesPage, !isDesktop && styles.messagesPageMobile]}>
          <View style={[styles.threadPane, !isDesktop && styles.threadPaneMobile]}>
            <View style={styles.messagesHeading}>
              <Text style={styles.pageTitle}>Messages</Text>
              <Text style={styles.pageSubtitle}>Conversations tied to real activity.</Text>
            </View>
            <SearchField value="" onChangeText={() => undefined} placeholder="Search conversations…" />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.threadList}>
              {threads.map((thread, index) => (
                <Pressable key={`${thread.name}-${index}`} onPress={() => setSelectedThread(index)} style={({ pressed }) => [styles.thread, selectedThread === index && styles.threadActive, pressed && styles.pressed]}>
                  <View style={styles.avatar}><Text style={styles.avatarEmoji}>{thread.emoji}</Text></View>
                  <View style={styles.threadBody}>
                    <View style={styles.rowBetween}><Text style={styles.threadName}>{thread.name}</Text><Text style={styles.threadTime}>{thread.time}</Text></View>
                    <Text style={styles.threadMessage} numberOfLines={1}>{thread.message}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={[styles.conversationPane, !isDesktop && styles.conversationPaneMobile]}>
            <View style={styles.conversationHeader}>
              <View style={styles.avatar}><Text style={styles.avatarEmoji}>{currentThread.emoji}</Text></View>
              <View><Text style={styles.conversationName}>{currentThread.name}</Text><Text style={styles.onlineText}>● online</Text></View>
            </View>
            <View style={styles.conversationBody}>
              <View style={styles.bubbleIncoming}><Text style={styles.bubbleText}>Hey! Is the room still available?</Text></View>
              <View style={styles.bubbleOutgoing}><Text style={styles.bubbleTextOutgoing}>Yes — would you like to arrange a viewing?</Text></View>
              <View style={styles.bubbleIncoming}><Text style={styles.bubbleText}>Thursday at 5pm would be great.</Text></View>
            </View>
            <View style={styles.composer}><Text style={styles.composerPlaceholder}>Type a message…</Text><View style={styles.sendButton}><Text style={styles.sendButtonText}>➤</Text></View></View>
          </View>
        </View>
      )}

      {tab === 'profile' && (
        <ScrollView contentContainerStyle={[styles.page, styles.profilePage]} showsVerticalScrollIndicator={false}>
          <View style={styles.profileHero}>
            <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>S</Text></View>
            <View style={styles.profileCopy}>
              <Text style={styles.profileName}>Your Stuora Passport</Text>
              <Text style={styles.profileSub}>Berlin · Data & AI · English / German</Text>
              <View style={styles.profileBadges}><Pill active>✓ Verified demo</Pill><Pill>📍 Berlin</Pill></View>
            </View>
            {isDesktop ? <Pressable style={styles.editButton}><Text style={styles.editButtonText}>Edit profile</Text></Pressable> : null}
          </View>
          <Text style={styles.profileBio}>A portable trust profile for housing, marketplace, trips, events and student work.</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCard}><Text style={styles.statNumber}>4.9</Text><Text style={styles.statLabel}>Rating</Text></View>
            <View style={styles.statCard}><Text style={styles.statNumber}>12</Text><Text style={styles.statLabel}>Connections</Text></View>
            <View style={styles.statCard}><Text style={styles.statNumber}>3</Text><Text style={styles.statLabel}>Listings</Text></View>
          </View>
          <View style={styles.menuCard}>
            {['My listings', 'Saved', 'My trips', 'Job applications', 'Privacy & safety', 'Settings'].map((label, index) => (
              <Pressable key={label} style={({ pressed }) => [styles.menuRow, index === 5 && styles.menuRowLast, pressed && styles.pressed]}>
                <Text style={styles.menuText}>{label}</Text><Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={BRAND.white} />
      <View style={styles.appShell}>
        {isDesktop ? (
          <View style={styles.desktopShell}>
            <View style={styles.sidebar}>
              <BrandMark />
              <Text style={styles.sidebarTagline}>Student life, all in one place.</Text>
              <View style={styles.sidebarMenu}>
                {sidebarItems.map((item) => (
                  <Pressable key={item.label} onPress={item.action} style={({ pressed }) => [styles.sidebarItem, item.active && styles.sidebarItemActive, pressed && styles.pressed]}>
                    <Text style={styles.sidebarIcon}>{item.icon}</Text>
                    <Text style={[styles.sidebarLabel, item.active && styles.sidebarLabelActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => setTab('create')} style={styles.sidebarCreate}><Text style={styles.sidebarCreateText}>＋ Create</Text></Pressable>
              <View style={styles.sidebarFooter}><View style={styles.miniAvatar}><Text style={styles.miniAvatarText}>S</Text></View><View><Text style={styles.sidebarUser}>Student profile</Text><Text style={styles.sidebarUserSub}>Berlin</Text></View></View>
            </View>
            <View style={styles.desktopMain}>
              <View style={styles.desktopTopBar}>
                <View><Text style={styles.desktopTopTitle}>{tab === 'home' ? 'Home' : tab === 'explore' ? category : tab === 'profile' ? 'Profile' : tab[0].toUpperCase() + tab.slice(1)}</Text><Text style={styles.desktopTopSub}>Berlin student network</Text></View>
                <View style={styles.desktopTopActions}><View style={styles.locationChip}><Text style={styles.locationChipText}>📍 Berlin</Text></View><View style={styles.notificationButton}><Text>♢</Text></View></View>
              </View>
              {content}
            </View>
          </View>
        ) : (
          <>
            <View style={styles.mobileTopBar}><BrandMark /><View style={styles.mobileTopActions}><View style={styles.notificationButton}><Text>♢</Text></View><View style={styles.miniAvatar}><Text style={styles.miniAvatarText}>S</Text></View></View></View>
            {content}
            <View style={styles.bottomNav}>
              {bottomNav.map((item) => {
                const isCreate = item.key === 'create';
                return (
                  <Pressable key={item.key} onPress={() => setTab(item.key)} style={styles.navButton}>
                    <View style={[styles.navIconWrap, isCreate && styles.navIconCreate, tab === item.key && !isCreate && styles.navIconActive]}><Text style={[styles.navIcon, isCreate && styles.navIconCreateText]}>{item.icon}</Text></View>
                    {!isCreate ? <Text style={[styles.navLabel, tab === item.key && styles.navLabelActive]}>{item.label}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BRAND.white },
  appShell: { flex: 1, backgroundColor: BRAND.soft },
  desktopShell: { flex: 1, flexDirection: 'row' },
  desktopMain: { flex: 1, backgroundColor: BRAND.soft },
  sidebar: { width: 230, backgroundColor: BRAND.white, borderRightWidth: 1, borderRightColor: BRAND.line, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 18 },
  sidebarTagline: { color: BRAND.subtle, fontSize: 11, marginTop: 2, marginBottom: 22 },
  sidebarMenu: { gap: 5, flex: 1 },
  sidebarItem: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderRadius: 12, paddingHorizontal: 12, gap: 12 },
  sidebarItemActive: { backgroundColor: BRAND.purpleSoft },
  sidebarIcon: { width: 22, textAlign: 'center', fontSize: 16 },
  sidebarLabel: { color: BRAND.muted, fontWeight: '700', fontSize: 13 },
  sidebarLabelActive: { color: BRAND.purple, fontWeight: '900' },
  sidebarCreate: { backgroundColor: BRAND.purple, borderRadius: 14, minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  sidebarCreateText: { color: BRAND.white, fontWeight: '900' },
  sidebarFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: BRAND.line },
  sidebarUser: { color: BRAND.ink, fontWeight: '800', fontSize: 12 },
  sidebarUserSub: { color: BRAND.subtle, fontSize: 10, marginTop: 2 },
  desktopTopBar: { minHeight: 72, backgroundColor: BRAND.white, borderBottomWidth: 1, borderBottomColor: BRAND.line, paddingHorizontal: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  desktopTopTitle: { color: BRAND.ink, fontSize: 17, fontWeight: '900' },
  desktopTopSub: { color: BRAND.subtle, fontSize: 11, marginTop: 2 },
  desktopTopActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mobileTopBar: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: BRAND.white, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mobileTopActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contentFrame: { flex: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logoMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoMarkCompact: { width: 30, height: 30, borderRadius: 9 },
  logoFoldTop: { position: 'absolute', top: -4, right: -3, width: 28, height: 15, borderRadius: 10, backgroundColor: BRAND.cyan, transform: [{ rotate: '-14deg' }] },
  logoFoldBottom: { position: 'absolute', bottom: -4, left: -2, width: 28, height: 15, borderRadius: 10, backgroundColor: '#B545F3', transform: [{ rotate: '-14deg' }] },
  logoLetter: { color: BRAND.white, fontSize: 24, fontWeight: '900', fontStyle: 'italic', zIndex: 3 },
  logoLetterCompact: { fontSize: 18 },
  brandName: { color: BRAND.ink, fontSize: 25, fontWeight: '900', letterSpacing: -0.8 },
  locationChip: { backgroundColor: BRAND.white, borderWidth: 1, borderColor: BRAND.line, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999 },
  locationChipText: { color: BRAND.ink, fontSize: 11, fontWeight: '800' },
  notificationButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: BRAND.white, borderWidth: 1, borderColor: BRAND.line, alignItems: 'center', justifyContent: 'center' },
  miniAvatar: { width: 36, height: 36, borderRadius: 12, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center' },
  miniAvatarText: { color: BRAND.white, fontWeight: '900' },
  page: { width: '100%', padding: 16, paddingBottom: 112, gap: 16 },
  pageDesktop: { maxWidth: 1180, alignSelf: 'center', padding: 28, paddingBottom: 60 },
  mobileWelcomeRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  greeting: { color: BRAND.muted, fontSize: 12, fontWeight: '700' },
  mobileHeading: { color: BRAND.ink, fontSize: 23, lineHeight: 28, fontWeight: '900', letterSpacing: -0.7, maxWidth: 260, marginTop: 3 },
  hero: { backgroundColor: BRAND.ink, borderRadius: 24, padding: 22, overflow: 'hidden', minHeight: 190, justifyContent: 'space-between' },
  heroDesktop: { minHeight: 280, padding: 34, flexDirection: 'row', alignItems: 'center' },
  heroCopy: { flex: 1, maxWidth: 670, zIndex: 2 },
  heroOrbOne: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: '#2B376D', right: -70, top: -120, opacity: 0.72 },
  heroOrbTwo: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: '#4C2B8A', right: 120, bottom: -135, opacity: 0.55 },
  eyebrow: { color: '#B9AAFF', fontSize: 11, fontWeight: '900', letterSpacing: 1.3, marginBottom: 8 },
  heroTitle: { color: BRAND.white, fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: -1.2 },
  heroTitleDesktop: { fontSize: 38, lineHeight: 43 },
  heroText: { color: '#D3D7E7', marginTop: 11, fontSize: 14, lineHeight: 21, maxWidth: 540 },
  heroSearchWrap: { marginTop: 20, maxWidth: 570 },
  heroCityCard: { alignSelf: 'flex-start', backgroundColor: '#202A55', borderWidth: 1, borderColor: '#34406F', borderRadius: 20, padding: 16, minWidth: 142, alignItems: 'center', zIndex: 2, marginTop: 18 },
  heroCityIcon: { fontSize: 34 },
  heroCityTitle: { color: BRAND.white, fontSize: 16, fontWeight: '900', marginTop: 7 },
  heroCitySub: { color: '#B9C0DA', fontSize: 10, marginTop: 2 },
  searchBox: { backgroundColor: BRAND.white, borderWidth: 1, borderColor: BRAND.line, borderRadius: 14, paddingHorizontal: 13, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchIcon: { fontSize: 21, color: BRAND.muted },
  searchInput: { flex: 1, color: BRAND.ink, fontSize: 14, outlineStyle: Platform.OS === 'web' ? 'none' : undefined } as any,
  sectionHeader: { gap: 2 },
  sectionHeaderInline: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: BRAND.ink, fontSize: 19, fontWeight: '900', letterSpacing: -0.35 },
  sectionHint: { color: BRAND.subtle, fontSize: 11, marginTop: 2 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryTile: { flexGrow: 1, flexBasis: 96, backgroundColor: BRAND.white, borderWidth: 1, borderColor: BRAND.line, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 10, alignItems: 'center', gap: 7, shadowColor: '#10162F', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
  categoryIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  categoryEmoji: { fontSize: 21 },
  categoryName: { color: BRAND.ink, fontWeight: '800', fontSize: 11 },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  desktopCardWrap: { width: '31.9%' },
  mobileCardWrap: { width: '48.1%' },
  listingCard: { backgroundColor: BRAND.white, borderWidth: 1, borderColor: BRAND.line, borderRadius: 18, overflow: 'hidden', minHeight: 286, width: '100%', shadowColor: '#10162F', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  listingCardCompact: { minHeight: 262 },
  listingVisual: { height: 145, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  listingVisualCompact: { height: 118 },
  visualBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, zIndex: 3 },
  visualBadgeText: { color: BRAND.ink, fontSize: 9, fontWeight: '900' },
  listingEmoji: { fontSize: 54, zIndex: 2 },
  listingEmojiCompact: { fontSize: 44 },
  visualShine: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.28)', top: -42, right: -24 },
  favoriteButton: { position: 'absolute', top: 9, right: 9, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  favoriteText: { color: BRAND.ink, fontSize: 18 },
  listingBody: { flex: 1, padding: 12, gap: 4 },
  listingTitle: { color: BRAND.ink, fontSize: 14, fontWeight: '900', lineHeight: 18 },
  listingPrice: { color: BRAND.ink, fontSize: 14, fontWeight: '900' },
  listingSubtitle: { color: BRAND.muted, fontSize: 11 },
  listingDetail: { color: BRAND.subtle, fontSize: 10 },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  trustDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.green },
  badge: { color: BRAND.green, fontSize: 9, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pill: { alignSelf: 'flex-start', backgroundColor: '#F1F2F6', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, marginRight: 7, marginBottom: 7, borderWidth: 1, borderColor: '#F1F2F6' },
  pillActive: { backgroundColor: BRAND.purpleSoft, borderColor: '#DDD4FF' },
  pillText: { color: BRAND.muted, fontSize: 10, fontWeight: '800' },
  pillTextActive: { color: BRAND.purple },
  linkText: { color: BRAND.purple, fontWeight: '900', fontSize: 11 },
  chipsRow: { paddingVertical: 2 },
  pageHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pageTitle: { color: BRAND.ink, fontSize: 29, fontWeight: '900', letterSpacing: -0.8 },
  pageSubtitle: { color: BRAND.muted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  createTopButton: { backgroundColor: BRAND.purple, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  createTopButtonText: { color: BRAND.white, fontWeight: '900', fontSize: 12 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultCount: { color: BRAND.muted, fontSize: 11 },
  successBanner: { backgroundColor: BRAND.greenSoft, borderWidth: 1, borderColor: '#C3EBD8', borderRadius: 13, padding: 12 },
  successBannerText: { color: '#0E734B', fontWeight: '800', fontSize: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 42, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 38 },
  emptyTitle: { color: BRAND.ink, fontSize: 18, fontWeight: '900', marginTop: 10 },
  emptyText: { color: BRAND.muted, textAlign: 'center', marginTop: 6, lineHeight: 20, maxWidth: 380 },
  secondaryButton: { marginTop: 14, backgroundColor: BRAND.purpleSoft, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  secondaryButtonText: { color: BRAND.purple, fontWeight: '900' },
  formPage: { maxWidth: 760, alignSelf: 'center', width: '100%' },
  formCard: { backgroundColor: BRAND.white, borderRadius: 22, borderWidth: 1, borderColor: BRAND.line, padding: 18, gap: 12 },
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  formIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: BRAND.purpleSoft, alignItems: 'center', justifyContent: 'center' },
  formIconText: { color: BRAND.purple, fontSize: 24, fontWeight: '900' },
  formHeaderCopy: { flex: 1 },
  formLabel: { color: BRAND.ink, fontWeight: '800', marginTop: 4, fontSize: 12 },
  field: { backgroundColor: BRAND.soft, color: BRAND.ink, borderWidth: 1, borderColor: BRAND.line, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 13, fontSize: 14, outlineStyle: Platform.OS === 'web' ? 'none' : undefined } as any,
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap' },
  primaryButton: { marginTop: 5, backgroundColor: BRAND.purple, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryButtonText: { color: BRAND.white, fontSize: 14, fontWeight: '900' },
  noteCard: { marginTop: 8, padding: 15, backgroundColor: '#FFF9E8', borderRadius: 15, borderWidth: 1, borderColor: '#F4E7AF' },
  noteTitle: { color: BRAND.ink, fontWeight: '900', marginBottom: 4 },
  noteText: { color: BRAND.muted, lineHeight: 19, fontSize: 12 },
  messagesPage: { flex: 1, flexDirection: 'row', backgroundColor: BRAND.white, margin: 28, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: BRAND.line },
  messagesPageMobile: { flexDirection: 'column', margin: 0, borderRadius: 0, borderWidth: 0, backgroundColor: BRAND.soft },
  threadPane: { width: 330, borderRightWidth: 1, borderRightColor: BRAND.line, padding: 16, backgroundColor: BRAND.white },
  threadPaneMobile: { width: '100%', borderRightWidth: 0, paddingBottom: 6 },
  messagesHeading: { marginBottom: 10 },
  threadList: { gap: 5, paddingTop: 10 },
  thread: { padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 13 },
  threadActive: { backgroundColor: BRAND.purpleSoft },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#F1EEFF', alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 21 },
  threadBody: { flex: 1, gap: 2 },
  threadName: { color: BRAND.ink, fontWeight: '900', fontSize: 12 },
  threadTime: { color: BRAND.subtle, fontSize: 9 },
  threadMessage: { color: BRAND.muted, fontSize: 11 },
  conversationPane: { flex: 1, backgroundColor: '#FCFCFE' },
  conversationPaneMobile: { margin: 14, marginTop: 8, minHeight: 330, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: BRAND.line },
  conversationHeader: { minHeight: 68, backgroundColor: BRAND.white, borderBottomWidth: 1, borderBottomColor: BRAND.line, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  conversationName: { color: BRAND.ink, fontWeight: '900', fontSize: 13 },
  onlineText: { color: BRAND.green, fontSize: 9, marginTop: 2 },
  conversationBody: { flex: 1, padding: 18, gap: 10, justifyContent: 'center' },
  bubbleIncoming: { alignSelf: 'flex-start', backgroundColor: '#EFF0F4', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 15, maxWidth: '78%' },
  bubbleOutgoing: { alignSelf: 'flex-end', backgroundColor: BRAND.purple, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 15, maxWidth: '78%' },
  bubbleText: { color: BRAND.ink, lineHeight: 18, fontSize: 12 },
  bubbleTextOutgoing: { color: BRAND.white, lineHeight: 18, fontSize: 12 },
  composer: { minHeight: 58, margin: 14, backgroundColor: BRAND.white, borderWidth: 1, borderColor: BRAND.line, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, justifyContent: 'space-between' },
  composerPlaceholder: { color: BRAND.subtle, fontSize: 12 },
  sendButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center' },
  sendButtonText: { color: BRAND.white, fontSize: 12 },
  profilePage: { maxWidth: 820, alignSelf: 'center', width: '100%' },
  profileHero: { backgroundColor: BRAND.white, borderRadius: 20, borderWidth: 1, borderColor: BRAND.line, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileAvatar: { width: 70, height: 70, borderRadius: 24, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { color: BRAND.white, fontSize: 30, fontWeight: '900' },
  profileCopy: { flex: 1 },
  profileName: { color: BRAND.ink, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  profileSub: { color: BRAND.muted, fontSize: 11, marginTop: 4 },
  profileBadges: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  editButton: { borderWidth: 1, borderColor: BRAND.line, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 8 },
  editButtonText: { color: BRAND.ink, fontSize: 11, fontWeight: '800' },
  profileBio: { color: BRAND.muted, fontSize: 13, lineHeight: 19 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: BRAND.white, borderRadius: 16, borderWidth: 1, borderColor: BRAND.line, padding: 15, alignItems: 'center' },
  statNumber: { color: BRAND.ink, fontSize: 22, fontWeight: '900' },
  statLabel: { color: BRAND.muted, fontSize: 10, marginTop: 2 },
  menuCard: { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: BRAND.line, backgroundColor: BRAND.white },
  menuRow: { paddingHorizontal: 15, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: BRAND.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  menuRowLast: { borderBottomWidth: 0 },
  menuText: { color: BRAND.ink, fontWeight: '700', fontSize: 12 },
  chevron: { color: BRAND.subtle, fontSize: 20 },
  bottomNav: { backgroundColor: BRAND.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BRAND.line, paddingHorizontal: 8, paddingTop: 7, paddingBottom: Platform.OS === 'ios' ? 17 : 9, flexDirection: 'row' },
  navButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 47, gap: 2 },
  navIconWrap: { width: 29, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  navIconActive: { backgroundColor: BRAND.purpleSoft },
  navIconCreate: { width: 43, height: 43, borderRadius: 22, backgroundColor: BRAND.purple, marginTop: -16, shadowColor: '#6D4AFF', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.24, shadowRadius: 8, elevation: 5 },
  navIcon: { color: BRAND.muted, fontWeight: '900', fontSize: 17 },
  navIconCreateText: { color: BRAND.white, fontSize: 24 },
  navLabel: { color: BRAND.muted, fontSize: 9, fontWeight: '800' },
  navLabelActive: { color: BRAND.purple },
  pressed: { opacity: 0.72 },
});
