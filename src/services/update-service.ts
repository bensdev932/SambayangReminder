import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Crypto from 'expo-crypto';

import {
  parseSemVer,
  compareSemVer,
  isNewerVersion,
  type SemVer,
} from './semver';

export { parseSemVer, compareSemVer, isNewerVersion, type SemVer };

export const GITHUB_REPO_OWNER = 'bensdev932';
export const GITHUB_REPO_NAME = 'SambayangReminder';
export const FALLBACK_APP_VERSION = '1.0.6';

export interface UpdateAssetInfo {
  name: string;
  downloadUrl: string;
  size: number;
  contentType: string;
  sha256?: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  latestVersionCode?: number;
  releaseTitle: string;
  releaseNotes: string;
  publishedAt: string;
  apkAsset: UpdateAssetInfo | null;
  isRateLimited?: boolean;
  error?: string;
}

export interface DownloadProgressInfo {
  bytesWritten: number;
  totalBytes: number;
  progress: number; // 0 to 1
  percentage: number; // 0 to 100
}

export interface InstallResult {
  success: boolean;
  reason?: 'unsupported_platform' | 'expo_go' | 'file_not_found' | 'intent_failed' | 'integrity_check_failed';
  message?: string;
}

export interface IntegrityVerificationResult {
  valid: boolean;
  actualHash: string;
  expectedHash?: string;
  error?: string;
}

/**
 * Returns the currently executing application version.
 */
export function getCurrentAppVersion(): string {
  return (
    Constants.expoConfig?.version ||
    (Constants.manifest2?.extra as { expoClient?: { version?: string } } | undefined)?.expoClient?.version ||
    FALLBACK_APP_VERSION
  );
}

export interface CheckUpdateOptions {
  owner?: string;
  repo?: string;
  githubToken?: string;
  currentVersion?: string;
}

/**
 * Queries version manifests and releases to detect available updates.
 * Implements Multi-Modal Discovery & Aggressive Cache Invalidation per universal-release-and-ci-guard.
 * Vector 1: Remote version.json (Rate-limit immune, carries SHA-256 checksum and versionCode).
 * Vector 2: GitHub Releases API (with fallback checksums.txt parsing).
 */
export async function checkForUpdate(options?: CheckUpdateOptions): Promise<UpdateCheckResult> {
  const owner = options?.owner ?? GITHUB_REPO_OWNER;
  const repo = options?.repo ?? GITHUB_REPO_NAME;
  const currentVersion = options?.currentVersion ?? getCurrentAppVersion();

  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': 'SambayangReminder-InAppUpdater',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
  };

  if (options?.githubToken) {
    headers['Authorization'] = `Bearer ${options.githubToken}`;
  }

  // 1. Primary Vector: Query remote version.json (bypasses GitHub API 403 rate limits)
  const rawVersionUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/version.json?_t=${Date.now()}`;
  try {
    const rawRes = await fetch(rawVersionUrl, { method: 'GET', headers });
    if (rawRes.ok) {
      const vJson = await rawRes.json();
      if (vJson && typeof vJson.version === 'string') {
        const hasUpdate = isNewerVersion(vJson.version, currentVersion);
        const apkAsset: UpdateAssetInfo | null = vJson.downloadUrl
          ? {
              name: vJson.apkFileName || 'SambayangReminder.apk',
              downloadUrl: vJson.downloadUrl,
              size: typeof vJson.size === 'number' ? vJson.size : 0,
              contentType: 'application/vnd.android.package-archive',
              sha256:
                typeof vJson.sha256 === 'string' && vJson.sha256.length === 64
                  ? vJson.sha256.toLowerCase()
                  : undefined,
            }
          : null;

        return {
          hasUpdate,
          currentVersion,
          latestVersion: vJson.version.replace(/^[vV]/, ''),
          latestVersionCode: vJson.versionCode,
          releaseTitle: `Sambayang Reminder v${vJson.version}`,
          releaseNotes: vJson.releaseNotes || 'New release available with performance improvements and bug fixes.',
          publishedAt: vJson.publishedAt || new Date().toISOString(),
          apkAsset,
        };
      }
    }
  } catch {
    // Continue smoothly to GitHub Releases API on network/raw content error
  }

  // 2. Secondary Vector: Query GitHub Releases API
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/releases/latest?_t=${Date.now()}`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        ...headers,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.status === 403) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      const resetEpoch = response.headers.get('x-ratelimit-reset');
      const resetMinutes = resetEpoch
        ? Math.max(1, Math.ceil((parseInt(resetEpoch, 10) * 1000 - Date.now()) / 60000))
        : 60;

      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
        releaseTitle: '',
        releaseNotes: '',
        publishedAt: '',
        apkAsset: null,
        isRateLimited: true,
        error: `GitHub API rate limit exceeded (remaining: ${remaining ?? 0}). Try again in ~${resetMinutes} min.`,
      };
    }

    if (!response.ok) {
      if (response.status === 404) {
        return {
          hasUpdate: false,
          currentVersion,
          latestVersion: currentVersion,
          releaseTitle: 'No Releases Found',
          releaseNotes: '',
          publishedAt: '',
          apkAsset: null,
          error: `No published releases found on repository ${owner}/${repo}.`,
        };
      }
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
        releaseTitle: '',
        releaseNotes: '',
        publishedAt: '',
        apkAsset: null,
        error: `GitHub API returned HTTP status ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const tagName: string = data.tag_name || '';
    const releaseTitle: string = data.name || tagName;
    const releaseNotes: string = data.body || '';
    const publishedAt: string = data.published_at || '';

    // Locate Android APK binary and checksums.txt among release assets
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const rawApkAsset = assets.find(
      (asset: any) =>
        typeof asset.name === 'string' &&
        asset.name.toLowerCase().endsWith('.apk') &&
        Boolean(asset.browser_download_url)
    );

    const checksumAsset = assets.find(
      (asset: any) =>
        typeof asset.name === 'string' &&
        asset.name.toLowerCase() === 'checksums.txt' &&
        Boolean(asset.browser_download_url)
    );

    let extractedSha256: string | undefined;
    if (checksumAsset?.browser_download_url) {
      try {
        const cRes = await fetch(`${checksumAsset.browser_download_url}?_t=${Date.now()}`, { headers });
        if (cRes.ok) {
          const cText = await cRes.text();
          const match = cText.match(/([a-fA-F0-9]{64})\s+.*SambayangReminder.*\.apk/);
          if (match?.[1]) {
            extractedSha256 = match[1].toLowerCase();
          }
        }
      } catch {
        // Non-critical checksum fetch failure
      }
    }

    let apkAsset: UpdateAssetInfo | null = null;
    if (rawApkAsset) {
      apkAsset = {
        name: rawApkAsset.name,
        downloadUrl: rawApkAsset.browser_download_url,
        size: typeof rawApkAsset.size === 'number' ? rawApkAsset.size : 0,
        contentType: rawApkAsset.content_type || 'application/vnd.android.package-archive',
        sha256: extractedSha256,
      };
    }

    const hasUpdate = isNewerVersion(tagName, currentVersion);

    return {
      hasUpdate,
      currentVersion,
      latestVersion: tagName.replace(/^[vV]/, ''),
      releaseTitle,
      releaseNotes,
      publishedAt,
      apkAsset,
    };
  } catch (error: any) {
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseTitle: '',
      releaseNotes: '',
      publishedAt: '',
      apkAsset: null,
      error: error?.message || 'Failed to connect to update server.',
    };
  }
}

/**
 * Downloads the update APK to local cache with live progress tracking.
 * Strictly enforces HTTP 200 validation before returning the file URI.
 */
export async function downloadUpdateApk(
  downloadUrl: string,
  expectedSize?: number,
  onProgress?: (progress: DownloadProgressInfo) => void
): Promise<string> {
  const localApkPath = `${FileSystem.cacheDirectory}SambayangReminder-update.apk`;

  // Safely clean up any previously cached installer
  try {
    const fileInfo = await FileSystem.getInfoAsync(localApkPath);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(localApkPath, { idempotent: true });
    }
  } catch {
    // Directory clean, proceed
  }

  const downloadResumable = FileSystem.createDownloadResumable(
    downloadUrl,
    localApkPath,
    {
      headers: {
        Accept: 'application/octet-stream',
        'User-Agent': 'SambayangReminder-InAppUpdater',
      },
    },
    (downloadProgress) => {
      const bytesWritten = downloadProgress.totalBytesWritten;
      const totalBytes =
        downloadProgress.totalBytesExpectedToWrite > 0
          ? downloadProgress.totalBytesExpectedToWrite
          : expectedSize && expectedSize > 0
            ? expectedSize
            : 0;

      const progress = totalBytes > 0 ? Math.min(1, Math.max(0, bytesWritten / totalBytes)) : 0;
      onProgress?.({
        bytesWritten,
        totalBytes,
        progress,
        percentage: Math.round(progress * 100),
      });
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result?.uri) {
    throw new Error('Download failed: No output URI returned by download engine.');
  }

  // Strict Fail-Closed Check: Verify HTTP 200 status code
  if (result.status !== 200) {
    try {
      await FileSystem.deleteAsync(result.uri, { idempotent: true });
    } catch {
      // Ignored
    }
    throw new Error(
      `Download failed: Server responded with HTTP status ${result.status} (expected 200 OK).`
    );
  }

  return result.uri;
}

/**
 * Computes the cryptographic SHA-256 hash of a local file.
 * Prioritizes native Android stream processing (zero memory leak), falling back to WebCrypto/expo-crypto.
 */
export async function computeFileSha256(fileUri: string): Promise<string> {
  // 1. Try Native Android streaming SHA-256
  const adhanModule = NativeModules?.AdhanAlarmModule;
  if (
    Platform.OS === 'android' &&
    !isRunningInExpoGo() &&
    typeof adhanModule?.getFileSha256 === 'function'
  ) {
    try {
      const hash: string = await adhanModule.getFileSha256(fileUri);
      if (typeof hash === 'string' && hash.length === 64) {
        return hash.toLowerCase();
      }
    } catch (nativeErr) {
      console.warn('[UpdateService] Native SHA-256 fallback to JS:', nativeErr);
    }
  }

  // 2. Decode raw file bytes and hash with Crypto.digest / WebCrypto
  const base64Content = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  let binaryString: string;
  if (typeof atob === 'function') {
    binaryString = atob(base64Content);
  } else {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let str = '';
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < base64Content.length; i++) {
      const c = base64Content[i];
      if (c === '=') break;
      const val = chars.indexOf(c);
      if (val === -1) continue;
      buffer = (buffer << 6) | val;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        str += String.fromCharCode((buffer >> bits) & 0xff);
      }
    }
    binaryString = str;
  }
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  if (typeof Crypto?.digest === 'function') {
    const digestBuffer = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
    return Array.from(new Uint8Array(digestBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toLowerCase();
  }

  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const digestBuffer = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digestBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toLowerCase();
  }

  throw new Error('No cryptographic SHA-256 digest engine available in runtime.');
}

/**
 * Verifies the cryptographic SHA-256 integrity of the downloaded APK.
 * If checksum does not match expected, deletes the corrupted file immediately and rejects.
 */
export async function verifyApkIntegrity(
  fileUri: string,
  expectedSha256?: string
): Promise<IntegrityVerificationResult> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists || fileInfo.size === 0) {
      return {
        valid: false,
        actualHash: '',
        expectedHash: expectedSha256,
        error: 'Downloaded APK file does not exist or has 0 bytes in cache storage.',
      };
    }

    const actualHash = await computeFileSha256(fileUri);

    if (expectedSha256 && expectedSha256.trim().length === 64) {
      const cleanExpected = expectedSha256.trim().toLowerCase();
      if (actualHash !== cleanExpected) {
        // Discard corrupted or tampered binary immediately to protect device
        try {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        } catch {
          // Ignored
        }

        return {
          valid: false,
          actualHash,
          expectedHash: cleanExpected,
          error: `SHA-256 checksum mismatch. Expected ${cleanExpected}, but got ${actualHash}. Binary discarded.`,
        };
      }
    }

    return {
      valid: true,
      actualHash,
      expectedHash: expectedSha256?.trim().toLowerCase(),
    };
  } catch (err: any) {
    return {
      valid: false,
      actualHash: '',
      expectedHash: expectedSha256,
      error: err?.message || 'Failed during SHA-256 integrity computation.',
    };
  }
}

/**
 * Launches the native Android package installer using Android FileProvider and ACTION_VIEW Intent.
 */
export async function installUpdateApk(fileUri: string): Promise<InstallResult> {
  if (Platform.OS !== 'android') {
    return {
      success: false,
      reason: 'unsupported_platform',
      message: 'Direct APK installation is only supported on Android devices.',
    };
  }

  if (isRunningInExpoGo()) {
    return {
      success: false,
      reason: 'expo_go',
      message:
        'Package installer intents cannot replace the running Expo Go client. Please run this in a standalone or development build.',
    };
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      return {
        success: false,
        reason: 'file_not_found',
        message: 'Downloaded APK file was not found in cache storage.',
      };
    }

    // Convert file:// URI to secure FileProvider content:// URI
    const contentUri = await FileSystem.getContentUriAsync(fileUri);

    // Launch Android Package Installer via ACTION_VIEW
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: 'application/vnd.android.package-archive',
      flags: 1, // Intent.FLAG_GRANT_READ_URI_PERMISSION
    });

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      reason: 'intent_failed',
      message: error?.message || 'Failed to launch Android package installer.',
    };
  }
}
