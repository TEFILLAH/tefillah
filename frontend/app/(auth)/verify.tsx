import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Logo } from '../../src/components/Logo';
import { Button } from '../../src/components/Button';
import { useAuthStore } from '../../src/store/authStore';
import { useTheme } from '../../src/store/themeStore';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { showAlert } from '../../src/lib/alerts';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';

export default function VerifyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { user, userType, verifyEmail, resendVerification, isLoading, logout } = useAuthStore();

  const handleUseDifferentAccount = async () => {
    await logout();
    router.replace('/(auth)/landing');
  };

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const handleCodeChange = (value: string, index: number) => {
    const newCode = [...code];
    if (value.length > 1) {
      const pastedCode = value.slice(0, 6).split('');
      pastedCode.forEach((char, i) => { if (i < 6) newCode[i] = char; });
      setCode(newCode);
      inputRefs.current[5]?.focus();
      return;
    }
    newCode[index] = value;
    setCode(newCode);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handleVerify = async () => {
    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      showAlert(t('common.error'), t('verify.enterFullCode'));
      return;
    }
    try {
      await verifyEmail(fullCode);
      if (userType === 'partner') {
        router.replace('/(partner)/dashboard');
      } else {
        router.replace('/(main)/home');
      }
    } catch (err: any) {
      showAlert(t('verify.verificationFailed'), err.message);
    }
  };

  const handleResend = async () => {
    try {
      await resendVerification();
      showAlert(t('verify.codeSent'), t('verify.codeSentMessage'));
    } catch (err: any) {
      showAlert(t('common.error'), err.message);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
        <View style={styles.headerSpacer} />
        <Logo size="small" />
        <ThemeToggle size="small" />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
          <Ionicons name="mail-open" size={48} color={colors.accent} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{t('verify.title')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('verify.subtitle')}{"\n"}
          <Text style={[styles.email, { color: colors.accent }]}>{user?.email}</Text>
        </Text>

        <View style={[styles.infoBox, { backgroundColor: colors.surface }]}>
          <Ionicons name="shield-checkmark" size={20} color={colors.accent} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t('verify.infoText')}
          </Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(600).delay(200)} style={styles.codeContainer}>
        <View style={styles.codeInputs}>
          {code.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => { inputRefs.current[index] = ref; }}
              style={[
                styles.codeInput,
                { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text },
                digit && { borderColor: colors.accent },
              ]}
              value={digit}
              onChangeText={(v) => handleCodeChange(v, index)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
              keyboardType="number-pad"
              maxLength={index === 0 ? 6 : 1}
              selectTextOnFocus
            />
          ))}
        </View>

        <Button title={t('verify.verifyButton')} onPress={handleVerify} variant="primary" size="large" loading={isLoading} style={styles.verifyButton} />

        <View style={styles.resendContainer}>
          <Text style={[styles.resendText, { color: colors.textSecondary }]}>{t('verify.noCode')} </Text>
          <TouchableOpacity onPress={handleResend} disabled={isLoading}>
            <Text style={[styles.resendLink, { color: colors.accent }]}>{t('verify.resend')}</Text>
          </TouchableOpacity>
        </View>

        {/* Escape hatch so an unverifiable user isn't trapped on this screen */}
        <TouchableOpacity onPress={handleUseDifferentAccount} disabled={isLoading} style={styles.switchAccount}>
          <Ionicons name="arrow-back" size={15} color={colors.textMuted} />
          <Text style={[styles.switchAccountText, { color: colors.textMuted }]}>Use a different account</Text>
        </TouchableOpacity>

      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: SPACING.md, paddingBottom: SPACING.lg },
  headerSpacer: { width: 40 },
  content: { flex: 0.4, justifyContent: 'center', alignItems: 'center' },
  iconContainer: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '600', marginBottom: SPACING.sm },
  subtitle: { fontSize: FONTS.sizes.md, textAlign: 'center', lineHeight: 24 },
  email: { fontWeight: '600' },
  infoBox: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.lg, gap: SPACING.sm },
  infoText: { flex: 1, fontSize: FONTS.sizes.sm, lineHeight: 20 },
  codeContainer: { flex: 0.6, justifyContent: 'center' },
  codeInputs: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.sm, marginBottom: SPACING.xl },
  codeInput: { width: 50, height: 60, borderRadius: BORDER_RADIUS.md, borderWidth: 2, fontSize: FONTS.sizes.xxl, textAlign: 'center', fontWeight: '600' },
  verifyButton: { marginBottom: SPACING.lg },
  resendContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: SPACING.md },
  resendText: { fontSize: FONTS.sizes.md },
  resendLink: { fontSize: FONTS.sizes.md, fontWeight: '600' },
  switchAccount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: SPACING.xs },
  switchAccountText: { fontSize: FONTS.sizes.sm, fontWeight: '500' },
});
