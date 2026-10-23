import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { features, operator } from '../backend/features';

export type LegalDocument = 'privacy' | 'terms' | 'imprint' | 'safety';
export const legalTitles: Record<LegalDocument, string> = {
  privacy: 'Privacy notice', terms: 'Terms of use', imprint: 'Imprint', safety: 'Safety and reporting',
};

type Section = { heading: string; body: string[] };

function privacy(): Section[] {
  const optional: string[] = [];
  if (features.aiAssistant) optional.push('Stuora Bot (optional): when you ask the Bot a question, the text of that question — never your name, email or messages — is sent from our server to Groq, Inc. (USA) and, if Groq is unavailable, to Cloudflare, Inc. (USA) to recognise what you are looking for. Results always come from Stuora itself. Transfers rely on the EU–US Data Privacy Framework or standard contractual clauses.');
  if (features.externalFeeds) optional.push('Jobs and events feeds (optional): the city and search words you choose are sent from our server — not from your device — to Ticketmaster, Adzuna and/or the Bundesagentur für Arbeit to show their public listings. Opening a listing takes you to that provider, whose own privacy notice applies.');
  if (features.cityLookup) optional.push('City check (optional): the city name you type is sent from our server to OpenStreetMap Nominatim (OpenStreetMap Foundation, UK). No location, GPS or IP address of yours is shared.');
  return [
    { heading: 'Controller', body: [`${operator.name}, ${operator.address}. Email: ${operator.email}. Privacy contact: ${operator.privacyContact}.`] },
    { heading: 'What we process and why', body: [
      'Account: email address and password hash, to provide your account (Art. 6(1)(b) GDPR).',
      'Profile: display name, city, bio and optional avatar. Your profile only appears in the student directory after you switch on discovery and confirm it (Art. 6(1)(a) GDPR); you can switch it off at any time.',
      'Listings, photos, saved items, messages, groups and group posts you create, to run the service (Art. 6(1)(b) GDPR). Listing photos added through Stuora’s photo processing are re-encoded on our server and their camera and location metadata is removed before anyone can see them. Photos uploaded before that processing was introduced are stored as uploaded; remove and re-add them to strip their metadata.',
      'Reports, moderation decisions, blocks, rate-limit counters and security logs, to keep students safe and prevent abuse (Art. 6(1)(f) GDPR). Moderators see the reported content, never who reported it, and the person reported is not told who reported them.',
    ] },
    { heading: 'Service providers', body: [
      'Supabase, Inc. hosts our database, sign-in and file storage, and Vercel, Inc. serves the web app, both as processors under Art. 28 GDPR.',
      ...optional,
    ] },
    { heading: 'How long we keep data', body: [
      'Your data is kept while your account exists. Deleting your account removes your profile, listings, photos, saved items, group memberships, group posts, messages you sent and reports you filed. Reports other students filed about your content, with a copy of the reported text, may be kept for as long as needed to handle abuse. If an account is suspended, a one-way fingerprint of its email address is kept so the same address cannot simply re-register. Short-lived rate-limit counters expire within a day.',
    ] },
    { heading: 'Your rights', body: [
      'You can access and download your data (Profile → Download my data), correct your profile, switch off discovery and delete your account (Profile → Delete account) yourself. You also have the rights to restriction, objection and data portability, and you can withdraw consent at any time without affecting earlier processing.',
      `You may complain to a data-protection supervisory authority, for example ${operator.supervisoryAuthority}.`,
    ] },
    { heading: 'No tracking, no advertising', body: ['Stuora uses no advertising trackers and does not sell personal data. Device storage is used only to keep you signed in and to remember your selected city.'] },
  ];
}

function terms(): Section[] {
  return [
    { heading: 'Who may use Stuora', body: ['Stuora is for students aged 16 or older. You must give accurate information and keep your password secret.'] },
    { heading: 'What you post', body: [
      'Only post genuine housing and marketplace offers that you are entitled to make. Do not post prohibited, illegal, discriminatory, misleading or unsafe content, and do not harass other students.',
      'You keep the rights to your content and allow Stuora to display it within the service for as long as it is published.',
    ] },
    { heading: 'Deals between students', body: ['Stuora does not take part in, guarantee or process payments for deals between students. Never pay a deposit before viewing a room or meeting the seller, and never share bank or identity documents in messages.'] },
    { heading: 'Moderation', body: ['We may remove content or suspend accounts that break these terms. You will be told why in your Stuora notices and can reply to the contact address below if you disagree.'] },
    { heading: 'External listings', body: ['Jobs and events marked with a provider name come from that provider. Stuora does not check or guarantee them, and the provider’s terms apply once you follow a link.'] },
    { heading: 'Liability', body: ['We are liable without limitation for intent and gross negligence and for injury to life, body or health. For slight negligence we are liable only for breaches of essential obligations and limited to typical, foreseeable damage. Statutory consumer rights are unaffected.'] },
    { heading: 'Contact', body: [`${operator.name}, ${operator.address}, ${operator.email}.`] },
  ];
}

function imprint(): Section[] {
  return [
    { heading: 'Provider (§ 5 DDG)', body: [operator.name, operator.address, `Represented by: ${operator.representative}`] },
    { heading: 'Contact', body: [`Email: ${operator.email}`] },
    ...(operator.register ? [{ heading: 'Register', body: [operator.register] }] : []),
    ...(operator.vatId ? [{ heading: 'VAT ID (§ 27a UStG)', body: [operator.vatId] }] : []),
    { heading: 'Responsible for content (§ 18(2) MStV)', body: [`${operator.representative}, ${operator.address}`] },
  ];
}

function safety(): Section[] {
  return [
    { heading: 'Report anything that feels wrong', body: ['Every listing, message, group post and profile has a Report button. Reports go to Stuora moderators; the person you report is not told who reported them. In a one-to-one conversation they may still be able to guess, so block them as well if you feel unsafe.'] },
    { heading: 'Block someone', body: ['In a conversation, choose Block to stop that person from contacting you. You can unblock them later from the same conversation.'] },
    { heading: 'Common scams', body: ['Requests to pay a deposit before a viewing, to move to another app straight away, to send ID documents or to pay by gift card are warning signs. Report them.'] },
    { heading: 'Emergencies', body: ['If you or someone else is in immediate danger, call 112.'] },
  ];
}

const documents: Record<LegalDocument, () => Section[]> = { privacy, terms, imprint, safety };

export default function LegalPage({ document, onNavigate }: { document: LegalDocument; onNavigate: (doc: LegalDocument) => void }) {
  return (
    <View style={styles.card} testID={`legal-${document}`}>
      <Text accessibilityRole="header" style={styles.title}>{legalTitles[document]}</Text>
      {operator.placeholder ? (
        <Text accessibilityRole="alert" style={styles.draft}>Draft for review: operator details are not complete yet. This build must not be used publicly.</Text>
      ) : null}
      {documents[document]().map(section => (
        <View key={section.heading} style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>{section.heading}</Text>
          {section.body.map((paragraph, i) => <Text key={i} style={styles.body}>{paragraph}</Text>)}
        </View>
      ))}
      <LegalLinks current={document} onNavigate={onNavigate} />
    </View>
  );
}

export function LegalLinks({ current, onNavigate }: { current?: LegalDocument; onNavigate: (doc: LegalDocument) => void }) {
  return (
    <View style={styles.links} accessibilityRole="none">
      {(Object.keys(legalTitles) as LegalDocument[]).filter(d => d !== current).map(doc => (
        <Pressable key={doc} accessibilityRole="link" onPress={() => onNavigate(doc)} style={styles.link}>
          <Text style={styles.linkText}>{legalTitles[doc]}</Text>
        </Pressable>
      ))}
      {!operator.placeholder ? (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`mailto:${operator.email}`)} style={styles.link}>
          <Text style={styles.linkText}>Contact</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#E9EAF1', padding: 20, gap: 14 },
  title: { fontSize: 26, fontWeight: '900', color: '#11162F' },
  draft: { backgroundColor: '#FFF4D6', color: '#6B4A00', padding: 12, borderRadius: 12, fontSize: 13, fontWeight: '700' },
  section: { gap: 6 },
  heading: { fontSize: 16, fontWeight: '900', color: '#11162F' },
  body: { fontSize: 14, lineHeight: 21, color: '#3D4459' },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  linkText: { color: '#5635E7', fontWeight: '800', fontSize: 13, textDecorationLine: 'underline' },
});
