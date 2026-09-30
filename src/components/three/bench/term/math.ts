/**
 * Arithmetic for $(( )), calc and bc: + - * / % ** ^, brackets, comparisons, a few functions and
 * constants. A small recursive-descent parser; nothing is ever handed to eval.
 */
const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2 };

export function arith(src: string, integer = false): number {
  let i = 0;
  const s = src.replace(/\s+/g, '');
  const peek = (t: string) => s.startsWith(t, i);
  const eat = (t: string) => (peek(t) ? ((i += t.length), true) : false);
  const fail = (): never => {
    throw new Error(i >= s.length ? 'syntax error: operand expected' : `syntax error near "${s.slice(i, i + 6)}"`);
  };

  const div = (a: number, b: number) => {
    if (b === 0) throw new Error('division by 0');
    return integer ? Math.trunc(a / b) : a / b;
  };

  function cmp(): number {
    let a = add();
    for (;;) {
      if (eat('==')) a = +(a === add());
      else if (eat('!=')) a = +(a !== add());
      else if (eat('<=')) a = +(a <= add());
      else if (eat('>=')) a = +(a >= add());
      else if (eat('<')) a = +(a < add());
      else if (eat('>')) a = +(a > add());
      else return a;
    }
  }
  function add(): number {
    let a = mul();
    for (;;) {
      if (eat('+')) a += mul();
      else if (eat('-')) a -= mul();
      else return a;
    }
  }
  function mul(): number {
    let a = pow();
    for (;;) {
      if (peek('**')) return a;
      if (eat('*')) a *= pow();
      else if (eat('/')) a = div(a, pow());
      else if (eat('%')) {
        const b = pow();
        if (b === 0) throw new Error('division by 0');
        a %= b;
      } else return a;
    }
  }
  function pow(): number {
    const a = unary();
    if (eat('**') || eat('^')) return Math.pow(a, pow());
    return a;
  }
  function unary(): number {
    if (eat('-')) return -unary();
    if (eat('+')) return unary();
    if (eat('!')) return +!unary();
    return atom();
  }
  function atom(): number {
    if (eat('(')) {
      const v = cmp();
      if (!eat(')')) fail();
      return v;
    }
    const num = /^(0x[0-9a-f]+|\d*\.?\d+(e[+-]?\d+)?)/i.exec(s.slice(i));
    if (num) {
      i += num[0].length;
      return Number(num[0]);
    }
    const name = /^[a-z_]\w*/i.exec(s.slice(i));
    if (name) {
      const k = name[0].toLowerCase();
      i += name[0].length;
      if (FUNCS[k]) {
        if (!eat('(')) fail();
        const v = cmp();
        if (!eat(')')) fail();
        return FUNCS[k](v);
      }
      if (k in CONSTS) return CONSTS[k];
      throw new Error(`unknown name "${name[0]}"`);
    }
    return fail();
  }

  if (!s) return 0;
  const v = cmp();
  if (i < s.length) fail();
  return v;
}

/** A number as a calculator shows it: no float noise. */
export function show(n: number) {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toPrecision(12)));
}
