import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CatalogueAccess } from './studentAccess';

// Shown instead of student-posted listings, photos and groups when the viewer
// is not a signed-in GISMA student. Sign-in, recovery, legal, privacy, safety
// and support stay reachable from the Profile tab and the legal links.
export default function StudentCatalogueGate({ access, onAccount }: {
  access: Exclude<CatalogueAccess, 'student'>; onAccount: () => void;
}) {
  const signedOut = access === 'signed-out';
  return <View accessibilityRole="summary" testID="student-catalogue-gate" style={s.panel}>
    <Text style={s.title}>{signedOut ? 'For GISMA students' : 'Stuora is only for GISMA students'}</Text>
    <Text style={s.body}>{signedOut
      ? 'Student listings, profiles, photos and groups are visible only to signed-in students. Sign in with your @gisma-student.com email to browse.'
      : 'Student listings, profiles, photos and groups are visible only to confirmed @gisma-student.com accounts. You can still export your data or delete your account from Profile.'}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={signedOut ? 'Sign in to browse' : 'Open Profile'}
      onPress={onAccount} style={({ pressed }) => [s.button, pressed && s.pressed]}>
      <Text style={s.buttonText}>{signedOut ? 'Sign in to browse' : 'Open Profile'}</Text>
    </Pressable>
  </View>;
}

const s = StyleSheet.create({
  panel: { backgroundColor: '#FFFFFF', padding: 22, borderRadius: 18, borderWidth: 1, borderColor: '#E9EAF1', gap: 12, alignItems: 'flex-start' },
  title: { color: '#11162F', fontSize: 18, fontWeight: '800' },
  body: { color: '#454B68', fontSize: 14, lineHeight: 21, maxWidth: 560 },
  button: { backgroundColor: '#4930BB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  pressed: { opacity: 0.85 },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
});
