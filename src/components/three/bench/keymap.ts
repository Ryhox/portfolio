/** QWERTY layout laid over the Lumen 64's four rows of caps (back row first) plus the space bar. */
export const KEY_ROWS: string[][] = [
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
  ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'Backspace'],
  ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Enter'],
  ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight'],
  ['Space'],
];

/** Codes without their own cap borrow the nearest one. */
export const KEY_ALIASES: Record<string, string> = {
  BracketRight: 'BracketLeft',
  Backslash: 'Backspace',
  Quote: 'Semicolon',
  NumpadEnter: 'Enter',
  Backquote: 'Tab',
  Escape: 'Tab',
  ArrowLeft: 'Comma',
  ArrowRight: 'Slash',
  ArrowUp: 'Semicolon',
  ArrowDown: 'Period',
};
