import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import App from '../App';
import AccountPanel from './account/AccountPanel';
import { AuthProvider, useAuth } from './account/AuthProvider';
import StudentSavingsOverlay from './StudentSavingsOverlay';
import ErrorBoundary from './ui/ErrorBoundary';

// A password-recovery session must not expose the rest of the app.
function RootContent() {
  const { recoveryMode, recoveryComplete } = useAuth();
  const [savingsOpen, setSavingsOpen] = useState(false);
  if (recoveryMode || recoveryComplete) {
    return (
      <ScrollView contentContainerStyle={styles.recovery} keyboardShouldPersistTaps="handled">
        <View style={styles.recoveryCard}><AccountPanel /></View>
      </ScrollView>
    );
  }
  return <View style={styles.root}><App onOpenSavings={() => setSavingsOpen(true)} /><StudentSavingsOverlay open={savingsOpen} onOpenChange={setSavingsOpen} /></View>;
}

export default function Root() {
  return <ErrorBoundary><AuthProvider><RootContent /></AuthProvider></ErrorBoundary>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  recovery: { flexGrow: 1, minHeight: '100%', padding: 20, backgroundColor: '#F7F7FB', alignItems: 'center', justifyContent: 'center' },
  recoveryCard: { width: '100%', maxWidth: 560 },
});
