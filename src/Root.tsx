import React from 'react';
import { View, StyleSheet } from 'react-native';
import App from '../App';
import { AuthProvider } from './account/AuthProvider';
import StudentSavingsOverlay from './StudentSavingsOverlay';

export default function Root() {
  return (
    <AuthProvider>
    <View style={styles.root}>
      <App />
      <StudentSavingsOverlay />
    </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
