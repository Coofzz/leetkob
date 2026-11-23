// A C++ lexer that is just enough for the hard rules: it drops comments, string, character and raw
// string literals, keeps every token's 1-based line number, and marks the tokens of a #define body.
// Other preprocessor lines (#include, #pragma, #if…) are skipped: a header name is not a use.

export interface Token {
  kind: 'ident' | 'number' | 'punct';
  text: string;
  line: number;
  /** The macro whose #define body this token is in. */
  macro?: string;
  /** True for the name right after #define. */
  defines?: boolean;
}

export interface Lexed {
  tokens: Token[];
  /** The original source lines, without line terminators; lines[0] is line 1. */
  lines: string[];
}

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;
const RAW_PREFIXES = new Set(['R', 'u8R', 'uR', 'UR', 'LR']);
const STRING_PREFIXES = new Set(['u8', 'u', 'U', 'L']);
const PUNCT2 = new Set(['::', '->', '&&', '||', '<<', '>>', '++', '--', '==', '!=', '<=', '>=']);

export function lex(source: string): Lexed {
  const src = source.replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let atLineStart = true; // only whitespace since the last newline
  let directive: 'define' | 'skip' | null = null;
  let macro: string | undefined; // inside a #define body
  let expectMacroName = false;

  const peek = (k = 0) => src[i + k] ?? '';
  const push = (kind: Token['kind'], text: string, tokenLine: number) => {
    if (directive === 'skip') return;
    if (expectMacroName && kind === 'ident') {
      tokens.push({ kind, text, line: tokenLine, defines: true });
      macro = text;
      expectMacroName = false;
      return;
    }
    tokens.push(macro ? { kind, text, line: tokenLine, macro } : { kind, text, line: tokenLine });
  };

  /** Skips a quoted literal that started at i (the opening quote), honouring backslash escapes. */
  const skipQuoted = (quote: string) => {
    i++;
    while (i < src.length && src[i] !== quote && src[i] !== '\n') {
      if (src[i] === '\\' && i + 1 < src.length) {
        if (src[i + 1] === '\n') line++;
        i += 2;
      } else i++;
    }
    if (src[i] === quote) i++;
  };

  /** Skips R"delim( … )delim" starting at the opening quote. */
  const skipRaw = () => {
    const open = src.indexOf('(', i);
    const delim = open < 0 ? '' : src.slice(i + 1, open);
    const close = open < 0 ? -1 : src.indexOf(`)${delim}"`, open + 1);
    const end = close < 0 ? src.length : close + delim.length + 2;
    for (let k = i; k < end; k++) if (src[k] === '\n') line++;
    i = end;
  };

  while (i < src.length) {
    const c = src[i] as string;

    if (c === '\n') {
      line++;
      i++;
      atLineStart = true;
      directive = null;
      macro = undefined;
      expectMacroName = false;
      continue;
    }
    if (c === '\\' && peek(1) === '\n') {
      // line continuation: the logical line goes on
      line++;
      i += 2;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\f' || c === '\v') {
      i++;
      continue;
    }
    if (c === '/' && peek(1) === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && peek(1) === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && peek(1) === '/')) {
        if (src[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '#' && atLineStart) {
      i++;
      while (peek() === ' ' || peek() === '\t') i++;
      let name = '';
      while (IDENT_PART.test(peek())) name += src[i++];
      directive = name === 'define' ? 'define' : 'skip';
      expectMacroName = name === 'define';
      atLineStart = false;
      continue;
    }
    atLineStart = false;

    if (IDENT_START.test(c)) {
      const start = line;
      let word = '';
      while (i < src.length && IDENT_PART.test(src[i] as string)) word += src[i++];
      if (peek() === '"' && RAW_PREFIXES.has(word)) {
        skipRaw();
        continue;
      }
      if ((peek() === '"' || peek() === "'") && STRING_PREFIXES.has(word)) {
        skipQuoted(peek());
        continue;
      }
      push('ident', word, start);
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(peek(1)))) {
      let num = '';
      while (i < src.length) {
        const d = src[i] as string;
        if (/[eEpP]/.test(d) && /[+-]/.test(peek(1))) {
          num += d + peek(1);
          i += 2;
        } else if (/[0-9A-Za-z_.]/.test(d)) num += src[i++];
        else if (d === "'" && /[0-9A-Za-z_]/.test(peek(1)))
          i++; // digit separator: 1'000'000
        else break;
      }
      push('number', num, line);
      continue;
    }
    if (c === '"') {
      skipQuoted('"');
      continue;
    }
    if (c === "'") {
      skipQuoted("'");
      continue;
    }
    const two = c + peek(1);
    if (PUNCT2.has(two)) {
      push('punct', two, line);
      i += 2;
      continue;
    }
    push('punct', c, line);
    i++;
  }
  return { tokens, lines };
}
