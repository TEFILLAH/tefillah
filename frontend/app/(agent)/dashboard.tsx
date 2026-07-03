import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Logo } from '../../src/components/Logo';
import { Button } from '../../src/components/Button';
import { useAuthStore } from '../../src/store/authStore';
import { useTheme } from '../../src/store/themeStore';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { agentAPI } from '../../src/api/client';
import { confirmAction, showAlert } from '../../src/lib/alerts';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';

interface Prayer {
  id: string;
  content: string;
  location_city?: string;
  location_country?: string;
  category?: string;
  status: string;
  submitted_at: string;
}

interface Stats {
  cell_name: string;
  pending_prayers: number;
  prayed_prayers: number;
  personal_prayers_handled: number;
}

export default function AgentDashboard() {
  const router = useRouter();
  const { agent, logout } = useAuthStore();
  const { colors } = useTheme();
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingPrayed, setMarkingPrayed] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [prayersData, statsData] = await Promise.all([
        agentAPI.getRequests(),
        agentAPI.getStats()
      ]);
      setPrayers(prayersData);
      setStats(statsData);
    } catch (error) {
      if (__DEV__) console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleMarkPrayed = async (prayerId: string) => {
    setMarkingPrayed(prayerId);
    try {
      await agentAPI.markPrayed(prayerId);
      showAlert('Prayer Completed', 'Thank you for praying. May God bless you.');
      fetchData();
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to mark prayer');
    } finally {
      setMarkingPrayed(null);
    }
  };

  const handleLogout = () => {
    confirmAction(
      'Sign Out',
      'Are you sure you want to sign out?',
      async () => {
        await logout();
        router.replace('/(auth)/landing');
      },
      undefined,
      'Sign Out',
      'Cancel'
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const renderPrayer = ({ item, index }: { item: Prayer; index: number }) => (
    <Animated.View
      entering={FadeInUp.duration(400).delay(index * 50)}
      style={[styles.prayerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.prayerHeader}>
        <View style={[styles.categoryBadge, { backgroundColor: colors.background }]}>
          <Text style={[styles.categoryText, { color: colors.accent }]}>
            {item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : 'Prayer'}
          </Text>
        </View>
        <Text style={[styles.dateText, { color: colors.textMuted }]}>{formatDate(item.submitted_at)}</Text>
      </View>

      {item.location_city && (
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.locationText, { color: colors.textMuted }]}>
            {item.location_city}{item.location_country ? `, ${item.location_country}` : ''}
          </Text>
        </View>
      )}

      <Text style={[styles.contentText, { color: colors.text }]}>{item.content}</Text>

      <View style={[styles.prayerFooter, { borderTopColor: colors.border }]}>
        <Text style={[styles.privacyNote, { color: colors.textMuted }]}>Identity hidden for privacy</Text>
        <Button
          title={markingPrayed === item.id ? 'Marking...' : 'Mark as Prayed'}
          onPress={() => handleMarkPrayed(item.id)}
          variant="primary"
          size="small"
          loading={markingPrayed === item.id}
          disabled={markingPrayed !== null}
        />
      </View>
    </Animated.View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="checkmark-circle" size={64} color={colors.success} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>All Caught Up!</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No pending prayer requests at the moment.</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(600)} style={styles.header}>
        <Logo size="small" />
        <View style={styles.headerRight}>
          <ThemeToggle size="small" />
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Agent Info & Stats */}
      <Animated.View
        entering={FadeInDown.duration(600).delay(100)}
        style={[styles.agentInfo, { backgroundColor: colors.surface }]}
      >
        <View style={styles.agentHeader}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={[styles.avatarText, { color: colors.buttonPrimaryText }]}>
              {agent?.name?.charAt(0).toUpperCase() || 'A'}
            </Text>
          </View>
          <View style={styles.agentDetails}>
            <Text style={[styles.agentName, { color: colors.text }]}>{agent?.name || 'Prayer Partner'}</Text>
            <Text style={[styles.cellName, { color: colors.accent }]}>{stats?.cell_name || 'Loading...'}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{stats?.pending_prayers || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Pending</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{stats?.personal_prayers_handled || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Prayed</Text>
          </View>
        </View>
      </Animated.View>

      {/* Section Title */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Prayer Requests</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Tap to mark as prayed</Text>
      </View>

      {/* Prayer List */}
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  logoutButton: { padding: SPACING.sm },
  agentInfo: { marginHorizontal: SPACING.lg, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg },
  agentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  avatarText: { fontSize: FONTS.sizes.xl, fontWeight: '600' },
  agentDetails: { flex: 1 },
  agentName: { fontSize: FONTS.sizes.lg, fontWeight: '600' },
  cellName: { fontSize: FONTS.sizes.sm, marginTop: 2 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: FONTS.sizes.xxl, fontWeight: '700' },
  statLabel: { fontSize: FONTS.sizes.sm, marginTop: 2 },
  statDivider: { width: 1, height: 40 },
  sectionHeader: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  sectionTitle: { fontSize: FONTS.sizes.lg, fontWeight: '600' },
  sectionSubtitle: { fontSize: FONTS.sizes.sm },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl, flexGrow: 1 },
  prayerCard: { borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1 },
  prayerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  categoryBadge: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm, borderRadius: BORDER_RADIUS.sm },
  categoryText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  dateText: { fontSize: FONTS.sizes.xs },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: SPACING.sm },
  locationText: { fontSize: FONTS.sizes.xs },
  contentText: { fontSize: FONTS.sizes.md, lineHeight: 24, marginBottom: SPACING.md },
  prayerFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: SPACING.md },
  privacyNote: { fontSize: FONTS.sizes.xs, fontStyle: 'italic' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.xxxl },
  emptyTitle: { fontSize: FONTS.sizes.lg, fontWeight: '600', marginTop: SPACING.lg },
  emptyText: { fontSize: FONTS.sizes.md, textAlign: 'center' },
});
