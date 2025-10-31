// Small namespace helper to strip the server namespace prefix from a name.
// Example: stripNsPrefix('ns', 'ns_toolA') => 'toolA'; stripNsPrefix('ns', 'toolA') => 'toolA'
export function stripNsPrefix(namespace: string, name: string): string {
  const prefix = namespace ? `${namespace}_` : '';
  return prefix && name.startsWith(prefix) ? name.substring(prefix.length) : name;
}

