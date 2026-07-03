import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../store/themeStore';
import { showAlert } from '../lib/alerts';
import { isFirebaseConfigured, signInWithGoogle } from '../lib/firebase';
import { FONTS, SPACING, BORDER_RADIUS } from '../constants/theme';

interface SocialAuthButtonsProps {
  onSocialAuth: (firebaseToken: string) => void;
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
  const [signingIn, setSigningIn] = useState<'google' | null>(null);
  const googleReady = isFirebaseConfigured();

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
        onSocialAuth(token);
      }
    } catch (error: any) {
      if (error.message && !error.message.includes('cancel')) {
        showAlert('Sign-In Failed', error.message || 'Google sign-in failed');
      }
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
