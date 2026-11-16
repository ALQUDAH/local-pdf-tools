/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Lightweight, dependency-free i18n. English is the source language; add a language by
// adding a dictionary below with the same keys. Missing keys fall back to English.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ActiveTool } from './types';

export type Lang = 'en' | 'ar';

export const LANGUAGES: { id: Lang; label: string; dir: 'ltr' | 'rtl' }[] = [
  { id: 'en', label: 'English', dir: 'ltr' },
  { id: 'ar', label: 'العربية', dir: 'rtl' },
];

const en = {
  'app.name': 'Local PDF Tools',
  'app.tagline': '100% Client-Side Privacy',
  'nav.searchTools': 'Search tools',
  'nav.focusSearch': 'Focus search (/ or ⌘K)',
  'nav.backToSearch': 'Back to tools search',
  'nav.language': 'Language',
  'theme.light': 'Light',
  'theme.system': 'System',
  'theme.dark': 'Dark',
  'hero.badge': '100% Secure Local Sandbox',
  'hero.title': 'Manipulate PDFs entirely inside your browser.',
  'hero.body':
    'A free, open-source PDF toolkit that processes your documents locally. 38 of 40 tools, including Office conversions, run in your browser, so your files never leave your device. Only AI translation and converting web pages by URL use a server you host yourself.',
  'hero.titleDesktop': 'Manipulate PDFs entirely on your computer.',
  'hero.bodyDesktop':
    'A free, open-source PDF toolkit that works offline. All 40 tools, including the Office converters, run on this computer, so your files never leave your device.',
  'search.placeholder': 'Search 40+ PDF tools by name or description... (e.g., merge, compress, protect, ocr)',
  'search.aria': 'Search PDF tools by name or description',
  'search.clear': 'Clear',
  'search.clearTitle': 'Clear search (Esc)',
  'search.press': 'Press',
  'search.or': 'or',
  'search.found': '{n} found',
  'search.tools': '{n} tools',
  'filter.category': 'Category:',
  'filter.all': 'All Tools ({n})',
  'filter.pinned': 'Pinned ({n})',
  'empty.title': 'No tools found',
  'empty.noMatch': 'No PDF utilities matched "{q}".',
  'empty.noCategory': 'No tools in this category.',
  'empty.popular': 'Popular searches:',
  'empty.reset': 'Reset Filters',
  'results.search': 'Search Results ({n})',
  'results.pinned': 'Pinned Utilities',
  'results.matching': 'matching "{q}"',
  'results.clear': 'Clear filters',
  'pin.add': 'Pin utility to top',
  'pin.remove': 'Unpin utility',
  'local.title': 'How does it stay local?',
  'local.body':
    "When you drop a PDF, it is read directly into your browser's memory. Merging, splitting, OCR, encryption and every other browser tool run on your own device with WebAssembly and JavaScript, and the result is saved straight to your disk. No uploads, no telemetry, no server logs.",
  'loading.tool': 'Loading tool...',
  'tool.untranslated': 'This tool is not translated yet.',
} as const;

export type MessageKey = keyof typeof en;

const ar: Partial<Record<MessageKey, string>> = {
  'app.name': 'أدوات PDF المحلية',
  'app.tagline': 'خصوصية كاملة على جهازك',
  'nav.searchTools': 'ابحث في الأدوات',
  'nav.focusSearch': 'البحث (/ أو ⌘K)',
  'nav.backToSearch': 'العودة إلى البحث في الأدوات',
  'nav.language': 'اللغة',
  'theme.light': 'فاتح',
  'theme.system': 'النظام',
  'theme.dark': 'داكن',
  'hero.badge': 'آمن 100% وعلى جهازك',
  'hero.title': 'عدّل ملفات PDF بالكامل داخل متصفحك.',
  'hero.body':
    'مجموعة أدوات PDF مجانية ومفتوحة المصدر تعالج مستنداتك محليًا. 38 أداة من أصل 40، بما فيها تحويل ملفات Office، تعمل داخل متصفحك، فلا تغادر ملفاتك جهازك أبدًا. فقط الترجمة بالذكاء الاصطناعي وتحويل صفحات الويب عبر رابط تستخدم خادمًا تستضيفه بنفسك.',
  'hero.titleDesktop': 'عدّل ملفات PDF بالكامل على جهازك.',
  'hero.bodyDesktop':
    'مجموعة أدوات PDF مجانية ومفتوحة المصدر تعمل دون إنترنت. جميع الأدوات الأربعين، بما فيها تحويل ملفات Office، تعمل على هذا الجهاز، فلا تغادر ملفاتك جهازك أبدًا.',
  'search.placeholder': 'ابحث في أكثر من 40 أداة PDF بالاسم أو الوصف... (مثل: دمج، ضغط، حماية، OCR)',
  'search.aria': 'ابحث في أدوات PDF بالاسم أو الوصف',
  'search.clear': 'مسح',
  'search.clearTitle': 'مسح البحث (Esc)',
  'search.press': 'اضغط',
  'search.or': 'أو',
  'search.found': '{n} نتيجة',
  'search.tools': '{n} أداة',
  'filter.category': 'الفئة:',
  'filter.all': 'كل الأدوات ({n})',
  'filter.pinned': 'المثبّتة ({n})',
  'empty.title': 'لا توجد أدوات',
  'empty.noMatch': 'لا توجد أدوات تطابق "{q}".',
  'empty.noCategory': 'لا توجد أدوات في هذه الفئة.',
  'empty.popular': 'عمليات بحث شائعة:',
  'empty.reset': 'إعادة ضبط الفلاتر',
  'results.search': 'نتائج البحث ({n})',
  'results.pinned': 'الأدوات المثبّتة',
  'results.matching': 'تطابق "{q}"',
  'results.clear': 'مسح الفلاتر',
  'pin.add': 'تثبيت الأداة في الأعلى',
  'pin.remove': 'إلغاء التثبيت',
  'local.title': 'كيف تبقى ملفاتك على جهازك؟',
  'local.body':
    'عندما تضيف ملف PDF، يُقرأ مباشرة في ذاكرة متصفحك. الدمج والتقسيم والتعرّف الضوئي على النصوص والتشفير وكل أدوات المتصفح الأخرى تعمل على جهازك باستخدام WebAssembly وJavaScript، وتُحفظ النتيجة مباشرة على جهازك. لا رفع للملفات، ولا تتبّع، ولا سجلات على أي خادم.',
  'loading.tool': 'جارٍ تحميل الأداة...',
  'tool.untranslated': 'هذه الأداة غير مترجمة بعد.',
};

const groupNamesAr: Record<string, { name: string; short: string }> = {
  'Organize Documents': { name: 'تنظيم المستندات', short: 'تنظيم' },
  'Edit & Modify': { name: 'التحرير والتعديل', short: 'تحرير' },
  'Convert & Optimize': { name: 'التحويل والتحسين', short: 'تحويل' },
  'Analysis & Extraction': { name: 'التحليل والاستخراج', short: 'تحليل و OCR' },
  'Security & Protection': { name: 'الأمان والحماية', short: 'أمان' },
  'Convert from PDF': { name: 'التحويل من PDF', short: 'PDF إلى Office' },
  'Convert to PDF': { name: 'التحويل إلى PDF', short: 'Office إلى PDF' },
};

const toolsAr: Partial<Record<ActiveTool, { title: string; description: string }>> = {
  crop: { title: 'قص الصفحات والهوامش', description: 'قص الهوامش أو إزالة الترويسات أو اقتطاع أجزاء مخصصة من صفحة واحدة أو عدة صفحات بشكل مرئي.' },
  formbuilder: { title: 'منشئ النماذج التفاعلية', description: 'أضف حقول نص قابلة للتعبئة ومربعات اختيار تفاعلية مباشرة على النماذج الممسوحة ضوئيًا.' },
  bates: { title: 'ترقيم بيتس والختم القانوني', description: 'اختم أرقامًا تسلسلية قانونية (مثل LIT-CASE-000001) على المستندات متعددة الصفحات.' },
  flatten: { title: 'تسطيح PDF', description: 'حوّل حقول النماذج التفاعلية والتعليقات إلى طبقات نصية ثابتة غير قابلة للتعديل.' },
  repair: { title: 'إصلاح PDF', description: 'حاول استعادة ملفات PDF التالفة أو المعطوبة وإعادة بنائها تلقائيًا عبر إعادة إنشاء جداول المراجع.' },
  resize: { title: 'تغيير حجم الصفحات', description: 'وحّد أبعاد الصفحات، وغيّر حجم المحتوى بدقة إلى مقاسات A4 أو Letter أو Legal.' },
  addmargin: { title: 'إضافة هوامش', description: 'صغّر المحتوى الداخلي مع الحفاظ على حجم الورقة لإضافة هوامش بيضاء واسعة للطباعة أو التجليد.' },
  redact: { title: 'الحجب الدائم', description: 'أخفِ البيانات الخاصة أو المقاطع الحساسة بشكل دائم ولا رجعة فيه.' },
  compare: { title: 'مقارنة مرئية وفروقات', description: 'قارن ملفي PDF جنبًا إلى جنب. يبرز تعديلات الفقرات وتغيّرات التخطيط والمراجعات، دون اتصال بالإنترنت.' },
  grayscale: { title: 'تدرّج رمادي وأحادي اللون', description: 'وفّر حبر الطابعة: حوّل ألوان المستند إلى الرمادي أو طبّق فلاتر تباين عالٍ مثل آلات النسخ.' },
  extractor: { title: 'استخراج النص والتخطيط', description: 'استخرج محتوى PDF صفحة بصفحة مع الحفاظ على تباعد النص، أو حوّله إلى Markdown أو JSON منظم.' },
  batchconverter: { title: 'المحوّل الدفعي', description: 'حوّل عدة ملفات دفعة واحدة: ارفع أي مزيج من ملفات PDF أو الصور، واختر صيغة الإخراج (PDF أو JPG أو PNG)، ونزّلها في ملف ZIP واحد.' },
  formfiller: { title: 'تعبئة النماذج التفاعلية', description: 'يكتشف حقول النماذج التفاعلية تلقائيًا: اكتب الإجابات، وحدّد مربعات الاختيار والقوائم المنسدلة، أو أضف أختامًا مخصصة.' },
  merge: { title: 'دمج PDF', description: 'اجمع عدة مستندات وأعد ترتيب صفحاتها في ملف PDF واحد.' },
  split: { title: 'تقسيم PDF', description: 'استخرج صفحات أو نطاقات محددة (مثل 1-3، 5) إلى مستند جديد.' },
  compress: { title: 'ضغط PDF', description: 'قلّل حجم الملف بشكل كبير داخل المتصفح عبر ضغط الصور المضمّنة.' },
  images: { title: 'PDF إلى صور', description: 'حوّل كل صفحة من PDF إلى صورة JPG عالية الجودة قابلة للتنزيل.' },
  imagestopdf: { title: 'صور إلى PDF', description: 'اجمع الصور العمودية والأفقية أو النماذج الممسوحة في ملف PDF واحد.' },
  rotate: { title: 'تدوير PDF', description: 'دوّر صفحات مفردة أو جميع الصفحات. صحّح المسوحات المقلوبة أو المائلة.' },
  organize: { title: 'تنظيم PDF', description: 'أعد ترتيب الصفحات أو احذفها أو كرّرها أو أدرج صفحات فارغة بشكل مرئي.' },
  pagenumbers: { title: 'إضافة أرقام الصفحات', description: 'اختر موضع الترقيم وصيغته، وتخطَّ صفحات الغلاف في التقارير.' },
  protect: { title: 'حماية PDF', description: 'أضف كلمة مرور إلى ملف PDF بتشفير AES-256 القياسي، ويفتح في أي قارئ PDF.' },
  watermark: { title: 'علامة مائية', description: 'أضف أختامًا أمنية بشكل مائل أو في المنتصف أو في شبكة متكررة، مع التحكم في الكثافة والخط.' },
  metadata: { title: 'تعديل البيانات الوصفية', description: 'عدّل العنوان والمؤلف والكلمات المفتاحية وبيانات النشر الخاصة بالمستند.' },
  sign: { title: 'توقيع PDF', description: 'ارسم توقيعك بخط اليد، أو اكتبه بخط مزخرف، أو ارفع صورة توقيع شفافة على صفحات محددة.' },
  ocr: { title: 'التعرّف الضوئي على النصوص (OCR)', description: 'تعرّف على النصوص في المستندات الممسوحة ضوئيًا داخل متصفحك، وعدّلها واحفظها كملف PDF قابل للبحث أو TXT. يدعم العربية.' },
  nup: { title: 'طباعة عدة صفحات في ورقة', description: 'رتّب عدة صفحات في صفوف وأعمدة على ورقة طباعة واحدة، مع التحكم في حجم الورقة واتجاه الترتيب والحدود.' },
  overlay: { title: 'دمج طبقات PDF', description: 'ضع صورًا أو أختامًا أو تواقيع أو قوالب متعددة الصفحات فوق ملفات PDF بدقة الميليمتر.' },
  scanner: { title: 'الماسح الضوئي للمستندات', description: 'حوّل المستندات الورقية إلى رقمية باستخدام كاميرا جهازك، مع إزالة الظلال وضبط المحاذاة والقص التلقائي للهوامش.' },
  pdftoword: { title: 'PDF إلى Word', description: 'استخرج نص ملف PDF إلى مستند Word قابل للتعديل. يعمل في متصفحك.' },
  pdftopowerpoint: { title: 'PDF إلى PowerPoint', description: 'حوّل كل صفحة PDF إلى شريحة PowerPoint بنصها. يعمل في متصفحك.' },
  pdftoexcel: { title: 'PDF إلى Excel', description: 'انسخ النصوص والجداول البسيطة من PDF إلى جدول Excel. يعمل في متصفحك.' },
  wordtopdf: { title: 'Word إلى PDF', description: 'حوّل نص مستند Word (.docx) إلى PDF. يعمل في متصفحك.' },
  powerpointtopdf: { title: 'PowerPoint إلى PDF', description: 'حوّل نص شرائح PowerPoint (.pptx) إلى صفحات PDF. يعمل في متصفحك.' },
  exceltopdf: { title: 'Excel إلى PDF', description: 'حوّل أوراق Excel (.xlsx) إلى PDF سهل القراءة. يعمل في متصفحك.' },
  editpdf: { title: 'تحرير PDF', description: 'أضف نصوصًا وصورًا وأشكالًا وتعليقات إلى ملف PDF مباشرة في المتصفح.' },
  htmltopdf: { title: 'HTML إلى PDF', description: 'حوّل كود HTML أو ملفاته إلى PDF في متصفحك. تحويل صفحة ويب عبر رابط يتطلب خادمًا مستضافًا ذاتيًا.' },
  unlockpdf: { title: 'فك قفل PDF', description: 'أزل كلمة المرور من ملف PDF تعرف كلمة مروره.' },
  pdftopdfa: { title: 'PDF إلى PDF/A', description: 'جهّز ملف PDF للأرشفة طويلة الأمد (بيانات PDF/A-2b وملف الألوان). يعمل في متصفحك.' },
  translatepdf: { title: 'ترجمة PDF', description: 'ترجم نص ملف PDF بالذكاء الاصطناعي (Google Gemini). يتطلب خادمًا مستضافًا ذاتيًا أو تطبيق سطح المكتب ومفتاح API خاصًا بك.' },
};

const messages: Record<Lang, Partial<Record<MessageKey, string>>> = { en, ar };

// ---------------------------------------------------------------------------
// Tool screens: gettext-style translation keyed by the English text itself.
//   tr("Merge PDF")                 -> "دمج PDF"
//   tr("Page {0} of {1}", i, total) -> "الصفحة 3 من 10"
// Untranslated strings fall back to English. Catalogs load on demand.
// ---------------------------------------------------------------------------
type Catalog = Record<string, string>;
const catalogLoaders: Partial<Record<Lang, () => Promise<{ default: Catalog }>>> = {
  ar: () => import('./locales/ar'),
};
const catalogs: Partial<Record<Lang, Catalog>> = {};
let currentLang: Lang = 'en';

export function tr(text: string, ...args: Array<string | number>): string {
  const translated = (currentLang !== 'en' && catalogs[currentLang]?.[text]) || text;
  return args.length ? translated.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? '')) : translated;
}

const STORAGE_KEY = 'pdf-lang';

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ar') return saved;
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

interface I18nValue {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  toolText: (id: ActiveTool, fallback: { title: string; description: string }) => { title: string; description: string };
  groupText: (name: string, shortName: string) => { name: string; short: string };
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const dir = LANGUAGES.find((l) => l.id === lang)!.dir;
  // Make tr() follow the active language for everything rendered below
  currentLang = lang;

  useEffect(() => {
    const load = catalogLoaders[lang];
    if (!load || catalogs[lang]) return;
    load().then((m) => {
      catalogs[lang] = m.default;
      setCatalogVersion((v) => v + 1);
    });
  }, [lang]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const value = useMemo<I18nValue>(() => {
    const setLang = (next: Lang) => {
      setLangState(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage unavailable */
      }
    };
    const t: I18nValue['t'] = (key, vars) => {
      let text = messages[lang][key] ?? en[key];
      if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
      return text;
    };
    const toolText: I18nValue['toolText'] = (id, fallback) => (lang === 'ar' && toolsAr[id]) || fallback;
    const groupText: I18nValue['groupText'] = (name, shortName) =>
      (lang === 'ar' && groupNamesAr[name]) || { name, short: shortName || name };
    return { lang, dir, setLang, t, toolText, groupText };
    // catalogVersion: re-render consumers once a catalog has loaded
  }, [lang, dir, catalogVersion]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
