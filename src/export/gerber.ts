import JSZip from 'jszip';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { FlattenedPcb } from '@/types/pcb';

const execFileAsync = promisify(execFile);

async function runPython(
  scriptPath: string,
  inputPath: string,
  outputDir: string
) {
  const commands = ['python3', 'python'];
  let lastError: unknown;

  for (const command of commands) {
    try {
      await execFileAsync(command, [
        scriptPath,
        '--input',
        inputPath,
        '--output',
        outputDir,
      ]);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    const errorWithStreams = lastError as Error & {
      stdout?: string;
      stderr?: string;
    };
    const parts = [
      `Unable to run Python Gerber generator at ${scriptPath}.`,
      `Cause: ${lastError.message}`,
      errorWithStreams.stderr
        ? `stderr: ${errorWithStreams.stderr.trim()}`
        : '',
      errorWithStreams.stdout
        ? `stdout: ${errorWithStreams.stdout.trim()}`
        : '',
    ].filter(Boolean);

    throw new Error(parts.join(' | '));
  }

  throw new Error('Unable to run Python Gerber generator.');
}

export async function generateGerberZip(
  flattened: FlattenedPcb
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

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(inputPath, JSON.stringify(flattened, null, 2), 'utf8');

  await runPython(scriptPath, inputPath, outputDir);

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
}
