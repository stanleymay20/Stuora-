import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import App from '../App';
import AccountPanel from './account/AccountPanel';
import { AuthProvider, useAuth } from './account/AuthProvider';
import StudentSavingsOverlay from './StudentSavingsOverlay';
import ErrorBoundary from './ui/ErrorBoundary';

// A password-recovery session must not expose the rest of the app.
function RootContent() {
  const { recoveryMode, recoveryComplete, linkNotice, dismissLinkNotice } = useAuth();
  const [savingsOpen, setSavingsOpen] = useState(false);
  if (recoveryMode || recoveryComplete) {
    return (
      <ScrollView contentContainerStyle={styles.recovery} keyboardShouldPersistTaps="handled">
        <View style={styles.recoveryCard}><AccountPanel /></View>
      </ScrollView>
    );
  }
  const banner = linkNotice ? (
    <View accessibilityRole="alert" testID="auth-link-notice" style={styles.banner}>
      <Text style={styles.bannerText}>{linkNotice}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss link message" onPress={dismissLinkNotice} style={styles.bannerClose}><Text style={styles.bannerCloseText}>OK</Text></Pressable>
    </View>
  ) : null;
  return <View style={styles.root}>{banner}<App onOpenSavings={() => setSavingsOpen(true)} /><StudentSavingsOverlay open={savingsOpen} onOpenChange={setSavingsOpen} /></View>;
}

export default function Root() {
  return <ErrorBoundary><AuthProvider><RootContent /></AuthProvider></ErrorBoundary>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#FFF4D6' },
  bannerText: { flex: 1, color: '#5A3E00', fontSize: 13, lineHeight: 19 },
  bannerClose: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#FFFFFF' },
  bannerCloseText: { color: '#4325C9', fontWeight: '800' },
  recovery: { flexGrow: 1, minHeight: '100%', padding: 20, backgroundColor: '#F7F7FB', alignItems: 'center', justifyContent: 'center' },
  recoveryCard: { width: '100%', maxWidth: 560 },
});
