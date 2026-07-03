import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSequence, withTiming, withDelay } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Button } from '../../src/components/Button';
import { useTheme } from '../../src/store/themeStore';
import { useAuthStore } from '../../src/store/authStore';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { prayerAPI } from '../../src/api/client';
import { showAlert, confirmAction } from '../../src/lib/alerts';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';

export default function ConfirmationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const {
    prayerId,
    category = 'prayer',
    comfortMessage = 'Your prayer has been received with love.',
    bibleVerse = 'The Lord is near to the brokenhearted.',
    bibleReference = 'Psalm 34:18',
  } = params;

  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState(false);

  const reportAiContent = () => {
    if (!prayerId) return;
    confirmAction(
      'Report this response?',
      'Flag this AI-generated message and scripture as wrong or inappropriate. Our team will review it.',
      async () => {
        setFlagging(true);
        try {
          await prayerAPI.flagAiContent(String(prayerId));
          setFlagged(true);
        } catch (e: any) {
          showAlert('Could not report', e.response?.data?.detail || 'Please try again.');
        } finally {
          setFlagging(false);
        }
      },
      undefined,
      'Report',
      'Cancel',
    );
  };

  const checkScale = useSharedValue(0);
  const checkOpacity = useSharedValue(0);

  useEffect(() => {
    checkOpacity.value = withDelay(300, withTiming(1, { duration: 400 }));
    checkScale.value = withDelay(300, withSequence(withTiming(1.2, { duration: 300 }), withTiming(1, { duration: 200 })));
  }, []);

  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
    transform: [{ scale: checkScale.value }],
  }));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.themeToggleContainer}>
        <ThemeToggle size="small" />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Decorative sparkles */}
        <Animated.View entering={FadeIn.duration(1200).delay(600)} style={styles.sparkleContainer}>
          <Ionicons name="sparkles" size={16} color={colors.accent} style={[styles.sparkle, styles.sparkle1]} />
          <Ionicons name="sparkles" size={12} color={colors.accent} style={[styles.sparkle, styles.sparkle2]} />
          <Ionicons name="star" size={10} color={colors.accent} style={[styles.sparkle, styles.sparkle3]} />
          <Ionicons name="sparkles" size={14} color={colors.accent} style={[styles.sparkle, styles.sparkle4]} />
        </Animated.View>

        {/* Success animation */}
        <Animated.View entering={FadeIn.duration(600)} style={styles.successContainer}>
          <View style={[styles.successGlow, { backgroundColor: colors.success }]} />
          <View style={[styles.successCircleOuter, { borderColor: colors.success }]}>
            <View style={[styles.successCircle, { backgroundColor: colors.successBg }]}>
              <Animated.View style={checkStyle}>
                <Ionicons name="checkmark" size={56} color={colors.success} />
              </Animated.View>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(600).delay(400)} style={styles.messageContainer}>
          <Text style={[styles.title, { color: colors.text }]}>{t('confirmation.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('confirmation.subtitle')}
          </Text>
        </Animated.View>

        {/* Category */}
        <Animated.View entering={FadeInUp.duration(600).delay(600)}>
          <View style={[styles.categoryBadge, { backgroundColor: colors.accentMuted }]}>
            <Text style={[styles.categoryLabel, { color: colors.textMuted }]}>{t('confirmation.categoryLabel')}</Text>
            <Text style={[styles.categoryValue, { color: colors.accent }]}>
              {String(category).charAt(0).toUpperCase() + String(category).slice(1)}
            </Text>
          </View>
        </Animated.View>

        {/* Comfort Card */}
        <Animated.View entering={FadeInUp.duration(600).delay(800)}>
          <View style={[styles.comfortCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.comfortAccentBar, { backgroundColor: colors.accent }]} />
            <View style={styles.comfortInner}>
              <View style={styles.comfortHeader}>
                <View style={[styles.comfortIconCircle, { backgroundColor: colors.accentMuted }]}>
                  <Ionicons name="heart" size={18} color={colors.accent} />
                </View>
                <Text style={[styles.comfortTitle, { color: colors.accent }]}>{t('confirmation.comfortTitle')}</Text>
              </View>

              <Text style={[styles.comfortMessage, { color: colors.text }]}>{comfortMessage}</Text>

              <View style={[styles.verseDivider, { backgroundColor: colors.border }]} />

              <View style={styles.verseContainer}>
                <Ionicons name="book" size={16} color={colors.accent} style={styles.verseIcon} />
                <View style={styles.verseTextContainer}>
                  <Text style={[styles.verseText, { color: colors.text }]}>"{bibleVerse}"</Text>
                  <Text style={[styles.verseReference, { color: colors.accent }]}>- {bibleReference}</Text>
                </View>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* AI disclosure + report (required for AI-generated content) */}
        <Animated.View entering={FadeInUp.duration(600).delay(900)}>
          <View style={styles.aiNotice}>
            <Ionicons name="sparkles-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.aiNoticeText, { color: colors.textMuted }]}>
              AI-generated — always weigh against Scripture.
            </Text>
          </View>
          {prayerId && user ? (
            flagged ? (
              <Text style={[styles.aiReport, { color: colors.success }]}>
                Thank you — flagged for review.
              </Text>
            ) : (
              <TouchableOpacity onPress={reportAiContent} disabled={flagging} hitSlop={8}>
                <Text style={[styles.aiReport, { color: colors.textMuted }]}>
                  {flagging ? 'Reporting…' : 'Report this response'}
                </Text>
              </TouchableOpacity>
            )
          ) : null}
        </Animated.View>

        {/* Email notice */}
        <Animated.View entering={FadeInUp.duration(600).delay(1000)}>
          <View style={[styles.emailNotice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.emailText, { color: colors.textSecondary }]}>
              {t('confirmation.emailNotice')}
            </Text>
          </View>
        </Animated.View>

        {/* Actions */}
        <Animated.View entering={FadeInUp.duration(600).delay(1200)} style={styles.actionsContainer}>
          <Button title={t('confirmation.returnHome')} onPress={() => router.replace('/(main)/home')} variant="primary" size="large" style={styles.actionButton} />
          <Button title={t('confirmation.submitAnother')} onPress={() => router.replace('/(main)/prayer')} variant="outline" size="large" style={styles.actionButton} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  themeToggleContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 16, right: 16, zIndex: 100 },
  scrollContent: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xl },
  sparkleContainer: { position: 'absolute', top: 60, left: 0, right: 0, height: 200 },
  sparkle: { position: 'absolute', opacity: 0.4 },
  sparkle1: { top: 20, left: '15%' },
  sparkle2: { top: 60, right: '12%' },
  sparkle3: { top: 10, right: '25%' },
  sparkle4: { top: 80, left: '20%' },
  successContainer: { alignItems: 'center', marginTop: SPACING.xl, marginBottom: SPACING.xl },
  successGlow: { position: 'absolute', width: 160, height: 160, borderRadius: 80, opacity: 0.08 },
  successCircleOuter: {
    width: 124, height: 124, borderRadius: 62, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  successCircle: {
    width: 110, height: 110, borderRadius: 55,
    alignItems: 'center', justifyContent: 'center',
  },
  messageContainer: { alignItems: 'center', marginBottom: SPACING.xl },
  title: {
    fontSize: FONTS.sizes.xxl, fontWeight: '600', marginBottom: SPACING.sm,
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  subtitle: {
    fontSize: FONTS.sizes.md, textAlign: 'center', lineHeight: 24,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  categoryBadge: {
    alignSelf: 'center', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.full, marginBottom: SPACING.xl, alignItems: 'center',
  },
  categoryLabel: { fontSize: FONTS.sizes.xs, marginBottom: 2 },
  categoryValue: { fontSize: FONTS.sizes.md, fontWeight: '700' },
  comfortCard: {
    borderRadius: BORDER_RADIUS.xl, marginBottom: SPACING.lg, borderWidth: 1, flexDirection: 'row', overflow: 'hidden',
  },
  comfortAccentBar: { width: 4 },
  comfortInner: { flex: 1, padding: SPACING.lg },
  comfortHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  comfortIconCircle: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  comfortTitle: {
    fontSize: FONTS.sizes.md, fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  comfortMessage: {
    fontSize: FONTS.sizes.md, lineHeight: 26,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  verseDivider: { height: 1, marginVertical: SPACING.lg },
  verseContainer: { flexDirection: 'row', alignItems: 'flex-start' },
  verseIcon: { marginTop: 2, marginRight: SPACING.sm },
  verseTextContainer: { flex: 1 },
  verseText: {
    fontSize: FONTS.sizes.md, fontStyle: 'italic', lineHeight: 24,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  verseReference: { fontSize: FONTS.sizes.sm, marginTop: SPACING.xs },
  aiNotice: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginBottom: SPACING.xs,
  },
  aiNoticeText: {
    fontSize: FONTS.sizes.xs,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  aiReport: {
    fontSize: FONTS.sizes.xs, textAlign: 'center', textDecorationLine: 'underline',
    marginBottom: SPACING.lg,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  emailNotice: {
    flexDirection: 'row', alignItems: 'center', padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg, marginBottom: SPACING.xl, gap: SPACING.sm, borderWidth: 1,
  },
  emailText: {
    flex: 1, fontSize: FONTS.sizes.sm, lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  actionsContainer: { gap: SPACING.md },
  actionButton: { width: '100%' },
});
