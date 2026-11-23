// Hard rules: decide a ban-list constraint from the code's tokens, without the model.
// Decisions: docs/decisions/pa3-architecture.md §5. Tests: test/unit/hard-rules.test.ts.
//
// A constraint is a ban list exactly when its text starts with "Do not use" or "Do not call"; the
// banned names are the backticked strings in its text. Nothing here knows any problem or dataset.
//
// A banned name is used when the code refers to it after comments and literals are gone:
// - `ns::x` (e.g. std::sort) matches a qualified reference whose namespace resolves to ns through
//   `using namespace`, namespace aliases or a leading `::`; and an unqualified `x` that is not the
//   student's own name, not a member access, and can reach ns (ns is std — argument-dependent lookup
//   or using — or ns is used by `using namespace` / a using-declaration).
// - a plain name (qsort, rbegin, goto, for) matches any reference to it, member calls included,
//   unless the student declared that name.
// - a macro whose body uses a banned name makes every use of the macro a use too.
// When the rules cannot tell, they say pass: a wrongful deduction costs a student real marks.
import type { Evidence } from '../types.ts';
import { lex, type Token } from './lexer.ts';

export interface BanListDecision {
  verdict: 'pass' | 'violation';
  evidence: Evidence[];
}

const BAN_LIST = /^\s*Do not (use|call)\b/;
const NAME = /^(::)?[A-Za-z_]\w*(::[A-Za-z_]\w*)*$/;

const KEYWORDS = new Set(
  (
    'alignas alignof asm auto bool break case catch char char8_t char16_t char32_t class const consteval ' +
    'constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do double ' +
    'dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable ' +
    'namespace new noexcept nullptr operator private protected public register reinterpret_cast requires ' +
    'return short signed sizeof static static_assert static_cast struct switch template this thread_local ' +
    'throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while'
  ).split(' '),
);
const TYPE_KEYWORDS = new Set(
  'auto bool char char8_t char16_t char32_t double float int long short signed unsigned void wchar_t'.split(
    ' ',
  ),
);
const DECLARING_KEYWORDS = new Set(['struct', 'class', 'namespace', 'enum', 'union', 'typename']);
const AFTER_DECLARED_NAME = new Set(['(', '[', '=', ';', ',', '{', ')', ':']);

export function isBanList(constraintText: string): boolean {
  return BAN_LIST.test(constraintText);
}

/** The banned names of a ban-list constraint, in order, without duplicates or a leading `::`. */
export function banListNames(constraintText: string): string[] {
  const names: string[] = [];
  for (const m of constraintText.matchAll(/`([^`]+)`/g)) {
    const name = (m[1] as string).trim();
    if (!NAME.test(name)) continue; // e.g. `new[]`: not a name the rules can look for
    const clean = name.replace(/^::/, '');
    if (!names.includes(clean)) names.push(clean);
  }
  return names;
}

/** One reference in the code: `a::b::c`, with or without a leading `::`. */
interface Ref {
  parts: string[];
  global: boolean;
  line: number; // the line of the last part
  member: boolean; // after `.` or `->`
  declares: boolean; // the student declares this name here
  usingDeclaration: boolean; // `using a::b;`
  macro?: string; // inside this macro's #define body
  definesMacro: boolean;
}

function collectRefs(tokens: Token[]): Ref[] {
  const refs: Ref[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as Token;
    const startsChain = t.kind === 'ident' || (t.text === '::' && tokens[i + 1]?.kind === 'ident');
    if (!startsChain) continue;
    const prevOfStart = tokens[i - 1];
    if (t.kind === 'ident' && prevOfStart?.text === '::') continue; // middle of a chain
    const global = t.text === '::';
    let j = global ? i + 1 : i;
    const parts = [(tokens[j] as Token).text];
    while (tokens[j + 1]?.text === '::' && tokens[j + 2]?.kind === 'ident') {
      j += 2;
      parts.push((tokens[j] as Token).text);
    }
    const last = tokens[j] as Token;
    const prev = tokens[i - 1];
    const next = tokens[j + 1];
    const declares =
      !global &&
      parts.length === 1 &&
      !KEYWORDS.has(last.text) &&
      !last.defines &&
      prev !== undefined &&
      (TYPE_KEYWORDS.has(prev.text) ||
        DECLARING_KEYWORDS.has(prev.text) ||
        ['*', '&', '&&', '>', '>>'].includes(prev.text) ||
        (prev.kind === 'ident' && !KEYWORDS.has(prev.text))) &&
      next !== undefined &&
      AFTER_DECLARED_NAME.has(next.text);
    refs.push({
      parts,
      global,
      line: last.line,
      member: prev?.text === '.' || prev?.text === '->',
      declares: declares || (prev?.text === 'using' && next?.text === '='),
      usingDeclaration:
        prev?.text === 'using' && prev?.macro === t.macro && next?.text === ';' && parts.length > 1,
      macro: t.macro,
      definesMacro: Boolean(last.defines),
    });
    i = j;
  }
  return refs;
}

interface Scope {
  aliases: Map<string, string>; // namespace a = std::ranges;
  usedNamespaces: Set<string>; // using namespace std;
  usingDeclarations: Set<string>; // using std::sort;
  declared: Set<string>; // the student's own names
  macros: Set<string>;
}

function scopeOf(tokens: Token[], refs: Ref[]): Scope {
  const scope: Scope = {
    aliases: new Map(),
    usedNamespaces: new Set(),
    usingDeclarations: new Set(),
    declared: new Set(),
    macros: new Set(),
  };
  const resolveNs = (path: string) => {
    const [head, ...rest] = path.split('::');
    const alias = scope.aliases.get(head as string);
    return alias ? [alias, ...rest].join('::') : path;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as Token;
    if (t.defines) scope.macros.add(t.text);
    // namespace a = x::y ;
    if (t.text === 'namespace' && tokens[i + 1]?.kind === 'ident' && tokens[i + 2]?.text === '=') {
      const target = readPath(tokens, i + 3);
      if (target) scope.aliases.set((tokens[i + 1] as Token).text, resolveNs(target));
    }
    // using namespace x::y ;
    if (t.text === 'using' && tokens[i + 1]?.text === 'namespace') {
      const target = readPath(tokens, i + 2);
      if (target) scope.usedNamespaces.add(resolveNs(target));
    }
  }
  for (const r of refs) {
    if (r.declares) scope.declared.add(r.parts[0] as string);
    if (r.usingDeclaration) scope.usingDeclarations.add(resolveNs(r.parts.join('::')));
  }
  return scope;
}

function readPath(tokens: Token[], from: number): string | null {
  let k = from;
  if (tokens[k]?.text === '::') k++;
  if (tokens[k]?.kind !== 'ident') return null;
  const parts = [(tokens[k] as Token).text];
  while (tokens[k + 1]?.text === '::' && tokens[k + 2]?.kind === 'ident') {
    k += 2;
    parts.push((tokens[k] as Token).text);
  }
  return parts.join('::');
}

/** Every full name a qualified reference can mean. */
function meanings(ref: Ref, scope: Scope): string[] {
  const path = ref.parts.join('::');
  if (ref.global) return [path];
  const [head, ...rest] = ref.parts;
  const alias = scope.aliases.get(head as string);
  if (alias) return [[alias, ...rest].join('::')];
  return [path, ...[...scope.usedNamespaces].map((ns) => `${ns}::${path}`)];
}

function usesName(ref: Ref, banned: string, scope: Scope): boolean {
  if (ref.declares || ref.definesMacro || ref.usingDeclaration) return false;
  const bannedParts = banned.split('::');
  const last = bannedParts[bannedParts.length - 1] as string;

  if (bannedParts.length === 1) {
    // a plain name: qsort, rbegin, goto
    if (ref.parts.length === 1) return ref.parts[0] === banned && !scope.declared.has(banned);
    if (ref.member) return false;
    const full = meanings(ref, scope);
    return full.includes(banned) || full.includes(`std::${banned}`);
  }

  // a qualified name: std::sort, std::ranges::sort, boost::integer::gcd
  if (ref.parts.length > 1 || ref.global) return !ref.member && meanings(ref, scope).includes(banned);
  if (ref.member || ref.parts[0] !== last) return false;
  if (scope.declared.has(last) || scope.macros.has(last)) return false;
  const ns = bannedParts.slice(0, -1).join('::');
  return ns === 'std' || scope.usedNamespaces.has(ns) || scope.usingDeclarations.has(banned);
}

export function decideBanList(constraintText: string, source: string): BanListDecision | null {
  if (!isBanList(constraintText)) return null;
  const banned = banListNames(constraintText);
  const { tokens, lines } = lex(source);
  const refs = collectRefs(tokens);
  const scope = scopeOf(tokens, refs);

  const hit = new Set<number>();
  const badMacros = new Set<string>();
  for (const r of refs) {
    if (banned.some((b) => usesName(r, b, scope))) {
      hit.add(r.line);
      if (r.macro) badMacros.add(r.macro);
    }
  }
  // A use of a macro whose body uses a banned name is a use too (macros may nest).
  for (let changed = true; changed;) {
    changed = false;
    for (const r of refs) {
      const name = r.parts[0] as string;
      if (r.parts.length !== 1 || r.definesMacro || r.member || !badMacros.has(name)) continue;
      if (!hit.has(r.line)) hit.add(r.line);
      if (r.macro && !badMacros.has(r.macro)) {
        badMacros.add(r.macro);
        changed = true;
      }
    }
  }

  const evidence = [...hit].sort((a, b) => a - b).map((line) => ({ line, text: lines[line - 1] ?? '' }));
  return { verdict: evidence.length > 0 ? 'violation' : 'pass', evidence };
}
