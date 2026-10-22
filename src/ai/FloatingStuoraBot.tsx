import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

/**
 * A lightweight floating launcher for the existing deterministic, read-only
 * Stuora Bot. The bundled mascot is 3D-styled artwork, not a WebGL model.
 * Respect reduced-motion settings and keep all animation on the launcher;
 * search, authentication, and authorization remain in StuoraBotOverlay.
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
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (mounted) setReduceMotion(value); })
      .catch(() => { /* Keep the launcher static if the setting is unavailable. */ });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      if (mounted) setReduceMotion(value);
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!visible || reduceMotion) {
      progress.stopAnimation();
      progress.setValue(0);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 1700, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(progress, { toValue: 0, duration: 1700, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    animation.start();
    return () => {
      animation.stop();
      progress.setValue(0);
    };
  }, [progress, reduceMotion, visible]);

  if (!visible) return null;

  const bob = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });

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
          {/* Animate the artwork, never the hit target: reliable touch and Playwright clicks. */}
          <Animated.View style={[styles.floating, { transform: [{ translateY: bob }, { scale }] }]}>
            <View style={styles.orb}>
              <View pointerEvents="none" style={styles.shine} />
              <Image
              source={require('../../assets/stuora-bot.webp')}
              resizeMode="contain"
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={styles.mascot}
              />
            </View>
          </Animated.View>
          <View style={styles.caption}><Text style={styles.captionText}>Ask Stuora</Text></View>
          <Text style={styles.beta}>SEARCH BETA</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute', right: 14, zIndex: 30, elevation: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  mobileHost: { bottom: 75 },
  desktopHost: { bottom: 22, right: 25 },
  floating: { alignItems: 'center', justifyContent: 'center' },
  launcher: { width: 94, minHeight: 101, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  orb: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: '#EDE9FF', borderWidth: 2, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#4F30AC', shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.24, shadowRadius: 15, elevation: 9,
    overflow: 'hidden',
  },
  shine: {
    position: 'absolute', top: 4, left: 9, width: 46, height: 20,
    borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.68)',
    transform: [{ rotate: '-18deg' }],
  },
  mascot: { width: 67, height: 67, borderRadius: 33 },
  caption: {
    backgroundColor: '#5635E7', borderRadius: 999,
    paddingHorizontal: 11, paddingVertical: 5, marginTop: -9,
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  captionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  beta: { marginTop: 3, fontSize: 8, letterSpacing: 0.7, color: '#493B7B', fontWeight: '800' },
});
