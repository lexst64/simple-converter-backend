import { execSync } from 'node:child_process';
import path from 'node:path';
import { exit } from 'node:process';

export function requireEnv(name: string): string {
  if (!process.env[name]) {
    console.error(`✗ ${name} env variable is NOT found`);
    exit(1);
  }

  return process.env[name];
}

export function requireFfmpeg(): void {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
  } catch (error) {
    console.error('✗ FFmpeg is NOT installed or NOT in your system PATH.');
    exit(1);
  }
}

export function getFilenameExt(filename: string): string {
  return path.extname(filename).slice(1);
}
