export function getQueryKey(path: string[], args?: Record<string, unknown>): unknown[] {
  return [...path, args ?? {}];
}

export function parseRouteToPath(route: string): string[] {
  return route.split('.');
}
