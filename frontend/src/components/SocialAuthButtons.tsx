import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../store/themeStore';
import { showAlert } from '../lib/alerts';
import {
  isFirebaseConfigured,
  signInWithGoogle,
  signInWithApple,
  isAppleSignInAvailable,
  AppleAuthButton,
  AppleAuthButtonType,
  AppleAuthButtonStyle,
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
  const [appleReady, setAppleReady] = useState(Platform.OS === 'ios' && !!AppleAuthButton);
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
    // Apple's native button has no `disabled` prop, so the re-entrancy guard
    // that Google gets from `disabled={isDisabled}` has to live here instead.
    if (isLoading || signingIn !== null) return;

    setSigningIn('apple');
    try {
      const result = await signInWithApple();
      // null means the user cancelled — not an error, say nothing.
      if (result) {
        onSocialAuth(result.identityToken, {
          provider: 'apple',
          fullName: result.fullName,
          appleAuthorizationCode: result.authorizationCode,
        });
      }
    } catch (error: any) {
      // signInWithApple already returns null for cancels, so anything reaching
      // here is a real failure. Alert unconditionally: gating on error.message
      // meant an error without one produced NO feedback at all.
      showAlert('Sign-In Failed', error?.message || 'Apple sign-in failed');
    } finally {
      setSigningIn(null);
    }
  };

  const isDisabled = isLoading || signingIn !== null;


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
        {/* Apple FIRST: the HIG asks for Sign in with Apple to lead the
            list of sign-in options, and in an LTR row the first child is the
            more prominent slot. Sizes are identical either way. */}
        {appleReady && AppleAuthButton && (
          // Wrapped, not modified: Apple's button must render itself and takes
          // neither children nor a `disabled` prop, so the in-flight spinner
          // for the 1-3s /auth/social call is an overlay on top of it.
          <View style={styles.appleWrap}>
            <AppleAuthButton
              buttonType={AppleAuthButtonType.SIGN_IN}
              buttonStyle={isDark ? AppleAuthButtonStyle.WHITE : AppleAuthButtonStyle.BLACK}
              cornerRadius={BORDER_RADIUS.md}
              style={styles.appleButton}
              onPress={handleApplePress}
            />
            {signingIn === 'apple' && (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  styles.appleBusy,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.75)' },
                ]}
              >
                <ActivityIndicator size="small" color={isDark ? '#000' : '#fff'} />
              </View>
            )}
          </View>
        )}

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
              {/* Pinned: the Apple button's 58 below is derived from this
                  label's default size, and the native button cannot scale
                  with Dynamic Type — letting only Google grow misaligns them. */}
              <Text
                allowFontScaling={false}
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
      </View>

      {/* Apple does not depend on Firebase — never tell users to "use email"
          while a working Apple button is sitting right above this line. */}
      {!googleReady && !appleReady && (
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
  // Apple's native button is a native view, so it needs an explicit height.
  // Google's rendered height = 28 (the 18pt glyph in its 28pt chip)
  // + 28 (paddingVertical 14 x2) + 2 (borderWidth x2) = 58. Matching it keeps
  // the two visually equal, which guideline 4.8 requires.
  appleButton: {
    flex: 1,
    height: 58,
  },
  appleWrap: {
    flex: 1,
  },
  appleBusy: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.md,
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
