export function appVersionLabel(build: string = 'development'): string {
  return !build || build === 'development' ? 'Development version' : `Version ${build.slice(0, 7)}`;
}
