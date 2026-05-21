import { execSync } from 'node:child_process';
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
    execSync('ffmpega -version', { stdio: 'ignore' });
  } catch (error) {
    console.error('✗ FFmpeg is NOT installed or NOT in your system PATH.');
    exit(1);
  }
}
