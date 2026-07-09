/**
 * Bible module — version registry.
 *
 * Only freely-licensed translations are BUNDLED (public domain / CC BY-SA):
 * shipping copyrighted text (ESV/NIV/NKJV) without a publisher license would
 * be a copyright violation and a store-takedown risk, so those appear as
 * greyed "coming soon" slots until licensing/API keys are secured.
 *
 * NOTE: the require() literals below must stay static so Metro can bundle the
 * assets (metro.config.js adds "bible" to assetExts).
 */
import type { BibleLang, BibleVersionMeta, UpcomingVersionMeta } from './types';

export const BIBLE_VERSIONS: BibleVersionMeta[] = [
  // ---- English ----
  {
    id: 'kjv',
    name: 'King James Version',
    shortName: 'KJV',
    lang: 'en',
    license: 'Public Domain',
    module: () => require('../../../assets/bibles/kjv.bible'),
  },
  {
    id: 'bsb',
    name: 'Berean Standard Bible',
    shortName: 'BSB',
    lang: 'en',
    license: 'Public Domain',
    module: () => require('../../../assets/bibles/bsb.bible'),
  },
  {
    id: 'web',
    name: 'World English Bible',
    shortName: 'WEB',
    lang: 'en',
    license: 'Public Domain',
    module: () => require('../../../assets/bibles/web.bible'),
  },
  {
    id: 'asv',
    name: 'American Standard Version',
    shortName: 'ASV',
    lang: 'en',
    license: 'Public Domain',
    module: () => require('../../../assets/bibles/asv.bible'),
  },
  // ---- Hindi ----
  {
    id: 'hi_irv',
    name: 'इंडियन रिवाइज्ड वर्ज़न (हिन्दी)',
    shortName: 'IRV',
    lang: 'hi',
    license: 'CC BY-SA 4.0',
    module: () => require('../../../assets/bibles/hi_irv.bible'),
  },
  // ---- Telugu ----
  {
    id: 'te_ov',
    name: 'పరిశుద్ధ గ్రంథము (O.V.)',
    shortName: 'OV',
    lang: 'te',
    license: 'Public Domain',
    module: () => require('../../../assets/bibles/te_ov.bible'),
  },
  {
    id: 'te_irv',
    name: 'ఇండియన్ రివైజ్డ్ వెర్షన్ (తెలుగు)',
    shortName: 'IRV',
    lang: 'te',
    license: 'CC BY-SA 4.0',
    module: () => require('../../../assets/bibles/te_irv.bible'),
  },
];

/** Licensed translations — visible but locked until publisher licensing. */
export const UPCOMING_VERSIONS: UpcomingVersionMeta[] = [
  { id: 'esv', name: 'English Standard Version', shortName: 'ESV', lang: 'en' },
  { id: 'niv', name: 'New International Version', shortName: 'NIV', lang: 'en' },
  { id: 'nkjv', name: 'New King James Version', shortName: 'NKJV', lang: 'en' },
];

/** Language display order + labels for the version picker. */
export const BIBLE_LANG_GROUPS: { lang: BibleLang; label: string }[] = [
  { lang: 'en', label: 'English' },
  { lang: 'hi', label: 'हिन्दी' },
  { lang: 'te', label: 'తెలుగు' },
];

/** Default version per app language (first open, before the user picks). */
export const DEFAULT_VERSION_BY_LANG: Record<string, string> = {
  en: 'kjv',
  hi: 'hi_irv',
  te: 'te_ov',
};

export function getVersionMeta(id: string): BibleVersionMeta | undefined {
  return BIBLE_VERSIONS.find((v) => v.id === id);
}

/** Old Testament = books[0..38], New Testament = books[39..65]. */
export const OT_BOOK_COUNT = 39;
