export function appVersionLabel(build: string = 'development', version?: string): string {
  if (!build || build === 'development') return 'Development version';
  const commit = build.slice(0, 7);
  return version ? `Version ${version} · ${commit}` : `Version ${commit}`;
}
