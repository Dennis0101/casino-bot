export const makeId = (scope: string, action: string, ...rest: string[]) =>
  `casino:${scope}:${action}:${rest.join(':')}`;

export function parseId(customId: string) {
  const [ns, scope, action, ...rest] = customId.split(':');
  return { ns, scope, action, rest };
}
