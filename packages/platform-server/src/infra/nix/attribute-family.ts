import semver from 'semver';

export type AttributeFamilyStrategy = {
  id: string;
  matches: (name: string) => boolean;
  derive: (version: string) => string | null;
  fallbacks?: string[];
};

const strategies: AttributeFamilyStrategy[] = [
  {
    id: 'nodejs',
    matches: (name) => /^nodejs(?=$|[-_])/i.test(name) || name === 'nodejs',
    derive: (version) => {
      const coerced = semver.coerce(version);
      if (!coerced) return null;
      const major = coerced.major;
      if (!Number.isFinite(major) || major <= 0) return null;
      return `nodejs_${major}`;
    },
    fallbacks: ['nodejs'],
  },
  {
    id: 'python3',
    matches: (name) => /^python(3)?($|[-_])/i.test(name),
    derive: (version) => {
      const coerced = semver.coerce(version);
      if (!coerced) return null;
      const major = coerced.major;
      const minor = coerced.minor;
      if (major !== 3 || minor == null) return null;
      const paddedMinor = Math.max(0, Math.min(99, minor));
      return `python3${paddedMinor.toString().padStart(2, '0')}`;
    },
    fallbacks: ['python3', 'python'],
  },
  {
    id: 'gcc',
    matches: (name) => /^gcc($|[-_])/i.test(name),
    derive: (version) => {
      const coerced = semver.coerce(version);
      if (!coerced) return null;
      const major = coerced.major;
      if (!Number.isFinite(major) || major <= 0) return null;
      return `gcc${major}`;
    },
    fallbacks: ['gcc'],
  },
  {
    id: 'go',
    matches: (name) => /^(go|golang)($|[-_])/i.test(name),
    derive: (version) => {
      const coerced = semver.coerce(version);
      if (!coerced) return null;
      const major = coerced.major;
      const minor = coerced.minor;
      if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
      return `go_${major}_${minor}`;
    },
    fallbacks: ['go', 'golang'],
  },
];

const sanitizeName = (name: string): string => name.replace(/[^A-Za-z0-9+\-_.]/g, '-');

export function attributeFamilyCandidates(name: string, version: string): string[] {
  const normName = name.trim();
  const seen = new Set<string>();
  const out: string[] = [];

  for (const strategy of strategies) {
    if (!strategy.matches(normName)) continue;
    const derived = strategy.derive(version);
    if (derived) {
      const candidate = sanitizeName(derived);
      if (candidate && !seen.has(candidate)) {
        seen.add(candidate);
        out.push(candidate);
      }
    }
    for (const fallback of strategy.fallbacks ?? []) {
      const candidate = sanitizeName(fallback);
      if (candidate && !seen.has(candidate)) {
        seen.add(candidate);
        out.push(candidate);
      }
    }
  }

  const defaultCandidate = sanitizeName(normName);
  if (defaultCandidate && !seen.has(defaultCandidate)) {
    seen.add(defaultCandidate);
    out.push(defaultCandidate);
  }

  return out;
}

export function registerAttributeFamilyStrategy(strategy: AttributeFamilyStrategy) {
  strategies.push(strategy);
}
