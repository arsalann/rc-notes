export function getMotherDuckToken(): string | null {
  return process.env.MOTHERDUCK_NOTEBOOK_RC || null;
}
