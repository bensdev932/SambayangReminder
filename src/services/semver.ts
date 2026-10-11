export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

/**
 * Parses a semantic version string into major, minor, patch, and prerelease segments.
 */
export function parseSemVer(raw: string | null | undefined): SemVer | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/^[vV]/, '');
  const withoutBuild = cleaned.split('+')[0];
  const parts = withoutBuild.split('-');
  const versionNums = parts[0].split('.').map((n) => parseInt(n, 10));

  if (versionNums.some(isNaN) || versionNums.length === 0) {
    return null;
  }

  return {
    major: versionNums[0] ?? 0,
    minor: versionNums[1] ?? 0,
    patch: versionNums[2] ?? 0,
    prerelease: parts.slice(1).join('-') || undefined,
  };
}

/**
 * Compares two semantic version strings.
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 */
export function compareSemVer(
  v1: string | null | undefined,
  v2: string | null | undefined
): number {
  const p1 = parseSemVer(v1);
  const p2 = parseSemVer(v2);

  if (!p1 && !p2) return 0;
  if (!p1) return -1;
  if (!p2) return 1;

  if (p1.major !== p2.major) return p1.major > p2.major ? 1 : -1;
  if (p1.minor !== p2.minor) return p1.minor > p2.minor ? 1 : -1;
  if (p1.patch !== p2.patch) return p1.patch > p2.patch ? 1 : -1;

  // Release without prerelease takes precedence over a prerelease of the same version
  if (!p1.prerelease && p2.prerelease) return 1;
  if (p1.prerelease && !p2.prerelease) return -1;
  if (p1.prerelease && p2.prerelease) {
    return p1.prerelease.localeCompare(p2.prerelease);
  }

  return 0;
}

/**
 * Checks whether remote release version is newer than local running version.
 */
export function isNewerVersion(
  remoteTag: string | null | undefined,
  localVersion: string | null | undefined
): boolean {
  return compareSemVer(remoteTag, localVersion) > 0;
}
