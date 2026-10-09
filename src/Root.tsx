import React from 'react';
import { View, StyleSheet } from 'react-native';
import App from '../App';
import StudentSavingsOverlay from './StudentSavingsOverlay';

export default function Root() {
  return (
    <View style={styles.root}>
      <App />
      <StudentSavingsOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
