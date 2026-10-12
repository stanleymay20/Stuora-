import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import App from '../App';
import { AuthProvider, useAuth } from './account/AuthProvider';
import AccountPanel from './account/AccountPanel';
import StudentSavingsOverlay from './StudentSavingsOverlay';

function RootContent() {
  const { recoveryMode } = useAuth();
  if (recoveryMode) {
    return <ScrollView contentContainerStyle={styles.recovery} keyboardShouldPersistTaps="handled"><View style={styles.recoveryCard}><AccountPanel /></View></ScrollView>;
  }
  return <View style={styles.root}><App /><StudentSavingsOverlay /></View>;
}

export default function Root() {
  return <AuthProvider><RootContent /></AuthProvider>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  recovery: { flexGrow: 1, minHeight: '100%', backgroundColor: '#F7F7FB', padding: 20, alignItems: 'center', justifyContent: 'center' },
  recoveryCard: { width: '100%', maxWidth: 560 },
});
