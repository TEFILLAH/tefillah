import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Modal, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { showAlert } from '../../src/lib/alerts';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { SocialAuthButtons } from '../../src/components/SocialAuthButtons';
import { useAuthStore } from '../../src/store/authStore';
import { useTheme } from '../../src/store/themeStore';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { handleSocialAuthFlow } from '../../src/lib/socialAuth';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';
import { termsContent, privacyContent } from '../../src/data/legalContent';

export default function SignUpScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { register, isLoading, error, clearError } = useAuthStore();

  const [step, setStep] = useState(1);
  const [socialLoading, setSocialLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '+91 ', // default to the India country code
    address: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [locationCity, setLocationCity] = useState('');
  const [locationCountry, setLocationCountry] = useState('');

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const [geo] = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (geo) {
            if (geo.city) setLocationCity(geo.city);
            if (geo.country) setLocationCountry(geo.country);
          }
        } catch {
          // Silently fail — location is optional for users
        }
      }
    })();
  }, []);

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = t('common.nameRequired');
    if (!formData.email.trim()) {
      newErrors.email = t('common.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('common.invalidEmail');
    }
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
    else if (formData.phone.trim().length < 6) newErrors.phone = 'Enter a valid phone number';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.password) {
      newErrors.password = t('common.passwordRequired');
    } else if (formData.password.length < 8) {
      newErrors.password = t('common.minPassword');
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t('common.passwordMismatch');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
  };

  const handleSubmit = async () => {
    if (!validateStep2()) return;

    try {
      clearError();
      await register({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        address: formData.address.trim() || undefined,
        location_city: locationCity.trim() || undefined,
        location_country: locationCountry.trim() || undefined,
        password: formData.password,
      });
      router.replace('/(auth)/verify');
    } catch (err: any) {
      showAlert(t('signup.registrationFailed'), err.message);
    }
  };

  const handleSocialAuth = async (firebaseToken: string) => {
    setSocialLoading(true);
    try {
      await handleSocialAuthFlow(firebaseToken, router);
    } catch (error: any) {
      const message = error.response?.data?.detail
        || (error.message === 'Network Error' ? 'Cannot reach server. Please check your connection.' : 'Please try again');
      showAlert(t('signup.registrationFailed'), message);
    } finally {
      setSocialLoading(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
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
            <TouchableOpacity
              onPress={() => step === 1 ? router.back() : setStep(1)}
              style={[styles.backButton, { backgroundColor: colors.surface }]}
            >
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Ionicons name="flame" size={20} color={colors.accent} />
            </View>
            <ThemeToggle size="small" />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.titleContainer}>
            <Text style={[styles.title, { color: colors.text }]}>{t('signup.title')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {step === 1 ? t('signup.step1Subtitle') : t('signup.step2Subtitle')}
            </Text>

            <View style={styles.stepIndicator}>
              <View style={[styles.stepDot, { backgroundColor: colors.accent, borderColor: colors.accent }]} />
              <View style={[styles.stepLine, { backgroundColor: step >= 2 ? colors.accent : colors.surface }]} />
              <View style={[
                styles.stepDot,
                step >= 2
                  ? { backgroundColor: colors.accent, borderColor: colors.accent }
                  : { backgroundColor: colors.surface, borderColor: colors.textMuted }
              ]} />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(600).delay(200)} style={styles.form}>
            {step === 1 ? (
              <>
                <Input
                  label={t('signup.nameLabel')}
                  placeholder={t('signup.namePlaceholder')}
                  icon="person-outline"
                  value={formData.name}
                  onChangeText={(v) => updateField('name', v)}
                  error={errors.name}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                />
                <Input
                  label={t('signup.emailLabel')}
                  placeholder={t('signup.emailPlaceholder')}
                  icon="mail-outline"
                  value={formData.email}
                  onChangeText={(v) => updateField('email', v)}
                  error={errors.email}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                />
                <Input
                  label={t('signup.phoneLabel')}
                  placeholder={t('signup.phonePlaceholder')}
                  icon="call-outline"
                  value={formData.phone}
                  onChangeText={(v) => updateField('phone', v)}
                  error={errors.phone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="next"
                />
                <Input
                  label={t('signup.locationLabel')}
                  placeholder={t('signup.locationPlaceholder')}
                  icon="location-outline"
                  value={formData.address}
                  onChangeText={(v) => updateField('address', v)}
                  returnKeyType="done"
                />
                <Button
                  title={t('common.continue')}
                  onPress={handleNext}
                  variant="primary"
                  size="large"
                  style={styles.submitButton}
                />
                <SocialAuthButtons
                  onSocialAuth={handleSocialAuth}
                  isLoading={socialLoading}
                />
              </>
            ) : (
              <>
                <Input
                  label={t('signup.passwordLabel')}
                  placeholder={t('signup.passwordPlaceholder')}
                  icon="lock-closed-outline"
                  value={formData.password}
                  onChangeText={(v) => updateField('password', v)}
                  error={errors.password}
                  secureTextEntry
                />
                <Input
                  label={t('signup.confirmPasswordLabel')}
                  placeholder={t('signup.confirmPasswordPlaceholder')}
                  icon="lock-closed-outline"
                  value={formData.confirmPassword}
                  onChangeText={(v) => updateField('confirmPassword', v)}
                  error={errors.confirmPassword}
                  secureTextEntry
                />
                <View style={[styles.infoBox, { backgroundColor: colors.surface }]}>
                  <Ionicons name="shield-checkmark" size={20} color={colors.accent} />
                  <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                    {t('signup.securityInfo')}
                  </Text>
                </View>
                {/* Terms & Privacy Agreement */}
                <TouchableOpacity
                  style={styles.termsRow}
                  onPress={() => setAgreedToTerms(!agreedToTerms)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.checkbox,
                    {
                      borderColor: agreedToTerms ? colors.accent : colors.textMuted,
                      backgroundColor: agreedToTerms ? colors.accent : 'transparent',
                    },
                  ]}>
                    {agreedToTerms && (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    )}
                  </View>
                  <Text style={[styles.termsText, { color: colors.textSecondary }]}>
                    I agree to the{' '}
                    <Text style={{ color: colors.accent, textDecorationLine: 'underline' }} onPress={() => setLegalModal('terms')}>
                      Terms of Service
                    </Text>
                    {' '}and{' '}
                    <Text style={{ color: colors.accent, textDecorationLine: 'underline' }} onPress={() => setLegalModal('privacy')}>
                      Privacy Policy
                    </Text>
                  </Text>
                </TouchableOpacity>

                <Button
                  title={t('signup.createAccount')}
                  onPress={handleSubmit}
                  variant="primary"
                  size="large"
                  loading={isLoading}
                  disabled={!agreedToTerms}
                  style={!agreedToTerms ? [styles.submitButton, { opacity: 0.5 }] : styles.submitButton}
                />
              </>
            )}
          </Animated.View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              {t('signup.alreadyHaveAccount')}{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={[styles.footerLink, { color: colors.accent }]}>{t('signup.signIn')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Legal Content Modal */}
      <Modal
        visible={legalModal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLegalModal(null)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {legalModal === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'}
            </Text>
            <TouchableOpacity onPress={() => setLegalModal(null)} style={[styles.modalClose, { backgroundColor: colors.surface }]}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={[styles.modalDateBadge, { backgroundColor: colors.surface }]}>
              <Ionicons name="calendar-outline" size={14} color={colors.accent} />
              <Text style={[styles.modalDateText, { color: colors.textMuted }]}>Last updated: March 15, 2026</Text>
            </View>
            {(legalModal === 'terms' ? termsContent : privacyContent).map((section, index) => (
              <View key={index} style={[styles.modalSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.modalSectionHeader}>
                  <View style={[styles.modalSectionNum, { backgroundColor: colors.accentMuted }]}>
                    <Text style={[styles.modalSectionNumText, { color: colors.accent }]}>{index + 1}</Text>
                  </View>
                  <Text style={[styles.modalSectionTitle, { color: colors.text }]}>{section.title}</Text>
                </View>
                <Text style={[styles.modalSectionBody, { color: colors.textSecondary }]}>{section.content}</Text>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  subtitle: { fontSize: FONTS.sizes.md, marginBottom: SPACING.lg, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif' },
  stepIndicator: { flexDirection: 'row', alignItems: 'center' },
  stepDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1 },
  stepLine: { flex: 1, height: 2, marginHorizontal: SPACING.sm, maxWidth: 100 },
  form: { flex: 1 },
  infoBox: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderRadius: BORDER_RADIUS.lg, marginVertical: SPACING.md, gap: SPACING.sm },
  infoText: { flex: 1, fontSize: FONTS.sizes.sm, lineHeight: 20, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif' },
  submitButton: { marginTop: SPACING.lg },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: SPACING.xl },
  footerText: { fontSize: FONTS.sizes.md, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif' },
  footerLink: { fontSize: FONTS.sizes.md, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif' },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: SPACING.lg, gap: SPACING.sm },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  termsText: { flex: 1, fontSize: FONTS.sizes.sm, lineHeight: 20, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif' },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1 },
  modalTitle: { fontSize: FONTS.sizes.lg, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif' },
  modalClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  modalContent: { padding: SPACING.lg, paddingBottom: SPACING.xxxl },
  modalDateBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: SPACING.sm, borderRadius: BORDER_RADIUS.full, gap: 6, marginBottom: SPACING.lg },
  modalDateText: { fontSize: FONTS.sizes.xs, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif' },
  modalSection: { marginBottom: SPACING.md, padding: SPACING.lg, borderRadius: BORDER_RADIUS.lg, borderWidth: 1 },
  modalSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  modalSectionNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalSectionNumText: { fontSize: FONTS.sizes.sm, fontWeight: '700' },
  modalSectionTitle: { flex: 1, fontSize: FONTS.sizes.md, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif' },
  modalSectionBody: { fontSize: FONTS.sizes.sm, lineHeight: 22, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif', paddingLeft: 40 },
});
