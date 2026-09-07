import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { AntDesign, FontAwesome } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../store/themeStore';
import { showAlert } from '../lib/alerts';
import {
  isFirebaseConfigured,
  signInWithGoogle,
  signInWithApple,
  isAppleSignInAvailable,
} from '../lib/firebase';
import type { SocialAuthMeta } from '../lib/socialAuth';
import { FONTS, SPACING, BORDER_RADIUS } from '../constants/theme';

interface SocialAuthButtonsProps {
  /**
   * `meta` tells the caller WHICH provider produced the token, and carries
   * Apple's first-authorization-only full name (see socialAuth.ts).
   */
  onSocialAuth: (firebaseToken: string, meta: SocialAuthMeta) => void;
  isLoading?: boolean;
}

/**
 * Google "G" mark rendered via AntDesign's google glyph so we avoid shipping
 * an extra SVG dependency. Wrapped in a white circular chip for brand
 * consistency with Google Identity's button guidelines.
 */
const GoogleGLogo = ({ size = 18 }: { size?: number }) => (
  <View style={[logoStyles.wrapper, { width: size + 10, height: size + 10, borderRadius: (size + 10) / 2 }]}>
    <AntDesign name="google" size={size} color="#4285F4" />
  </View>
);

const logoStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 1 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 1,
      },
    }),
  },
});

export const SocialAuthButtons: React.FC<SocialAuthButtonsProps> = ({
  onSocialAuth,
  isLoading = false,
}) => {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [signingIn, setSigningIn] = useState<'google' | 'apple' | null>(null);
  const googleReady = isFirebaseConfigured();

  // Sign in with Apple exists on iOS only (ASAuthorization has no Android or
  // web equivalent), so the button is not rendered at all elsewhere rather
  // than shown disabled — a dead button is worse than no button.
  const [appleReady, setAppleReady] = useState(false);
  useEffect(() => {
    let active = true;
    isAppleSignInAvailable().then((ok) => {
      if (active) setAppleReady(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleGooglePress = async () => {
    if (!googleReady) {
      showAlert(
        t('common.comingSoon'),
        t('landing.socialDisabled')
      );
      return;
    }

    setSigningIn('google');
    try {
      const token = await signInWithGoogle();
      if (token) {
        onSocialAuth(token, { provider: 'google' });
      }
    } catch (error: any) {
      if (error.message && !error.message.includes('cancel')) {
        showAlert('Sign-In Failed', error.message || 'Google sign-in failed');
      }
    } finally {
      setSigningIn(null);
    }
  };

  const handleApplePress = async () => {
    setSigningIn('apple');
    try {
      const result = await signInWithApple();
      // null means the user cancelled — not an error, say nothing.
      if (result) {
        onSocialAuth(result.identityToken, {
          provider: 'apple',
          fullName: result.fullName,
        });
      }
    } catch (error: any) {
      if (error.message && !error.message.includes('cancel')) {
        showAlert('Sign-In Failed', error.message || 'Apple sign-in failed');
      }
    } finally {
      setSigningIn(null);
    }
  };

  const isDisabled = isLoading || signingIn !== null;

  // Apple's Human Interface Guidelines: black button on light backgrounds,
  // white on dark. Both use the SAME socialButton style as Google so the two
  // are identical in size and weight — App Store guideline 4.8 requires Apple
  // to be presented no less prominently than other sign-in options.
  const appleBg = isDark ? '#ffffff' : '#000000';
  const appleFg = isDark ? '#000000' : '#ffffff';

  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.container}>
      <View style={styles.dividerContainer}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.dividerText, { color: colors.textMuted }]}>
          {t('common.orContinueWith')}
        </Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={[
            styles.socialButton,
            {
              backgroundColor: isDark ? colors.surface : '#ffffff',
              borderColor: isDark ? colors.border : '#dadce0',
              shadowColor: isDark ? '#000' : '#1a1a1a',
            },
            !googleReady && styles.disabledButton,
          ]}
          onPress={handleGooglePress}
          disabled={isDisabled}
          activeOpacity={0.85}
        >
          {signingIn === 'google' ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <>
              <GoogleGLogo size={18} />
              <Text
                style={[
                  styles.socialButtonText,
                  { color: isDark ? colors.text : '#3c4043' },
                ]}
              >
                {t('common.google')}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {appleReady && (
          <TouchableOpacity
            style={[
              styles.socialButton,
              {
                backgroundColor: appleBg,
                borderColor: appleBg,
                shadowColor: isDark ? '#000' : '#1a1a1a',
              },
            ]}
            onPress={handleApplePress}
            disabled={isDisabled}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('common.apple')}
          >
            {signingIn === 'apple' ? (
              <ActivityIndicator size="small" color={appleFg} />
            ) : (
              <>
                {/* FontAwesome is the only bundled pack with an Apple glyph —
                    AntDesign has none, so it would render an empty box. */}
                <FontAwesome name="apple" size={20} color={appleFg} />
                <Text style={[styles.socialButtonText, { color: appleFg }]}>
                  {t('common.apple')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {!googleReady && (
        <Text style={[styles.noteText, { color: colors.textMuted }]}>
          {t('landing.socialDisabled')}
        </Text>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: SPACING.lg,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    paddingHorizontal: SPACING.md,
    fontSize: FONTS.sizes.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '500',
  },
  buttonsContainer: {
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
    // Subtle elevation for premium feel
    ...Platform.select({
      android: {
        elevation: 2,
      },
      ios: {
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
    }),
  },
  disabledButton: {
    opacity: 0.55,
  },
  socialButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    letterSpacing: 0.2,
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif-medium',
  },
  noteText: {
    textAlign: 'center',
    fontSize: FONTS.sizes.xs,
    marginTop: SPACING.sm,
    fontStyle: 'italic',
    letterSpacing: 0.2,
  },
});
