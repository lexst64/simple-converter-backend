export function requireEnv(name: string): string {
  if (!process.env[name]) {
    throw new Error(`${name} is required`);
  }

  return process.env[name];
}
