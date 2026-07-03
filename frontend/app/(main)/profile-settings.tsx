import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { useTheme } from '../../src/store/themeStore';
import { useAuthStore } from '../../src/store/authStore';
import { authAPI } from '../../src/api/client';
import { showAlert, confirmAction } from '../../src/lib/alerts';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';

export default function ProfileSettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user, refreshUser, logout } = useAuthStore();
  const u = user as any;
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState(u?.name ?? '');
  const [email, setEmail] = useState(u?.email ?? '');
  const [phone, setPhone] = useState(u?.phone ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Pending email change — confirmed with a code sent to the new address.
  const [pendingEmail, setPendingEmail] = useState<string | null>(u?.pending_email ?? null);
  const [emailCode, setEmailCode] = useState('');
  const [confirmingEmail, setConfirmingEmail] = useState(false);

  const [photoUrl, setPhotoUrl] = useState<string>(u?.profile_photo_url ?? '');
  const [photoBusy, setPhotoBusy] = useState(false);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert('Permission needed', 'Please allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setPhotoBusy(true);
    try {
      const res = await authAPI.uploadPhoto({
        uri: asset.uri,
        name: asset.fileName || 'avatar.jpg',
        type: asset.mimeType || 'image/jpeg',
      });
      setPhotoUrl(res.profile_photo_url);
      await refreshUser();
    } catch (error: any) {
      showAlert('Upload failed', error.response?.data?.detail || 'Could not upload the photo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const saveProfile = async () => {
    if (name.trim().length < 2) {
      showAlert('Invalid name', 'Name must be at least 2 characters.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 7) {
      showAlert('Phone required', 'Please enter a valid phone number.');
      return;
    }
    const payload: Record<string, string> = {};
    if (name.trim() !== (u?.name ?? '')) payload.name = name.trim();
    if (email.trim().toLowerCase() !== (u?.email ?? '').toLowerCase()) payload.email = email.trim();
    if (phone.trim() !== (u?.phone ?? '')) payload.phone = phone.trim();

    if (Object.keys(payload).length === 0) {
      showAlert('No changes', 'There is nothing to save.');
      return;
    }

    setSavingProfile(true);
    try {
      const res = await authAPI.updateProfile(payload);
      await refreshUser();
      if (res.email_change_pending && res.pending_email) {
        setPendingEmail(res.pending_email);
        showAlert(
          'Confirm your new email',
          `We emailed a code to ${res.pending_email}. Enter it below to switch — your current email stays until you do.`,
        );
      } else {
        showAlert('Profile saved', 'Your changes have been saved.');
      }
    } catch (error: any) {
      showAlert('Could not save', error.response?.data?.detail || 'Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  const doDeleteAccount = async () => {
    setDeleting(true);
    try {
      await authAPI.deleteAccount();
      await logout();
      router.replace('/(auth)/landing');
    } catch (error: any) {
      setDeleting(false);
      showAlert(
        'Could not delete',
        error.response?.data?.detail || 'Please try again, or email admin@tefillah.in.',
      );
    }
  };

  const handleDeleteAccount = () => {
    confirmAction(
      'Delete your account?',
      'This permanently deletes your profile, photo and notifications, and removes your identity from past prayer requests. This cannot be undone.',
      () =>
        confirmAction(
          'Are you absolutely sure?',
          'Your account and data will be permanently deleted. This action is final.',
          doDeleteAccount,
          undefined,
          'Delete forever',
          'Keep my account',
        ),
      undefined,
      'Continue',
      'Cancel',
    );
  };

  const confirmEmailChange = async () => {
    if (emailCode.trim().length < 4) {
      showAlert('Enter the code', 'Type the code we emailed to your new address.');
      return;
    }
    setConfirmingEmail(true);
    try {
      const res = await authAPI.verifyEmailChange(emailCode.trim());
      await refreshUser();
      setPendingEmail(null);
      setEmailCode('');
      setEmail(res.email);
      showAlert('Email updated', 'Your email has been changed.');
    } catch (error: any) {
      showAlert('Could not confirm', error.response?.data?.detail || 'Invalid or expired code.');
    } finally {
      setConfirmingEmail(false);
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
          {/* Header */}
          <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Profile Settings</Text>
            <View style={styles.headerSpacer} />
          </Animated.View>

          {/* Avatar + change photo */}
          <Animated.View entering={FadeInDown.duration(600).delay(80)} style={styles.avatarWrap}>
            <TouchableOpacity onPress={pickPhoto} activeOpacity={0.8} disabled={photoBusy}>
              <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                {photoUrl ? (
                  <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={[styles.avatarText, { color: colors.buttonPrimaryText }]}>
                    {(u?.name?.charAt(0) || 'U').toUpperCase()}
                  </Text>
                )}
                <View style={[styles.cameraBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {photoBusy ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Ionicons name="camera" size={16} color={colors.accent} />
                  )}
                </View>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={pickPhoto} disabled={photoBusy}>
              <Text style={[styles.changePhotoText, { color: colors.accent }]}>
                {photoBusy ? 'Uploading…' : 'Change photo'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Profile section */}
          <Animated.View
            entering={FadeInUp.duration(600).delay(150)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.cardTitle, { color: colors.accent }]}>Your details</Text>

            <Input
              label="Full name"
              icon="person-outline"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
            />
            <Input
              label="Email"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
            />
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              Changing your email signs you out elsewhere and requires verifying the new address.
            </Text>
            <Input
              label="Phone number"
              icon="call-outline"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="done"
            />

            <Button
              title="Save changes"
              onPress={saveProfile}
              variant="primary"
              size="large"
              loading={savingProfile}
              style={styles.button}
            />
          </Animated.View>

          {/* Pending email confirmation */}
          {pendingEmail && (
            <Animated.View
              entering={FadeInUp.duration(500)}
              style={[styles.card, { backgroundColor: colors.accentMuted, borderColor: colors.accent }]}
            >
              <View style={styles.pendingHeader}>
                <Ionicons name="mail-unread-outline" size={20} color={colors.accent} />
                <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>Confirm your new email</Text>
              </View>
              <Text style={[styles.hint, { color: colors.textSecondary, marginTop: SPACING.sm, marginBottom: SPACING.md }]}>
                Enter the code we emailed to {pendingEmail}. Your current email stays active until you confirm.
              </Text>
              <Input
                label="Confirmation code"
                icon="keypad-outline"
                value={emailCode}
                onChangeText={setEmailCode}
                keyboardType="number-pad"
                placeholder="123456"
                returnKeyType="done"
              />
              <Button
                title="Confirm new email"
                onPress={confirmEmailChange}
                variant="primary"
                size="large"
                loading={confirmingEmail}
                style={styles.button}
              />
            </Animated.View>
          )}

          {/* Change password */}
          <Animated.View entering={FadeInUp.duration(600).delay(220)}>
            <TouchableOpacity
              style={[styles.passwordRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push('/(main)/change-password')}
              activeOpacity={0.7}
            >
              <View style={[styles.passwordIcon, { backgroundColor: colors.accentMuted }]}>
                <Ionicons name="key-outline" size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.passwordTitle, { color: colors.text }]}>Change password</Text>
                <Text style={[styles.passwordSub, { color: colors.textSecondary }]}>Keep your account secure</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </Animated.View>

          {/* Danger zone — permanent account deletion (required by Google Play & Apple) */}
          <Animated.View entering={FadeInUp.duration(600).delay(300)}>
            <TouchableOpacity
              style={[styles.passwordRow, { backgroundColor: colors.surface, borderColor: colors.error, marginTop: SPACING.lg }]}
              onPress={handleDeleteAccount}
              disabled={deleting}
              activeOpacity={0.7}
            >
              <View style={[styles.passwordIcon, { backgroundColor: 'rgba(220,38,38,0.12)' }]}>
                {deleting ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.passwordTitle, { color: colors.error }]}>Delete account</Text>
                <Text style={[styles.passwordSub, { color: colors.textSecondary }]}>
                  Permanently remove your account and data
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
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
  avatarWrap: { alignItems: 'center', marginBottom: SPACING.lg },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: FONTS.sizes.xxxl,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhotoText: {
    marginTop: SPACING.sm,
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  card: {
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  cardTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    marginBottom: SPACING.md,
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  pendingHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  hint: {
    fontSize: FONTS.sizes.xs,
    lineHeight: 18,
    marginTop: -SPACING.xs,
    marginBottom: SPACING.sm,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  button: { marginTop: SPACING.sm },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    gap: SPACING.md,
  },
  passwordIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif',
  },
  passwordSub: {
    fontSize: FONTS.sizes.sm,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
});
