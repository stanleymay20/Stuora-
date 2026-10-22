import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * Stuora Bot's complete, transparent, vector character rig. Nothing is cropped
 * or read from a flattened mascot photo. The face blinks independently of the
 * hovering chassis; the greeting arm and ground shadow have separate motion.
 *
 * This is intentionally a lightweight 2.5D character, NOT a realtime 3D mesh
 * or an AI model. The caller owns the stationary, accessible press target.
 */
export default function AnimatedStuoraMascot({
  active = true,
  reducedMotion = true,
}: {
  active?: boolean;
  reducedMotion?: boolean;
}) {
  const float = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reducedMotion) {
      float.stopAnimation(); blink.stopAnimation(); wave.stopAnimation();
      float.setValue(0); blink.setValue(0); wave.setValue(0);
      return;
    }
    // All loops are scoped to the mounted/visible mascot and stopped on hide.
    const native = Platform.OS !== 'web';
    const floatLoop = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 1800, useNativeDriver: native }),
      Animated.timing(float, { toValue: 0, duration: 1800, useNativeDriver: native }),
    ]));
    const blinkLoop = Animated.loop(Animated.sequence([
      Animated.delay(2600),
      Animated.timing(blink, { toValue: 1, duration: 105, useNativeDriver: native }),
      Animated.timing(blink, { toValue: 0, duration: 130, useNativeDriver: native }),
      Animated.delay(3750),
      Animated.timing(blink, { toValue: 1, duration: 95, useNativeDriver: native }),
      Animated.timing(blink, { toValue: 0, duration: 140, useNativeDriver: native }),
      Animated.delay(120),
      Animated.timing(blink, { toValue: 1, duration: 95, useNativeDriver: native }),
      Animated.timing(blink, { toValue: 0, duration: 120, useNativeDriver: native }),
      Animated.delay(2300),
    ]));
    const waveLoop = Animated.loop(Animated.sequence([
      Animated.timing(wave, { toValue: 1, duration: 1850, useNativeDriver: native }),
      Animated.timing(wave, { toValue: 0, duration: 1850, useNativeDriver: native }),
    ]));
    floatLoop.start(); blinkLoop.start(); waveLoop.start();
    return () => {
      floatLoop.stop(); blinkLoop.stop(); waveLoop.stop();
      float.stopAnimation(); blink.stopAnimation(); wave.stopAnimation();
    };
  }, [active, reducedMotion, float, blink, wave]);

  const rise = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const breath = float.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] });
  const shadowScale = float.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] });
  const shadowOpacity = float.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.22] });
  const eyeScale = blink.interpolate({ inputRange: [0, 1], outputRange: [1, 0.07] });
  const armTilt = wave.interpolate({ inputRange: [0, 1], outputRange: ['-5deg', '7deg'] });

  return (
    <View pointerEvents="none" testID="stuora-mascot-rig" style={styles.stage}>
      <Animated.View
        testID="stuora-mascot-shadow"
        style={[styles.shadow, { opacity: shadowOpacity, transform: [{ scaleX: shadowScale }] }]}
      />
      <Animated.View
        testID="stuora-mascot-body"
        style={[styles.character, { transform: [{ translateY: rise }, { scale: breath }] }]}
      >
        {/* Independently waving left arm: outside the helmet's silhouette. */}
        <Animated.View testID="stuora-mascot-arm" style={[styles.waveArm, { transform: [{ rotate: armTilt }] }]}>
          <Svg width={38} height={45} viewBox="0 0 52 60" accessibilityElementsHidden>
            <Defs>
              <LinearGradient id="waveArmShell" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#FFFFFF" />
                <Stop offset="100%" stopColor="#C9D4F6" />
              </LinearGradient>
            </Defs>
            <Path d="M42 51 C33 47 25 39 21 29" fill="none" stroke="#252641" strokeWidth={19} strokeLinecap="round" />
            <Path d="M42 51 C33 47 25 39 21 29" fill="none" stroke="url(#waveArmShell)" strokeWidth={14} strokeLinecap="round" />
            <Circle cx={40} cy={50} r={8} fill="#4C67F8" stroke="#DCEBFF" strokeWidth={3} />
            <Rect x={8} y={12} width={30} height={25} rx={12} fill="url(#waveArmShell)" stroke="#AAB8DB" strokeWidth={1.4} />
            <Rect x={7} y={2} width={7} height={20} rx={3.5} fill="#F6F8FF" stroke="#8E9BBE" strokeWidth={1} />
            <Rect x={19} y={0} width={7} height={19} rx={3.5} fill="#F6F8FF" stroke="#8E9BBE" strokeWidth={1} />
            <Rect x={30} y={4} width={7} height={18} rx={3.5} fill="#F6F8FF" stroke="#8E9BBE" strokeWidth={1} />
            <Circle cx={23} cy={24} r={6} fill="#66E2FF" stroke="#667CF9" strokeWidth={2} />
          </Svg>
        </Animated.View>

        <Svg width={110} height={118} viewBox="0 0 140 150" accessibilityElementsHidden>
          <Defs>
            <LinearGradient id="stuoraShell" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#FFFFFF" />
              <Stop offset="54%" stopColor="#F5F8FF" />
              <Stop offset="100%" stopColor="#BBC9EE" />
            </LinearGradient>
            <LinearGradient id="stuoraVisor" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#252A55" />
              <Stop offset="80%" stopColor="#080E29" />
              <Stop offset="100%" stopColor="#111D45" />
            </LinearGradient>
            <LinearGradient id="stuoraLight" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#69EDFF" />
              <Stop offset="100%" stopColor="#8E7CFF" />
            </LinearGradient>
          </Defs>

          {/* Antenna fins and ear receivers appear behind the main helmet. */}
          <Path d="M32 30 L22 5 Q21 0 26 3 L40 20 Z" fill="url(#stuoraShell)" stroke="#A4B4D8" strokeWidth={1.6} />
          <Path d="M29 8 L35 23" stroke="#7786FF" strokeWidth={3.6} strokeLinecap="round" />
          <Path d="M109 28 L119 5 Q122 0 125 5 L119 39 Z" fill="url(#stuoraShell)" stroke="#A4B4D8" strokeWidth={1.6} />
          <Path d="M119 11 L114 28" stroke="#76B7FF" strokeWidth={3.6} strokeLinecap="round" />

          {/* Right arm extends beyond torso, without an image crop. */}
          <Path d="M104 96 Q128 101 122 122" stroke="#283052" strokeWidth={21} fill="none" strokeLinecap="round" />
          <Path d="M105 97 Q127 102 121 121" stroke="url(#stuoraShell)" strokeWidth={17} fill="none" strokeLinecap="round" />
          <Ellipse cx={121} cy={125} rx={13} ry={11} fill="url(#stuoraShell)" stroke="#A5B4DC" strokeWidth={1.5} />
          <Circle cx={115} cy={132} r={4.2} fill="#323957" />
          <Circle cx={128} cy={133} r={4.2} fill="#323957" />

          {/* Hover engine and separated torso. */}
          <Ellipse cx={72} cy={138} rx={28} ry={10} fill="#707DFA" opacity={0.24} />
          <Path d="M48 129 Q71 143 97 129 L90 142 Q72 152 55 142 Z" fill="#DCE5FC" stroke="#A3B5E1" strokeWidth={1.5} />
          <Ellipse cx={72} cy={141} rx={17} ry={4.5} fill="#213C7F" />
          <Ellipse cx={72} cy={141} rx={12} ry={3} fill="#6BE4FF" />
          <Rect x={38} y={85} width={69} height={52} rx={28} fill="url(#stuoraShell)" stroke="#A9B9DB" strokeWidth={2} />
          <Path d="M47 121 Q71 128 99 118" fill="none" stroke="#6F85FF" strokeWidth={3.8} strokeLinecap="round" />
          <Path d="M61 106 L72 112 L83 106" stroke="#7883F6" fill="none" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M61 106 L61 98 L72 103 L83 98 L83 106" stroke="#7883F6" fill="none" strokeWidth={3} strokeLinejoin="round" />
          <Ellipse cx={73} cy={92} rx={19} ry={8} fill="#2F315F" />
          <Path d="M57 93 Q73 99 91 93" fill="none" stroke="#5BD8FF" strokeWidth={3} strokeLinecap="round" />

          {/* Helmet shell, visor, luminous ear pieces and friendly cheek/mouth. */}
          <Rect x={13} y={17} width={114} height={79} rx={39} fill="url(#stuoraShell)" stroke="#ACB8DB" strokeWidth={2.1} />
          <Rect x={24} y={29} width={92} height={57} rx={25} fill="url(#stuoraVisor)" stroke="#515B83" strokeWidth={2.2} />
          <Path d="M35 42 Q63 23 99 37" fill="none" stroke="#778BBE" strokeWidth={3.5} strokeLinecap="round" opacity={0.23} />
          <Ellipse cx={44} cy={72} rx={5.5} ry={2.5} fill="#B28AFF" opacity={0.85} />
          <Ellipse cx={98} cy={72} rx={5.5} ry={2.5} fill="#B28AFF" opacity={0.85} />
          <Path d="M61 72 Q71 80 81 72" fill="none" stroke="#68DFFF" strokeWidth={4} strokeLinecap="round" />
          <Ellipse cx={15} cy={60} rx={8} ry={19} fill="#C4D5F5" stroke="#8A9ED4" strokeWidth={1.5} />
          <Ellipse cx={15} cy={60} rx={4.5} ry={12.5} fill="url(#stuoraLight)" />
          <Ellipse cx={125} cy={60} rx={8} ry={19} fill="#C4D5F5" stroke="#8A9ED4" strokeWidth={1.5} />
          <Ellipse cx={125} cy={60} rx={4.5} ry={12.5} fill="url(#stuoraLight)" />
          <Path d="M60 21 Q82 16 101 26" fill="none" stroke="#8DB6FF" strokeWidth={2.8} opacity={0.65} strokeLinecap="round" />
        </Svg>
        {/* Independent eyes are layered over a blank visor, never baked into an image. */}
        <Animated.View
          testID="stuora-mascot-eyes"
          style={[styles.eyes, { transform: [{ scaleY: eyeScale }] }]}
        >
          <Svg width={61} height={26} viewBox="0 0 76 32" accessibilityElementsHidden>
            <G>
              <Ellipse cx={17} cy={15} rx={8.5} ry={12} fill="#6BE6FF" />
              <Ellipse cx={52} cy={15} rx={8.5} ry={12} fill="#6BE6FF" />
              <Ellipse cx={14} cy={10} rx={2.2} ry={3.1} fill="#F3FFFF" opacity={0.8} />
              <Ellipse cx={49} cy={10} rx={2.2} ry={3.1} fill="#F3FFFF" opacity={0.8} />
            </G>
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: 116, height: 127, position: 'relative', alignItems: 'center', overflow: 'visible' },
  shadow: {
    position: 'absolute', bottom: 0, left: 27, width: 65, height: 9,
    backgroundColor: '#606DAB', borderRadius: 99,
    shadowColor: '#4955B3', shadowOpacity: 0.22, shadowRadius: 9, shadowOffset: { width: 0, height: 2 },
  },
  character: { position: 'absolute', width: 110, height: 118, top: 0, left: 3, overflow: 'visible' },
  waveArm: { position: 'absolute', top: 57, left: -10, width: 38, height: 45, zIndex: 1 },
  eyes: { position: 'absolute', top: 38, left: 31, width: 61, height: 26, zIndex: 2 },
});
