import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Modal, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/Button';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { showAlert } from '../../src/lib/alerts';
import { Input } from '../../src/components/Input';
import { useAuthStore } from '../../src/store/authStore';
import { useTheme } from '../../src/store/themeStore';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { useTranslation } from 'react-i18next';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';
import { termsContent, privacyContent } from '../../src/data/legalContent';

export default function AgentSignUpScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { registerAsPartner, isLoading, clearError } = useAuthStore();
  const { t } = useTranslation();
  
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '+91 ', // default to the India country code
    location_city: '',
    location_country: '',
    organization: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationGranted(true);
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const [geo] = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (geo) {
            if (geo.city) setFormData(prev => ({ ...prev, location_city: geo.city || '' }));
            if (geo.country) setFormData(prev => ({ ...prev, location_country: geo.country || '' }));
          }
        } catch {
          // GPS failed but permission granted — user can still type manually
        }
      } else {
        setLocationGranted(false);
      }
      setLocationLoading(false);
    })();
  }, []);

  const handleRequestLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      setLocationGranted(true);
      setLocationLoading(true);
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (geo) {
          if (geo.city) setFormData(prev => ({ ...prev, location_city: geo.city || '' }));
          if (geo.country) setFormData(prev => ({ ...prev, location_country: geo.country || '' }));
        }
      } catch {
        // GPS failed
      }
      setLocationLoading(false);
    } else {
      showAlert(
        'Location Required',
        'Location access is mandatory for prayer partners. Please enable it in your device settings.',
      );
      Linking.openSettings();
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!locationGranted) {
      showAlert('Location Required', 'Location access is mandatory for prayer partners. Please grant location permission to continue.');
      return false;
    }
    if (!formData.name.trim()) newErrors.name = t('common.nameRequired');
    if (!formData.email.trim()) newErrors.email = t('common.emailRequired');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = t('common.invalidEmail');
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
    else if (formData.phone.trim().length < 6) newErrors.phone = 'Enter a valid phone number';
    if (!formData.location_city.trim()) newErrors.location_city = t('common.cityRequired');
    if (!formData.location_country.trim()) newErrors.location_country = t('common.countryRequired');
    if (!formData.password) newErrors.password = t('common.passwordRequired');
    else if (formData.password.length < 8) newErrors.password = t('common.minPassword');
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = t('common.passwordMismatch');

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    
    try {
      clearError();
      await registerAsPartner({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        password: formData.password,
        location_city: formData.location_city.trim(),
        location_country: formData.location_country.trim(),
        organization: formData.organization.trim() || undefined,
        partner_type: 'prayer_warrior',
      });
      // New partners land in pending_approval and can't use the app until an admin
      // approves them — so don't keep the session registerAsPartner persisted (it would
      // otherwise route them into the dashboard on next launch, contradicting this message).
      await useAuthStore.getState().logout();
      Alert.alert(
        'Interest Received',
        'Your interest has been received. Our team will get back to you soon.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/agent-login') }]
      );
    } catch (err: any) {
      showAlert(t('partnerSignup.registrationFailed'), err.message);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
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
              <Text style={[styles.badgeText, { color: colors.accent }]}>{t('partnerSignup.badge')}</Text>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{t('partnerSignup.title')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('partnerSignup.subtitle')}</Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(600).delay(200)} style={styles.form}>
            <Input label={t('partnerSignup.nameLabel')} placeholder={t('partnerSignup.namePlaceholder')} icon="person-outline" value={formData.name} onChangeText={(v) => updateField('name', v)} error={errors.name} autoCapitalize="words" />
            <Input label={t('partnerSignup.emailLabel')} placeholder={t('partnerSignup.emailPlaceholder')} icon="mail-outline" value={formData.email} onChangeText={(v) => updateField('email', v)} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
            <Input label={t('partnerSignup.phoneLabel')} placeholder={t('partnerSignup.phonePlaceholder')} icon="call-outline" value={formData.phone} onChangeText={(v) => updateField('phone', v)} error={errors.phone} keyboardType="phone-pad" />
            <Input label={t('partnerSignup.orgLabel')} placeholder={t('partnerSignup.orgPlaceholder')} icon="business-outline" value={formData.organization} onChangeText={(v) => updateField('organization', v)} />
            
            {locationGranted === false && (
              <TouchableOpacity
                style={[styles.locationBanner, { backgroundColor: colors.warningBg || colors.surface, borderColor: colors.warning || colors.accent }]}
                onPress={handleRequestLocation}
                activeOpacity={0.7}
              >
                <Ionicons name="location" size={20} color={colors.warning || colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.locationBannerTitle, { color: colors.text }]}>Location Access Required</Text>
                  <Text style={[styles.locationBannerText, { color: colors.textSecondary }]}>
                    Tap here to grant location access. This is mandatory for prayer partners.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            {locationGranted === true && (
              <View style={[styles.locationBannerSuccess, { backgroundColor: colors.successBg || colors.surface, borderColor: colors.success || colors.accent }]}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success || colors.accent} />
                <Text style={[styles.locationBannerText, { color: colors.textSecondary }]}>
                  Location access granted — city and country auto-filled.
                </Text>
              </View>
            )}
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Input label={t('partnerSignup.cityLabel')} placeholder={t('partnerSignup.cityPlaceholder')} icon="location-outline" value={formData.location_city} onChangeText={(v) => updateField('location_city', v)} error={errors.location_city} />
              </View>
              <View style={styles.halfInput}>
                <Input label={t('partnerSignup.countryLabel')} placeholder={t('partnerSignup.countryPlaceholder')} icon="globe-outline" value={formData.location_country} onChangeText={(v) => updateField('location_country', v)} error={errors.location_country} />
              </View>
            </View>
            
            <Input label={t('partnerSignup.passwordLabel')} placeholder={t('partnerSignup.passwordPlaceholder')} icon="lock-closed-outline" value={formData.password} onChangeText={(v) => updateField('password', v)} error={errors.password} secureTextEntry />
            <Input label={t('partnerSignup.confirmPasswordLabel')} placeholder={t('partnerSignup.confirmPasswordPlaceholder')} icon="lock-closed-outline" value={formData.confirmPassword} onChangeText={(v) => updateField('confirmPassword', v)} error={errors.confirmPassword} secureTextEntry />

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

            <Button title={t('partnerSignup.submitButton')} onPress={handleSubmit} variant="primary" size="large" loading={isLoading} disabled={!agreedToTerms} style={!agreedToTerms ? [styles.submitButton, { opacity: 0.5 }] : styles.submitButton} />
          </Animated.View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>{t('partnerSignup.alreadyPartner')} </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/agent-login')}>
              <Text style={[styles.footerLink, { color: colors.accent }]}>{t('partnerSignup.signIn')}</Text>
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
  backButton: { padding: SPACING.sm, borderRadius: 20 },
  themeToggleWrapper: { borderRadius: 20, borderWidth: 1, padding: 4 },
  titleContainer: { marginBottom: SPACING.xl },
  badge: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm, borderRadius: BORDER_RADIUS.full, alignSelf: 'flex-start', gap: SPACING.xs, marginBottom: SPACING.md },
  badgeText: { fontSize: FONTS.sizes.sm, fontWeight: '600' },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '600', marginBottom: SPACING.sm },
  subtitle: { fontSize: FONTS.sizes.md, lineHeight: 24 },
  form: { flex: 1 },
  row: { flexDirection: 'row', gap: SPACING.sm },
  halfInput: { flex: 1 },
  locationBanner: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, marginBottom: SPACING.md, gap: SPACING.sm },
  locationBannerSuccess: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, marginBottom: SPACING.md, gap: SPACING.sm },
  locationBannerTitle: { fontSize: FONTS.sizes.sm, fontWeight: '600', marginBottom: 2 },
  locationBannerText: { fontSize: FONTS.sizes.xs, lineHeight: 18 },
  submitButton: { marginTop: SPACING.lg },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: SPACING.xl },
  footerText: { fontSize: FONTS.sizes.md },
  footerLink: { fontSize: FONTS.sizes.md, fontWeight: '600' },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: SPACING.lg, gap: SPACING.sm },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  termsText: { flex: 1, fontSize: FONTS.sizes.sm, lineHeight: 20 },
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
