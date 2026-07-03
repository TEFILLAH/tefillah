import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withTiming, 
  withDelay,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { useLanguageStore } from '../src/store/languageStore';
import { Logo } from '../src/components/Logo';
import { COLORS } from '../src/constants/theme';

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
  const router = useRouter();
  const { user, agent, isInitialized, token, userType } = useAuthStore();
  const { isInitialized: langInitialized, hasSelectedLanguage } = useLanguageStore();
  const [showSplash, setShowSplash] = useState(true);
  const hasNavigated = useRef(false);

  const fadeOut = useSharedValue(1);
  const backgroundScale = useSharedValue(1);

  const navigate = () => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;

    // If language not selected yet, go to language selection
    if (!hasSelectedLanguage) {
      router.replace('/(auth)/language-select');
      return;
    }

    if (token) {
      if (userType === 'partner') {
        // Partner logged in
        if (agent?.is_verified) {
          router.replace('/(partner)/dashboard');
        } else {
          router.replace('/(auth)/verify');
        }
      } else {
        // Regular user
        if (user?.is_verified) {
          router.replace('/(main)/home');
        } else {
          router.replace('/(auth)/verify');
        }
      }
    } else {
      router.replace('/(auth)/landing');
    }
  };

  useEffect(() => {
    if (isInitialized && langInitialized && showSplash) {
      const timer = setTimeout(() => {
        fadeOut.value = withTiming(0, { 
          duration: 500, 
          easing: Easing.out(Easing.cubic) 
        }, () => {
          runOnJS(navigate)();
        });
      }, 2500);

      return () => clearTimeout(timer);
    }
  }, [isInitialized, langInitialized, showSplash]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: fadeOut.value,
    transform: [{ scale: backgroundScale.value }],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <View style={styles.backgroundGlow} />
      <Logo size="large" animated showTagline />
      <View style={styles.loadingContainer}>
        <LoadingDots />
      </View>
    </Animated.View>
  );
}

const LoadingDots = () => {
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    const animateDots = () => {
      dot1.value = withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.3, { duration: 400 })
      );
      dot2.value = withDelay(200, withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.3, { duration: 400 })
      ));
      dot3.value = withDelay(400, withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.3, { duration: 400 })
      ));
    };

    animateDots();
    const interval = setInterval(animateDots, 1200);
    return () => clearInterval(interval);
  }, []);

  const dot1Style = useAnimatedStyle(() => ({ opacity: dot1.value }));
  const dot2Style = useAnimatedStyle(() => ({ opacity: dot2.value }));
  const dot3Style = useAnimatedStyle(() => ({ opacity: dot3.value }));

  return (
    <View style={styles.dotsContainer}>
      <Animated.View style={[styles.dot, dot1Style]} />
      <Animated.View style={[styles.dot, dot2Style]} />
      <Animated.View style={[styles.dot, dot3Style]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundGlow: {
    position: 'absolute',
    width: width * 1.5,
    height: width * 1.5,
    borderRadius: width,
    backgroundColor: COLORS.gold,
    opacity: 0.03,
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 100,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.gold,
  },
});
