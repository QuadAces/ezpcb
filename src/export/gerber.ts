import JSZip from 'jszip';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { FlattenedPcb } from '@/types/pcb';

const execFileAsync = promisify(execFile);

type ExecFileError = Error & {
  code?: string;
  stdout?: string;
  stderr?: string;
};

export type GerberExportOptions = {
  silkscreenStrokeMm?: number;
};

async function runPython(
  scriptPath: string,
  inputPath: string,
  outputDir: string,
  options?: GerberExportOptions
) {
  const pythonCandidates = [
    process.env.PYTHON,
    process.env.PYTHON_PATH,
    path.join(process.cwd(), '.venv', 'bin', 'python'),
    path.join(process.cwd(), '.venv', 'bin', 'python3'),
    path.join(process.cwd(), '.venv', 'Scripts', 'python.exe'),
    '/var/lang/bin/python3.12',
    '/var/lang/bin/python3.11',
    '/var/lang/bin/python3.10',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
    '/opt/homebrew/bin/python3',
    'python3',
    'python',
  ].filter((candidate): candidate is string => Boolean(candidate));
  let lastError: ExecFileError | undefined;

  const args = [scriptPath, '--input', inputPath, '--output', outputDir];
  if (typeof options?.silkscreenStrokeMm === 'number') {
    args.push('--silk-stroke-mm', String(options.silkscreenStrokeMm));
  }

  for (const command of pythonCandidates) {
    try {
      await execFileAsync(command, args);
      return;
    } catch (error) {
      const execError = error as ExecFileError;
      lastError = execError;

      // Keep searching only if the executable does not exist.
      if (execError.code !== 'ENOENT') {
        break;
      }
    }
  }

  if (lastError instanceof Error) {
    const parts = [
      `Unable to run Python Gerber generator at ${scriptPath}.`,
      `Cause: ${lastError.message}`,
      `Tried Python candidates: ${pythonCandidates.join(', ')}`,
      lastError.stderr ? `stderr: ${lastError.stderr.trim()}` : '',
      lastError.stdout ? `stdout: ${lastError.stdout.trim()}` : '',
    ].filter(Boolean);

    throw new Error(parts.join(' | '));
  }

  throw new Error('Unable to run Python Gerber generator.');
}

export async function generateGerberZip(
  flattened: FlattenedPcb,
  options?: GerberExportOptions
): Promise<Buffer> {
  const workspaceRoot = process.cwd();
  const scriptPath = path.join(
    workspaceRoot,
    'scripts',
    'pcb',
    'generate_gerber.py'
  );
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pcb-export-'));
  const inputPath = path.join(tmpRoot, 'pcb.json');
  const outputDir = path.join(tmpRoot, 'gerber');

  try {
    await fs.access(scriptPath);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(inputPath, JSON.stringify(flattened, null, 2), 'utf8');

    await runPython(scriptPath, inputPath, outputDir, options);

    const zip = new JSZip();
    const entries = await fs.readdir(outputDir, { withFileTypes: true });

    await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const fullPath = path.join(outputDir, entry.name);
          const content = await fs.readFile(fullPath);
          zip.file(entry.name, content);
        })
    );

    return zip.generateAsync({ type: 'nodebuffer' });
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}
