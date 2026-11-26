import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type State = { failed: boolean };
/** Shows a recoverable screen instead of a blank page when rendering throws. */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: unknown) {
    // Log the error type only; component state may contain private messages.
    console.error('Stuora render failure', error instanceof Error ? error.name : 'unknown');
  }
  private reload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign(window.location.pathname);
      return;
    }
    this.setState({ failed: false });
  };
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.wrap} accessibilityRole="alert">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>Stuora hit an unexpected problem. Your data is safe. Reload to continue.</Text>
        <Pressable accessibilityRole="button" onPress={this.reload} style={styles.button}><Text style={styles.buttonText}>Reload Stuora</Text></Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#FAFAFD' },
  title: { fontSize: 22, fontWeight: '900', color: '#11162F' },
  body: { fontSize: 14, color: '#4A5166', textAlign: 'center', maxWidth: 360 },
  button: { minHeight: 48, paddingHorizontal: 20, justifyContent: 'center', borderRadius: 12, backgroundColor: '#5635E7' },
  buttonText: { color: '#FFFFFF', fontWeight: '900' },
});
