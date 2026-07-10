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
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
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
import {
  HIGHLIGHT_COLORS,
  highlightBg,
  makeVerseKey,
  parseVerseKey,
  useAnnotations,
} from '../../src/lib/bible/annotations';
import { parseReference } from '../../src/lib/bible/refparse';
import {
  formatXrefTarget,
  getXrefTargets,
  loadXrefs,
  xrefBookIndex,
  xrefPreview,
  type XrefTarget,
} from '../../src/lib/bible/xrefs';
import type { BibleData, SearchHit } from '../../src/lib/bible/types';

type SheetKind = null | 'versions' | 'books' | 'search' | 'font' | 'actions' | 'bookmarks';

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
    setFontScale,
  } = useBibleStore();
  const {
    hydrate: hydrateAnnotations,
    bookmarks,
    highlights,
    toggleBookmark,
    removeBookmark,
    setHighlight,
  } = useAnnotations();

  const [bible, setBible] = useState<BibleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [pickerBook, setPickerBook] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [highlightVerse, setHighlightVerse] = useState<number | null>(null);
  const [actionVerse, setActionVerse] = useState<VerseRow | null>(null);
  const [verseXrefs, setVerseXrefs] = useState<XrefTarget[] | null>(null);
  const [xrefsLoading, setXrefsLoading] = useState(false);

  const listRef = useRef<FlatList<VerseRow>>(null);
  const pendingVerse = useRef<number | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- boot: hydrate prefs + annotations, pick default version ----
  useEffect(() => {
    hydrate();
    hydrateAnnotations();
  }, [hydrate, hydrateAnnotations]);

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

  const bookmarkedSet = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookmarks) s.add(b.key);
    return s;
  }, [bookmarks]);

  // After a jump, scroll to the target verse once the list has data.
  useEffect(() => {
    const target = pendingVerse.current;
    if (target == null || verses.length === 0) return;
    pendingVerse.current = null;
    const idx = verses.findIndex((v) => v.n === target);
    if (idx >= 0) {
      setHighlightVerse(target);
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.25, animated: true });
      }, 250);
      setTimeout(() => setHighlightVerse(null), 3200);
    }
  }, [verses]);

  // ---- navigation ----
  const openChapter = useCallback(
    (b: number, c: number) => {
      setPosition(b, c);
      setSheet(null);
      setPickerBook(null);
      setActionVerse(null);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    },
    [setPosition],
  );

  const jumpToRef = useCallback(
    (b: number, c: number, v?: number) => {
      if (v != null) pendingVerse.current = v;
      openChapter(b, c);
    },
    [openChapter],
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

  // ---- pinch-to-zoom: adjusts VERSE TEXT SIZE only (no page zoom) ----
  const fontRef = useRef(fontScale);
  useEffect(() => {
    fontRef.current = fontScale;
  }, [fontScale]);
  const pinchBase = useRef(1);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onStart(() => {
          pinchBase.current = fontRef.current;
        })
        .onUpdate((e) => {
          const next = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, pinchBase.current * e.scale));
          // small threshold keeps re-renders sane during the gesture
          if (Math.abs(next - fontRef.current) >= 0.02) setFontScale(next, false);
        })
        .onEnd(() => {
          setFontScale(fontRef.current, true); // persist once
        }),
    [setFontScale],
  );

  // ---- verse actions ----
  const verseKeyFor = useCallback(
    (n: number) => (book ? makeVerseKey(book.id, chapter, n) : ''),
    [book, chapter],
  );

  const refLabelFor = useCallback(
    (n: number) => (book ? `${book.name} ${chapter}:${n}` : ''),
    [book, chapter],
  );

  const shareVerse = useCallback(
    (row: VerseRow) => {
      if (!meta) return;
      Share.share({ message: `"${row.text}"\n— ${refLabelFor(row.n)} (${meta.shortName})` }).catch(() => {});
    },
    [meta, refLabelFor],
  );

  const copyVerse = useCallback(
    async (row: VerseRow) => {
      if (!meta) return;
      await Clipboard.setStringAsync(`"${row.text}" — ${refLabelFor(row.n)} (${meta.shortName})`).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSheet(null);
      setActionVerse(null);
    },
    [meta, refLabelFor],
  );

  const openVerseActions = useCallback(
    (row: VerseRow) => {
      setActionVerse(row);
      setSheet('actions');
      setVerseXrefs(null);
      if (book) {
        setXrefsLoading(true);
        loadXrefs()
          .then((data) => setVerseXrefs(getXrefTargets(data, book.id, chapter, row.n)))
          .catch(() => setVerseXrefs([]))
          .finally(() => setXrefsLoading(false));
      }
    },
    [book, chapter],
  );

  // ---- search: reference parsing + full-text, current version ----
  const gotoRef = useMemo(
    () => (bible && query.trim().length >= SEARCH_MIN_CHARS ? parseReference(query, bible.books) : null),
    [bible, query],
  );

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

  // ---- render ----
  const verseBaseSize = 17 * fontScale;
  const verseLineHeight = Math.round(verseBaseSize * 1.72);

  const renderVerse = useCallback(
    ({ item }: { item: VerseRow }) => {
      const key = verseKeyFor(item.n);
      const hlBg = highlightBg(highlights[key]);
      const isBookmarked = bookmarkedSet.has(key);
      const flashBg = highlightVerse === item.n ? colors.accentMuted : undefined;
      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => openVerseActions(item)}
          onLongPress={() => shareVerse(item)}
          delayLongPress={350}
          style={[
            styles.verseRow,
            (hlBg || flashBg) && { backgroundColor: flashBg ?? hlBg, borderRadius: BORDER_RADIUS.md },
          ]}
        >
          <Text style={[styles.verseText, { color: colors.text, fontSize: verseBaseSize, lineHeight: verseLineHeight }]}>
            <Text style={[styles.verseNum, { color: colors.accent, fontSize: Math.max(11, verseBaseSize * 0.62) }]}>
              {item.n}
              {isBookmarked ? ' ' : ''}
              {isBookmarked && <Ionicons name="bookmark" size={Math.max(10, verseBaseSize * 0.55)} color={colors.accent} />}
              {'  '}
            </Text>
            {item.text}
          </Text>
        </TouchableOpacity>
      );
    },
    [
      colors,
      highlightVerse,
      highlights,
      bookmarkedSet,
      openVerseActions,
      shareVerse,
      verseBaseSize,
      verseLineHeight,
      verseKeyFor,
    ],
  );

  const actionKey = actionVerse ? verseKeyFor(actionVerse.n) : '';
  const actionHighlight = actionVerse ? highlights[actionKey] : undefined;

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
            onPress={() => setSheet('bookmarks')}
            activeOpacity={0.7}
            accessibilityLabel={t('bible.bookmarks')}
          >
            <Ionicons name="bookmark-outline" size={19} color={colors.text} />
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
          <GestureDetector gesture={pinchGesture}>
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
          </GestureDetector>

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
                        {
                          backgroundColor: active ? colors.accentMuted : colors.surface,
                          borderColor: active ? colors.accent : colors.border,
                        },
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
        title={pickerBook != null && bible ? bible.books[pickerBook].name : t('bible.books')}
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
                      <Text
                        style={[styles.chapterCellText, { color: active ? colors.buttonPrimaryText : colors.text }]}
                      >
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

      {/* ---------- search sheet (reference + full-text) ---------- */}
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

        {/* "Go to John 3:16" row when the query parses as a reference */}
        {gotoRef && bible && (
          <TouchableOpacity
            style={[styles.gotoRow, { backgroundColor: colors.accentMuted, borderColor: colors.accent }]}
            onPress={() => jumpToRef(gotoRef.bookIndex, gotoRef.chapter, gotoRef.verse)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-forward-circle" size={20} color={colors.accent} />
            <Text style={[styles.gotoText, { color: colors.accent }]} numberOfLines={1}>
              {t('bible.goTo')}: {bible.books[gotoRef.bookIndex].name} {gotoRef.chapter}
              {gotoRef.verse ? `:${gotoRef.verse}` : ''}
            </Text>
          </TouchableOpacity>
        )}

        <FlatList
          data={hits}
          keyExtractor={(h) => `${h.bookIndex}-${h.chapter}-${h.verse}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.hitRow, { borderBottomColor: colors.border }]}
              onPress={() => jumpToRef(item.bookIndex, item.chapter, item.verse)}
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
            searched && !gotoRef && query.trim().length >= SEARCH_MIN_CHARS ? (
              <Text style={[styles.noResults, { color: colors.textMuted }]}>{t('bible.noResults')}</Text>
            ) : null
          }
        />
      </Sheet>

      {/* ---------- verse actions sheet ---------- */}
      <Sheet
        visible={sheet === 'actions' && actionVerse != null}
        onClose={() => {
          setSheet(null);
          setActionVerse(null);
        }}
        colors={colors}
        title={actionVerse ? refLabelFor(actionVerse.n) : ''}
      >
        {actionVerse && book && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.actionVerseText, { color: colors.textSecondary }]} numberOfLines={4}>
              {actionVerse.text}
            </Text>

            {/* actions row */}
            <View style={styles.actionRow}>
              <ActionButton
                colors={colors}
                icon="copy-outline"
                label={t('bible.copy')}
                onPress={() => copyVerse(actionVerse)}
              />
              <ActionButton
                colors={colors}
                icon="share-social-outline"
                label={t('bible.share')}
                onPress={() => shareVerse(actionVerse)}
              />
              <ActionButton
                colors={colors}
                icon={bookmarkedSet.has(actionKey) ? 'bookmark' : 'bookmark-outline'}
                label={t('bible.bookmark')}
                active={bookmarkedSet.has(actionKey)}
                onPress={() => {
                  toggleBookmark(actionKey);
                  Haptics.selectionAsync().catch(() => {});
                }}
              />
            </View>

            {/* highlight palette */}
            <Text style={[styles.sheetGroupLabel, { color: colors.textMuted }]}>{t('bible.highlight')}</Text>
            <View style={styles.highlightRow}>
              {HIGHLIGHT_COLORS.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.highlightDot,
                    { backgroundColor: c.bg, borderColor: actionHighlight === c.id ? colors.accent : colors.border },
                  ]}
                  onPress={() => {
                    setHighlight(actionKey, actionHighlight === c.id ? null : c.id);
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  activeOpacity={0.7}
                >
                  {actionHighlight === c.id && <Ionicons name="checkmark" size={16} color={colors.text} />}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.highlightDot, { backgroundColor: 'transparent', borderColor: colors.border }]}
                onPress={() => setHighlight(actionKey, null)}
                activeOpacity={0.7}
                accessibilityLabel="Remove highlight"
              >
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* cross references */}
            <Text style={[styles.sheetGroupLabel, { color: colors.textMuted }]}>{t('bible.crossRefs')}</Text>
            {xrefsLoading ? (
              <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: SPACING.md }} />
            ) : verseXrefs && verseXrefs.length > 0 ? (
              verseXrefs.map((x) => {
                const bIdx = xrefBookIndex(x, bible.books);
                if (bIdx < 0) return null;
                const preview = xrefPreview(x, bible.books);
                return (
                  <TouchableOpacity
                    key={x.raw}
                    style={[styles.xrefRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => jumpToRef(bIdx, x.chapter, x.verse)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.xrefMain}>
                      <Text style={[styles.hitRef, { color: colors.accent }]}>
                        {formatXrefTarget(x, bible.books)}
                      </Text>
                      {!!preview && (
                        <Text style={[styles.hitText, { color: colors.textSecondary }]} numberOfLines={2}>
                          {preview}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text style={[styles.noResults, { color: colors.textMuted, marginTop: SPACING.xs }]}>
                {t('bible.noCrossRefs')}
              </Text>
            )}
            {verseXrefs && verseXrefs.length > 0 && (
              <Text style={[styles.xrefCredit, { color: colors.textMuted }]}>{t('bible.xrefCredit')}</Text>
            )}
            <View style={{ height: SPACING.xl }} />
          </ScrollView>
        )}
      </Sheet>

      {/* ---------- bookmarks sheet ---------- */}
      <Sheet visible={sheet === 'bookmarks'} onClose={() => setSheet(null)} colors={colors} title={t('bible.bookmarks')}>
        {bible && (
          <FlatList
            data={bookmarks}
            keyExtractor={(b) => b.key}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const parsed = parseVerseKey(item.key);
              if (!parsed) return null;
              const bIdx = bible.books.findIndex((b) => b.id === parsed.bookId);
              if (bIdx < 0) return null;
              const bk = bible.books[bIdx];
              const text = bk.chapters[parsed.chapter - 1]?.[parsed.verse - 1] ?? '';
              return (
                <View style={[styles.bookmarkRow, { borderBottomColor: colors.border }]}>
                  <TouchableOpacity
                    style={styles.bookmarkMain}
                    onPress={() => jumpToRef(bIdx, parsed.chapter, parsed.verse)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.hitRef, { color: colors.accent }]}>
                      {bk.name} {parsed.chapter}:{parsed.verse}
                    </Text>
                    {!!text && (
                      <Text style={[styles.hitText, { color: colors.textSecondary }]} numberOfLines={2}>
                        {text}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.bookmarkDelete}
                    onPress={() => removeBookmark(item.key)}
                    activeOpacity={0.7}
                    accessibilityLabel="Delete bookmark"
                  >
                    <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={[styles.noResults, { color: colors.textMuted }]}>{t('bible.noBookmarks')}</Text>
            }
          />
        )}
      </Sheet>

      {/* ---------- font-size sheet ---------- */}
      <Sheet
        visible={sheet === 'font'}
        onClose={() => setSheet(null)}
        colors={colors}
        title={t('bible.fontSize')}
        compact
      >
        <View style={styles.fontRow}>
          <TouchableOpacity
            style={[
              styles.fontBtn,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: fontScale <= MIN_FONT_SCALE ? 0.4 : 1,
              },
            ]}
            onPress={() => adjustFontScale(-1)}
            disabled={fontScale <= MIN_FONT_SCALE}
            activeOpacity={0.7}
          >
            <Text style={[styles.fontBtnText, { color: colors.text, fontSize: 14 }]}>A</Text>
          </TouchableOpacity>
          <Text style={[styles.fontPreview, { color: colors.text, fontSize: 17 * fontScale }]}>
            {verses[0] ? verses[0].text.slice(0, 40) : 'Aa'}
            {verses[0] && verses[0].text.length > 40 ? '…' : ''}
          </Text>
          <TouchableOpacity
            style={[
              styles.fontBtn,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: fontScale >= MAX_FONT_SCALE ? 0.4 : 1,
              },
            ]}
            onPress={() => adjustFontScale(1)}
            disabled={fontScale >= MAX_FONT_SCALE}
            activeOpacity={0.7}
          >
            <Text style={[styles.fontBtnText, { color: colors.text, fontSize: 22 }]}>A</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.pinchHint, { color: colors.textMuted }]}>{t('bible.pinchHint')}</Text>
      </Sheet>
    </SafeAreaView>
  );
}

/* ---------------- small components ---------------- */

function ActionButton({
  colors,
  icon,
  label,
  onPress,
  active,
}: {
  colors: any;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        { backgroundColor: active ? colors.accentMuted : colors.surface, borderColor: active ? colors.accent : colors.border },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={19} color={active ? colors.accent : colors.text} />
      <Text style={[styles.actionBtnLabel, { color: active ? colors.accent : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  versionPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    marginRight: 2,
  },
  versionPillText: { fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.5 },
  iconBtn: { padding: 7 },

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
  gotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  gotoText: { fontSize: FONTS.sizes.md, fontWeight: '700', flexShrink: 1 },
  hitRow: { paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  hitRef: { fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 2 },
  hitText: { fontSize: FONTS.sizes.sm, lineHeight: 19 },
  hitCount: { fontSize: FONTS.sizes.xs, marginBottom: SPACING.xs },
  noResults: { fontSize: FONTS.sizes.sm, textAlign: 'center', marginTop: SPACING.xl },

  // verse actions
  actionVerseText: { fontSize: FONTS.sizes.sm, lineHeight: 20, marginTop: SPACING.md, fontStyle: 'italic' },
  actionRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
  },
  actionBtnLabel: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  highlightRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  highlightDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xrefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  xrefMain: { flex: 1 },
  xrefCredit: { fontSize: 10, marginTop: SPACING.xs, marginLeft: SPACING.xs },

  bookmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACING.sm,
  },
  bookmarkMain: { flex: 1 },
  bookmarkDelete: { padding: SPACING.xs },

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
  pinchHint: {
    fontSize: FONTS.sizes.xs,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
});
