import React from 'react';
import { View, ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import App from '../App';
import { AuthProvider, useAuth } from './account/AuthProvider';

import AccountPanel from './account/AccountPanel';
function Content() {
 const { recoveryMode, recoveryComplete, error, dismissRecovery } = useAuth();
 return recoveryMode || recoveryComplete || /^This (?:Stuora )?sign-in link/.test(error) ? <ScrollView contentContainerStyle={{padding:20}} keyboardShouldPersistTaps="handled"><AccountPanel />{recoveryComplete ? <Pressable accessibilityRole="button" onPress={dismissRecovery} style={{padding:16,alignItems:"center"}}><Text style={{color:"#7048FF",fontWeight:"700"}}>Continue to Stuora</Text></Pressable> : null}</ScrollView> : <App />;
}

export default function Root() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <AuthProvider>
    <View style={styles.root}>
      <Content />
    </View>
    </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
