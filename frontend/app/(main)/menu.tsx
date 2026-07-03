import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Logo } from '../../src/components/Logo';
import { useAuthStore } from '../../src/store/authStore';
import { useTheme } from '../../src/store/themeStore';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { confirmAction, showAlert } from '../../src/lib/alerts';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';
import { useTranslation } from 'react-i18next';
import { useLanguageStore } from '../../src/store/languageStore';
import { LANGUAGES } from '../../src/i18n';

export default function MenuScreen() {
  const router = useRouter();
  const { user, logout, canSwitch, switchTarget, switchAccount } = useAuthStore();
  const { colors, mode } = useTheme();
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguageStore();
  const [switching, setSwitching] = React.useState(false);

  const currentLang = LANGUAGES.find(l => l.code === language);

  const handleLogout = () => {
    confirmAction(
      t('menu.signOut'),
      t('menu.signOutConfirm'),
      async () => {
        await logout();
        router.replace('/(auth)/landing');
      },
      undefined,
      t('menu.signOut'),
      t('common.cancel')
    );
  };

  const handleLanguageChange = async () => {
    const currentIndex = LANGUAGES.findIndex(l => l.code === language);
    const nextIndex = (currentIndex + 1) % LANGUAGES.length;
    await setLanguage(LANGUAGES[nextIndex].code);
  };

  const handleSwitch = async () => {
    if (switching) return;
    setSwitching(true);
    try {
      const type = await switchAccount();
      router.replace(type === 'partner' ? '/(partner)/dashboard' : '/(main)/home');
    } catch (e: any) {
      showAlert(
        'Could not switch accounts',
        e?.response?.data?.detail ||
          'We couldn\'t switch you over. Make sure both your user and partner accounts use this email and are verified, then try again.',
      );
    } finally {
      setSwitching(false);
    }
  };

  const legalItems = [
    { icon: 'document-text-outline' as const, label: t('menu.terms', { defaultValue: 'Terms & Conditions' }), onPress: () => router.push('/(main)/terms') },
    { icon: 'shield-checkmark-outline' as const, label: t('menu.privacyPolicy', { defaultValue: 'Privacy Policy' }), onPress: () => router.push('/(main)/privacy-policy') },
    { icon: 'people-outline' as const, label: t('menu.communityGuidelines', { defaultValue: 'Community Guidelines' }), onPress: () => router.push('/(main)/community-guidelines') },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
          <Logo size="small" />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Account</Text>
        </Animated.View>

        {/* User Profile Card */}
        <Animated.View entering={FadeInDown.duration(600).delay(100)}>
          <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.profileAccent, { backgroundColor: colors.accent }]} />
            <View style={styles.profileCardInner}>
              <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                {(user as any)?.profile_photo_url ? (
                  <Image source={{ uri: (user as any).profile_photo_url }} style={styles.avatarImage} />
                ) : (
                  <Text style={[styles.avatarText, { color: colors.buttonPrimaryText }]}>
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                )}
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.userName, { color: colors.text }]}>{user?.name || 'User'}</Text>
                <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user?.email || ''}</Text>
              </View>
              {!user?.is_verified && (
                <TouchableOpacity
                  style={[styles.verifyBadge, { backgroundColor: colors.warningBg }]}
                  onPress={() => router.push('/(auth)/verify')}
                >
                  <Ionicons name="alert-circle" size={14} color={colors.warning} />
                  <Text style={[styles.verifyText, { color: colors.warning }]}>{t('menu.verifyEmail')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>

        {/* Profile Settings — edit name, email, phone, verify phone */}
        <Animated.View entering={FadeInDown.duration(600).delay(110)}>
          <TouchableOpacity
            style={[styles.settingsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push('/(main)/profile-settings' as any)}
            activeOpacity={0.7}
          >
            <View style={styles.settingsItem}>
              <View style={[styles.settingsIcon, { backgroundColor: colors.accentMuted }]}>
                <Ionicons name="person-circle-outline" size={18} color={colors.accent} />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>Profile Settings</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </Animated.View>

        {/* Switch account — only for verified dual user+partner accounts */}
        {canSwitch && (
          <Animated.View entering={FadeInDown.duration(600).delay(120)}>
            <TouchableOpacity
              style={[styles.settingsRow, { backgroundColor: colors.accentMuted, borderColor: colors.accent, opacity: switching ? 0.6 : 1 }]}
              onPress={handleSwitch}
              disabled={switching}
              activeOpacity={0.7}
            >
              <View style={styles.settingsItem}>
                <View style={[styles.settingsIcon, { backgroundColor: colors.accent + '22' }]}>
                  <Ionicons name="swap-horizontal" size={18} color={colors.accent} />
                </View>
                <Text style={[styles.settingsLabel, { color: colors.accent }]}>
                  {switching
                    ? 'Switching…'
                    : switchTarget === 'partner'
                    ? 'Switch to Partner account'
                    : 'Switch to User account'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* App Settings */}
        <Animated.View entering={FadeInDown.duration(600).delay(140)}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: SPACING.sm }]}>App Settings</Text>
        </Animated.View>

        {/* Settings Row - Theme */}
        <Animated.View entering={FadeInDown.duration(600).delay(150)}>
          <View style={[styles.settingsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.settingsItem}>
              <View style={[styles.settingsIcon, { backgroundColor: colors.accentMuted }]}>
                <Ionicons name={mode === 'dark' ? 'moon' : 'sunny'} size={18} color={colors.accent} />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>
                {mode === 'dark' ? t('menu.darkMode') : t('menu.lightMode')}
              </Text>
            </View>
            <ThemeToggle size="medium" />
          </View>
        </Animated.View>

        {/* Settings Row - Language */}
        <Animated.View entering={FadeInDown.duration(600).delay(175)}>
          <TouchableOpacity
            style={[styles.settingsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleLanguageChange}
            activeOpacity={0.7}
          >
            <View style={styles.settingsItem}>
              <View style={[styles.settingsIcon, { backgroundColor: colors.accentMuted }]}>
                <Ionicons name="language" size={18} color={colors.accent} />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>{t('menu.language')}</Text>
            </View>
            <View style={styles.langSelector}>
              <Text style={[styles.langValue, { color: colors.accent }]}>
                {currentLang?.nativeLabel || 'English'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Settings Row - Notifications */}
        <Animated.View entering={FadeInDown.duration(600).delay(185)}>
          <TouchableOpacity
            style={[styles.settingsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push('/(main)/notifications' as any)}
            activeOpacity={0.7}
          >
            <View style={styles.settingsItem}>
              <View style={[styles.settingsIcon, { backgroundColor: colors.accentMuted }]}>
                <Ionicons name="notifications-outline" size={18} color={colors.accent} />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>Notifications</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </Animated.View>

        {/* Legal Section */}
        <Animated.View entering={FadeInUp.duration(600).delay(250)} style={styles.menuSection}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Legal</Text>
          {legalItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={[styles.menuItemIcon, { backgroundColor: colors.accentMuted }]}>
                <Ionicons name={item.icon} size={20} color={colors.accent} />
              </View>
              <Text style={[styles.menuItemLabel, { color: colors.text }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </Animated.View>

        {/* About */}
        <Animated.View entering={FadeInUp.duration(600).delay(300)}>
          <View style={[styles.aboutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.aboutTitle, { color: colors.accent }]}>{t('menu.aboutTitle')}</Text>
            <Text style={[styles.aboutText, { color: colors.textSecondary }]}>
              {t('menu.aboutText')}
            </Text>
            <View style={[styles.versionBadge, { backgroundColor: colors.background }]}>
              <Text style={[styles.versionText, { color: colors.textMuted }]}>v1.0.0</Text>
            </View>
          </View>
        </Animated.View>

        {/* Sign Out */}
        <Animated.View entering={FadeInUp.duration(600).delay(350)} style={styles.logoutContainer}>
          <TouchableOpacity
            style={[styles.logoutButton, { borderColor: colors.error }]}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={[styles.logoutText, { color: colors.error }]}>{t('menu.signOut')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  headerTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif',
  },
  backButton: { padding: 2 },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Profile Card
  profileCard: {
    flexDirection: 'row',
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
  },
  profileAccent: { width: 4 },
  profileCardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  avatarImage: { width: 56, height: 56, borderRadius: 28 },
  profileInfo: { flex: 1 },
  userName: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: FONTS.sizes.sm,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  verifyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    gap: 4,
  },
  verifyText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  // Settings
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  settingsItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsLabel: {
    fontSize: FONTS.sizes.md,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif',
  },
  langSelector: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  langValue: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  // Menu sections
  menuSection: { marginTop: SPACING.lg },
  sectionLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemLabel: {
    flex: 1,
    fontSize: FONTS.sizes.md,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif',
  },
  // About
  aboutCard: {
    marginTop: SPACING.xl,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
  },
  aboutTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    marginBottom: SPACING.sm,
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  aboutText: {
    fontSize: FONTS.sizes.sm,
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  versionBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.md,
  },
  versionText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  // Logout
  logoutContainer: { marginTop: SPACING.xl, marginBottom: SPACING.lg },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5,
    gap: SPACING.sm,
  },
  logoutText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
});
