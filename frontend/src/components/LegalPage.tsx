import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../store/themeStore';
import { FONTS, SPACING, BORDER_RADIUS } from '../constants/theme';

interface Section {
  title: string;
  content: string;
}

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  sections: Section[];
}

export function LegalPage({ title, lastUpdated, sections }: LegalPageProps) {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <View style={[styles.backCircle, { backgroundColor: colors.surface }]}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </View>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(400).delay(100)}>
          <View style={[styles.dateBadge, { backgroundColor: colors.surface }]}>
            <Ionicons name="calendar-outline" size={14} color={colors.accent} />
            <Text style={[styles.lastUpdated, { color: colors.textMuted }]}>
              Last updated: {lastUpdated}
            </Text>
          </View>
        </Animated.View>

        {sections.map((section, index) => (
          <Animated.View
            key={index}
            entering={FadeInDown.duration(400).delay(150 + index * 50)}
          >
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionNumber, { backgroundColor: colors.accentMuted }]}>
                  <Text style={[styles.sectionNumberText, { color: colors.accent }]}>
                    {index + 1}
                  </Text>
                </View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {section.title}
                </Text>
              </View>
              <Text style={[styles.sectionContent, { color: colors.textSecondary }]}>
                {section.content}
              </Text>
            </View>
          </Animated.View>
        ))}

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <View style={[styles.footerIcon, { backgroundColor: colors.accentMuted }]}>
            <Ionicons name="flame" size={20} color={colors.accent} />
          </View>
          <Text style={[styles.footerBrand, { color: colors.text }]}>Tefillah</Text>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>
            Sacred Prayer Platform
          </Text>
          <View style={styles.footerContact}>
            <Ionicons name="mail-outline" size={14} color={colors.accent} />
            <Text style={[styles.footerContactText, { color: colors.accent }]}>
              admin@tefillah.in
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  backButton: { padding: 2 },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    letterSpacing: 0.3,
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxxl },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    gap: 6,
    marginBottom: SPACING.lg,
  },
  lastUpdated: {
    fontSize: FONTS.sizes.xs,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  section: {
    marginBottom: SPACING.md,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  sectionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionNumberText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
  },
  sectionTitle: {
    flex: 1,
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  sectionContent: {
    fontSize: FONTS.sizes.sm,
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
    paddingLeft: 40,
  },
  footer: {
    marginTop: SPACING.xl,
    paddingTop: SPACING.xl,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  footerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  footerBrand: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '300',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    marginBottom: 4,
  },
  footerText: {
    fontSize: FONTS.sizes.xs,
    marginBottom: SPACING.md,
  },
  footerContact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerContactText: {
    fontSize: FONTS.sizes.sm,
  },
});
