import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, ActivityIndicator, Platform, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/store/themeStore';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { notificationsAPI, deviceAPI } from '../../src/api/client';
import { registerForPushNotifications } from '../../src/utils/pushNotifications';
import { getNotificationsEnabled, setNotificationsEnabled } from '../../src/utils/notificationPrefs';
import { showAlert } from '../../src/lib/alerts';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';

interface AppNotification {
  id: string;
  title: string;
  message: string;
  type?: string;
  is_read: boolean;
  prayer_id?: string | null;
  created_at: string;
}

// Defensive: the API returns { notifications: [...] }, but tolerate a bare array too.
function asNotifications(data: any): AppNotification[] {
  if (Array.isArray(data)) return data as AppNotification[];
  if (data && Array.isArray(data.notifications)) return data.notifications as AppNotification[];
  return [];
}

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function iconForType(type?: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'prayer_prayed': return 'heart';
    case 'prayer_assigned': return 'hand-left';
    case 'warning': return 'alert-circle';
    default: return 'notifications';
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [togglingNotif, setTogglingNotif] = useState(false);

  const fetchNotifications = async () => {
    try {
      const data = await notificationsAPI.getAll(1);
      setItems(asNotifications(data));
    } catch (error) {
      if (__DEV__) console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    getNotificationsEnabled().then(setNotifEnabled);
  }, []);

  const toggleNotifications = async (next: boolean) => {
    setTogglingNotif(true);
    try {
      if (next) {
        const token = await registerForPushNotifications();
        await setNotificationsEnabled(true);
        setNotifEnabled(true);
        if (!token) {
          showAlert(
            'Notifications On',
            "If you don't receive notifications, please enable them for Tefillah in your phone's Settings.",
          );
        }
      } else {
        await deviceAPI.unregisterToken().catch(() => {});
        await setNotificationsEnabled(false);
        setNotifEnabled(false);
      }
    } catch (e) {
      if (__DEV__) console.error('toggle notifications failed:', e);
      showAlert('Error', 'Could not update your notification setting. Please try again.');
    } finally {
      setTogglingNotif(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const markOne = async (id: string, alreadyRead: boolean) => {
    if (alreadyRead) return;
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await notificationsAPI.markRead(id);
    } catch (error) {
      if (__DEV__) console.error('Failed to mark notification read:', error);
    }
  };

  const markAll = async () => {
    setMarkingAll(true);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await notificationsAPI.markAllRead();
    } catch (error) {
      if (__DEV__) console.error('Failed to mark all read:', error);
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = items.filter((n) => !n.is_read).length;

  const renderItem = ({ item, index }: { item: AppNotification; index: number }) => (
    <Animated.View entering={FadeInUp.duration(400).delay(Math.min(index, 8) * 70)}>
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: item.is_read ? colors.surface : colors.accentMuted,
            borderColor: colors.border,
          },
        ]}
        activeOpacity={0.7}
        onPress={() => {
          markOne(item.id, item.is_read);
          setExpandedId((prev) => (prev === item.id ? null : item.id));
        }}
      >
        <View style={[styles.iconBubble, { backgroundColor: colors.accent + '22' }]}>
          <Ionicons name={iconForType(item.type)} size={20} color={colors.accent} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {item.title || 'Notification'}
            </Text>
            <Text style={[styles.cardTime, { color: colors.textMuted }]}>
              {relativeTime(item.created_at)}
            </Text>
          </View>
          <Text
            style={[styles.cardMessage, { color: colors.textSecondary }]}
            numberOfLines={expandedId === item.id ? undefined : 3}
          >
            {item.message}
          </Text>
          {(item.message?.length ?? 0) > 90 && (
            <View style={styles.readMoreRow}>
              <Text style={[styles.readMoreText, { color: colors.accent }]}>
                {expandedId === item.id ? 'Show less' : 'Read more'}
              </Text>
              <Ionicons
                name={expandedId === item.id ? 'chevron-up' : 'chevron-down'}
                size={13}
                color={colors.accent}
              />
            </View>
          )}
        </View>
        {!item.is_read && <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />}
      </TouchableOpacity>
    </Animated.View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
        <Ionicons name="notifications-off-outline" size={48} color={colors.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No notifications yet</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        You're all caught up. Updates from your prayer partners will appear here.
      </Text>
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
        <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Updates from your prayer partners and from Tefillah
        </Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={[styles.markAllBtn, { borderColor: colors.border }]}
            onPress={markAll}
            disabled={markingAll}
          >
            <Ionicons name="checkmark-done" size={14} color={colors.accent} />
            <Text style={[styles.markAllText, { color: colors.accent }]}>
              {markingAll ? 'Marking…' : `Mark all read (${unreadCount})`}
            </Text>
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* Push notification on/off toggle */}
      <View style={[styles.settingRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.settingLeft}>
          <Ionicons
            name={notifEnabled ? 'notifications' : 'notifications-off'}
            size={18}
            color={notifEnabled ? colors.accent : colors.textMuted}
          />
          <View style={styles.settingTextWrap}>
            <Text style={[styles.settingTitle, { color: colors.text }]}>Push Notifications</Text>
            <Text style={[styles.settingSubtitle, { color: colors.textMuted }]}>
              {notifEnabled
                ? "On — you'll be notified when a partner prays"
                : "Off — you won't receive push notifications"}
            </Text>
          </View>
        </View>
        {togglingNotif ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Switch
            value={notifEnabled}
            onValueChange={toggleNotifications}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
          />
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
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
  markAllBtn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: SPACING.md, borderRadius: BORDER_RADIUS.full,
    borderWidth: 1, marginTop: SPACING.md,
  },
  markAllText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: SPACING.lg, marginBottom: SPACING.md, padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg, borderWidth: 1,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1, paddingRight: SPACING.sm },
  settingTextWrap: { flex: 1 },
  settingTitle: { fontSize: FONTS.sizes.md, fontWeight: '600' },
  settingSubtitle: { fontSize: FONTS.sizes.xs, marginTop: 2 },
  readMoreRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
  readMoreText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xxl, flexGrow: 1 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1,
  },
  iconBubble: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  cardTitle: { flex: 1, fontSize: FONTS.sizes.md, fontWeight: '600' },
  cardTime: { fontSize: FONTS.sizes.xs },
  cardMessage: { fontSize: FONTS.sizes.sm, lineHeight: 20, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
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
    fontSize: FONTS.sizes.md, textAlign: 'center', lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif',
  },
});
