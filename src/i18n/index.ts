import { useMemo } from 'react'
import { useWorld, type Lang } from '../state/useWorld'
import { en, type StringKey } from './en'
import { de } from './de'
import { it } from './it'
import { zh } from './zh'
import { es } from './es'
import { fr } from './fr'
import { ru } from './ru'
import { ja } from './ja'
import { pt } from './pt'
import { ko } from './ko'

export type { StringKey } from './en'
export type Vars = Record<string, string | number>

const DICTS: Record<Lang, Record<StringKey, string>> = {
  en, de, it, zh, es, fr, ru, ja, pt, ko,
}

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`))
}

// Core lookup: chosen language, falling back to English for any missing/blank value.
export function translate(lang: Lang, key: StringKey, vars?: Vars): string {
  const dict = DICTS[lang] ?? en
  const raw = dict[key] || en[key] || key
  return interpolate(raw, vars)
}

// Imperative translate for non-React code (e.g. the summit "copied" toast). Reads
// the current language straight from the store — not reactive.
export function tg(key: StringKey, vars?: Vars): string {
  return translate(useWorld.getState().language, key, vars)
}

// React hook: returns a `t(key, vars)` bound to the live language so components
// re-render when the user switches in settings.
export function useT(): (key: StringKey, vars?: Vars) => string {
  const lang = useWorld((s) => s.language)
  return useMemo(() => (key: StringKey, vars?: Vars) => translate(lang, key, vars), [lang])
}
