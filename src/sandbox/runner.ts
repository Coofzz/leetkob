// Judges one submission in two throw-away containers: one compiles, one runs every test.
// Decisions: docs/decisions/pa3-architecture.md §3–4. Attacks that prove each limit: test/sandbox.
//
// - Every container gets the full set of flags below; nothing is mounted and no -e/--env-file is passed.
// - The docker CLI itself is spawned with an environment of PATH only, so no key of ours can reach it.
// - Code, the binary and test inputs go in on stdin; expected outputs never enter a container.
// - Each container has a wall-clock budget; past it the runner removes the whole container
//   (`docker rm -f`), which kills every process in it, not only the student's program.
import { spawn } from 'node:child_process';
import type { JudgeFn, JudgeInput, JudgeResult } from '../types.ts';
import { sameTokens } from './compare.ts';
import { tar } from './tar.ts';

export const JUDGE_IMAGE = 'leetkob-judge';
const OUTPUT_LIMIT = 1 << 20; // 1 MB per test (FAQ-05)
const PROCESS_LIMIT = 16; // processes and threads (FAQ-05)
const COMPILE_SECONDS = 10; // enforced inside the container; the budget below adds start-up time
const COMPILE_MEMORY_MB = 512; // the compiler, not the student's program
const COMPILE_ERRORS_BYTES = 4096;
const START_UP_MS = 5_000; // starting a container takes about a second, more on a busy CI runner

type TestVerdict = JudgeResult['tests'][number]['verdict'];

/** The hardened `docker run` arguments. The only place a judging container is described. */
export function containerArgs(name: string, memoryMb: number, command: string[]): string[] {
  return [
    'run', '-i', '--rm', '--name', name,
    '--network', 'none',
    '--user', '65534:65534',
    '--read-only', '--tmpfs', '/tmp:rw,exec,nosuid,size=64m',
    '--memory', `${memoryMb}m`, '--memory-swap', `${memoryMb}m`,
    '--pids-limit', String(PROCESS_LIMIT),
    '--cpus', '1',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    JUDGE_IMAGE,
    ...command,
  ]; // prettier-ignore
}

interface Exec {
  code: number | null;
  stdout: Buffer;
  stderr: string;
  timedOut: boolean;
}

function docker(args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn('docker', args, { env: { PATH: process.env.PATH ?? '' }, stdio: 'pipe' });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', () => resolve({ code: null, out }));
    child.on('close', (code) => resolve({ code, out }));
  });
}

/** Removes the container whatever state it is in. Kills all of its processes first. */
const removeContainer = (name: string) => docker(['rm', '-f', name]);

/** Runs one container with `stdin`, a wall-clock budget and a cap on what it may print. */
function runContainer(
  name: string,
  memoryMb: number,
  command: string[],
  stdin: Buffer,
  budgetMs: number,
  maxStdout: number,
): Promise<Exec> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', containerArgs(name, memoryMb, command), {
      env: { PATH: process.env.PATH ?? '' },
      stdio: 'pipe',
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = '';
    let timedOut = false;
    const stop = () => void removeContainer(name);
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, budgetMs);

    child.stdout.on('data', (d: Buffer) => {
      size += d.length;
      if (size > maxStdout) return stop(); // more than the container may legitimately print
      chunks.push(d);
    });
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < COMPILE_ERRORS_BYTES * 2) stderr += d.toString();
    });
    child.stdin.on('error', () => {}); // the container may exit before reading everything
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', async (code) => {
      clearTimeout(timer);
      await removeContainer(name); // --rm is asynchronous; make sure nothing is left behind
      resolve({ code, stdout: Buffer.concat(chunks), stderr, timedOut });
    });
    child.stdin.end(stdin);
  });
}

interface TestLine {
  idx: number;
  exit: number;
  oom: boolean;
  ms: number;
  bytes: number;
  out: string;
}

function verdictOf(line: TestLine | undefined, expected: string, cpuMs: number, wallMs: number): TestVerdict {
  if (!line) return 'TLE'; // the job ran out of time before this test
  if (line.oom) return 'MLE';
  if (line.bytes > OUTPUT_LIMIT) return 'OLE';
  if (line.exit === 128 + 24 /* SIGXCPU */ || line.ms >= wallMs) return 'TLE';
  // SIGKILL without an oom_kill count: past the CPU limit it was the hard CPU limit, else memory.
  if (line.exit === 128 + 9 /* SIGKILL */) return line.ms >= cpuMs ? 'TLE' : 'MLE';
  if (line.exit !== 0) return 'RE';
  return sameTokens(Buffer.from(line.out, 'base64').toString('utf8'), expected) ? 'AC' : 'WA';
}

const STATUS: Record<Exclude<TestVerdict, 'AC'>, JudgeResult['status']> = {
  WA: 'wrong_answer',
  TLE: 'time_limit',
  MLE: 'memory_limit',
  RE: 'runtime_error',
  OLE: 'output_limit',
};

function parseLines(stdout: Buffer): Map<number, TestLine> {
  const lines = new Map<number, TestLine>();
  for (const text of stdout.toString('utf8').split('\n')) {
    if (!text.trim()) continue;
    try {
      const line = JSON.parse(text) as TestLine;
      if (Number.isInteger(line.idx)) lines.set(line.idx, line);
    } catch {
      // a line cut by the budget: that test counts as not finished
    }
  }
  return lines;
}

export const judge: JudgeFn = async (input: JudgeInput) => {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(input.jobId)) throw new Error('jobId must be 1-64 of [A-Za-z0-9_-]');
  const cpuS = Math.max(1, Math.ceil(input.cpuMs / 1000));
  const wallS = 3 * cpuS; // FAQ-05: wall time is 3 × CPU time
  const name = `job-${input.jobId}`;

  const compiled = await runContainer(
    `${name}-compile`,
    COMPILE_MEMORY_MB,
    ['compile'],
    Buffer.from(input.source, 'utf8'),
    COMPILE_SECONDS * 1000 + START_UP_MS,
    64 << 20,
  );
  if (compiled.code !== 0 || compiled.timedOut) {
    const message = compiled.timedOut ? 'compilation took too long' : compiled.stderr;
    return { status: 'compile_error', compileStderr: message.slice(0, COMPILE_ERRORS_BYTES), tests: [] };
  }

  const files = [
    { name: 'a.out', data: compiled.stdout, mode: 0o755 },
    ...input.tests.map((t, i) => ({ name: `${String(i).padStart(3, '0')}.in`, data: Buffer.from(t.input) })),
  ];
  const ran = await runContainer(
    `${name}-run`,
    input.memoryMb,
    ['run', String(cpuS), String(wallS), String(OUTPUT_LIMIT)],
    tar(files),
    input.tests.length * (wallS + 1) * 1000 + START_UP_MS,
    input.tests.length * 1.5 * OUTPUT_LIMIT + 65_536,
  );

  const lines = parseLines(ran.stdout);
  const tests = input.tests.map((t, idx) => {
    const line = lines.get(idx);
    return {
      idx,
      verdict: verdictOf(line, t.expected, cpuS * 1000, wallS * 1000),
      timeMs: line?.ms ?? wallS * 1000,
    };
  });
  const failed = tests.find((t) => t.verdict !== 'AC');
  return {
    status: failed ? STATUS[failed.verdict as Exclude<TestVerdict, 'AC'>] : 'accepted',
    tests,
  };
};
