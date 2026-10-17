import React, { useState } from 'react';
import AccountPanel from './src/account/AccountPanel';
import ListingWorkspace from './src/listings/ListingWorkspace';
import MessageWorkspace from './src/messages/MessageWorkspace';
import PeopleDirectory from './src/people/PeopleDirectory';
import { useAuth } from './src/account/AuthProvider';
import { Icon, StuoraMark } from './src/ui/Brand';
import {
  Platform,
  Image,
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

const BRAND = {
  ink: '#11162F',
  inkSoft: '#252B4A',
  muted: '#747B91',
  subtle: '#9AA1B5',
  line: '#E9EAF1',
  soft: '#FAFAFD',
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

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brandRow}>
      <StuoraMark size={compact ? 30 : 40} />
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
  const { width } = useWindowDimensions();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Browse ${item.name}`} onPress={onPress} style={({ pressed }) => [styles.categoryTile, width >= 960 && styles.categoryTileDesktop, pressed && styles.pressed]}>
      <View style={[styles.categoryIcon, { backgroundColor: item.tint }]}>
        <Icon name={item.name} color={BRAND.purple} size={25} />
      </View>
      <Text style={styles.categoryName}>{item.name}</Text>
    </Pressable>
  );
}

function SearchField({ value, onChangeText, placeholder, onSubmit }: { value: string; onChangeText: (value: string) => void; placeholder: string; onSubmit?: () => void }) {
  return (
    <View style={styles.searchBox}>
      <Icon name="search" size={20} />
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
  const { session, profile } = useAuth();
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 960;
  const [tab, setTab] = useState<Tab>('home');
  const [category, setCategory] = useState<Category>('Housing');
  const [search, setSearch] = useState('');
  const [draftType, setDraftType] = useState<'Housing' | 'Marketplace'>('Marketplace');

  const goToCategory = (next: Category) => {
    setCategory(next);
    setSearch('');
    setTab('explore');
  };

  const startListing = (next: 'Housing' | 'Marketplace') => {
    setDraftType(next);
    setTab('create');
  };

  const bottomNav: { key: Tab; label: string; icon: string }[] = [
    { key: 'home', label: 'Home', icon: '⌂' },
    { key: 'explore', label: 'Explore', icon: '⌕' },
    { key: 'create', label: 'Create', icon: '+' },
    { key: 'messages', label: 'Messages', icon: '◫' },
    { key: 'profile', label: 'You', icon: '○' },
  ];

  const desktopNav: { key: Tab; label: string; icon: string }[] = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'explore', label: 'Explore', icon: 'search' },
    { key: 'messages', label: 'Messages', icon: 'messages' },
    { key: 'profile', label: 'You', icon: 'profile' },
  ];

  const content = (
    <View style={styles.contentFrame}>
      {tab === 'home' && (
        <ScrollView testID="home-scroll" style={styles.pageScroll} contentContainerStyle={[styles.page, isDesktop && styles.pageDesktop]} showsVerticalScrollIndicator={false}>
          <View style={[styles.hero, isDesktop ? styles.heroDesktop : styles.heroMobile]}>
            <Image source={require('./assets/berlin-skyline.jpg')} resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} accessibilityLabel="Berlin skyline at sunset" />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(17,22,47,0.56)' }]} />
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>STUDENT LIFE, CONNECTED</Text>
              <Text style={[styles.heroTitle, isDesktop ? styles.heroTitleDesktop : styles.heroTitleMobile]}>Find your people.{"\n"}Find your place.{"\n"}Make the most of student life.</Text>
              <Text style={styles.heroText}>Housing, things, trips, jobs and student communities — all in one trusted local network.</Text>
              <View style={styles.heroSearchWrap}>
                <SearchField value={search} onChangeText={setSearch} placeholder="Search housing listings…" onSubmit={() => { setCategory('Housing'); setTab('explore'); }} />
              </View>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Browse by category</Text>
            <Text style={styles.sectionHint}>Everything outside the classroom</Text>
          </View>
          <View style={styles.categoryGrid}>
            {categories.map((item) => <CategoryTile key={item.name} item={item} onPress={() => goToCategory(item.name)} />)}
          </View>

          <View style={styles.sectionHeaderInline}><Text style={styles.sectionTitle}>Community housing</Text><Pressable accessibilityRole="button" accessibilityLabel="See all housing" onPress={() => goToCategory('Housing')}><Text style={styles.linkText}>See all</Text></Pressable></View>
          <ListingWorkspace key={`home-${session?.user.id ?? 'public'}`} category="Housing" preview onAccount={() => setTab('profile')} onMessage={() => setTab('messages')} onCreate={() => startListing('Housing')} />

          <View style={styles.sectionHeaderInline}><Text style={styles.sectionTitle}>Marketplace</Text><Pressable accessibilityRole="button" accessibilityLabel="See all marketplace" onPress={() => goToCategory('Marketplace')}><Text style={styles.linkText}>See all</Text></Pressable></View>
          <ListingWorkspace key={`home-market-${session?.user.id ?? 'public'}`} category="Marketplace" preview onAccount={() => setTab('profile')} onMessage={() => setTab('messages')} onCreate={() => startListing('Marketplace')} />
        </ScrollView>
      )}

      {tab === 'explore' && (
        <ScrollView testID="explore-scroll" style={styles.pageScroll} contentContainerStyle={[styles.page, isDesktop && styles.pageDesktop]} showsVerticalScrollIndicator={false}>
          <View style={styles.pageHeadingRow}>
            <View>
              <Text style={styles.pageTitle}>{category}</Text>
              <Text style={styles.pageSubtitle}>{category === 'Housing' || category === 'Marketplace' ? 'Live community listings · one shared backend.' : category === 'People' ? 'Discoverable profiles from Stuora.' : 'This category is not available yet.'}</Text>
            </View>
            {isDesktop && (category === 'Housing' || category === 'Marketplace') ? <Pressable accessibilityRole="button" accessibilityLabel="Create in this category" onPress={() => startListing(category)} style={styles.createTopButton}><Text style={styles.createTopButtonText}>Create</Text></Pressable> : null}
          </View>
          {category === 'Housing' || category === 'Marketplace' || category === 'People' ? <SearchField value={search} onChangeText={setSearch} placeholder={`Search ${category.toLowerCase()}…`} /> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {categories.map((item) => (
              <Pressable accessibilityRole="button" accessibilityLabel={`Browse ${item.name}`} key={item.name} onPress={() => { setCategory(item.name); setSearch(''); }}>
                <Pill active={category === item.name}>{item.name}</Pill>
              </Pressable>
            ))}
          </ScrollView>
          {category === 'Housing' || category === 'Marketplace' ? <ListingWorkspace key={`${category}-${session?.user.id ?? 'public'}`} category={category} search={search} onAccount={() => setTab('profile')} onMessage={() => setTab('messages')} onCreate={() => startListing(category)} onClearSearch={() => setSearch('')} /> : category === 'People' ? <PeopleDirectory key={session?.user.id ?? 'public'} search={search} onAccount={() => setTab('profile')} /> : <View style={styles.emptyState}><Icon name={category} size={40} color={BRAND.purple} /><Text style={styles.emptyTitle}>{category} is not available yet</Text><Text style={styles.emptyText}>Posting and participation will open after persistence and permissions are verified. No sample offers are displayed.</Text></View>}
        </ScrollView>
      )}

      {tab === 'create' && (
        <ScrollView testID="create-scroll" style={styles.pageScroll} contentContainerStyle={[styles.page, styles.formPage]} keyboardShouldPersistTaps="handled">
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <View style={styles.formIcon}><Icon name="plus" color={BRAND.purple} size={26} /></View>
              <View style={styles.formHeaderCopy}>
                <Text style={styles.pageTitle}>Create on Stuora</Text>
                <Text style={styles.pageSubtitle}>Create a Housing or Marketplace listing saved to your account.</Text>
              </View>
            </View>
            <Text style={styles.formLabel}>What are you posting?</Text>
            <View style={styles.wrapRow}>
              {categories.filter((item) => item.name === 'Housing' || item.name === 'Marketplace').map((item) => (
                <Pressable accessibilityRole="button" accessibilityLabel={`Post ${item.name}`} key={item.name} onPress={() => { if (item.name === 'Housing' || item.name === 'Marketplace') setDraftType(item.name); }}>
                  <Pill active={draftType === item.name}>{item.name}</Pill>
                </Pressable>
              ))}
            </View>
            <ListingWorkspace key={`${draftType}-${session?.user.id ?? 'public'}`} category={draftType} mode="create" onAccount={() => setTab('profile')} onMessage={() => setTab('messages')} />
            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>Stuora quality rule</Text>
              <Text style={styles.noteText}>If a feature appears in the product, it must work end-to-end. Payments, production verification and media upload stay hidden until their backend flows are ready.</Text>
            </View>
          </View>
        </ScrollView>
      )}

      {tab === 'messages' && <MessageWorkspace onAccount={() => setTab('profile')} />}

      {tab === 'profile' && (
        <ScrollView testID="profile-scroll" style={styles.pageScroll} contentContainerStyle={[styles.page, styles.profilePage]} showsVerticalScrollIndicator={false}>
          <AccountPanel />
        </ScrollView>
      )}
    </View>
  );

  return (
    <SafeAreaView style={Platform.OS === 'web' ? [styles.safeArea, { height }] : styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={BRAND.white} />
      <View style={styles.appShell}>
        {isDesktop ? (
          <View style={styles.desktopShell}>
            <View style={styles.desktopNavigation}>
              <BrandMark />
              <View style={styles.desktopNavLinks}>
                {desktopNav.map(item => (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityLabel={item.label === 'You' ? 'Open your profile' : `Open ${item.label}`}
                    accessibilityState={{ selected: tab === item.key }}
                    onPress={() => setTab(item.key)}
                    style={({ pressed }) => [styles.desktopNavItem, tab === item.key && styles.desktopNavItemActive, pressed && styles.pressed]}
                  >
                    <Icon name={item.icon} size={19} color={tab === item.key ? BRAND.purple : BRAND.muted} />
                    <Text style={[styles.desktopNavText, tab === item.key && styles.desktopNavTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.desktopTopActions}>
                <View style={styles.locationChip}><Text style={styles.locationChipText}>{profile?.city || 'Berlin'}</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel="Create listing" onPress={() => setTab('create')} style={[styles.desktopCreate, tab === 'create' && styles.desktopCreateActive]}>
                  <Icon name="plus" size={18} color={BRAND.white} />
                  <Text style={styles.desktopCreateText}>Create</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.desktopMain}>{content}</View>
          </View>
        ) : (
          <>
            <View style={styles.mobileTopBar}><BrandMark /><View style={styles.mobileTopActions}><Pressable accessibilityRole="button" accessibilityLabel="Open your account" onPress={() => setTab('profile')} style={styles.miniAvatar}><Icon name="profile" color="#FFFFFF" size={22} /></Pressable></View></View>
            {content}
            <View style={styles.bottomNav}>
              {bottomNav.map((item) => {
                const isCreate = item.key === 'create';
                return (
                  <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={isCreate ? 'Create listing' : item.label} onPress={() => setTab(item.key)} style={styles.navButton}>
                    <View style={[styles.navIconWrap, isCreate && styles.navIconCreate, tab === item.key && !isCreate && styles.navIconActive]}><Icon name={isCreate ? 'plus' : item.key === 'explore' ? 'search' : item.key} size={isCreate ? 25 : 21} color={isCreate ? BRAND.white : tab === item.key ? BRAND.purple : BRAND.muted} /></View>
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
  demoBackdrop: { flex: 1, backgroundColor: 'rgba(17,22,47,0.55)', padding: 24, alignItems: 'center', justifyContent: 'center' },
  demoPanel: { width: '100%', maxWidth: 480, padding: 24, borderRadius: 24, backgroundColor: BRAND.white, gap: 18 },
  safeArea: { flex: 1, backgroundColor: BRAND.white },
  appShell: { flex: 1, minHeight: 0, backgroundColor: BRAND.soft },
  desktopShell: { flex: 1, minHeight: 0 },
  desktopMain: { flex: 1, minHeight: 0, backgroundColor: BRAND.soft },
  desktopNavigation: { backgroundColor: BRAND.white, borderBottomWidth: 1, borderBottomColor: BRAND.line, paddingHorizontal: 28, minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 22 },
  desktopNavLinks: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, justifyContent: 'center' },
  desktopNavItem: { minHeight: 43, paddingHorizontal: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  desktopNavItemActive: { backgroundColor: BRAND.purpleSoft },
  desktopNavText: { color: BRAND.muted, fontSize: 13, fontWeight: '700' },
  desktopNavTextActive: { color: BRAND.purple, fontWeight: '900' },
  desktopCreate: { backgroundColor: BRAND.purple, paddingVertical: 11, paddingHorizontal: 17, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  desktopCreateActive: { backgroundColor: '#5931E8' },
  desktopCreateText: { color: BRAND.white, fontWeight: '900', fontSize: 13 },
  sidebar: { width: 230, backgroundColor: BRAND.white, borderRightWidth: 1, borderRightColor: BRAND.line, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 18 },
  sidebarTagline: { color: BRAND.subtle, fontSize: 11, marginTop: 2, marginBottom: 22 },
  sidebarMenu: { gap: 5, flex: 1 },
  sidebarItem: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderRadius: 12, paddingHorizontal: 12, gap: 12 },
  sidebarItemActive: { backgroundColor: BRAND.purpleSoft },
  sidebarIcon: { width: 22, textAlign: 'center', fontSize: 16 },
  sidebarLabel: { color: BRAND.muted, fontWeight: '700', fontSize: 13 },
  sidebarLabelActive: { color: BRAND.purple, fontWeight: '900' },
  sidebarCreate: { flexDirection: 'row', gap: 6, backgroundColor: BRAND.purple, borderRadius: 14, minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
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
  contentFrame: { flex: 1, minHeight: 0 },
  pageScroll: { flex: 1, minHeight: 0 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logoMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoMarkCompact: { width: 30, height: 30, borderRadius: 9 },
  logoFoldTop: { position: 'absolute', top: -4, right: -3, width: 28, height: 15, borderRadius: 10, backgroundColor: BRAND.cyan, transform: [{ rotate: '-14deg' }] },
  logoFoldBottom: { position: 'absolute', bottom: -4, left: -2, width: 28, height: 15, borderRadius: 10, backgroundColor: '#B545F3', transform: [{ rotate: '-14deg' }] },
  logoLetter: { color: BRAND.white, fontSize: 24, fontWeight: '900', fontStyle: 'italic', zIndex: 3 },
  logoLetterCompact: { fontSize: 18 },
  brandName: { color: BRAND.ink, fontSize: 26, fontWeight: '900', letterSpacing: -1.2 },
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
  heroDesktop: { minHeight: 292, padding: 34, flexDirection: 'row', alignItems: 'center' },
  heroMobile: { minHeight: 312, padding: 20, justifyContent: 'flex-end' },
  heroCopy: { flex: 1, maxWidth: 670, zIndex: 2 },
  heroOrbOne: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: '#2B376D', right: -70, top: -120, opacity: 0.72 },
  heroOrbTwo: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: '#4C2B8A', right: 120, bottom: -135, opacity: 0.55 },
  eyebrow: { color: '#B9AAFF', fontSize: 11, fontWeight: '900', letterSpacing: 1.3, marginBottom: 8 },
  heroTitle: { color: BRAND.white, fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: -1.2 },
  heroTitleDesktop: { fontSize: 34, lineHeight: 40 },
  heroTitleMobile: { fontSize: 24, lineHeight: 29, letterSpacing: -0.6 },
  heroText: { color: '#D3D7E7', marginTop: 11, fontSize: 14, lineHeight: 21, maxWidth: 540 },
  heroSearchWrap: { marginTop: 18, width: '100%', maxWidth: 570 },
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
  categoryTile: { flexGrow: 0, flexBasis: '22%', backgroundColor: BRAND.white, borderWidth: 0, borderColor: BRAND.line, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 10, alignItems: 'center', gap: 7, shadowColor: '#10162F', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
  categoryTileDesktop: { flexBasis: '15%', minHeight: 118, paddingTop: 21, paddingBottom: 18, justifyContent: 'center' },
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