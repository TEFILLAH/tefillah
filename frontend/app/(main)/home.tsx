import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Logo } from '../../src/components/Logo';
import { useAuthStore } from '../../src/store/authStore';
import { useTheme } from '../../src/store/themeStore';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { PrayerBillboard } from '../../src/components/PrayerBillboard';
import { notificationsAPI, publicAPI } from '../../src/api/client';
import { useLanguageStore } from '../../src/store/languageStore';
import { FONTS, SPACING, SHADOWS, BORDER_RADIUS } from '../../src/constants/theme';

const FALLBACK_VERSES = [
  { verse: "The Lord is near to all who call on Him.", reference: "Psalm 145:18" },
  { verse: "Cast all your anxiety on Him because He cares for you.", reference: "1 Peter 5:7" },
  { verse: "Be still, and know that I am God.", reference: "Psalm 46:10" },
];

const getTimeGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { language } = useLanguageStore();

  const [unreadCount, setUnreadCount] = useState(0);
  const [dailyVerse, setDailyVerse] = useState({ verse: '', reference: '' });
  const [verseLoading, setVerseLoading] = useState(true);

  const pulse = useSharedValue(1);
  const glowOpacity = useSharedValue(0.2);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.03, { duration: 2500, easing: Easing.inOut(Easing.ease) }), -1, true);
    glowOpacity.value = withRepeat(withTiming(0.5, { duration: 2500, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);

  useEffect(() => {
    publicAPI.generateVerse(language).then(data => {
      setDailyVerse({ verse: data.verse, reference: data.reference });
    }).catch(() => {
      const fallback = FALLBACK_VERSES[Math.floor(Math.random() * FALLBACK_VERSES.length)];
      setDailyVerse(fallback);
    }).finally(() => setVerseLoading(false));
  }, [language]);

  useFocusEffect(
    useCallback(() => {
      notificationsAPI.getAll(1).then(data => {
        setUnreadCount(data.unread_count || 0);
      }).catch(() => {});
    }, [])
  );

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
        <Logo size="small" />
        <View style={styles.headerRight}>
          <ThemeToggle size="small" />
          <TouchableOpacity
            onPress={() => router.push('/(main)/notifications' as any)}
            style={[styles.headerBtn, { backgroundColor: colors.surface }]}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
            {unreadCount > 0 && (
              <View style={[styles.notifBadge, { backgroundColor: colors.accent }]}>
                <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Greeting */}
        <Animated.View entering={FadeIn.duration(800).delay(200)} style={styles.greetingSection}>
          <Text style={[styles.greetingLabel, { color: colors.textMuted }]}>
            {getTimeGreeting()}
          </Text>
          <Text style={[styles.greetingName, { color: colors.text }]}>
            {user?.name ? user.name.split(' ')[0] : ''}
          </Text>
          <Text style={[styles.greetingSubtext, { color: colors.textSecondary }]}>
            {t('home.subtitle')}
          </Text>
        </Animated.View>

        {/* Verse of the Day */}
        <Animated.View entering={FadeInDown.duration(700).delay(350)}>
          <View style={[styles.verseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.verseAccentBar, { backgroundColor: colors.accent }]} />
            <View style={styles.verseInner}>
              <View style={styles.verseHeader}>
                <Ionicons name="book-outline" size={14} color={colors.accent} />
                <Text style={[styles.verseLabel, { color: colors.accent }]}>Verse of the Day</Text>
              </View>
              {verseLoading ? (
                <ActivityIndicator size="small" color={colors.accent} style={{ paddingVertical: 12 }} />
              ) : (
                <>
                  <Text style={[styles.verseText, { color: colors.text }]}>
                    "{dailyVerse.verse}"
                  </Text>
                  <Text style={[styles.verseRef, { color: colors.accent }]}>
                    {dailyVerse.reference}
                  </Text>
                </>
              )}
            </View>
          </View>
        </Animated.View>

        {/* Prayer CTA */}
        <Animated.View entering={FadeInUp.duration(800).delay(500)} style={styles.prayerContainer}>
          <Animated.View style={[styles.prayerButtonGlow, { backgroundColor: colors.accent }, glowStyle]} />
          <Animated.View style={pulseStyle}>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                router.push('/(main)/prayer');
              }}
              activeOpacity={0.85}
              style={styles.prayerButtonOuter}
            >
              <LinearGradient
                colors={isDark
                  ? ['#d4af37', '#c9a227', '#b8941f']
                  : ['#0d9488', '#0f766e', '#115e59']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.prayerButton}
              >
                <View style={styles.prayerButtonInner}>
                  <Ionicons name="sparkles" size={36} color={isDark ? '#000' : '#fff'} />
                  <Text style={[styles.prayerButtonText, { color: isDark ? '#000' : '#fff' }]}>
                    {t('home.submitPrayer')}
                  </Text>
                  <Text style={[styles.prayerButtonSubtext, { color: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)' }]}>
                    {t('home.submitPrayerSubtext')}
                  </Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>

        {/* Living Prayer Billboard — community pulse, prayed-for-you moments, daily intention */}
        <Animated.View entering={FadeInUp.duration(800).delay(700)}>
          <PrayerBillboard />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: { color: '#000', fontSize: 9, fontWeight: '700' },
  scrollContent: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },

  // Greeting
  greetingSection: { paddingTop: SPACING.md, marginBottom: SPACING.lg },
  greetingLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '500',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif',
    marginBottom: 4,
  },
  greetingName: {
    fontSize: FONTS.sizes.xxxl,
    fontWeight: '300',
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    marginBottom: SPACING.xs,
  },
  greetingSubtext: {
    fontSize: FONTS.sizes.md,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },

  // Verse Card
  verseCard: {
    flexDirection: 'row',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.xl,
    overflow: 'hidden',
  },
  verseAccentBar: { width: 3 },
  verseInner: { flex: 1, padding: SPACING.md },
  verseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  verseLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  verseText: {
    fontSize: FONTS.sizes.md,
    fontStyle: 'italic',
    lineHeight: 24,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: SPACING.sm,
  },
  verseRef: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif',
  },

  // Prayer Button
  prayerContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  prayerButtonGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  prayerButtonOuter: {
    borderRadius: 120,
    ...SHADOWS.lg,
  },
  prayerButton: {
    width: 220,
    height: 220,
    borderRadius: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prayerButtonInner: {
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  prayerButtonText: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    marginTop: SPACING.sm,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  prayerButtonSubtext: {
    fontSize: FONTS.sizes.xs,
    marginTop: 4,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },

  // Quick Actions
  quickActions: { gap: SPACING.sm, marginBottom: SPACING.lg },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    gap: SPACING.sm,
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    flex: 1,
    fontSize: FONTS.sizes.md,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif',
  },
  quickBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  quickBadgeText: { fontSize: FONTS.sizes.xs, fontWeight: '700' },

  // Stats Strip
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  statLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  statDivider: { width: 1, height: 28 },
});
