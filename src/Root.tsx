import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import App from '../App';
import { AuthProvider } from './account/AuthProvider';

export default function Root() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <AuthProvider>
    <View style={styles.root}>
      <App />
    </View>
    </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
