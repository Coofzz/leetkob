// The checker command: one command line takes a dataset folder (the layout of leetkob-eval/) and writes
// one prediction line per (solution, constraint), as leetkob-eval/README.md specifies.
//
//   npm run checker -- --data <dir> [--out <file>]        (no --out: the predictions go to stdout)
//   MODEL_OFF=1 npm run checker -- --data leetkob-eval    hard rules only, no network
//
// It reads statement.md and constraints.json only. It never reads labels.jsonl and has no per-problem
// configuration, so it runs the same way on a held-out set.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createReview } from './review.ts';

const USAGE = 'usage: [MODEL_OFF=1] npm run checker -- --data <dataset dir> [--out <predictions.jsonl>]';

interface Prediction {
  solution: string;
  constraint: string;
  verdict: 'pass' | 'violation' | 'unsure';
  evidence: { line: number; text: string }[];
}

function parseArgs(argv: string[]): { data?: string; out?: string } | null {
  const args: { data?: string; out?: string } = {};
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    if (value === undefined) return null;
    if (argv[i] === '--data') args.data = value;
    else if (argv[i] === '--out') args.out = value;
    else return null;
  }
  return args;
}

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const args = parseArgs(argv);
  if (!args?.data || !isDir(join(args.data, 'problems'))) {
    console.error(`${USAGE}\nthe dataset folder must contain problems/<id>/constraints.json`);
    return 2;
  }
  const modelOff = env.MODEL_OFF === '1';
  if (!modelOff) {
    // The model client arrives in its own change; until then the checker runs the hard rules only.
    console.error('the model is not wired into the checker yet: run with MODEL_OFF=1');
    return 2;
  }
  const review = createReview();

  const predictions: Prediction[] = [];
  const problems = readdirSync(join(args.data, 'problems')).sort();
  for (const problem of problems) {
    const dir = join(args.data, 'problems', problem);
    const constraints = JSON.parse(readFileSync(join(dir, 'constraints.json'), 'utf8')) as {
      id: string;
      text: string;
    }[];
    const statementFile = join(dir, 'statement.md');
    const statement = existsSync(statementFile) ? readFileSync(statementFile, 'utf8') : '';
    const solutionsDir = join(args.data, 'solutions', problem);
    if (!isDir(solutionsDir)) continue;
    const files = readdirSync(solutionsDir)
      .filter((f) => f.endsWith('.cpp'))
      .sort();
    for (const file of files) {
      const source = readFileSync(join(solutionsDir, file), 'utf8');
      const results = await review(
        { statement, constraints: constraints.map((c) => ({ id: c.id, text: c.text })), source },
        { modelOff },
      );
      for (const r of results) {
        predictions.push({
          solution: `${problem}/${file.replace(/\.cpp$/, '')}`,
          constraint: r.constraint,
          verdict: r.verdict,
          evidence: r.verdict === 'unsure' ? [] : r.evidence,
        });
      }
    }
  }

  const jsonl = predictions.map((p) => JSON.stringify(p)).join('\n') + '\n';
  if (args.out) writeFileSync(args.out, jsonl);
  else process.stdout.write(jsonl);
  console.error(`checker: ${predictions.length} predictions${args.out ? ` written to ${args.out}` : ''}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    },
  );
}
