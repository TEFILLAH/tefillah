import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { secureStorage } from '../../src/lib/secureStorage';
import { Logo } from '../../src/components/Logo';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { useTheme } from '../../src/store/themeStore';
import { useAuthStore } from '../../src/store/authStore';
import { authAPI } from '../../src/api/client';
import { showAlert } from '../../src/lib/alerts';
import { useTranslation } from 'react-i18next';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';
import { termsContent, privacyContent } from '../../src/data/legalContent';

export default function CompleteProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const initialEmail = (params.email as string) || '';
  const initialName = (params.name as string) || '';
  const provider = (params.provider as string) || 'social';
  // If this user came in as a prayer partner (from /auth/social with is_agent=true),
  // lock the toggle so they can't accidentally switch to a regular user flow.
  const lockedAsAgent = params.isAgent === '1';

  const [isAgent, setIsAgent] = useState(lockedAsAgent);
  const [formData, setFormData] = useState({
    name: initialName,
    email: initialEmail,
    phone: '+91 ', // default to the India country code
    address: '',
    location_city: '',
    location_country: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    // Name & email
    if (!formData.name.trim()) {
      newErrors.name = t('common.nameRequired', { defaultValue: 'Name is required' });
    }
    if (!formData.email.trim()) {
      newErrors.email = t('common.emailRequired', { defaultValue: 'Email is required' });
    }

    // Phone is MANDATORY for everyone (users + agents) signing in via Google/Apple
    const phoneDigits = formData.phone.replace(/\D/g, '');
    if (!formData.phone.trim()) {
      newErrors.phone = t('common.phoneRequired', { defaultValue: 'Phone number is required' });
    } else if (phoneDigits.length < 6) {
      newErrors.phone = t('common.phoneTooShort', { defaultValue: 'Enter a valid phone number' });
    }

    // City + country are MANDATORY for everyone so we can match them with a local prayer cell
    if (!formData.location_city.trim()) {
      newErrors.location_city = t('common.cityRequired', { defaultValue: 'City is required' });
    }
    if (!formData.location_country.trim()) {
      newErrors.location_country = t('common.countryRequired', { defaultValue: 'Country is required' });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleComplete = async () => {
    if (!validate()) return;
    setIsLoading(true);
    try {
      const response = await authAPI.completeSocialAuth({
        email: formData.email.trim().toLowerCase(),
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        address: !isAgent ? (formData.address.trim() || undefined) : undefined,
        is_agent: isAgent,
        location_city: formData.location_city.trim(),
        location_country: formData.location_country.trim(),
      });

      await secureStorage.setItem('auth_token', response.access_token);
      await secureStorage.setItem('user_type', response.user_type);

      // Update the Zustand store so guards elsewhere in the app reflect the
      // now-complete profile and don't route back here.
      useAuthStore.setState({
        user: response.user,
        token: response.access_token,
        userType: response.user_type,
        agent: response.user_type === 'partner' ? response.user : null,
        isInitialized: true,
      });

      // After completing profile, if the user still isn't email-verified, send
      // them to verify. Otherwise jump straight into the app.
      if (!response.user?.is_verified) {
        router.replace('/(auth)/verify');
        return;
      }
      if (response.user_type === 'partner' || response.user_type === 'agent') {
        router.replace('/(partner)/dashboard');
      } else {
        router.replace('/(main)/home');
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail.map((d: any) => d.msg || d).join(', ')
        : (detail || error.message || 'Please try again');
      showAlert(
        t('completeProfile.registrationFailed', { defaultValue: 'Registration failed' }),
        message,
      );
    } finally {
      setIsLoading(false);
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
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Logo size="small" />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.titleContainer}>
            <View style={[styles.providerBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.providerBadgeDot} />
              <Ionicons
                name={provider === 'apple' ? 'logo-apple' : 'logo-google'}
                size={14}
                color={colors.accent}
              />
              <Text style={[styles.providerText, { color: colors.accent }]}>
                {t('completeProfile.signedInWith', { defaultValue: 'Signed in with' })} {provider.charAt(0).toUpperCase() + provider.slice(1)}
              </Text>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('completeProfile.title', { defaultValue: 'Complete your profile' })}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('completeProfile.subtitleRequired', {
                defaultValue: 'Your phone number and location are required to connect you with prayer partners nearby.',
              })}
            </Text>
            <View style={[styles.requiredHint, { backgroundColor: colors.surface, borderLeftColor: colors.accent }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
              <Text style={[styles.requiredHintText, { color: colors.textSecondary }]}>
                {t('completeProfile.requiredNote', {
                  defaultValue: 'Fields marked with * are required.',
                })}
              </Text>
            </View>
          </Animated.View>

          {/* User Type Toggle — hidden if locked as agent */}
          {!lockedAsAgent && (
            <Animated.View
              entering={FadeInUp.duration(600).delay(200)}
              style={[styles.toggleContainer, { backgroundColor: colors.surface }]}
            >
              <TouchableOpacity
                style={[styles.toggleOption, !isAgent && { backgroundColor: colors.accent }]}
                onPress={() => setIsAgent(false)}
              >
                <Ionicons
                  name="hand-left-outline"
                  size={20}
                  color={!isAgent ? colors.buttonPrimaryText : colors.textSecondary}
                />
                <Text style={[styles.toggleText, { color: !isAgent ? colors.buttonPrimaryText : colors.textSecondary }]}>
                  {t('completeProfile.submitPrayers', { defaultValue: 'Submit Prayers' })}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toggleOption, isAgent && { backgroundColor: colors.accent }]}
                onPress={() => setIsAgent(true)}
              >
                <Ionicons
                  name="people-outline"
                  size={20}
                  color={isAgent ? colors.buttonPrimaryText : colors.textSecondary}
                />
                <Text style={[styles.toggleText, { color: isAgent ? colors.buttonPrimaryText : colors.textSecondary }]}>
                  {t('completeProfile.prayerAgent', { defaultValue: 'Prayer Partner' })}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          <Animated.View entering={FadeInUp.duration(600).delay(300)} style={styles.form}>
            <Input
              label={t('completeProfile.nameLabel', { defaultValue: 'Full name' })}
              placeholder={t('completeProfile.namePlaceholder', { defaultValue: 'Enter your name' })}
              icon="person-outline"
              value={formData.name}
              onChangeText={(v) => updateField('name', v)}
              error={errors.name}
              autoCapitalize="words"
            />

            <Input
              label={t('completeProfile.emailLabel', { defaultValue: 'Email' })}
              placeholder={t('completeProfile.emailPlaceholder', { defaultValue: 'Email address' })}
              icon="mail-outline"
              value={formData.email}
              onChangeText={(v) => updateField('email', v)}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={false}
            />

            <Input
              label={`${t('completeProfile.phoneLabel', { defaultValue: 'Phone number' })} *`}
              placeholder={t('completeProfile.phonePlaceholder', { defaultValue: '+1 555 123 4567' })}
              icon="call-outline"
              value={formData.phone}
              onChangeText={(v) => updateField('phone', v)}
              error={errors.phone}
              keyboardType="phone-pad"
            />

            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Input
                  label={`${t('completeProfile.cityLabel', { defaultValue: 'City' })} *`}
                  placeholder={t('completeProfile.cityPlaceholder', { defaultValue: 'City' })}
                  icon="location-outline"
                  value={formData.location_city}
                  onChangeText={(v) => updateField('location_city', v)}
                  error={errors.location_city}
                />
              </View>
              <View style={styles.halfInput}>
                <Input
                  label={`${t('completeProfile.countryLabel', { defaultValue: 'Country' })} *`}
                  placeholder={t('completeProfile.countryPlaceholder', { defaultValue: 'Country' })}
                  icon="globe-outline"
                  value={formData.location_country}
                  onChangeText={(v) => updateField('location_country', v)}
                  error={errors.location_country}
                />
              </View>
            </View>

            {!isAgent && (
              <Input
                label={t('completeProfile.addressLabel', { defaultValue: 'Address (optional)' })}
                placeholder={t('completeProfile.addressPlaceholder', { defaultValue: 'Street / area (optional)' })}
                icon="home-outline"
                value={formData.address}
                onChangeText={(v) => updateField('address', v)}
              />
            )}

            {isAgent && (
              <View style={[styles.infoBox, { backgroundColor: colors.surface }]}>
                <Ionicons name="information-circle" size={20} color={colors.accent} />
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                  {t('completeProfile.agentInfo', {
                    defaultValue: 'As a prayer partner you will be matched with a prayer cell in your city.',
                  })}
                </Text>
              </View>
            )}

            {/* Terms & Privacy agreement */}
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
                {agreedToTerms && <Ionicons name="checkmark" size={14} color="#fff" />}
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
              title={isAgent
                ? t('completeProfile.joinAsAgent', { defaultValue: 'Join as Prayer Partner' })
                : t('completeProfile.completeRegistration', { defaultValue: 'Complete Registration' })}
              onPress={handleComplete}
              variant="primary"
              size="large"
              loading={isLoading}
              disabled={!agreedToTerms}
              style={!agreedToTerms ? [styles.submitButton, { opacity: 0.5 }] : styles.submitButton}
            />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Legal content modal */}
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
            {(legalModal === 'terms' ? termsContent : privacyContent).map((section, index) => (
              <View key={index} style={[styles.modalSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.modalSectionTitle, { color: colors.text }]}>{section.title}</Text>
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
  backButton: { padding: SPACING.sm, marginLeft: -SPACING.sm },
  titleContainer: { marginBottom: SPACING.xl },
  providerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'flex-start',
    gap: 6,
    marginBottom: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  providerBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34A853',
  },
  providerText: { fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 0.3 },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '700', marginBottom: SPACING.xs, letterSpacing: 0.2 },
  subtitle: { fontSize: FONTS.sizes.md, lineHeight: 22 },
  requiredHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
    borderLeftWidth: 3,
  },
  requiredHintText: {
    flex: 1,
    fontSize: FONTS.sizes.xs,
    lineHeight: 18,
  },
  toggleContainer: { flexDirection: 'row', borderRadius: BORDER_RADIUS.lg, padding: SPACING.xs, marginBottom: SPACING.xl, gap: SPACING.xs },
  toggleOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, gap: SPACING.sm },
  toggleText: { fontSize: FONTS.sizes.sm, fontWeight: '600' },
  form: { flex: 1 },
  row: { flexDirection: 'row', gap: SPACING.sm },
  halfInput: { flex: 1 },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', padding: SPACING.md, borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.md, gap: SPACING.sm },
  infoText: { flex: 1, fontSize: FONTS.sizes.sm, lineHeight: 20 },
  submitButton: { marginTop: SPACING.lg },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: SPACING.lg, gap: SPACING.sm },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  termsText: { flex: 1, fontSize: FONTS.sizes.sm, lineHeight: 20, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif' },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1 },
  modalTitle: { fontSize: FONTS.sizes.lg, fontWeight: '600' },
  modalClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  modalContent: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  modalSection: { marginBottom: SPACING.md, padding: SPACING.lg, borderRadius: BORDER_RADIUS.lg, borderWidth: 1 },
  modalSectionTitle: { fontSize: FONTS.sizes.md, fontWeight: '600', marginBottom: SPACING.sm },
  modalSectionBody: { fontSize: FONTS.sizes.sm, lineHeight: 22 },
});
