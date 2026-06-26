// Shared UI font stack. Latin (and Cyrillic, via Nunito) render in the handwritten
// "Patrick Hand" look; for scripts those faces don't cover — Chinese, Japanese,
// Korean — the browser walks down to the rounded Noto Sans faces (loaded in
// index.html) before the generic `cursive`, so localized text never falls back to
// an ugly system font. Import this everywhere instead of redeclaring the stack.
export const HAND =
  "'Patrick Hand', 'Nunito', 'Noto Sans KR', 'Noto Sans JP', 'Noto Sans SC', cursive"
