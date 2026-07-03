import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { 
  FadeIn, 
  FadeInDown, 
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useLanguageStore } from '../../src/store/languageStore';
import { useTheme } from '../../src/store/themeStore';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { publicAPI } from '../../src/api/client';
import { isFirebaseConfigured, signInWithGoogle } from '../../src/lib/firebase';
import { handleSocialAuthFlow } from '../../src/lib/socialAuth';
import { showAlert } from '../../src/lib/alerts';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';

const { width, height } = Dimensions.get('window');

// Fallback Bible verses
const FALLBACK_VERSES = [
  { verse: "The Lord is near to all who call on Him, to all who call on Him in truth.", reference: "Psalm 145:18" },
  { verse: "Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.", reference: "Philippians 4:6" },
  { verse: "Call to me and I will answer you and tell you great and unsearchable things you do not know.", reference: "Jeremiah 33:3" },
  { verse: "Come to me, all you who are weary and burdened, and I will give you rest.", reference: "Matthew 11:28" },
  { verse: "Trust in the Lord with all your heart, and do not lean on your own understanding.", reference: "Proverbs 3:5" },
  { verse: "The prayer of a righteous person is powerful and effective.", reference: "James 5:16" },
];

// Breathing Logo Component
const BreathingLogo = ({ colors }: { colors: any }) => {
  const breathe = useSharedValue(0);
  const innerGlow = useSharedValue(0);

  useEffect(() => {
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    innerGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const innerGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(innerGlow.value, [0, 1], [0.15, 0.35]),
    transform: [{ scale: interpolate(innerGlow.value, [0, 1], [0.95, 1.05]) }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.85, 1]),
    transform: [{ scale: interpolate(breathe.value, [0, 1], [0.98, 1.02]) }],
  }));

  return (
    <View style={styles.logoContainer}>
      <Animated.View style={[styles.innerGlow, { backgroundColor: colors.accent }, innerGlowStyle]} />
      <Animated.View style={[styles.logoCircle, { backgroundColor: colors.accentMuted }]} >
        <Animated.View style={iconStyle}>
          <Ionicons name="flame" size={48} color={colors.accent} />
        </Animated.View>
      </Animated.View>
    </View>
  );
};

export default function LandingScreen() {
  const router = useRouter();
  const { colors, isDark, isHydrated } = useTheme();
  const { t } = useTranslation();
  const { language } = useLanguageStore();
  const [bibleVerse, setBibleVerse] = useState({ verse: '', reference: '' });
  const [isLoadingVerse, setIsLoadingVerse] = useState(true);
  const [socialLoading, setSocialLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    if (!isFirebaseConfigured()) {
      showAlert(t('common.comingSoon'), t('landing.socialDisabled'));
      return;
    }
    setSocialLoading(true);
    try {
      const token = await signInWithGoogle();
      if (token) {
        await handleSocialAuthFlow(token, router);
      }
    } catch (error: any) {
      const message = error.message === 'Network Error'
        ? t('common.networkError', { defaultValue: 'Cannot reach server. Please check your connection.' })
        : (error.message || 'Google sign-in failed');
      showAlert(t('login.loginFailed', { defaultValue: 'Sign-In Failed' }), message);
    } finally {
      setSocialLoading(false);
    }
  };

  useEffect(() => {
    const fetchVerse = async () => {
      try {
        setIsLoadingVerse(true);
        const response = await publicAPI.generateVerse(language);
        setBibleVerse({
          verse: response.verse,
          reference: response.reference
        });
      } catch (error) {
        if (__DEV__) console.log('Using fallback verse');
        const randomIndex = Math.floor(Math.random() * FALLBACK_VERSES.length);
        setBibleVerse(FALLBACK_VERSES[randomIndex]);
      } finally {
        setIsLoadingVerse(false);
      }
    };
    
    fetchVerse();
  }, [language]);

  // Prevent flash of wrong theme
  if (!isHydrated) {
    return (
      <View style={[styles.container, { backgroundColor: '#000000' }]}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Fixed Header with Theme Toggle */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft} />
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Tefillah</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.themeToggleWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ThemeToggle size="small" />
            </View>
          </View>
        </View>
        
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
        >
          {/* Logo Section */}
          <Animated.View entering={FadeInDown.duration(1000).delay(200)} style={styles.logoSection}>
            <BreathingLogo colors={colors} />
            
            <View style={styles.titleContainer}>
              <Text style={[styles.logoText, { color: colors.text }]}>Tefillah</Text>
              <View style={styles.taglineContainer}>
                <View style={[styles.taglineLine, { backgroundColor: colors.accent }]} />
                <Text style={[styles.tagline, { color: colors.textSecondary }]}>
                  {t('landing.tagline')}
                </Text>
                <View style={[styles.taglineLine, { backgroundColor: colors.accent }]} />
              </View>
            </View>
          </Animated.View>

          {/* Bible Verse Section */}
          <Animated.View entering={FadeIn.duration(1000).delay(600)} style={styles.verseSection}>
            <View style={[styles.verseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.verseAccentBar, { backgroundColor: colors.accent }]} />
              <View style={styles.verseCardInner}>
                <View style={styles.verseCardHeader}>
                  <Ionicons name="book-outline" size={14} color={colors.accent} />
                  <Text style={[styles.verseCardLabel, { color: colors.accent }]}>Daily Scripture</Text>
                </View>
                {isLoadingVerse ? (
                  <View style={styles.verseLoadingContainer}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={[styles.verseLoadingText, { color: colors.textMuted }]}>
                      {t('landing.receivingVerse')}
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.verseText, { color: colors.text }]}>
                      "{bibleVerse.verse}"
                    </Text>
                    <Text style={[styles.verseReference, { color: colors.accent }]}>
                      {bibleVerse.reference}
                    </Text>
                  </>
                )}
              </View>
            </View>
          </Animated.View>

          {/* Main Action Button */}
          <Animated.View entering={FadeInUp.duration(800).delay(900)} style={styles.actionsSection}>
            <TouchableOpacity 
              style={styles.primaryButton}
              onPress={() => router.push('/(auth)/signup')}
              activeOpacity={0.9}
              data-testid="begin-prayer-journey-btn"
            >
              <LinearGradient
                colors={isDark 
                  ? ['#d4af37', '#c9a227', '#b8941f']
                  : ['#0d9488', '#0f766e', '#115e59']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradientButton}
              >
                <Text style={[styles.primaryButtonText, { color: isDark ? '#000' : '#fff' }]}>
                  {t('landing.beginJourney')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Sign In Link */}
            <TouchableOpacity 
              style={styles.secondaryButton}
              onPress={() => router.push('/(auth)/login')}
              activeOpacity={0.8}
              data-testid="sign-in-link"
            >
              <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
                {t('landing.alreadyHaveAccount')}{' '}
              </Text>
              <Text style={[styles.secondaryButtonLink, { color: colors.accent }]}>
                {t('landing.signIn')}
              </Text>
            </TouchableOpacity>

            {/* Social Sign In Options */}
            <View style={styles.socialSection}>
              <View style={styles.socialDivider}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.textMuted }]}>
                  {t('common.orSignInWith')}
                </Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>

              <View style={styles.socialButtons}>
                <TouchableOpacity
                  style={[styles.socialButton, {
                    backgroundColor: colors.surface,
                    borderColor: colors.border
                  }]}
                  onPress={handleGoogleSignIn}
                  disabled={socialLoading}
                  activeOpacity={0.8}
                  data-testid="google-signin-btn"
                >
                  {socialLoading ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <>
                      <View style={styles.googleIcon}>
                        <Text style={styles.googleIconText}>G</Text>
                      </View>
                      <Text style={[styles.socialButtonText, { color: colors.text }]}>Google</Text>
                    </>
                  )}
                </TouchableOpacity>

              </View>
              {!isFirebaseConfigured() && (
                <Text style={[styles.socialDisabledText, { color: colors.textMuted }]}>
                  {t('landing.socialDisabled')}
                </Text>
              )}
            </View>
          </Animated.View>

          {/* Prayer Partner Section */}
          <Animated.View entering={FadeInUp.duration(800).delay(1100)} style={styles.partnerSection}>
            <View style={[styles.partnerCard, { 
              borderColor: colors.border,
              backgroundColor: colors.cardBackground 
            }]}>
              <View style={styles.partnerHeader}>
                <Ionicons name="people" size={18} color={colors.accent} />
                <Text style={[styles.partnerTitle, { color: colors.text }]}>
                  {t('landing.becomePartner')}
                </Text>
              </View>
              <Text style={[styles.partnerDescription, { color: colors.textSecondary }]}>
                {t('landing.partnerDescription')}
              </Text>
              
              <View style={styles.partnerActions}>
                <TouchableOpacity 
                  style={[styles.partnerButton, { 
                    backgroundColor: colors.surface,
                    borderColor: colors.border 
                  }]}
                  onPress={() => router.push('/(auth)/agent-signup')}
                  activeOpacity={0.8}
                  data-testid="join-partner-btn"
                >
                  <Text style={[styles.partnerButtonText, { color: colors.accent }]}>
                    {t('landing.joinAsPartner')}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.partnerLoginButton}
                  onPress={() => router.push('/(auth)/agent-login')}
                  activeOpacity={0.8}
                  data-testid="partner-login-btn"
                >
                  <Text style={[styles.partnerLoginText, { color: colors.textSecondary }]}>
                    {t('landing.partnerLogin')}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.accent} />
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
  },
  safeArea: { 
    flex: 1 
  },
  // Fixed Header - No overlaps
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 0,
  },
  headerLeft: {
    width: 70,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '300',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    opacity: 0,  // Hidden, just for layout
  },
  headerRight: {
    width: 70,
    alignItems: 'flex-end',
  },
  themeToggleWrapper: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 6,
  },
  scrollContent: { 
    flexGrow: 1, 
    paddingHorizontal: SPACING.xl, 
    paddingBottom: SPACING.xl 
  },
  logoSection: { 
    alignItems: 'center', 
    paddingTop: height * 0.04, 
    marginBottom: SPACING.xl 
  },
  logoContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  innerGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    alignItems: 'center',
  },
  logoText: { 
    fontSize: 38, 
    fontWeight: '200', 
    letterSpacing: 8, 
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    marginBottom: 8,
  },
  taglineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: SPACING.sm,
  },
  taglineLine: {
    width: 50,
    height: 1,
    opacity: 0.6,
  },
  tagline: { 
    fontSize: 11, 
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Light' : 'sans-serif',
    fontWeight: '300',
    textTransform: 'uppercase',
    paddingHorizontal: SPACING.sm,
    textAlign: 'center',
  },
  verseSection: {
    marginBottom: SPACING.xl,
  },
  verseCard: {
    flexDirection: 'row',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  verseAccentBar: { width: 3 },
  verseCardInner: { flex: 1, padding: SPACING.md },
  verseCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  verseCardLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  verseLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
  },
  verseLoadingText: {
    fontSize: 13,
    marginTop: SPACING.sm,
    fontStyle: 'italic',
  },
  verseText: {
    fontSize: 15,
    lineHeight: 24,
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: SPACING.sm,
  },
  verseReference: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif',
  },
  actionsSection: { 
    marginBottom: SPACING.lg 
  },
  primaryButton: { 
    borderRadius: BORDER_RADIUS.lg, 
    overflow: 'hidden', 
    elevation: 8 
  },
  gradientButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingVertical: 18, 
    paddingHorizontal: SPACING.xl, 
  },
  primaryButtonText: { 
    fontSize: FONTS.sizes.md, 
    fontWeight: '600', 
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  secondaryButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingVertical: SPACING.md 
  },
  secondaryButtonText: { 
    fontSize: FONTS.sizes.md,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  secondaryButtonLink: { 
    fontSize: FONTS.sizes.md, 
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  socialSection: {
    marginTop: SPACING.sm,
  },
  socialDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  dividerLine: { 
    flex: 1, 
    height: 1,
  },
  dividerText: { 
    paddingHorizontal: SPACING.md, 
    fontSize: FONTS.sizes.sm, 
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  socialButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.sm,
    borderWidth: 1,
  },
  googleIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4285F4',
  },
  socialButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif',
  },
  socialDisabledText: {
    fontSize: FONTS.sizes.xs,
    textAlign: 'center',
    marginTop: SPACING.sm,
    fontStyle: 'italic',
  },
  partnerSection: { 
    marginBottom: SPACING.xl 
  },
  partnerCard: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
  },
  partnerHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: SPACING.sm, 
    marginBottom: SPACING.xs 
  },
  partnerTitle: { 
    fontSize: FONTS.sizes.md, 
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  partnerDescription: { 
    fontSize: FONTS.sizes.sm, 
    lineHeight: 20, 
    marginBottom: SPACING.md,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  partnerActions: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: SPACING.md 
  },
  partnerButton: { 
    flex: 1, 
    paddingVertical: 12, 
    borderRadius: BORDER_RADIUS.md, 
    alignItems: 'center', 
    borderWidth: 1,
  },
  partnerButtonText: { 
    fontSize: FONTS.sizes.sm, 
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  partnerLoginButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: SPACING.xs, 
    paddingVertical: 12, 
    paddingHorizontal: SPACING.sm 
  },
  partnerLoginText: { 
    fontSize: FONTS.sizes.sm,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
});
