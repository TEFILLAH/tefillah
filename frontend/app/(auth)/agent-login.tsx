import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform 
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Logo } from '../../src/components/Logo';
import { showAlert } from '../../src/lib/alerts';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { useAuthStore } from '../../src/store/authStore';
import { useTheme } from '../../src/store/themeStore';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { useTranslation } from 'react-i18next';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';

export default function AgentLoginScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { loginAsPartner, isLoading, clearError } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!email.trim()) newErrors.email = t('common.emailRequired');
    if (!password) newErrors.password = t('common.passwordRequired');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    
    try {
      clearError();
      await loginAsPartner(email.trim().toLowerCase(), password);
      const { user } = useAuthStore.getState();
      if (user?.is_verified) {
        router.replace('/(partner)/dashboard');
      } else {
        router.replace('/(auth)/verify');
      }
    } catch (err: any) {
      showAlert(t('partnerLogin.loginFailed'), err.message);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surface }]}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <View style={[styles.themeToggleWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ThemeToggle size="small" />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.titleContainer}>
            <View style={[styles.badge, { backgroundColor: colors.surface }]}>
              <Ionicons name="people" size={16} color={colors.accent} />
              <Text style={[styles.badgeText, { color: colors.accent }]}>{t('partnerLogin.badge')}</Text>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{t('partnerLogin.title')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('partnerLogin.subtitle')}</Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(600).delay(200)} style={styles.form}>
            <Input label={t('partnerLogin.emailLabel')} placeholder={t('partnerLogin.emailPlaceholder')} icon="mail-outline" value={email} onChangeText={(v) => { setEmail(v); if (errors.email) setErrors(prev => ({ ...prev, email: '' })); }} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
            <Input label={t('partnerLogin.passwordLabel')} placeholder={t('partnerLogin.passwordPlaceholder')} icon="lock-closed-outline" value={password} onChangeText={(v) => { setPassword(v); if (errors.password) setErrors(prev => ({ ...prev, password: '' })); }} error={errors.password} secureTextEntry />

            <TouchableOpacity style={styles.forgotPassword} onPress={() => router.push('/(auth)/forgot-password')}>
              <Text style={[styles.forgotPasswordText, { color: colors.accent }]}>{t('login.forgotPassword')}</Text>
            </TouchableOpacity>

            <Button title={t('partnerLogin.signInButton')} onPress={handleLogin} variant="primary" size="large" loading={isLoading} style={styles.submitButton} />
          </Animated.View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>{t('partnerLogin.notPartner')} </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/agent-signup')}>
              <Text style={[styles.footerLink, { color: colors.accent }]}>{t('partnerLogin.becomeOne')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: SPACING.md, paddingBottom: SPACING.lg },
  backButton: { padding: SPACING.sm, borderRadius: 20 },
  themeToggleWrapper: { borderRadius: 20, borderWidth: 1, padding: 4 },
  titleContainer: { marginBottom: SPACING.xl },
  badge: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm, borderRadius: BORDER_RADIUS.full, alignSelf: 'flex-start', gap: SPACING.xs, marginBottom: SPACING.md },
  badgeText: { fontSize: FONTS.sizes.sm, fontWeight: '600' },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '600', marginBottom: SPACING.xs },
  subtitle: { fontSize: FONTS.sizes.md },
  form: { flex: 1 },
  forgotPassword: { alignSelf: 'flex-end', marginTop: SPACING.sm, marginBottom: SPACING.sm },
  forgotPasswordText: { fontSize: FONTS.sizes.sm },
  submitButton: { marginTop: SPACING.lg },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: SPACING.xl },
  footerText: { fontSize: FONTS.sizes.md },
  footerLink: { fontSize: FONTS.sizes.md, fontWeight: '600' },
});
