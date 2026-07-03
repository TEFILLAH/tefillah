import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../store/themeStore';
import { ThemeToggle } from './ThemeToggle';
import { SPACING } from '../constants/theme';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  showLogo?: boolean;
  showThemeToggle?: boolean;
  showMenu?: boolean;
  rightComponent?: React.ReactNode;
  onBackPress?: () => void;
  transparent?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  showBack = false,
  showLogo = false,
  showThemeToggle = true,
  showMenu = false,
  rightComponent,
  onBackPress,
  transparent = false,
}) => {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  
  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.back();
    }
  };

  return (
    <View style={[
      styles.container,
      { 
        paddingTop: insets.top + 8,
        backgroundColor: transparent ? 'transparent' : colors.background,
        borderBottomColor: transparent ? 'transparent' : colors.border,
      }
    ]}>
      <View style={styles.content}>
        {/* Left Section */}
        <View style={styles.leftSection}>
          {showBack && (
            <TouchableOpacity 
              onPress={handleBack} 
              style={[styles.iconButton, { backgroundColor: colors.surface }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
          )}
          {showLogo && (
            <View style={styles.logoContainer}>
              <View style={[styles.logoIcon, { backgroundColor: colors.accentMuted }]}>
                <Ionicons name="flame" size={20} color={colors.accent} />
              </View>
              <Text style={[styles.logoText, { color: colors.text }]}>Tefillah</Text>
            </View>
          )}
          {title && !showLogo && (
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          )}
        </View>

        {/* Right Section */}
        <View style={styles.rightSection}>
          {showThemeToggle && (
            <View style={[styles.themeToggleWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ThemeToggle size="small" />
            </View>
          )}
          {showMenu && (
            <TouchableOpacity 
              onPress={() => router.push('/(main)/menu')} 
              style={[styles.iconButton, { backgroundColor: colors.surface }]}
            >
              <Ionicons name="menu" size={24} color={colors.text} />
            </TouchableOpacity>
          )}
          {rightComponent}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    zIndex: 100,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    minHeight: 48,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.sm,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 18,
    fontWeight: '300',
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  themeToggleWrapper: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 4,
  },
});

export default Header;
