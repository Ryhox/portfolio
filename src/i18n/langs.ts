import type { Lang } from '../state/useWorld'

// Dropdown metadata for the settings Language picker. `native` shows each language
// in its own name (so a French speaker recognises "Français"); `flag` points at a
// flat SVG in public/ui/flags. Order = display order in the dropdown.
export type LangMeta = { code: Lang; native: string; flag: string }

export const LANG_META: LangMeta[] = [
  { code: 'en', native: 'English', flag: '/ui/flags/en.svg' },
  { code: 'de', native: 'Deutsch', flag: '/ui/flags/de.svg' },
  { code: 'es', native: 'Español', flag: '/ui/flags/es.svg' },
  { code: 'fr', native: 'Français', flag: '/ui/flags/fr.svg' },
  { code: 'it', native: 'Italiano', flag: '/ui/flags/it.svg' },
  { code: 'pt', native: 'Português', flag: '/ui/flags/pt.svg' },
  { code: 'ru', native: 'Русский', flag: '/ui/flags/ru.svg' },
  { code: 'zh', native: '中文', flag: '/ui/flags/zh.svg' },
  { code: 'ja', native: '日本語', flag: '/ui/flags/ja.svg' },
  { code: 'ko', native: '한국어', flag: '/ui/flags/ko.svg' },
]

export function langMeta(code: Lang): LangMeta {
  return LANG_META.find((l) => l.code === code) ?? LANG_META[0]
}
