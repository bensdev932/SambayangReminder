import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { isRunningInExpoGo } from 'expo';
import {
  checkForUpdate,
  downloadUpdateApk,
  installUpdateApk,
  getCurrentAppVersion,
  type UpdateCheckResult,
  type DownloadProgressInfo,
} from '../services/update-service';

export interface InAppUpdateModalProps {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  initialCheckResult?: UpdateCheckResult | null;
  onUpdateAvailable?: (result: UpdateCheckResult) => void;
}

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'up_to_date'
  | 'error';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function InAppUpdateModal({
  visible,
  onClose,
  isDark,
  initialCheckResult,
  onUpdateAvailable,
}: InAppUpdateModalProps) {
  const currentVersion = getCurrentAppVersion();
  const [status, setStatus] = useState<UpdateStatus>(() => {
    if (!initialCheckResult) return 'idle';
    if (initialCheckResult.error) return 'error';
    if (initialCheckResult.hasUpdate) return 'available';
    return 'up_to_date';
  });
  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(initialCheckResult ?? null);
  const [progress, setProgress] = useState<DownloadProgressInfo>({
    bytesWritten: 0,
    totalBytes: 0,
    progress: 0,
    percentage: 0,
  });
  const [downloadedUri, setDownloadedUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialCheckResult?.error ?? null);

  const performCheck = useCallback(async () => {
    setStatus('checking');
    setErrorMessage(null);
    try {
      const result = await checkForUpdate();
      setCheckResult(result);

      if (result.error) {
        setStatus('error');
        setErrorMessage(result.error);
      } else if (result.hasUpdate) {
        setStatus('available');
        onUpdateAvailable?.(result);
      } else {
        setStatus('up_to_date');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err?.message || 'Failed to check for updates.');
    }
  }, [onUpdateAvailable]);

  // Trigger check if opened without an existing result
  useEffect(() => {
    let isMounted = true;
    if (visible && !checkResult) {
      const timer = setTimeout(() => {
        if (isMounted) {
          void performCheck();
        }
      }, 0);
      return () => {
        isMounted = false;
        clearTimeout(timer);
      };
    }
  }, [visible, checkResult, performCheck]);

  const handleInstallNow = async (uri: string) => {
    setStatus('installing');
    setErrorMessage(null);

    const res = await installUpdateApk(uri);
    if (!res.success) {
      setStatus('downloaded');
      setErrorMessage(
        res.reason === 'expo_go'
          ? 'Package installation is disabled inside Expo Go. Please build or install a standalone APK.'
          : res.message || 'Failed to launch installer. Please grant unknown app installation permission in Settings.'
      );
    } else {
      // Installation intent was fired successfully
      setStatus('downloaded');
    }
  };

  const handleStartDownload = async () => {
    if (!checkResult?.apkAsset?.downloadUrl) {
      setStatus('error');
      setErrorMessage('No APK file attached to this release yet.');
      return;
    }

    setStatus('downloading');
    setErrorMessage(null);
    setProgress({
      bytesWritten: 0,
      totalBytes: checkResult.apkAsset.size || 0,
      progress: 0,
      percentage: 0,
    });

    try {
      const uri = await downloadUpdateApk(
        checkResult.apkAsset.downloadUrl,
        checkResult.apkAsset.size,
        (p) => setProgress(p)
      );

      setDownloadedUri(uri);
      setStatus('downloaded');

      // Seamlessly invoke native package installer upon completion
      await handleInstallNow(uri);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err?.message || 'Download failed. Please check network connection.');
    }
  };

  const themeCardBg = isDark ? '#111827' : '#FFFFFF';
  const themeTextColor = isDark ? '#F9FAFB' : '#111827';
  const themeSecondaryColor = isDark ? '#9CA3AF' : '#4B5563';
  const themeBorderColor = isDark ? '#1F2937' : '#E5E7EB';
  const isExpoGo = isRunningInExpoGo();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={status === 'downloading' ? undefined : onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: themeCardBg, borderColor: themeBorderColor }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleRow}>
              <View style={styles.iconCircle}>
                <Ionicons name="sparkles" size={20} color="#2563EB" />
              </View>
              <View>
                <Text style={[styles.titleText, { color: themeTextColor }]}>In-App Updater</Text>
                <Text style={[styles.subTitleText, { color: themeSecondaryColor }]}>
                  Native APK Package Installer
                </Text>
              </View>
            </View>

            {status !== 'downloading' && (
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close updater dialog">
                <Ionicons name="close" size={20} color={themeSecondaryColor} />
              </Pressable>
            )}
          </View>

          {/* Expo Go Warning if applicable */}
          {isExpoGo && (
            <View style={styles.expoGoBanner}>
              <Ionicons name="information-circle" size={18} color="#D97706" />
              <Text style={styles.expoGoBannerText}>
                Running in Expo Go. Package installer intents operate exclusively in standalone production builds.
              </Text>
            </View>
          )}

          {/* Version Comparison Card */}
          <View
            style={[
              styles.versionCard,
              { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: themeBorderColor },
            ]}>
            <View style={styles.versionCol}>
              <Text style={[styles.versionLabel, { color: themeSecondaryColor }]}>CURRENT</Text>
              <Text style={[styles.versionValue, { color: themeTextColor }]}>v{currentVersion}</Text>
            </View>

            <View style={styles.versionArrow}>
              <Ionicons name="arrow-forward" size={18} color="#2563EB" />
            </View>

            <View style={styles.versionCol}>
              <Text style={[styles.versionLabel, { color: themeSecondaryColor }]}>LATEST</Text>
              <Text style={[styles.versionValue, { color: '#2563EB' }]}>
                {checkResult?.latestVersion ? `v${checkResult.latestVersion}` : 'Checking...'}
              </Text>
            </View>
          </View>

          {/* Status-specific Content */}
          <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent}>
            {status === 'checking' && (
              <View style={styles.centeredState}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={[styles.stateMessage, { color: themeTextColor }]}>
                  Connecting to GitHub Releases...
                </Text>
                <Text style={[styles.stateSubMessage, { color: themeSecondaryColor }]}>
                  Querying latest tag for Sambayang Reminder
                </Text>
              </View>
            )}

            {status === 'up_to_date' && (
              <View style={styles.centeredState}>
                <View style={[styles.statusIconBadge, { backgroundColor: '#DCFCE7' }]}>
                  <Ionicons name="checkmark-circle" size={36} color="#16A34A" />
                </View>
                <Text style={[styles.stateMessage, { color: themeTextColor }]}>
                  You{"'"}re Up to Date!
                </Text>
                <Text style={[styles.stateSubMessage, { color: themeSecondaryColor }]}>
                  Sambayang Reminder v{currentVersion} is the latest release.
                </Text>
              </View>
            )}

            {(status === 'available' || status === 'downloading' || status === 'downloaded') && (
              <View style={styles.releaseDetails}>
                <View style={styles.releaseHeader}>
                  <Text style={[styles.releaseTitleText, { color: themeTextColor }]}>
                    {checkResult?.releaseTitle || `v${checkResult?.latestVersion}`}
                  </Text>
                  {checkResult?.apkAsset?.size ? (
                    <View style={styles.sizeBadge}>
                      <Ionicons name="cube-outline" size={12} color="#2563EB" />
                      <Text style={styles.sizeBadgeText}>{formatBytes(checkResult.apkAsset.size)}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Release Notes */}
                {checkResult?.releaseNotes ? (
                  <View
                    style={[
                      styles.notesBox,
                      { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: themeBorderColor },
                    ]}>
                    <Text style={[styles.notesHeading, { color: themeSecondaryColor }]}>
                      What{"'"}s New:
                    </Text>
                    <Text style={[styles.notesText, { color: themeTextColor }]}>
                      {checkResult.releaseNotes.trim()}
                    </Text>
                  </View>
                ) : null}

                {/* Download Progress Bar */}
                {status === 'downloading' && (
                  <View style={styles.progressContainer}>
                    <View style={styles.progressLabelRow}>
                      <Text style={[styles.progressTitle, { color: themeTextColor }]}>
                        Downloading Update Binary...
                      </Text>
                      <Text style={styles.progressPercentText}>{progress.percentage}%</Text>
                    </View>

                    <View style={styles.progressBarTrack}>
                      <View style={[styles.progressBarFill, { width: `${progress.percentage}%` }]} />
                    </View>

                    <View style={styles.progressBytesRow}>
                      <Text style={[styles.bytesText, { color: themeSecondaryColor }]}>
                        {formatBytes(progress.bytesWritten)} / {formatBytes(progress.totalBytes)}
                      </Text>
                      <ActivityIndicator size="small" color="#2563EB" />
                    </View>
                  </View>
                )}

                {/* Download Finished Banner */}
                {status === 'downloaded' && (
                  <View style={styles.readyBanner}>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#16A34A" />
                    <Text style={styles.readyBannerText}>
                      APK downloaded successfully. Tap below to launch installer.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {status === 'error' && (
              <View style={styles.centeredState}>
                <View style={[styles.statusIconBadge, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="alert-circle" size={36} color="#DC2626" />
                </View>
                <Text style={[styles.stateMessage, { color: '#DC2626' }]}>Update Check Failed</Text>
                <Text style={[styles.stateSubMessage, { color: themeSecondaryColor }]}>
                  {errorMessage || 'Unable to fetch update details from GitHub API.'}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={[styles.footerRow, { borderTopColor: themeBorderColor }]}>
            {status === 'available' && (
              <Pressable
                onPress={handleStartDownload}
                accessibilityRole="button"
                accessibilityLabel="Download and install update"
                style={({ pressed }) => [
                  styles.primaryActionButton,
                  pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                ]}>
                <LinearGradient
                  colors={['#2563EB', '#1D4ED8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.gradientButtonInner}>
                  <Ionicons name="cloud-download-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.buttonPrimaryText}>Download & Install Now</Text>
                </LinearGradient>
              </Pressable>
            )}

            {status === 'downloaded' && downloadedUri && (
              <Pressable
                onPress={() => handleInstallNow(downloadedUri)}
                accessibilityRole="button"
                accessibilityLabel="Launch Android package installer"
                style={({ pressed }) => [
                  styles.primaryActionButton,
                  pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                ]}>
                <LinearGradient
                  colors={['#16A34A', '#15803D']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.gradientButtonInner}>
                  <Ionicons name="hardware-chip-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.buttonPrimaryText}>Launch Installer</Text>
                </LinearGradient>
              </Pressable>
            )}

            {status === 'downloading' && (
              <View style={styles.downloadingPlaceholder}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={[styles.downloadingText, { color: themeTextColor }]}>
                  Downloading update ({progress.percentage}%)...
                </Text>
              </View>
            )}

            {(status === 'up_to_date' || status === 'error') && (
              <Pressable
                onPress={performCheck}
                accessibilityRole="button"
                accessibilityLabel="Re-check for updates"
                style={({ pressed }) => [
                  styles.secondaryActionButton,
                  { borderColor: themeBorderColor },
                  pressed && { opacity: 0.7 },
                ]}>
                <Ionicons name="refresh-outline" size={17} color={themeTextColor} />
                <Text style={[styles.buttonSecondaryText, { color: themeTextColor }]}>
                  Check Again
                </Text>
              </Pressable>
            )}

            {status !== 'downloading' && (
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Dismiss updater"
                style={({ pressed }) => [styles.dismissButton, pressed && { opacity: 0.6 }]}>
                <Text style={[styles.dismissButtonText, { color: themeSecondaryColor }]}>
                  {status === 'available' ? 'Later' : 'Close'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subTitleText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  closeButton: {
    padding: 6,
    borderRadius: 14,
  },
  expoGoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 10,
  },
  expoGoBannerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
    lineHeight: 15,
  },
  versionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  versionCol: {
    alignItems: 'center',
  },
  versionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  versionValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  versionArrow: {
    paddingHorizontal: 8,
  },
  bodyScroll: {
    maxHeight: 280,
  },
  bodyContent: {
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  centeredState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  statusIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stateMessage: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  stateSubMessage: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 17,
  },
  releaseDetails: {
    gap: 12,
  },
  releaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  releaseTitleText: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  sizeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  sizeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  notesBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    maxHeight: 140,
  },
  notesHeading: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  notesText: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 18,
  },
  progressContainer: {
    gap: 6,
    marginTop: 6,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressPercentText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 4,
  },
  progressBytesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bytesText: {
    fontSize: 11,
    fontWeight: '500',
  },
  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    padding: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  readyBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
  },
  footerRow: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    gap: 10,
  },
  primaryActionButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  gradientButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  buttonPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  buttonSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  downloadingPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  downloadingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dismissButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  dismissButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
