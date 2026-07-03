import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { showAlert } from '../../src/lib/alerts';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { prayerAPI } from '../../src/api/client';
import { useAuthStore } from '../../src/store/authStore';
import { useTheme } from '../../src/store/themeStore';
import { useLanguageStore } from '../../src/store/languageStore';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';

const MAX_CHARS = 1000;

export default function PrayerScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const { colors } = useTheme();
  const { language } = useLanguageStore();
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [locationCity, setLocationCity] = useState('');
  const [locationCountry, setLocationCountry] = useState('');
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationErrors, setLocationErrors] = useState<{ city?: string; country?: string }>({});

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setHasLocationPermission(granted);
      if (granted) {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setLocationCoords({ lat: loc.coords.latitude, lon: loc.coords.longitude });
          // Reverse geocode to auto-fill city and country
          const [geo] = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (geo) {
            if (geo.city) setLocationCity(geo.city);
            if (geo.country) setLocationCountry(geo.country);
          }
        } catch {
          setHasLocationPermission(false);
        }
      }
    })();
  }, []);

  const handleSubmit = async () => {
    if (!content.trim()) {
      showAlert(t('prayer.emptyPrayer'), t('prayer.emptyPrayerMessage'));
      return;
    }

    // If no location permission, city and country are required
    if (!locationCoords) {
      const errors: { city?: string; country?: string } = {};
      if (!locationCity.trim()) errors.city = 'City is required';
      if (!locationCountry.trim()) errors.country = 'Country is required';
      if (Object.keys(errors).length > 0) {
        setLocationErrors(errors);
        showAlert('Location Required', 'Please enter your city and country since location access was not granted.');
        return;
      }
    }
    setLocationErrors({});

    setIsSubmitting(true);
    try {
      let response;
      const prayerData = {
        content: content.trim(),
        is_anonymous: isAnonymous,
        location_city: locationCity.trim() || undefined,
        location_country: locationCountry.trim() || undefined,
        location_lat: locationCoords?.lat,
        location_lon: locationCoords?.lon,
        language,
      };
      
      if (token) {
        response = await prayerAPI.submit(prayerData);
      } else {
        response = await prayerAPI.guestSubmit(prayerData);
      }
      
      router.replace({
        pathname: '/(main)/confirmation',
        params: {
          prayerId: response.prayer_id,
          category: response.category,
          comfortMessage: response.comfort_message,
          bibleVerse: response.bible_verse,
          bibleReference: response.bible_reference,
        },
      });
    } catch (error: any) {
      showAlert(t('prayer.submissionFailed'), error.response?.data?.detail || 'Please try again later.');
      setIsSubmitting(false);
    }
  };

  const charsRemaining = MAX_CHARS - content.length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surface }]}>
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <ThemeToggle size="small" />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.titleContainer}>
            <Text style={[styles.titleLabel, { color: colors.accent }]}>{t('prayer.title').toUpperCase()}</Text>
            <Text style={[styles.title, { color: colors.text }]}>Share Your Heart</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('prayer.subtitle')}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(600).delay(200)} style={styles.inputContainer}>
            <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' }]}
                placeholder={t('prayer.placeholder')}
                placeholderTextColor={colors.placeholder}
                value={content}
                onChangeText={setContent}
                multiline
                maxLength={MAX_CHARS}
                textAlignVertical="top"
              />
              <View style={styles.charCountRow}>
                <View style={[styles.charCountBar, { backgroundColor: colors.border }]}>
                  <View style={[styles.charCountFill, { backgroundColor: charsRemaining < 50 ? colors.error : charsRemaining < 100 ? colors.warning : colors.accent, width: `${((MAX_CHARS - charsRemaining) / MAX_CHARS) * 100}%` }]} />
                </View>
                <Text style={[
                  styles.charCountText,
                  { color: colors.textMuted },
                  charsRemaining < 100 && { color: colors.warning },
                  charsRemaining < 50 && { color: colors.error },
                ]}>
                  {charsRemaining}
                </Text>
              </View>
            </View>

            <View style={[styles.optionRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: colors.text }]}>{t('prayer.anonymous')}</Text>
                <Text style={[styles.optionDescription, { color: colors.textMuted }]}>{t('prayer.anonymousDescription')}</Text>
              </View>
              <Switch
                value={isAnonymous}
                onValueChange={setIsAnonymous}
                trackColor={{ false: colors.inputBackground, true: colors.accent }}
                thumbColor="#fff"
              />
            </View>

            <View style={[styles.locationSection, { backgroundColor: colors.surface, borderColor: locationCoords ? colors.border : colors.accent }]}>
              <View style={styles.locationHeader}>
                <Text style={[styles.locationTitle, { color: colors.text }]}>{t('prayer.locationTitle')}</Text>
                <Text style={[styles.optionalBadge, { color: locationCoords ? colors.textMuted : colors.error }]}>
                  {locationCoords ? 'Optional' : 'Required'}
                </Text>
              </View>
              <Text style={[styles.locationDescription, { color: colors.textMuted }]}>
                {locationCoords
                  ? t('prayer.locationDescription')
                  : 'Location access not granted. Please enter your city and country.'}
              </Text>
              <View style={styles.locationRow}>
                <View style={styles.locationInput}>
                  <Input placeholder={t('prayer.cityPlaceholder')} value={locationCity} onChangeText={(v) => { setLocationCity(v); setLocationErrors(prev => ({ ...prev, city: '' })); }} error={locationErrors.city} containerStyle={styles.noMargin} />
                </View>
                <View style={styles.locationInput}>
                  <Input placeholder={t('prayer.countryPlaceholder')} value={locationCountry} onChangeText={(v) => { setLocationCountry(v); setLocationErrors(prev => ({ ...prev, country: '' })); }} error={locationErrors.country} containerStyle={styles.noMargin} />
                </View>
              </View>
            </View>

            <Text style={[styles.privacyText, { color: colors.textMuted }]}>
              {t('prayer.privacyNote')}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(600).delay(300)} style={styles.buttonContainer}>
            <Button
              title={t('prayer.submitButton')}
              onPress={handleSubmit}
              variant="primary"
              size="large"
              loading={isSubmitting}
              disabled={!content.trim()}
              style={styles.submitButton}
            />
          </Animated.View>
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
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  titleContainer: { marginBottom: SPACING.xl },
  titleLabel: { fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 2, marginBottom: SPACING.xs, fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif-medium', textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: '300', fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif', marginBottom: SPACING.sm, letterSpacing: 0.5 },
  subtitle: { fontSize: FONTS.sizes.md, lineHeight: 24, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif' },
  inputContainer: { flex: 1 },
  inputWrapper: { borderRadius: BORDER_RADIUS.xl, borderWidth: 1, minHeight: 200, paddingTop: SPACING.md },
  input: { flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.xs, paddingBottom: SPACING.lg, fontSize: 16, lineHeight: 28, minHeight: 160 },
  charCountRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, gap: SPACING.sm },
  charCountBar: { flex: 1, height: 2, borderRadius: 1, overflow: 'hidden' },
  charCountFill: { height: 2, borderRadius: 1 },
  charCountText: { fontSize: FONTS.sizes.xs, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif' },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md, borderRadius: BORDER_RADIUS.lg, marginTop: SPACING.md, borderWidth: 1, gap: SPACING.md },
  optionLabel: { fontSize: FONTS.sizes.md, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif-medium' },
  optionDescription: { fontSize: FONTS.sizes.xs, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif' },
  locationSection: { padding: SPACING.md, borderRadius: BORDER_RADIUS.lg, marginTop: SPACING.md, borderWidth: 1 },
  locationHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.xs },
  locationTitle: { fontSize: FONTS.sizes.md, fontWeight: '600', flex: 1, fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif-medium' },
  optionalBadge: { fontSize: FONTS.sizes.xs, fontStyle: 'italic', fontFamily: Platform.OS === 'ios' ? 'Avenir-LightOblique' : 'sans-serif' },
  locationDescription: { fontSize: FONTS.sizes.xs, marginBottom: SPACING.md, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif' },
  locationRow: { flexDirection: 'row', gap: SPACING.sm },
  locationInput: { flex: 1 },
  noMargin: { marginBottom: 0 },
  privacyText: { marginTop: SPACING.lg, fontSize: FONTS.sizes.xs, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif', textAlign: 'center', fontStyle: 'italic', lineHeight: 18 },
  buttonContainer: { marginTop: SPACING.xl },
  submitButton: { width: '100%' },
});
