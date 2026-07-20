import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Logo } from '../../src/components/Logo';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { useTheme } from '../../src/store/themeStore';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { authAPI } from '../../src/api/client';
import { showAlert } from '../../src/lib/alerts';
import { useTranslation } from 'react-i18next';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';

type Step = 'email' | 'code' | 'success';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const validateEmail = () => {
    const newErrors: Record<string, string> = {};
    if (!email.trim()) {
      newErrors.email = t('common.emailRequired');
    } else if (!/\S+@\S+\.\S+/.test(email.trim())) {
      newErrors.email = t('common.invalidEmail');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateReset = () => {
    const newErrors: Record<string, string> = {};
    if (!code.trim() || code.trim().length !== 6) {
      newErrors.code = t('forgotPassword.invalidCode', { defaultValue: 'Please enter the 6-digit code' });
    }
    if (!newPassword) {
      newErrors.newPassword = t('common.passwordRequired');
    } else if (newPassword.length < 8) {
      newErrors.newPassword = t('common.minPassword');
    }
    if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = t('common.passwordMismatch');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSendCode = async () => {
    if (!validateEmail()) return;
    setIsLoading(true);
    try {
      await authAPI.forgotPassword(email.trim().toLowerCase());
      setStep('code');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to send reset code. Please try again.';
      showAlert(t('common.error'), message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!validateReset()) return;
    setIsLoading(true);
    try {
      await authAPI.resetPassword({
        email: email.trim().toLowerCase(),
        code: code.trim(),
        new_password: newPassword,
      });
      setStep('success');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to reset password. Please try again.';
      showAlert(t('common.error'), message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    try {
      await authAPI.forgotPassword(email.trim().toLowerCase());
      showAlert(
        t('common.success'),
        t('forgotPassword.codeSent', { defaultValue: 'A new reset code has been sent to your email.' })
      );
    } catch (error: any) {
      showAlert(t('common.error'), 'Failed to resend code.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Logo size="small" />
            <ThemeToggle size="small" />
          </Animated.View>

          {/* Step 1: Enter Email */}
          {step === 'email' && (
            <>
              <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.titleContainer}>
                <View style={[styles.iconCircle, { backgroundColor: colors.accentMuted }]}>
                  <Ionicons name="lock-closed-outline" size={32} color={colors.accent} />
                </View>
                <Text style={[styles.title, { color: colors.text }]}>
                  {t('forgotPassword.title', { defaultValue: 'Forgot Password?' })}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {t('forgotPassword.subtitle', { defaultValue: "Enter your email address and we'll send you a code to reset your password." })}
                </Text>
              </Animated.View>

              <Animated.View entering={FadeInUp.duration(600).delay(200)} style={styles.form}>
                <Input
                  label={t('login.emailLabel')}
                  placeholder={t('login.emailPlaceholder')}
                  icon="mail-outline"
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    if (errors.email) setErrors(prev => ({ ...prev, email: '' }));
                  }}
                  error={errors.email}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Button
                  title={t('forgotPassword.sendCode', { defaultValue: 'Send Reset Code' })}
                  onPress={handleSendCode}
                  variant="primary"
                  size="large"
                  loading={isLoading}
                  style={styles.submitButton}
                />
              </Animated.View>
            </>
          )}

          {/* Step 2: Enter Code + New Password */}
          {step === 'code' && (
            <>
              <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.titleContainer}>
                <View style={[styles.iconCircle, { backgroundColor: colors.accentMuted }]}>
                  <Ionicons name="key-outline" size={32} color={colors.accent} />
                </View>
                <Text style={[styles.title, { color: colors.text }]}>
                  {t('forgotPassword.resetTitle', { defaultValue: 'Reset Password' })}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {t('forgotPassword.resetSubtitle', { defaultValue: 'Enter the 6-digit code sent to' })}{' '}
                  <Text style={{ color: colors.accent, fontWeight: '600' }}>{email}</Text>
                </Text>
              </Animated.View>

              <Animated.View entering={FadeInUp.duration(600).delay(200)} style={styles.form}>
                <Input
                  label={t('forgotPassword.codeLabel', { defaultValue: 'Reset Code' })}
                  placeholder="000000"
                  icon="keypad-outline"
                  value={code}
                  onChangeText={(v) => {
                    setCode(v.replace(/[^0-9]/g, '').slice(0, 6));
                    if (errors.code) setErrors(prev => ({ ...prev, code: '' }));
                  }}
                  error={errors.code}
                  keyboardType="number-pad"
                  maxLength={6}
                />

                <Input
                  label={t('forgotPassword.newPasswordLabel', { defaultValue: 'New Password' })}
                  placeholder={t('forgotPassword.newPasswordPlaceholder', { defaultValue: 'Enter new password' })}
                  icon="lock-closed-outline"
                  value={newPassword}
                  onChangeText={(v) => {
                    setNewPassword(v);
                    if (errors.newPassword) setErrors(prev => ({ ...prev, newPassword: '' }));
                  }}
                  error={errors.newPassword}
                  secureTextEntry
                />

                <Input
                  label={t('forgotPassword.confirmPasswordLabel', { defaultValue: 'Confirm New Password' })}
                  placeholder={t('forgotPassword.confirmPasswordPlaceholder', { defaultValue: 'Confirm new password' })}
                  icon="lock-closed-outline"
                  value={confirmPassword}
                  onChangeText={(v) => {
                    setConfirmPassword(v);
                    if (errors.confirmPassword) setErrors(prev => ({ ...prev, confirmPassword: '' }));
                  }}
                  error={errors.confirmPassword}
                  secureTextEntry
                />

                <Button
                  title={t('forgotPassword.resetButton', { defaultValue: 'Reset Password' })}
                  onPress={handleResetPassword}
                  variant="primary"
                  size="large"
                  loading={isLoading}
                  style={styles.submitButton}
                />

                <TouchableOpacity style={styles.resendContainer} onPress={handleResendCode} disabled={isLoading}>
                  <Text style={[styles.resendText, { color: colors.textSecondary }]}>
                    {t('forgotPassword.noCode', { defaultValue: "Didn't receive the code?" })}{' '}
                  </Text>
                  <Text style={[styles.resendLink, { color: colors.accent }]}>
                    {t('forgotPassword.resend', { defaultValue: 'Resend' })}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </>
          )}

          {/* Step 3: Success */}
          {step === 'success' && (
            <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.successContainer}>
              <View style={[styles.successCircle, { backgroundColor: colors.accentMuted }]}>
                <Ionicons name="checkmark-circle" size={64} color={colors.accent} />
              </View>
              <Text style={[styles.title, { color: colors.text, textAlign: 'center' }]}>
                {t('forgotPassword.successTitle', { defaultValue: 'Password Reset!' })}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign: 'center' }]}>
                {t('forgotPassword.successMessage', { defaultValue: 'Your password has been reset successfully. You can now sign in with your new password.' })}
              </Text>

              <Button
                title={t('forgotPassword.backToLogin', { defaultValue: 'Back to Sign In' })}
                onPress={() => router.replace('/(auth)/login')}
                variant="primary"
                size="large"
                style={styles.submitButton}
              />
            </Animated.View>
          )}

          {step !== 'success' && (
            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                {t('forgotPassword.rememberPassword', { defaultValue: 'Remember your password?' })}{' '}
              </Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={[styles.footerLink, { color: colors.accent }]}>
                  {t('login.signIn')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: SPACING.md, paddingBottom: SPACING.lg,
  },
  backButton: { padding: SPACING.sm, marginLeft: -SPACING.sm },
  titleContainer: { alignItems: 'center', marginBottom: SPACING.xl },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg,
  },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '600', marginBottom: SPACING.xs },
  subtitle: {
    fontSize: FONTS.sizes.md, lineHeight: 22, textAlign: 'center',
    paddingHorizontal: SPACING.md,
  },
  form: { flex: 1 },
  submitButton: { marginTop: SPACING.lg },
  resendContainer: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginTop: SPACING.lg,
  },
  resendText: { fontSize: FONTS.sizes.sm },
  resendLink: { fontSize: FONTS.sizes.sm, fontWeight: '600' },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg },
  successCircle: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xl,
  },
  footer: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginTop: SPACING.xl,
  },
  footerText: { fontSize: FONTS.sizes.md },
  footerLink: { fontSize: FONTS.sizes.md, fontWeight: '600' },
});
