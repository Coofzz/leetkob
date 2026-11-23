// What leaves the system: the code with every comment blanked out (a comment is where a name, a
// student ID or a note to the checker lives), string and character literals kept (they are code),
// and the line numbers unchanged, so the model's evidence lines map back to the original source.
export interface Deidentified {
  /** The code, line by line, comments blanked and trailing spaces trimmed; lines[0] is line 1. */
  lines: string[];
  /** The same lines as "N| code", the form the prompt uses. */
  numbered: string;
}

const RAW_PREFIX = /(?:^|[^A-Za-z0-9_])(?:u8|u|U|L)?R$/;

export function deidentify(source: string): Deidentified {
  const src = source.replace(/\r\n?/g, '\n');
  let out = '';
  let i = 0;
  const blank = (text: string) => text.replace(/[^\n]/g, ' ');

  while (i < src.length) {
    const c = src[i] as string;
    const next = src[i + 1] ?? '';
    if (c === '/' && next === '/') {
      let end = src.indexOf('\n', i);
      if (end < 0) end = src.length;
      out += blank(src.slice(i, end));
      i = end;
    } else if (c === '/' && next === '*') {
      let end = src.indexOf('*/', i + 2);
      end = end < 0 ? src.length : end + 2;
      out += blank(src.slice(i, end));
      i = end;
    } else if (c === '"' && RAW_PREFIX.test(src.slice(Math.max(0, i - 4), i))) {
      const open = src.indexOf('(', i);
      const delim = open < 0 ? '' : src.slice(i + 1, open);
      const close = open < 0 ? -1 : src.indexOf(`)${delim}"`, open + 1);
      const end = close < 0 ? src.length : close + delim.length + 2;
      out += src.slice(i, end);
      i = end;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }

  const lines = out.split('\n').map((l) => l.trimEnd());
  if (src.endsWith('\n')) lines.pop();
  return { lines, numbered: lines.map((l, n) => `${n + 1}| ${l}`.trimEnd()).join('\n') };
}
