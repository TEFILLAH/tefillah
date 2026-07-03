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
import { SocialAuthButtons } from '../../src/components/SocialAuthButtons';
import { useAuthStore } from '../../src/store/authStore';
import { useTheme } from '../../src/store/themeStore';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { handleSocialAuthFlow } from '../../src/lib/socialAuth';
import { showAlert } from '../../src/lib/alerts';
import { useTranslation } from 'react-i18next';
import { FONTS, SPACING } from '../../src/constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { login, isLoading, clearError } = useAuthStore();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [socialLoading, setSocialLoading] = useState(false);

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
      const result = await login(email.trim().toLowerCase(), password);
      const { user, userType } = useAuthStore.getState();

      // Route based on role first, then verification status
      if (userType === 'partner') {
        if (user?.is_verified) {
          router.replace('/(partner)/dashboard');
        } else {
          router.replace('/(auth)/verify');
        }
      } else {
        if (user?.is_verified) {
          router.replace('/(main)/home');
        } else {
          router.replace('/(auth)/verify');
        }
      }
    } catch (err: any) {
      if (__DEV__) console.log('Login error:', err);
      showAlert(t('login.loginFailed'), err.message || 'Please try again');
    }
  };

  const handleSocialAuth = async (firebaseToken: string) => {
    setSocialLoading(true);
    try {
      await handleSocialAuthFlow(firebaseToken, router);
    } catch (error: any) {
      const message = error.response?.data?.detail
        || (error.message === 'Network Error' ? 'Cannot reach server. Please check your connection.' : 'Please try again');
      showAlert(t('login.loginFailed'), message);
    } finally {
      setSocialLoading(false);
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
            <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surface }]}>
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Ionicons name="flame" size={20} color={colors.accent} />
            </View>
            <ThemeToggle size="small" />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.titleContainer}>
            <Text style={[styles.title, { color: colors.text }]}>{t('login.welcomeBack')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('login.subtitle')}
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
            
            <Input
              label={t('login.passwordLabel')}
              placeholder={t('login.passwordPlaceholder')}
              icon="lock-closed-outline"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (errors.password) setErrors(prev => ({ ...prev, password: '' }));
              }}
              error={errors.password}
              secureTextEntry
            />
            
            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={() => router.push('/(auth)/forgot-password')}
            >
              <Text style={[styles.forgotPasswordText, { color: colors.accent }]}>
                {t('login.forgotPassword')}
              </Text>
            </TouchableOpacity>
            
            <Button
              title={t('login.signIn')}
              onPress={handleLogin}
              variant="primary"
              size="large"
              loading={isLoading}
              style={styles.submitButton}
            />

            <SocialAuthButtons
              onSocialAuth={handleSocialAuth}
              isLoading={socialLoading}
            />
          </Animated.View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              {t('login.noAccount')}{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
              <Text style={[styles.footerLink, { color: colors.accent }]}>{t('login.createAccount')}</Text>
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
  headerCenter: { alignItems: 'center' },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  titleContainer: { marginBottom: SPACING.xl },
  title: { fontSize: 28, fontWeight: '300', marginBottom: SPACING.xs, fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif' },
  subtitle: { fontSize: FONTS.sizes.md, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif' },
  form: { flex: 1 },
  forgotPassword: { alignSelf: 'flex-end', marginTop: SPACING.sm, marginBottom: SPACING.lg },
  forgotPasswordText: { fontSize: FONTS.sizes.sm, fontFamily: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif' },
  submitButton: { marginTop: SPACING.md },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: SPACING.xl },
  footerText: { fontSize: FONTS.sizes.md, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif' },
  footerLink: { fontSize: FONTS.sizes.md, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif' },
});
