import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, type LayoutChangeEvent } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store/themeStore';
import { communityAPI, type CommunityPulse } from '../api/client';
import { FONTS, SPACING, BORDER_RADIUS } from '../constants/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

const PIXELS_PER_SECOND = 45; // gentle, constant marquee speed

const INTENTIONS: { theme: string; icon: IoniconName }[] = [
  { theme: 'those who feel alone tonight', icon: 'people-outline' },
  { theme: 'healing — in body and mind', icon: 'medkit-outline' },
  { theme: 'peace where there is conflict', icon: 'leaf-outline' },
  { theme: 'families and children', icon: 'home-outline' },
  { theme: 'strength to carry a heavy burden', icon: 'barbell-outline' },
  { theme: 'a grateful, joyful heart', icon: 'sunny-outline' },
  { theme: 'wisdom for a hard decision', icon: 'compass-outline' },
];

function relTime(iso: string): string {
  try {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  } catch {
    return '';
  }
}

interface Item {
  key: string;
  icon: IoniconName;
  text: string;
}

export function PrayerBillboard() {
  const { colors } = useTheme();
  const router = useRouter();
  const [pulse, setPulse] = useState<CommunityPulse | null>(null);
  const [setWidth, setSetWidth] = useState(0);
  const offset = useSharedValue(0);

  useEffect(() => {
    let alive = true;
    communityAPI.getPulse().then((p) => alive && setPulse(p)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const intention = INTENTIONS[Math.floor(Date.now() / 86400000) % INTENTIONS.length];

  // The marquee "items" — short headlines that scroll past continuously.
  const items: Item[] = [];
  items.push({
    key: 'week',
    icon: 'earth',
    text: pulse ? `${pulse.prayers_this_week.toLocaleString()} prayers lifted this week` : 'A global family at prayer',
  });
  if (pulse && pulse.prayers_answered > 0) {
    items.push({ key: 'answered', icon: 'sparkles', text: `${pulse.prayers_answered.toLocaleString()} prayers prayed over so far` });
  }
  if (pulse && pulse.your_prayers_prayed > 0) {
    items.push({
      key: 'you',
      icon: 'heart',
      text: pulse.last_prayed_at ? `A partner prayed over you ${relTime(pulse.last_prayed_at)}` : 'A partner prayed over your request',
    });
  }
  items.push({ key: 'intention', icon: intention.icon, text: `Today: pray for ${intention.theme}` });
  items.push({ key: 'alone', icon: 'infinite', text: "You're never praying alone" });

  // Continuous, constant-speed loop: translate one full set's width, then repeat seamlessly
  // (a second identical set follows it, so the wrap is invisible).
  useEffect(() => {
    cancelAnimation(offset);
    offset.value = 0;
    if (setWidth > 0) {
      const duration = (setWidth / PIXELS_PER_SECOND) * 1000;
      offset.value = withRepeat(withTiming(-setWidth, { duration, easing: Easing.linear }), -1, false);
    }
    return () => cancelAnimation(offset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setWidth]);

  const trackStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  const onSetLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - setWidth) > 1) setSetWidth(w);
  };

  const renderSet = (suffix: string, measure: boolean) => (
    <View style={styles.set} onLayout={measure ? onSetLayout : undefined}>
      {items.map((it) => (
        <View key={it.key + suffix} style={styles.item}>
          <View style={[styles.iconWrap, { backgroundColor: colors.accentMuted }]}>
            <Ionicons name={it.icon} size={15} color={colors.accent} />
          </View>
          <Text style={[styles.itemText, { color: colors.text }]}>{it.text}</Text>
          <Text style={[styles.sep, { color: colors.accent }]}>•</Text>
        </View>
      ))}
    </View>
  );

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        router.push('/(main)/prayer');
      }}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.accentBar, { backgroundColor: colors.accent }]} />
      <View style={styles.body}>
        <Animated.View style={[styles.track, trackStyle]}>
          {renderSet('-a', true)}
          {renderSet('-b', false)}
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    height: 64,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    alignItems: 'stretch',
  },
  accentBar: { width: 3 },
  body: { flex: 1, justifyContent: 'center', overflow: 'hidden' },
  track: { flexDirection: 'row' },
  set: { flexDirection: 'row', alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', paddingLeft: SPACING.md, gap: SPACING.sm },
  iconWrap: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  itemText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif',
  },
  sep: { fontSize: FONTS.sizes.md, paddingLeft: SPACING.md, opacity: 0.6 },
});
