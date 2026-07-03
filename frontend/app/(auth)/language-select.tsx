import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, Modal,
  FlatList, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/store/themeStore';
import { useLanguageStore } from '../../src/store/languageStore';
import { LANGUAGES, type LanguageCode } from '../../src/i18n';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';

export default function LanguageSelectScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { setLanguage } = useLanguageStore();
  const [selectedLang, setSelectedLang] = useState<LanguageCode>('en');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const selectedLanguage = LANGUAGES.find(l => l.code === selectedLang)!;

  const handleContinue = async () => {
    await setLanguage(selectedLang);
    router.replace('/(auth)/landing');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View entering={FadeInDown.duration(800)} style={styles.header}>
        <View style={styles.logoContainer}>
          <View style={[styles.logoCircle, { backgroundColor: colors.accentMuted }]}>
            <Ionicons name="flame" size={36} color={colors.accent} />
          </View>
        </View>
        <Text style={[styles.appName, { color: colors.text }]}>Tefillah</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(800).delay(200)} style={styles.titleSection}>
        <Text style={[styles.title, { color: colors.text }]}>English</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Select your preferred language for the app
        </Text>
      </Animated.View>

      {/* Language Dropdown */}
      <Animated.View entering={FadeInUp.duration(800).delay(400)} style={styles.dropdownSection}>
        <Text style={[styles.dropdownLabel, { color: colors.textMuted }]}>Language</Text>
        <TouchableOpacity
          style={[styles.dropdownButton, {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          }]}
          onPress={() => setDropdownOpen(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.dropdownFlag}>{selectedLanguage.flag}</Text>
          <View style={styles.dropdownTextContainer}>
            <Text style={[styles.dropdownMainText, { color: colors.text }]}>
              {selectedLanguage.nativeLabel}
            </Text>
            {selectedLanguage.code !== 'en' && (
              <Text style={[styles.dropdownSubText, { color: colors.textMuted }]}>
                {selectedLanguage.label}
              </Text>
            )}
          </View>
          <Ionicons
            name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textMuted}
          />
        </TouchableOpacity>

        {/* Dropdown Modal */}
        <Modal
          visible={dropdownOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setDropdownOpen(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setDropdownOpen(false)}
          >
            <View style={[styles.dropdownMenu, {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }]}>
              <Text style={[styles.dropdownMenuTitle, { color: colors.textMuted }]}>
                Select Language
              </Text>
              {LANGUAGES.map((lang) => {
                const isSelected = selectedLang === lang.code;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.dropdownItem,
                      {
                        backgroundColor: isSelected ? colors.accentMuted : 'transparent',
                        borderBottomColor: colors.border,
                      },
                    ]}
                    onPress={() => {
                      setSelectedLang(lang.code as LanguageCode);
                      setDropdownOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dropdownItemFlag}>{lang.flag}</Text>
                    <View style={styles.dropdownItemTextContainer}>
                      <Text style={[styles.dropdownItemMainText, { color: colors.text }]}>
                        {lang.nativeLabel}
                      </Text>
                      <Text style={[styles.dropdownItemSubText, { color: colors.textMuted }]}>
                        {lang.label}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </Modal>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(800).delay(600)} style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: colors.buttonPrimary }]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={[styles.continueText, { color: colors.buttonPrimaryText }]}>
            {selectedLang === 'hi' ? 'जारी रखें' : selectedLang === 'te' ? 'కొనసాగించు' : 'Continue'}
          </Text>
          <Ionicons name="arrow-forward" size={20} color={colors.buttonPrimaryText} />
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
  },
  header: {
    alignItems: 'center',
    paddingTop: SPACING.xxl,
    marginBottom: SPACING.xl,
  },
  logoContainer: {
    marginBottom: SPACING.md,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 28,
    fontWeight: '200',
    letterSpacing: 6,
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONTS.sizes.md,
    textAlign: 'center',
  },
  dropdownSection: {
    flex: 1,
  },
  dropdownLabel: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5,
    gap: SPACING.md,
  },
  dropdownFlag: {
    fontSize: 28,
  },
  dropdownTextContainer: {
    flex: 1,
  },
  dropdownMainText: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
  },
  dropdownSubText: {
    fontSize: FONTS.sizes.sm,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  dropdownMenu: {
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    overflow: 'hidden',
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  dropdownMenuTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    padding: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
    borderBottomWidth: 0.5,
  },
  dropdownItemFlag: {
    fontSize: 26,
  },
  dropdownItemTextContainer: {
    flex: 1,
  },
  dropdownItemMainText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
  },
  dropdownItemSubText: {
    fontSize: FONTS.sizes.sm,
    marginTop: 1,
  },
  footer: {
    paddingVertical: SPACING.xl,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  continueText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
  },
});
