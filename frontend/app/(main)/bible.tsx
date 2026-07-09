import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../src/store/themeStore';
import { useLanguageStore } from '../../src/store/languageStore';
import { FONTS, SPACING, BORDER_RADIUS } from '../../src/constants/theme';
import {
  BIBLE_LANG_GROUPS,
  BIBLE_VERSIONS,
  DEFAULT_VERSION_BY_LANG,
  OT_BOOK_COUNT,
  UPCOMING_VERSIONS,
  getVersionMeta,
} from '../../src/lib/bible/registry';
import { loadBible } from '../../src/lib/bible/loader';
import { MAX_FONT_SCALE, MIN_FONT_SCALE, useBibleStore } from '../../src/lib/bible/store';
import type { BibleData, SearchHit } from '../../src/lib/bible/types';

type SheetKind = null | 'versions' | 'books' | 'search' | 'font';

const SEARCH_MIN_CHARS = 2;
const SEARCH_MAX_HITS = 200;

interface VerseRow {
  /** 1-based verse number (index in the chapter array + 1). */
  n: number;
  text: string;
}

export default function BibleScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { language } = useLanguageStore();
  const {
    hydrated,
    hydrate,
    versionId,
    bookIndex,
    chapter,
    fontScale,
    setVersion,
    setPosition,
    adjustFontScale,
  } = useBibleStore();

  const [bible, setBible] = useState<BibleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [pickerBook, setPickerBook] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);

  const listRef = useRef<FlatList<VerseRow>>(null);
  const pendingVerse = useRef<number | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- boot: hydrate prefs, pick a default version for the app language ----
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && !versionId) {
      setVersion(DEFAULT_VERSION_BY_LANG[language] ?? 'kjv');
    }
  }, [hydrated, versionId, language, setVersion]);

  // ---- load the selected translation ----
  useEffect(() => {
    if (!versionId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    loadBible(versionId)
      .then((data) => {
        if (!cancelled) setBible(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  const meta = versionId ? getVersionMeta(versionId) : undefined;
  const book = bible?.books[bookIndex];
  const chapterCount = book?.chapters.length ?? 0;

  const verses = useMemo<VerseRow[]>(() => {
    const raw = book?.chapters[chapter - 1] ?? [];
    const rows: VerseRow[] = [];
    for (let i = 0; i < raw.length; i++) {
      if (raw[i]) rows.push({ n: i + 1, text: raw[i] });
    }
    return rows;
  }, [book, chapter]);

  // After a search jump, scroll to the target verse once the list has data.
  useEffect(() => {
    const target = pendingVerse.current;
    if (target == null || verses.length === 0) return;
    pendingVerse.current = null;
    const idx = verses.findIndex((v) => v.n === target);
    if (idx >= 0) {
      setHighlight(target);
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.25, animated: true });
      }, 250);
      setTimeout(() => setHighlight(null), 3200);
    }
  }, [verses]);

  // ---- navigation ----
  const openChapter = useCallback(
    (b: number, c: number) => {
      setPosition(b, c);
      setSheet(null);
      setPickerBook(null);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    },
    [setPosition],
  );

  const goNext = useCallback(() => {
    if (!bible) return;
    if (chapter < chapterCount) openChapter(bookIndex, chapter + 1);
    else if (bookIndex < bible.books.length - 1) openChapter(bookIndex + 1, 1);
  }, [bible, bookIndex, chapter, chapterCount, openChapter]);

  const goPrev = useCallback(() => {
    if (!bible) return;
    if (chapter > 1) openChapter(bookIndex, chapter - 1);
    else if (bookIndex > 0) openChapter(bookIndex - 1, bible.books[bookIndex - 1].chapters.length);
  }, [bible, bookIndex, chapter, openChapter]);

  const atStart = bookIndex === 0 && chapter === 1;
  const atEnd = !!bible && bookIndex === bible.books.length - 1 && chapter === chapterCount;

  // ---- share ----
  const shareVerse = useCallback(
    (row: VerseRow) => {
      if (!book || !meta) return;
      const ref = `${book.name} ${chapter}:${row.n}`;
      Share.share({ message: `"${row.text}"\n— ${ref} (${meta.shortName})` }).catch(() => {});
    },
    [book, chapter, meta],
  );

  // ---- search (current version, debounced as-you-type + on submit) ----
  const runSearch = useCallback(
    (q: string) => {
      const needle = q.trim().toLowerCase();
      setSearched(true);
      if (!bible || needle.length < SEARCH_MIN_CHARS) {
        setHits([]);
        return;
      }
      const found: SearchHit[] = [];
      outer: for (let b = 0; b < bible.books.length; b++) {
        const bk = bible.books[b];
        for (let c = 0; c < bk.chapters.length; c++) {
          const ch = bk.chapters[c];
          for (let v = 0; v < ch.length; v++) {
            if (ch[v] && ch[v].toLowerCase().includes(needle)) {
              found.push({ bookIndex: b, bookName: bk.name, chapter: c + 1, verse: v + 1, text: ch[v] });
              if (found.length >= SEARCH_MAX_HITS) break outer;
            }
          }
        }
      }
      setHits(found);
    },
    [bible],
  );

  const onQueryChange = useCallback(
    (q: string) => {
      setQuery(q);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => runSearch(q), 350);
    },
    [runSearch],
  );

  const jumpToHit = useCallback(
    (hit: SearchHit) => {
      pendingVerse.current = hit.verse;
      openChapter(hit.bookIndex, hit.chapter);
    },
    [openChapter],
  );

  // ---- render ----
  const verseBaseSize = 17 * fontScale;
  const verseLineHeight = Math.round(verseBaseSize * 1.72);

  const renderVerse = useCallback(
    ({ item }: { item: VerseRow }) => (
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => shareVerse(item)}
        delayLongPress={350}
        style={[
          styles.verseRow,
          highlight === item.n && { backgroundColor: colors.accentMuted, borderRadius: BORDER_RADIUS.md },
        ]}
      >
        <Text style={[styles.verseText, { color: colors.text, fontSize: verseBaseSize, lineHeight: verseLineHeight }]}>
          <Text style={[styles.verseNum, { color: colors.accent, fontSize: Math.max(11, verseBaseSize * 0.62) }]}>
            {item.n}{'  '}
          </Text>
          {item.text}
        </Text>
      </TouchableOpacity>
    ),
    [colors, highlight, shareVerse, verseBaseSize, verseLineHeight],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* ---------- header ---------- */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.bookChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => {
            setPickerBook(null);
            setSheet('books');
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.bookChipText, { color: colors.text }]} numberOfLines={1}>
            {book ? `${book.name} ${chapter}` : t('bible.title')}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.versionPill, { backgroundColor: colors.accentMuted }]}
            onPress={() => setSheet('versions')}
            activeOpacity={0.7}
          >
            <Text style={[styles.versionPillText, { color: colors.accent }]}>{meta?.shortName ?? '—'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => {
              setQuery('');
              setHits([]);
              setSearched(false);
              setSheet('search');
            }}
            activeOpacity={0.7}
            accessibilityLabel={t('bible.search')}
          >
            <Ionicons name="search" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setSheet('font')}
            activeOpacity={0.7}
            accessibilityLabel={t('bible.fontSize')}
          >
            <Ionicons name="text" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ---------- body ---------- */}
      {loading || !hydrated ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>{t('bible.loading')}</Text>
        </View>
      ) : error || !bible ? (
        <View style={styles.center}>
          <Ionicons name="book-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>{t('bible.failed')}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: colors.accent }]}
            onPress={() => versionId && setVersion(versionId)}
            activeOpacity={0.8}
          >
            <Text style={[styles.retryText, { color: colors.buttonPrimaryText }]}>{t('bible.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={verses}
            keyExtractor={(v) => String(v.n)}
            renderItem={renderVerse}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={20}
            windowSize={9}
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
              setTimeout(
                () => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.25, animated: true }),
                350,
              );
            }}
            ListHeaderComponent={
              <View style={styles.chapterHeader}>
                <Text style={[styles.chapterBook, { color: colors.textMuted }]}>{book?.name}</Text>
                <Text style={[styles.chapterNum, { color: colors.accent }]}>{chapter}</Text>
              </View>
            }
            ListFooterComponent={
              <Text style={[styles.license, { color: colors.textMuted }]}>
                {bible.name} · {bible.license}
              </Text>
            }
          />

          {/* prev / next floating controls */}
          {!atStart && (
            <TouchableOpacity
              style={[styles.navBtn, styles.navPrev, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={goPrev}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={22} color={colors.accent} />
            </TouchableOpacity>
          )}
          {!atEnd && (
            <TouchableOpacity
              style={[styles.navBtn, styles.navNext, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={goNext}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-forward" size={22} color={colors.accent} />
            </TouchableOpacity>
          )}
        </>
      )}

      {/* ---------- versions sheet ---------- */}
      <Sheet visible={sheet === 'versions'} onClose={() => setSheet(null)} colors={colors} title={t('bible.versions')}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {BIBLE_LANG_GROUPS.map((group) => {
            const items = BIBLE_VERSIONS.filter((v) => v.lang === group.lang);
            if (items.length === 0) return null;
            return (
              <View key={group.lang}>
                <Text style={[styles.sheetGroupLabel, { color: colors.textMuted }]}>{group.label}</Text>
                {items.map((v) => {
                  const active = v.id === versionId;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[
                        styles.versionRow,
                        { backgroundColor: active ? colors.accentMuted : colors.surface, borderColor: active ? colors.accent : colors.border },
                      ]}
                      onPress={() => {
                        if (!active) setVersion(v.id);
                        setSheet(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.versionRowMain}>
                        <Text style={[styles.versionShort, { color: colors.accent }]}>{v.shortName}</Text>
                        <View style={styles.versionNameWrap}>
                          <Text style={[styles.versionName, { color: colors.text }]} numberOfLines={1}>
                            {v.name}
                          </Text>
                          <Text style={[styles.versionLicense, { color: colors.textMuted }]}>{v.license}</Text>
                        </View>
                      </View>
                      {active && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}

          {/* Licensed versions — locked until publisher licensing is secured */}
          <Text style={[styles.sheetGroupLabel, { color: colors.textMuted }]}>{t('bible.comingSoon')}</Text>
          {UPCOMING_VERSIONS.map((v) => (
            <View
              key={v.id}
              style={[styles.versionRow, { backgroundColor: colors.surface, borderColor: colors.border, opacity: 0.55 }]}
            >
              <View style={styles.versionRowMain}>
                <Text style={[styles.versionShort, { color: colors.textMuted }]}>{v.shortName}</Text>
                <View style={styles.versionNameWrap}>
                  <Text style={[styles.versionName, { color: colors.textSecondary }]} numberOfLines={1}>
                    {v.name}
                  </Text>
                </View>
              </View>
              <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
            </View>
          ))}
          <Text style={[styles.licensedNote, { color: colors.textMuted }]}>{t('bible.licensedNote')}</Text>
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      </Sheet>

      {/* ---------- books / chapters sheet ---------- */}
      <Sheet
        visible={sheet === 'books'}
        onClose={() => {
          setSheet(null);
          setPickerBook(null);
        }}
        colors={colors}
        title={
          pickerBook != null && bible
            ? bible.books[pickerBook].name
            : t('bible.books')
        }
        onBack={pickerBook != null ? () => setPickerBook(null) : undefined}
      >
        {pickerBook == null ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            {bible &&
              [
                { label: t('bible.oldTestament'), start: 0, end: OT_BOOK_COUNT },
                { label: t('bible.newTestament'), start: OT_BOOK_COUNT, end: bible.books.length },
              ].map((sec) => (
                <View key={sec.label}>
                  <Text style={[styles.sheetGroupLabel, { color: colors.textMuted }]}>{sec.label}</Text>
                  {bible.books.slice(sec.start, sec.end).map((b, i) => {
                    const idx = sec.start + i;
                    const active = idx === bookIndex;
                    return (
                      <TouchableOpacity
                        key={b.id}
                        style={[styles.bookRow, { borderBottomColor: colors.border }]}
                        onPress={() => setPickerBook(idx)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.bookRowText, { color: active ? colors.accent : colors.text }]}>
                          {b.name}
                        </Text>
                        <Text style={[styles.bookRowCount, { color: colors.textMuted }]}>{b.chapters.length}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            <View style={{ height: SPACING.xl }} />
          </ScrollView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.chapterGrid}>
              {bible &&
                bible.books[pickerBook].chapters.map((_, c) => {
                  const active = pickerBook === bookIndex && c + 1 === chapter;
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.chapterCell,
                        {
                          backgroundColor: active ? colors.accent : colors.surface,
                          borderColor: active ? colors.accent : colors.border,
                        },
                      ]}
                      onPress={() => openChapter(pickerBook, c + 1)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chapterCellText, { color: active ? colors.buttonPrimaryText : colors.text }]}>
                        {c + 1}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </View>
            <View style={{ height: SPACING.xl }} />
          </ScrollView>
        )}
      </Sheet>

      {/* ---------- search sheet ---------- */}
      <Sheet visible={sheet === 'search'} onClose={() => setSheet(null)} colors={colors} title={t('bible.search')}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={t('bible.searchHint')}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={onQueryChange}
            onSubmitEditing={() => runSearch(query)}
            returnKeyType="search"
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => onQueryChange('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <FlatList
          data={hits}
          keyExtractor={(h) => `${h.bookIndex}-${h.chapter}-${h.verse}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.hitRow, { borderBottomColor: colors.border }]}
              onPress={() => jumpToHit(item)}
              activeOpacity={0.7}
            >
              <Text style={[styles.hitRef, { color: colors.accent }]}>
                {item.bookName} {item.chapter}:{item.verse}
              </Text>
              <Text style={[styles.hitText, { color: colors.textSecondary }]} numberOfLines={2}>
                {item.text}
              </Text>
            </TouchableOpacity>
          )}
          ListHeaderComponent={
            hits.length > 0 ? (
              <Text style={[styles.hitCount, { color: colors.textMuted }]}>
                {t('bible.results', { count: hits.length })}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            searched && query.trim().length >= SEARCH_MIN_CHARS ? (
              <Text style={[styles.noResults, { color: colors.textMuted }]}>{t('bible.noResults')}</Text>
            ) : null
          }
        />
      </Sheet>

      {/* ---------- font-size sheet ---------- */}
      <Sheet visible={sheet === 'font'} onClose={() => setSheet(null)} colors={colors} title={t('bible.fontSize')} compact>
        <View style={styles.fontRow}>
          <TouchableOpacity
            style={[styles.fontBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: fontScale <= MIN_FONT_SCALE ? 0.4 : 1 }]}
            onPress={() => adjustFontScale(-1)}
            disabled={fontScale <= MIN_FONT_SCALE}
            activeOpacity={0.7}
          >
            <Text style={[styles.fontBtnText, { color: colors.text, fontSize: 14 }]}>A</Text>
          </TouchableOpacity>
          <Text style={[styles.fontPreview, { color: colors.text, fontSize: 17 * fontScale }]}>
            {book && verses[0] ? verses[0].text.slice(0, 40) : 'Aa'}
            {book && verses[0] && verses[0].text.length > 40 ? '…' : ''}
          </Text>
          <TouchableOpacity
            style={[styles.fontBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: fontScale >= MAX_FONT_SCALE ? 0.4 : 1 }]}
            onPress={() => adjustFontScale(1)}
            disabled={fontScale >= MAX_FONT_SCALE}
            activeOpacity={0.7}
          >
            <Text style={[styles.fontBtnText, { color: colors.text, fontSize: 22 }]}>A</Text>
          </TouchableOpacity>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

/* ---------------- bottom sheet wrapper ---------------- */

function Sheet({
  visible,
  onClose,
  onBack,
  title,
  colors,
  children,
  compact,
}: {
  visible: boolean;
  onClose: () => void;
  onBack?: () => void;
  title: string;
  colors: any;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onBack ?? onClose}>
      <View style={styles.sheetBackdropWrap}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.sheetBody,
            compact ? styles.sheetBodyCompact : styles.sheetBodyTall,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            {onBack ? (
              <TouchableOpacity onPress={onBack} style={styles.sheetHeaderBtn} activeOpacity={0.7}>
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </TouchableOpacity>
            ) : (
              <View style={styles.sheetHeaderBtn} />
            )}
            <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.sheetHeaderBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.sheetContent}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

/* ---------------- styles ---------------- */

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    gap: SPACING.sm,
  },
  bookChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    flexShrink: 1,
  },
  bookChipText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
    flexShrink: 1,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  versionPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    marginRight: 2,
  },
  versionPillText: { fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.5 },
  iconBtn: { padding: 8 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, padding: SPACING.xl },
  centerText: { fontSize: FONTS.sizes.md, textAlign: 'center' },
  retryBtn: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  retryText: { fontSize: FONTS.sizes.md, fontWeight: '600' },

  listContent: { paddingHorizontal: SPACING.lg, paddingBottom: 96 },
  chapterHeader: { alignItems: 'center', paddingVertical: SPACING.lg },
  chapterBook: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  chapterNum: {
    fontSize: 56,
    fontWeight: '300',
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    marginTop: 2,
  },
  verseRow: { paddingVertical: 3, paddingHorizontal: 4 },
  verseText: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  verseNum: { fontWeight: '700' },
  license: { fontSize: FONTS.sizes.xs, textAlign: 'center', marginTop: SPACING.xl },

  navBtn: {
    position: 'absolute',
    bottom: 18,
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  navPrev: { left: SPACING.lg },
  navNext: { right: SPACING.lg },

  // sheets
  sheetBackdropWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheetBody: {
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sheetBodyTall: { height: '82%' },
  sheetBodyCompact: { paddingBottom: SPACING.xl },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  sheetHeaderBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif',
  },
  sheetContent: { flex: 1, paddingHorizontal: SPACING.md },
  sheetGroupLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
    marginLeft: SPACING.xs,
  },

  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.xs,
  },
  versionRowMain: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 },
  versionShort: { width: 44, fontSize: FONTS.sizes.sm, fontWeight: '800', letterSpacing: 0.5 },
  versionNameWrap: { flex: 1 },
  versionName: { fontSize: FONTS.sizes.md, fontWeight: '500' },
  versionLicense: { fontSize: FONTS.sizes.xs, marginTop: 1 },
  licensedNote: { fontSize: FONTS.sizes.xs, marginTop: SPACING.sm, marginHorizontal: SPACING.xs, lineHeight: 16 },

  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: SPACING.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bookRowText: { fontSize: FONTS.sizes.md, fontWeight: '500' },
  bookRowCount: { fontSize: FONTS.sizes.xs },

  chapterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: SPACING.md },
  chapterCell: {
    width: 52,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterCellText: { fontSize: FONTS.sizes.md, fontWeight: '600' },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: FONTS.sizes.md },
  hitRow: { paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  hitRef: { fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 2 },
  hitText: { fontSize: FONTS.sizes.sm, lineHeight: 19 },
  hitCount: { fontSize: FONTS.sizes.xs, marginBottom: SPACING.xs },
  noResults: { fontSize: FONTS.sizes.sm, textAlign: 'center', marginTop: SPACING.xl },

  fontRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  fontBtn: {
    width: 52,
    height: 52,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontBtnText: { fontWeight: '700' },
  fontPreview: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
});
