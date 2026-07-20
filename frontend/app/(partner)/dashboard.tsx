import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, ActivityIndicator, Dimensions, Platform, TextInput
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/store/themeStore';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { useAuthStore } from '../../src/store/authStore';
import { partnerAPI } from '../../src/api/client';
import { confirmAction, showAlert } from '../../src/lib/alerts';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';

const { width } = Dimensions.get('window');

interface PartnerStats {
  total_prayers_received: number;
  prayers_completed: number;
  prayers_pending: number;
  average_response_time_hours: number;
  total_prayer_time_minutes: number;
  response_rate: number;
  weekly_activity: Array<{ date: string; count: number }>;
  monthly_trend: Array<{ date: string; count: number }>;
}

interface PrayerRequest {
  id: string;
  content: string;
  location_city?: string;
  location_country?: string;
  category?: string;
  status: string;
  submitted_at: string;
  assigned_at?: string;
  seen_at?: string;
  seen_by_partner?: boolean;
  requester_id?: string | null;
}

// Build a fixed 7-day window (oldest -> today) and map the API's sparse
// weekly_activity onto it, so the chart always shows seven labelled day-bars
// instead of a single stretched bar.
function buildWeek(activity: Array<{ date: string; count: number }>) {
  const counts: Record<string, number> = {};
  (activity || []).forEach((d) => { counts[d.date] = d.count; });
  const out: Array<{ date: string; initial: string; count: number }> = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    // UTC to match the backend, which groups prayed_at with UTC $dateToString — a
    // local window dropped day-boundary prayers onto the wrong (or missing) bar.
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    out.push({ date: key, initial: d.toLocaleDateString('en-US', { weekday: 'narrow', timeZone: 'UTC' }), count: counts[key] ?? 0 });
  }
  return out;
}

export default function PartnerDashboard() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { user, logout, canSwitch, switchTarget, switchAccount } = useAuthStore();
  const [stats, setStats] = useState<PartnerStats | null>(null);
  const [recentRequests, setRecentRequests] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'requests' | 'profile'>('overview');
  const [requestFilter, setRequestFilter] = useState<string | undefined>(undefined);
  const [switching, setSwitching] = useState(false);

  const goToRequests = (filter?: string) => {
    setRequestFilter(filter);
    setActiveTab('requests');
  };

  const fetchData = useCallback(async () => {
    try {
      const [statsData, requestsData] = await Promise.all([
        partnerAPI.getStats(),
        partnerAPI.getRequests(undefined, 1, 5)
      ]);
      setStats(statsData);
      setRecentRequests(requestsData);
    } catch (error) {
      if (__DEV__) console.error('Failed to fetch partner data:', error);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const StatCard = ({ icon, value, label, color, onPress }: { icon: string; value: string | number; label: string; color?: string; onPress?: () => void }) => {
    const iconColor = color || colors.accent;
    return (
      <TouchableOpacity
        style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
      >
        <View style={[styles.statIconBg, { backgroundColor: iconColor + '15' }]}>
          <Ionicons name={icon as any} size={20} color={iconColor} />
        </View>
        <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const renderOverview = () => (
    <ScrollView
      style={styles.tabContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatCard icon="hand-left" value={stats?.total_prayers_received || 0} label="Total Received" onPress={() => goToRequests(undefined)} />
        <StatCard icon="checkmark-circle" value={stats?.prayers_completed || 0} label="Completed" color={colors.success} onPress={() => goToRequests('prayed')} />
        <StatCard icon="time" value={stats?.prayers_pending || 0} label="Pending" color={colors.warning} onPress={() => goToRequests('assigned')} />
        <StatCard icon="trending-up" value={`${stats?.response_rate || 0}%`} label="Response Rate" onPress={() => goToRequests(undefined)} />
      </View>

      {/* Performance Section */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Performance Summary</Text>
        <View style={styles.performanceRow}>
          <View style={styles.performanceItem}>
            <Text style={[styles.performanceValue, { color: colors.accent }]}>
              {stats?.average_response_time_hours?.toFixed(1) || '0'}h
            </Text>
            <Text style={[styles.performanceLabel, { color: colors.textSecondary }]}>Avg Response</Text>
          </View>
          <View style={[styles.performanceDivider, { backgroundColor: colors.border }]} />
          <View style={styles.performanceItem}>
            <Text style={[styles.performanceValue, { color: colors.accent }]}>
              {stats?.total_prayer_time_minutes || 0}
            </Text>
            <Text style={[styles.performanceLabel, { color: colors.textSecondary }]}>Total Minutes</Text>
          </View>
        </View>
      </View>

      {/* Weekly Activity Chart — always 7 labelled day bars */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Weekly Activity</Text>
        <View style={styles.chartContainer}>
          {(() => {
            const week = buildWeek(stats?.weekly_activity || []);
            const max = Math.max(1, ...week.map((d) => d.count));
            return week.map((day) => (
              <View key={day.date} style={styles.chartBar}>
                <Text style={[styles.chartBarCount, { color: day.count ? colors.accent : colors.textMuted }]}>
                  {day.count || ''}
                </Text>
                <View
                  style={[
                    styles.chartBarFill,
                    {
                      backgroundColor: day.count ? colors.accent : colors.border,
                      height: Math.max(4, (day.count / max) * 60),
                      opacity: day.count ? 1 : 0.5,
                    },
                  ]}
                />
                <Text style={[styles.chartBarLabel, { color: colors.textMuted }]}>
                  {day.initial}
                </Text>
              </View>
            ));
          })()}
        </View>
      </View>

      {/* Recent Requests */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Requests</Text>
          <TouchableOpacity onPress={() => setActiveTab('requests')}>
            <Text style={[styles.viewAllLink, { color: colors.accent }]}>View All</Text>
          </TouchableOpacity>
        </View>
        {recentRequests.length > 0 ? (
          recentRequests.slice(0, 3).map((request) => (
            <View
              key={request.id}
              style={[styles.requestItem, { borderBottomColor: colors.border }]}
            >
              <View style={styles.requestHeader}>
                <View style={[styles.categoryBadge, { backgroundColor: colors.accentMuted }]}>
                  <Text style={[styles.categoryText, { color: colors.accent }]}>
                    {request.category || 'Prayer'}
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: request.status === 'prayed' ? colors.successBg : colors.warningBg }
                ]}>
                  <Text style={[
                    styles.statusText,
                    { color: request.status === 'prayed' ? colors.success : colors.warning }
                  ]}>
                    {request.status}
                  </Text>
                </View>
              </View>
              <Text style={[styles.requestContent, { color: colors.text }]} numberOfLines={2}>
                {request.content}
              </Text>
              <Text style={[styles.requestDate, { color: colors.textMuted }]}>
                {formatDate(request.submitted_at)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No requests yet</Text>
        )}
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderRequests = () => (
    <ScrollView
      style={styles.tabContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <PartnerRequestsList colors={colors} onRefresh={fetchData} initialFilter={requestFilter} />
    </ScrollView>
  );

  const renderProfile = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <PartnerProfile colors={colors} user={user} />
    </ScrollView>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(400)} style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.logoIcon, { backgroundColor: colors.accentMuted }]}>
            <Ionicons name="flame" size={20} color={colors.accent} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Partner</Text>
        </View>
        <View style={styles.headerRight}>
          {canSwitch && (
            <TouchableOpacity onPress={handleSwitch} disabled={switching} style={[styles.iconButton, { backgroundColor: colors.accentMuted, opacity: switching ? 0.6 : 1 }]} accessibilityLabel="Switch to user account">
              <Ionicons name="swap-horizontal" size={20} color={colors.accent} />
            </TouchableOpacity>
          )}
          <View style={[styles.themeToggleWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ThemeToggle size="small" />
          </View>
          <TouchableOpacity onPress={handleLogout} style={[styles.iconButton, { backgroundColor: colors.surface }]}>
            <Ionicons name="log-out-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Partner Badge */}
      <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.partnerBadge}>
        <View style={[styles.badgeContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={[styles.avatarText, { color: isDark ? '#000' : '#fff' }]}>
              {user?.name?.charAt(0)?.toUpperCase() || 'P'}
            </Text>
          </View>
          <View style={styles.badgeInfo}>
            <Text style={[styles.badgeName, { color: colors.text }]}>{user?.name || 'Partner'}</Text>
            <View style={styles.badgeRole}>
              <Ionicons name="shield-checkmark" size={14} color={colors.accent} />
              <Text style={[styles.badgeRoleText, { color: colors.accent }]}>Prayer Partner</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: colors.background }]}>
        {(['overview', 'requests', 'profile'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              { backgroundColor: activeTab === tab ? colors.accent : colors.surface, borderColor: colors.border }
            ]}
            onPress={() => setActiveTab(tab)}
            data-testid={`partner-tab-${tab}`}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === tab ? (isDark ? '#000' : '#fff') : colors.textSecondary }
            ]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'requests' && renderRequests()}
      {activeTab === 'profile' && renderProfile()}
    </SafeAreaView>
  );
}

// Partner Requests List Component
const PartnerRequestsList = ({ colors, onRefresh, initialFilter }: { colors: any; onRefresh: () => void; initialFilter?: string }) => {
  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | undefined>(initialFilter);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [moderatingId, setModeratingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const data = await partnerAPI.getRequests(filter, 1, 50);
      // Mark assigned requests as seen the moment the partner views them. The backend
      // measures the 60-min prayer gate from seen_at ?? assigned_at, and the web "New"
      // bucket only drains on seen_by_partner — mobile never called this, so mobile-first
      // partners' requests stayed "New" forever and their gate disagreed with the server.
      // Optimistically stamp seen_at so the local gate matches immediately; fire-and-forget.
      const toSee = data.filter((r: PrayerRequest) => r.status === 'assigned' && !r.seen_by_partner && !r.seen_at);
      if (toSee.length) {
        const nowIso = new Date().toISOString();
        setRequests(data.map((r: PrayerRequest) =>
          r.status === 'assigned' && !r.seen_by_partner && !r.seen_at ? { ...r, seen_at: nowIso } : r));
        toSee.forEach((r: PrayerRequest) => partnerAPI.markSeen(r.id).catch(() => {}));
      } else {
        setRequests(data);
      }
    } catch (error) {
      if (__DEV__) console.error('Failed to fetch requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPrayed = async (prayerId: string) => {
    setMarkingId(prayerId);
    try {
      await partnerAPI.markPrayed(prayerId, 5);
      showAlert('Prayer Completed', 'Thank you for praying. May God bless you.');
      fetchRequests();
      onRefresh();
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to mark prayer');
    } finally {
      setMarkingId(null);
    }
  };

  const handleReport = (prayerId: string) => {
    confirmAction(
      'Report this request?',
      'Flag this request as abusive or inappropriate. It will be reviewed and removed from your queue.',
      async () => {
        setModeratingId(prayerId);
        try {
          const res = await partnerAPI.report(prayerId);
          showAlert('Reported', res.message || 'Reported for review.');
          fetchRequests();
          onRefresh();
        } catch (error: any) {
          showAlert('Error', error.response?.data?.detail || 'Could not report this request.');
        } finally {
          setModeratingId(null);
        }
      },
      undefined,
      'Report',
      'Cancel',
    );
  };

  const handleBlock = (prayerId: string, requesterId: string) => {
    confirmAction(
      'Block this person?',
      "You won't be assigned their requests again, and their current requests are released back to the pool.",
      async () => {
        setModeratingId(prayerId);
        try {
          const res = await partnerAPI.blockUser(requesterId);
          showAlert('Blocked', res.message || 'Requester blocked.');
          fetchRequests();
          onRefresh();
        } catch (error: any) {
          showAlert('Error', error.response?.data?.detail || 'Could not block this requester.');
        } finally {
          setModeratingId(null);
        }
      },
      undefined,
      'Block',
      'Cancel',
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <View style={{ paddingHorizontal: SPACING.lg }}>
      {/* Filter Buttons */}
      <View style={styles.filterRow}>
        {[
          { label: 'All', value: undefined },
          { label: 'Assigned', value: 'assigned' },
          { label: 'Prayed', value: 'prayed' }
        ].map((f) => (
          <TouchableOpacity
            key={f.label}
            style={[
              styles.filterButton,
              {
                backgroundColor: filter === f.value ? colors.accent : colors.surface,
                borderColor: colors.border
              }
            ]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[
              styles.filterButtonText,
              { color: filter === f.value ? colors.buttonPrimaryText : colors.textSecondary }
            ]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
      ) : requests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle" size={48} color={colors.success} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>All Caught Up!</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No pending requests</Text>
        </View>
      ) : (
        requests.map((request) => (
          <View
            key={request.id}
            style={[styles.requestCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.requestCardHeader}>
              <View style={[styles.categoryBadge, { backgroundColor: colors.accentMuted }]}>
                <Text style={[styles.categoryText, { color: colors.accent }]}>
                  {request.category || 'Prayer'}
                </Text>
              </View>
              <Text style={[styles.requestDate, { color: colors.textMuted }]}>
                {formatDate(request.submitted_at)}
              </Text>
            </View>

            {request.location_city && (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.locationText, { color: colors.textMuted }]}>
                  {request.location_city}{request.location_country ? `, ${request.location_country}` : ''}
                </Text>
              </View>
            )}

            <Text style={[styles.requestContent, { color: colors.text }]}>{request.content}</Text>

            {request.status !== 'prayed' && (() => {
              // Gate from seen_at ?? assigned_at to match the backend (which measures the
              // hour from when the partner first saw the request, not when it was assigned).
              const base = request.seen_at ?? request.assigned_at;
              const baseMs = base ? new Date(base).getTime() : 0;
              const elapsed = Date.now() - baseMs;
              const canMark = elapsed >= 3600000; // 1 hour in ms
              const remainingMin = canMark ? 0 : Math.ceil((3600000 - elapsed) / 60000);
              return (
                <TouchableOpacity
                  style={[styles.prayButton, { backgroundColor: canMark ? colors.accent : colors.surface, borderColor: colors.border, borderWidth: canMark ? 0 : 1 }]}
                  onPress={() => canMark ? handleMarkPrayed(request.id) : showAlert('Please Wait', `You can mark this as prayed in ${remainingMin} minutes. Please spend time in prayer.`)}
                  disabled={markingId !== null}
                  data-testid={`mark-prayed-btn-${request.id}`}
                >
                  {markingId === request.id ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <>
                      <Ionicons name={canMark ? "checkmark" : "time-outline"} size={18} color={canMark ? "#000" : colors.textMuted} />
                      <Text style={[styles.prayButtonText, !canMark && { color: colors.textMuted }]}>
                        {canMark ? 'Mark as Prayed' : `Wait ${remainingMin}m`}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })()}

            {/* Moderation — report abusive content or block the requester */}
            {request.status !== 'prayed' && (
              <View style={[styles.moderationRow, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.modButton}
                  onPress={() => handleReport(request.id)}
                  disabled={moderatingId !== null}
                  hitSlop={6}
                >
                  <Ionicons name="flag-outline" size={14} color={colors.textMuted} />
                  <Text style={[styles.modButtonText, { color: colors.textMuted }]}>Report</Text>
                </TouchableOpacity>
                {request.requester_id ? (
                  <TouchableOpacity
                    style={styles.modButton}
                    onPress={() => handleBlock(request.id, request.requester_id as string)}
                    disabled={moderatingId !== null}
                    hitSlop={6}
                  >
                    <Ionicons name="ban-outline" size={14} color={colors.error} />
                    <Text style={[styles.modButtonText, { color: colors.error }]}>Block</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>
        ))
      )}
      <View style={{ height: 100 }} />
    </View>
  );
};

// Partner Profile Component
const PartnerProfile = ({ colors, user }: { colors: any; user: any }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await partnerAPI.updateProfile({ name, phone });
      // Pull the saved values back into the store, else the read-only view + header
      // keep showing the old name/phone until re-login.
      await useAuthStore.getState().refreshUser();
      showAlert('Success', 'Profile updated successfully');
      setEditing(false);
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ paddingHorizontal: SPACING.lg }}>
      <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.profileHeader}>
          <View style={[styles.profileAvatar, { backgroundColor: colors.accent }]}>
            <Text style={[styles.profileAvatarText, { color: '#000' }]}>
              {user?.name?.charAt(0)?.toUpperCase() || 'P'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.editButton, { borderColor: colors.border }]}
            onPress={() => setEditing(!editing)}
          >
            <Ionicons name={editing ? 'close' : 'pencil'} size={18} color={colors.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.profileInfo}>
          <View style={styles.profileField}>
            <Text style={[styles.profileLabel, { color: colors.textMuted }]}>Name</Text>
            {editing ? (
              <TextInput
                style={[styles.profileInput, styles.profileInputText, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
                value={name}
                onChangeText={setName}
                placeholder="Enter your name"
                placeholderTextColor={colors.textMuted}
              />
            ) : (
              <Text style={[styles.profileValue, { color: colors.text }]}>{user?.name || 'Not set'}</Text>
            )}
          </View>

          <View style={styles.profileField}>
            <Text style={[styles.profileLabel, { color: colors.textMuted }]}>Email</Text>
            <Text style={[styles.profileValue, { color: colors.text }]}>{user?.email || 'Not set'}</Text>
          </View>

          <View style={styles.profileField}>
            <Text style={[styles.profileLabel, { color: colors.textMuted }]}>Phone</Text>
            {editing ? (
              <TextInput
                style={[styles.profileInput, styles.profileInputText, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter your phone"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
              />
            ) : (
              <Text style={[styles.profileValue, { color: colors.text }]}>{user?.phone || 'Not set'}</Text>
            )}
          </View>

          <View style={styles.profileField}>
            <Text style={[styles.profileLabel, { color: colors.textMuted }]}>Location</Text>
            <Text style={[styles.profileValue, { color: colors.text }]}>
              {user?.location_city ? `${user.location_city}, ${user.location_country}` : 'Not set'}
            </Text>
          </View>

          <View style={styles.profileField}>
            <Text style={[styles.profileLabel, { color: colors.textMuted }]}>Organization</Text>
            <Text style={[styles.profileValue, { color: colors.text }]}>{user?.organization || 'Not set'}</Text>
          </View>

          <View style={styles.profileField}>
            <Text style={[styles.profileLabel, { color: colors.textMuted }]}>Partner Type</Text>
            <Text style={[styles.profileValue, { color: colors.accent }]}>
              {user?.partner_type?.replace('_', ' ') || 'Prayer Warrior'}
            </Text>
          </View>

          <View style={styles.profileField}>
            <Text style={[styles.profileLabel, { color: colors.textMuted }]}>Verified</Text>
            <View style={styles.verifiedBadge}>
              <Ionicons
                name={user?.is_verified ? 'checkmark-circle' : 'close-circle'}
                size={18}
                color={user?.is_verified ? colors.success : colors.error}
              />
              <Text style={[styles.verifiedText, { color: user?.is_verified ? colors.success : colors.error }]}>
                {user?.is_verified ? 'Verified' : 'Not Verified'}
              </Text>
            </View>
          </View>
        </View>

        {editing && (
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.accent }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
      <View style={{ height: 100 }} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: SPACING.md, fontSize: FONTS.sizes.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  logoIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONTS.sizes.lg, fontWeight: '600' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  themeToggleWrapper: { borderRadius: 20, borderWidth: 1, padding: 4 },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  partnerBadge: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  badgeContainer: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderRadius: BORDER_RADIUS.lg, borderWidth: 1 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: FONTS.sizes.xl, fontWeight: '700' },
  badgeInfo: { marginLeft: SPACING.md, flex: 1 },
  badgeName: { fontSize: FONTS.sizes.lg, fontWeight: '600' },
  badgeRole: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  badgeRoleText: { fontSize: FONTS.sizes.sm, fontWeight: '500' },
  tabsContainer: { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.md },
  tab: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: BORDER_RADIUS.md, borderWidth: 1 },
  tabText: { fontSize: FONTS.sizes.sm, fontWeight: '500' },
  tabContent: { flex: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.md },
  statCard: { width: (width - SPACING.lg * 2 - SPACING.sm) / 2 - 1, padding: SPACING.md, borderRadius: BORDER_RADIUS.lg, alignItems: 'center', borderWidth: 1 },
  statIconBg: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: FONTS.sizes.xxl, fontWeight: '700', marginTop: SPACING.sm },
  statLabel: { fontSize: FONTS.sizes.xs, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Avenir' : 'sans-serif' },
  sectionCard: { marginHorizontal: SPACING.lg, padding: SPACING.lg, borderRadius: BORDER_RADIUS.lg, marginBottom: SPACING.md, borderWidth: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  sectionTitle: { fontSize: FONTS.sizes.md, fontWeight: '600' },
  viewAllLink: { fontSize: FONTS.sizes.sm, fontWeight: '500' },
  performanceRow: { flexDirection: 'row', alignItems: 'center' },
  performanceItem: { flex: 1, alignItems: 'center' },
  performanceValue: { fontSize: FONTS.sizes.xxl, fontWeight: '700' },
  performanceLabel: { fontSize: FONTS.sizes.sm, marginTop: 4 },
  performanceDivider: { width: 1, height: 40, marginHorizontal: SPACING.md },
  chartContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 80, paddingTop: SPACING.md },
  chartBar: { alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  chartBarFill: { width: '60%', borderRadius: 4, minHeight: 4 },
  chartBarCount: { fontSize: 10, fontWeight: '600', marginBottom: 2 },
  chartBarLabel: { fontSize: 10, marginTop: 4 },
  requestItem: { paddingVertical: SPACING.md, borderBottomWidth: 1 },
  requestHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs },
  categoryBadge: { paddingVertical: 2, paddingHorizontal: SPACING.sm, borderRadius: BORDER_RADIUS.sm },
  categoryText: { fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'capitalize' },
  statusBadge: { paddingVertical: 2, paddingHorizontal: SPACING.sm, borderRadius: BORDER_RADIUS.sm },
  statusText: { fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase' },
  requestContent: { fontSize: FONTS.sizes.sm, lineHeight: 20 },
  requestDate: { fontSize: FONTS.sizes.xs, marginTop: SPACING.xs },
  emptyText: { textAlign: 'center', paddingVertical: SPACING.lg },
  filterRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  filterButton: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md, borderRadius: BORDER_RADIUS.md, borderWidth: 1 },
  filterButtonText: { fontSize: FONTS.sizes.sm, fontWeight: '500' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.xxxl },
  emptyTitle: { fontSize: FONTS.sizes.lg, fontWeight: '600', marginTop: SPACING.md },
  requestCard: { padding: SPACING.lg, borderRadius: BORDER_RADIUS.lg, marginBottom: SPACING.md, borderWidth: 1 },
  requestCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: SPACING.sm },
  locationText: { fontSize: FONTS.sizes.xs },
  prayButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.md },
  prayButtonText: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: '#000' },
  moderationRow: { flexDirection: 'row', gap: SPACING.lg, marginTop: SPACING.md, paddingTop: SPACING.sm, borderTopWidth: 1 },
  modButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  modButtonText: { fontSize: FONTS.sizes.xs, fontWeight: '500' },
  profileCard: { padding: SPACING.lg, borderRadius: BORDER_RADIUS.lg, borderWidth: 1 },
  profileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  profileAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { fontSize: FONTS.sizes.xxxl, fontWeight: '700' },
  editButton: { padding: SPACING.sm, borderRadius: BORDER_RADIUS.md, borderWidth: 1 },
  profileInfo: { gap: SPACING.md },
  profileField: {},
  profileLabel: { fontSize: FONTS.sizes.xs, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  profileValue: { fontSize: FONTS.sizes.md },
  profileInput: { padding: SPACING.sm, borderRadius: BORDER_RADIUS.sm, borderWidth: 1 },
  profileInputText: { fontSize: FONTS.sizes.md },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: FONTS.sizes.sm, fontWeight: '500' },
  saveButton: { marginTop: SPACING.lg, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, alignItems: 'center' },
  saveButtonText: { fontSize: FONTS.sizes.md, fontWeight: '600', color: '#000' },
});
