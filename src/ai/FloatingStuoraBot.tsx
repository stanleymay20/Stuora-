import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AnimatedStuoraMascot from './AnimatedStuoraMascot';

/**
 * The floating Bot is a character, not a cropped illustration in a round icon.
 * Motion remains decorative and never moves the tappable, accessible Pressable.
 * Only the existing deterministic, read-only Stuora Bot opens on press.
 */
export default function FloatingStuoraBot({
  onPress,
  desktop,
  visible = true,
}: {
  onPress: () => void;
  desktop: boolean;
  visible?: boolean;
}) {
  // Safe default: no motion until the device's preference can be read.
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (mounted) setReduceMotion(value); })
      .catch(() => { /* Keep motion disabled if the setting is unavailable. */ });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      if (mounted) setReduceMotion(value);
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={[styles.host, desktop ? styles.desktopHost : styles.mobileHost]}>
      <Pressable
        testID="floating-stuora-bot"
        accessibilityRole="button"
        accessibilityLabel="Open Stuora Bot"
        accessibilityHint="Open the beta assistant for read-only searches of Stuora"
        onPress={onPress}
        style={({ pressed }) => [styles.launcher, pressed && styles.pressed]}
      >
        <View pointerEvents="none" style={styles.mascotFrame}>
          <View style={styles.mascotScaled}><AnimatedStuoraMascot reducedMotion={reduceMotion} active={visible} /></View>
        </View>
        <View style={styles.caption}><Text style={styles.captionText}>Ask Stuora</Text></View>
        <Text style={styles.beta}>SEARCH BETA</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute', right: 9, zIndex: 30, elevation: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  mobileHost: { bottom: 75 },
  desktopHost: { bottom: 22, right: 20 },
  launcher: {
    width: 106, minHeight: 134,
    alignItems: 'center', justifyContent: 'center',
    // No clipping: antennae, fingertips, underside light and hover shadow remain visible.
    overflow: 'visible',
  },
  mascotFrame: { width: 100, height: 101, alignItems: 'center', position: 'relative', overflow: 'visible' },
  mascotScaled: { position: 'absolute', top: -11, left: -8, transform: [{ scale: 0.82 }] },
  pressed: { opacity: 0.85 },
  caption: {
    backgroundColor: '#5635E7', borderRadius: 999,
    paddingHorizontal: 11, paddingVertical: 5, marginTop: -2,
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  captionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  beta: { marginTop: 3, fontSize: 8, letterSpacing: 0.7, color: '#493B7B', fontWeight: '800' },
});
