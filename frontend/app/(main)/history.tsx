import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, ActivityIndicator, Platform, Modal, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/store/themeStore';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { prayerAPI } from '../../src/api/client';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';

interface Prayer {
  id: string;
  content: string;
  category: string;
  comfort_message: string;
  bible_verse: string;
  bible_reference: string;
  submitted_at: string;
  status: string;
}

export default function HistoryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPrayer, setSelectedPrayer] = useState<Prayer | null>(null);

  const fetchPrayers = async () => {
    try {
      const data = await prayerAPI.getHistory();
      setPrayers(data);
    } catch (error) {
      if (__DEV__) console.error('Failed to fetch prayers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchPrayers(); }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPrayers();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'prayed': return '#4CAF50';
      case 'assigned': return '#2196F3';
      case 'pending': return colors.accent;
      default: return colors.textMuted;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'prayed': return 'Prayed';
      case 'assigned': return 'Being Prayed For';
      case 'pending': return 'Received';
      default: return status?.charAt(0).toUpperCase() + status?.slice(1);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'prayed': return 'checkmark-circle';
      case 'assigned': return 'hourglass-outline';
      case 'pending': return 'ellipse-outline';
      default: return 'ellipse-outline';
    }
  };

  const renderPrayer = ({ item, index }: { item: Prayer; index: number }) => (
    <Animated.View entering={FadeInUp.duration(400).delay(index * 80)}>
      <View style={styles.timelineRow}>
        {/* Timeline connector */}
        <View style={styles.timelineTrack}>
          {index > 0 && <View style={[styles.timelineLineTop, { backgroundColor: colors.border }]} />}
          <View style={[styles.timelineDot, { backgroundColor: getStatusColor(item.status) + '30', borderColor: getStatusColor(item.status) }]}>
            <Ionicons name={getStatusIcon(item.status) as any} size={12} color={getStatusColor(item.status)} />
          </View>
          {index < prayers.length - 1 && <View style={[styles.timelineLineBottom, { backgroundColor: colors.border }]} />}
        </View>

        {/* Card */}
        <TouchableOpacity
          style={[styles.prayerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => setSelectedPrayer(item)}
          activeOpacity={0.7}
        >
          <View style={styles.prayerHeader}>
            <View style={[styles.categoryBadge, { backgroundColor: colors.accentMuted }]}>
              <Text style={[styles.categoryText, { color: colors.accent }]}>
                {item.category?.charAt(0).toUpperCase() + item.category?.slice(1) || 'Prayer'}
              </Text>
            </View>
            <View style={styles.dateColumn}>
              <Text style={[styles.dateText, { color: colors.textMuted }]}>{formatDate(item.submitted_at)}</Text>
              <Text style={[styles.timeText, { color: colors.textMuted }]}>{formatTime(item.submitted_at)}</Text>
            </View>
          </View>

          <Text style={[styles.contentText, { color: colors.text }]} numberOfLines={3}>
            {item.content}
          </Text>

          <View style={styles.cardFooter}>
            {item.bible_reference && (
              <View style={[styles.verseContainer, { backgroundColor: colors.background }]}>
                <Ionicons name="book-outline" size={14} color={colors.accent} />
                <Text style={[styles.verseText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.bible_reference}
                </Text>
              </View>
            )}
            {item.status && (
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                <Ionicons name={getStatusIcon(item.status) as any} size={12} color={getStatusColor(item.status)} />
                <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                  {getStatusLabel(item.status)}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
        <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('history.emptyTitle')}</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        {t('history.emptyText')}
      </Text>
      <TouchableOpacity
        style={[styles.emptyButton, { backgroundColor: colors.accent }]}
        onPress={() => router.push('/(main)/prayer')}
      >
        <Text style={[styles.emptyButtonText, { color: colors.buttonPrimaryText }]}>
          {t('home.submitPrayer')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <View style={[styles.backCircle, { backgroundColor: colors.surface }]}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </View>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="flame" size={20} color={colors.accent} />
        </View>
        <ThemeToggle size="small" />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.titleContainer}>
        <Text style={[styles.title, { color: colors.text }]}>{t('history.title')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('history.subtitle')}
        </Text>
        {prayers.length > 0 && (
          <View style={[styles.countBadge, { backgroundColor: colors.accentMuted }]}>
            <Text style={[styles.countText, { color: colors.accent }]}>
              {prayers.length} {prayers.length === 1 ? 'prayer' : 'prayers'}
            </Text>
          </View>
        )}
      </Animated.View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={prayers}
          renderItem={renderPrayer}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        />
      )}

      {/* Prayer Detail Modal */}
      <Modal
        visible={!!selectedPrayer}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedPrayer(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Prayer Details</Text>
              <TouchableOpacity
                onPress={() => setSelectedPrayer(null)}
                style={[styles.closeButton, { backgroundColor: colors.surface }]}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
              {selectedPrayer && (
                <>
                  <View style={styles.modalMeta}>
                    <View style={[styles.categoryBadge, { backgroundColor: colors.accentMuted }]}>
                      <Text style={[styles.categoryText, { color: colors.accent }]}>
                        {selectedPrayer.category?.charAt(0).toUpperCase() + selectedPrayer.category?.slice(1)}
                      </Text>
                    </View>
                    <Text style={[styles.modalDate, { color: colors.textMuted }]}>
                      {formatDate(selectedPrayer.submitted_at)} at {formatTime(selectedPrayer.submitted_at)}
                    </Text>
                  </View>

                  {selectedPrayer.status && (
                    <View style={[styles.statusRow, { backgroundColor: getStatusColor(selectedPrayer.status) + '15', borderColor: getStatusColor(selectedPrayer.status) + '30' }]}>
                      <View style={[styles.statusDot, { backgroundColor: getStatusColor(selectedPrayer.status) }]} />
                      <Text style={[styles.statusRowText, { color: getStatusColor(selectedPrayer.status) }]}>
                        {getStatusLabel(selectedPrayer.status)}
                      </Text>
                    </View>
                  )}

                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>YOUR PRAYER</Text>
                  <View style={[styles.prayerContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.fullContentText, { color: colors.text }]}>
                      {selectedPrayer.content}
                    </Text>
                  </View>

                  {selectedPrayer.comfort_message && (
                    <>
                      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>COMFORT MESSAGE</Text>
                      <View style={[styles.comfortCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={styles.comfortHeader}>
                          <Ionicons name="heart" size={16} color={colors.accent} />
                          <Text style={[styles.comfortTitle, { color: colors.accent }]}>Words of Comfort</Text>
                        </View>
                        <Text style={[styles.comfortText, { color: colors.text }]}>
                          {selectedPrayer.comfort_message}
                        </Text>
                      </View>
                    </>
                  )}

                  {selectedPrayer.bible_verse && (
                    <>
                      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SCRIPTURE</Text>
                      <View style={[styles.verseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Ionicons name="book" size={16} color={colors.accent} style={{ marginBottom: SPACING.sm }} />
                        <Text style={[styles.verseFullText, { color: colors.text }]}>
                          "{selectedPrayer.bible_verse}"
                        </Text>
                        <Text style={[styles.verseRef, { color: colors.accent }]}>
                          — {selectedPrayer.bible_reference}
                        </Text>
                      </View>
                    </>
                  )}
                </>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCloseBtn, { backgroundColor: colors.buttonPrimary }]}
              onPress={() => setSelectedPrayer(null)}
            >
              <Text style={[styles.modalCloseBtnText, { color: colors.buttonPrimaryText }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: SPACING.md, paddingBottom: SPACING.md, paddingHorizontal: SPACING.lg,
  },
  headerCenter: { alignItems: 'center' },
  backButton: { padding: 2 },
  backCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  titleContainer: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg },
  title: {
    fontSize: FONTS.sizes.xxl, fontWeight: '600', marginBottom: SPACING.xs,
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  subtitle: { fontSize: FONTS.sizes.md, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif' },
  countBadge: {
    alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, marginTop: SPACING.sm,
  },
  countText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xxl, flexGrow: 1 },
  timelineRow: { flexDirection: 'row' },
  timelineTrack: { width: 28, alignItems: 'center' },
  timelineLineTop: { width: 2, flex: 1 },
  timelineLineBottom: { width: 2, flex: 1 },
  timelineDot: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  prayerCard: {
    flex: 1, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, marginLeft: SPACING.sm,
  },
  prayerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm,
  },
  categoryBadge: {
    paddingVertical: 4, paddingHorizontal: SPACING.sm, borderRadius: BORDER_RADIUS.full,
  },
  categoryText: { fontSize: FONTS.sizes.xs, fontWeight: '700' },
  dateColumn: { alignItems: 'flex-end' },
  dateText: { fontSize: FONTS.sizes.xs },
  timeText: { fontSize: 10, marginTop: 1 },
  contentText: {
    fontSize: FONTS.sizes.md, lineHeight: 24,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: SPACING.md, flexWrap: 'wrap', gap: SPACING.sm,
  },
  verseContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: SPACING.sm, borderRadius: BORDER_RADIUS.sm,
  },
  verseText: { fontSize: FONTS.sizes.sm, fontStyle: 'italic' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 4, paddingHorizontal: SPACING.sm, borderRadius: BORDER_RADIUS.full,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  // Empty state
  emptyContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.xxxl, paddingHorizontal: SPACING.xl,
  },
  emptyIcon: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg,
  },
  emptyTitle: {
    fontSize: FONTS.sizes.xl, fontWeight: '600', marginBottom: SPACING.sm,
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  emptyText: {
    fontSize: FONTS.sizes.md, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.xl,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  emptyButton: { paddingVertical: 14, paddingHorizontal: SPACING.xl, borderRadius: BORDER_RADIUS.lg },
  emptyButtonText: {
    fontSize: FONTS.sizes.md, fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  // Modal
  modalContainer: { flex: 1, justifyContent: 'flex-end' },
  modalContent: {
    maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: SPACING.lg, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONTS.sizes.xl, fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  closeButton: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  modalScroll: { paddingBottom: SPACING.lg },
  modalMeta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md,
  },
  modalDate: { fontSize: FONTS.sizes.sm },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: SPACING.sm, borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.lg, borderWidth: 1,
  },
  statusRowText: { fontSize: FONTS.sizes.sm, fontWeight: '600' },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: SPACING.sm, marginTop: SPACING.sm,
  },
  prayerContent: {
    padding: SPACING.lg, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, marginBottom: SPACING.md,
  },
  fullContentText: {
    fontSize: FONTS.sizes.md, lineHeight: 26,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  comfortCard: {
    padding: SPACING.lg, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, marginBottom: SPACING.md,
  },
  comfortHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm,
  },
  comfortTitle: { fontSize: FONTS.sizes.sm, fontWeight: '700' },
  comfortText: {
    fontSize: FONTS.sizes.md, lineHeight: 24,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
  verseCard: {
    padding: SPACING.lg, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, marginBottom: SPACING.md,
  },
  verseFullText: {
    fontSize: FONTS.sizes.md, fontStyle: 'italic', lineHeight: 24,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  verseRef: { fontSize: FONTS.sizes.sm, marginTop: SPACING.sm, fontWeight: '600' },
  modalCloseBtn: {
    paddingVertical: 14, borderRadius: BORDER_RADIUS.lg, alignItems: 'center',
  },
  modalCloseBtnText: { fontSize: FONTS.sizes.md, fontWeight: '600' },
});
