import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { useTheme } from '../../src/store/themeStore';
import { authAPI } from '../../src/api/client';
import { showAlert } from '../../src/lib/alerts';
import { useTranslation } from 'react-i18next';
import { FONTS, SPACING } from '../../src/constants/theme';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!currentPassword) {
      newErrors.currentPassword = t('changePassword.currentRequired', {
        defaultValue: 'Current password is required',
      });
    }
    if (!newPassword) {
      newErrors.newPassword = t('common.passwordRequired');
    } else if (newPassword.length < 8) {
      newErrors.newPassword = t('common.minPassword');
    }
    if (newPassword && currentPassword && newPassword === currentPassword) {
      newErrors.newPassword = t('changePassword.sameAsCurrent', {
        defaultValue: 'New password must be different from current password',
      });
    }
    if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = t('common.passwordMismatch');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChangePassword = async () => {
    if (!validate()) return;
    setIsLoading(true);
    try {
      await authAPI.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setSuccess(true);
    } catch (error: any) {
      const message =
        error.response?.data?.detail ||
        t('changePassword.failed', { defaultValue: 'Failed to change password. Please try again.' });
      showAlert(t('common.error'), message);
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
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {t('changePassword.title', { defaultValue: 'Change Password' })}
            </Text>
            <View style={styles.headerSpacer} />
          </Animated.View>

          {!success ? (
            <>
              <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.titleContainer}>
                <View style={[styles.iconCircle, { backgroundColor: colors.accentMuted }]}>
                  <Ionicons name="lock-closed-outline" size={32} color={colors.accent} />
                </View>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {t('changePassword.subtitle', {
                    defaultValue: 'Enter your current password and choose a new one.',
                  })}
                </Text>
              </Animated.View>

              <Animated.View entering={FadeInUp.duration(600).delay(200)} style={styles.form}>
                <Input
                  label={t('changePassword.currentLabel', { defaultValue: 'Current Password' })}
                  placeholder={t('changePassword.currentPlaceholder', {
                    defaultValue: 'Enter current password',
                  })}
                  icon="lock-closed-outline"
                  value={currentPassword}
                  onChangeText={(v) => {
                    setCurrentPassword(v);
                    if (errors.currentPassword) setErrors((prev) => ({ ...prev, currentPassword: '' }));
                  }}
                  error={errors.currentPassword}
                  secureTextEntry
                />

                <Input
                  label={t('changePassword.newLabel', { defaultValue: 'New Password' })}
                  placeholder={t('changePassword.newPlaceholder', { defaultValue: 'Enter new password' })}
                  icon="key-outline"
                  value={newPassword}
                  onChangeText={(v) => {
                    setNewPassword(v);
                    if (errors.newPassword) setErrors((prev) => ({ ...prev, newPassword: '' }));
                  }}
                  error={errors.newPassword}
                  secureTextEntry
                />

                <Input
                  label={t('changePassword.confirmLabel', { defaultValue: 'Confirm New Password' })}
                  placeholder={t('changePassword.confirmPlaceholder', {
                    defaultValue: 'Confirm new password',
                  })}
                  icon="key-outline"
                  value={confirmPassword}
                  onChangeText={(v) => {
                    setConfirmPassword(v);
                    if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: '' }));
                  }}
                  error={errors.confirmPassword}
                  secureTextEntry
                />

                <Button
                  title={t('changePassword.submit', { defaultValue: 'Change Password' })}
                  onPress={handleChangePassword}
                  variant="primary"
                  size="large"
                  loading={isLoading}
                  style={styles.submitButton}
                />
              </Animated.View>
            </>
          ) : (
            <Animated.View entering={FadeInDown.duration(600)} style={styles.successContainer}>
              <View style={[styles.successCircle, { backgroundColor: colors.accentMuted }]}>
                <Ionicons name="checkmark-circle" size={64} color={colors.accent} />
              </View>
              <Text style={[styles.title, { color: colors.text, textAlign: 'center' }]}>
                {t('changePassword.successTitle', { defaultValue: 'Password Changed!' })}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign: 'center' }]}>
                {t('changePassword.successMessage', {
                  defaultValue: 'Your password has been updated successfully.',
                })}
              </Text>
              <Button
                title={t('common.done', { defaultValue: 'Done' })}
                onPress={() => router.back()}
                variant="primary"
                size="large"
                style={styles.submitButton}
              />
            </Animated.View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  backButton: { padding: SPACING.sm, marginLeft: -SPACING.sm },
  headerTitle: { fontSize: FONTS.sizes.lg, fontWeight: '600' },
  headerSpacer: { width: 40 },
  titleContainer: { alignItems: 'center', marginBottom: SPACING.xl },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '600', marginBottom: SPACING.xs },
  subtitle: {
    fontSize: FONTS.sizes.md,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
  },
  form: { flex: 1 },
  submitButton: { marginTop: SPACING.lg },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xxl,
  },
  successCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
});
