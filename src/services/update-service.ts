import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

import {
  parseSemVer,
  compareSemVer,
  isNewerVersion,
  type SemVer,
} from './semver';

export { parseSemVer, compareSemVer, isNewerVersion, type SemVer };

export const GITHUB_REPO_OWNER = 'bensdev932';
export const GITHUB_REPO_NAME = 'SambayangReminder';
export const FALLBACK_APP_VERSION = '1.0.2';

export interface UpdateAssetInfo {
  name: string;
  downloadUrl: string;
  size: number;
  contentType: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
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
  reason?: 'unsupported_platform' | 'expo_go' | 'file_not_found' | 'intent_failed';
  message?: string;
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
 * Queries the GitHub API for the latest published release and validates if an update is available.
 */
export async function checkForUpdate(options?: CheckUpdateOptions): Promise<UpdateCheckResult> {
  const owner = options?.owner ?? GITHUB_REPO_OWNER;
  const repo = options?.repo ?? GITHUB_REPO_NAME;
  const currentVersion = options?.currentVersion ?? getCurrentAppVersion();
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/releases/latest?_t=${Date.now()}`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'SambayangReminder-InAppUpdater',
    'X-GitHub-Api-Version': '2022-11-28',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
  };

  if (options?.githubToken) {
    headers['Authorization'] = `Bearer ${options.githubToken}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
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

    // Locate Android APK binary among release assets
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const rawApkAsset = assets.find(
      (asset: any) =>
        typeof asset.name === 'string' &&
        asset.name.toLowerCase().endsWith('.apk') &&
        Boolean(asset.browser_download_url)
    );

    let apkAsset: UpdateAssetInfo | null = null;
    if (rawApkAsset) {
      apkAsset = {
        name: rawApkAsset.name,
        downloadUrl: rawApkAsset.browser_download_url,
        size: typeof rawApkAsset.size === 'number' ? rawApkAsset.size : 0,
        contentType: rawApkAsset.content_type || 'application/vnd.android.package-archive',
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
 * Downloads the update APK to the local cache directory with live progress tracking.
 * Returns the local file:// URI of the downloaded APK.
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
    // Directory might be clean, ignore deletion failure
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

  return result.uri;
}

/**
 * Launches the native Android package installer using Android FileProvider and ACTION_VIEW Intent.
 * Does not redirect the user to an external web browser.
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
