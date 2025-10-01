export const id = (scope, action, ...rest) => `casino:${scope}:${action}:${rest.join(':')}`;
export function parseId(customId) {
  const [ns, scope, action, ...rest] = customId.split(':');
  return { ns, scope, action, rest };
}
