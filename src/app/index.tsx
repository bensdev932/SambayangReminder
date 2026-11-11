import React, { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { MonthWindowCountdown } from '../components/month-window-countdown';
import { PostSalahDuaModal } from '../components/post-salah-dua-modal';
import { InAppUpdateModal } from '../components/in-app-update-modal';
import {
  checkForUpdate,
  getCurrentAppVersion,
  type UpdateCheckResult,
} from '../services/update-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSharedPrayerAlertCoordinator } from '../adapters/expo-prayer-platform-adapter';
import {
  computeDailyPrayerWindow,
  evaluatePrayerArrival,
  formatHijriDate,
  formatPrayerTime,
  getIslamicEventInfo,
  type PrayerName,
} from '../domain/prayer-calendar';

// Local Adhan audio files
const standardAdhanAudio = require('../../assets/audio/adhan.mp3');
const fajrAdhanAudio = require('../../assets/audio/fajr_adhan.mp3');

// Baseline fallback coordinates (Manila, Philippines)
const FALLBACK_LOCATION = {
  latitude: 14.5995,
  longitude: 120.9842,
  name: 'Manila, Philippines',
};

interface PrayerItem {
  id: PrayerName;
  name: string;
  time: Date;
  formattedTime: string;
  iconName: keyof typeof Ionicons.glyphMap;
}

interface WeatherData {
  temperature: number;
  weatherCode: number;
  conditionLabel: string;
  iconName: keyof typeof Ionicons.glyphMap;
}

function getWeatherInfo(code: number): { label: string; icon: keyof typeof Ionicons.glyphMap } {
  switch (code) {
    case 0:
      return { label: 'Clear Sky', icon: 'sunny' };
    case 1:
      return { label: 'Mainly Clear', icon: 'partly-sunny' };
    case 2:
      return { label: 'Partly Cloudy', icon: 'partly-sunny' };
    case 3:
      return { label: 'Overcast', icon: 'cloudy' };
    case 45:
    case 48:
      return { label: 'Foggy', icon: 'cloud' };
    case 51:
    case 53:
    case 55:
      return { label: 'Drizzle', icon: 'rainy' };
    case 61:
    case 63:
    case 65:
      return { label: 'Rain', icon: 'rainy' };
    case 71:
    case 73:
    case 75:
    case 77:
      return { label: 'Snow', icon: 'snow' };
    case 80:
    case 81:
    case 82:
      return { label: 'Showers', icon: 'rainy' };
    case 95:
    case 96:
    case 99:
      return { label: 'Thunderstorm', icon: 'thunderstorm' };
    default:
      return { label: 'Partly Cloudy', icon: 'partly-sunny' };
  }
}

function formatGregorianDate(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}

function formatAudioDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [coords, setCoords] = useState<{ latitude: number; longitude: number }>({
    latitude: FALLBACK_LOCATION.latitude,
    longitude: FALLBACK_LOCATION.longitude,
  });
  const [locationName, setLocationName] = useState<string>(FALLBACK_LOCATION.name);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState<boolean>(true);
  const [isDuaModalVisible, setIsDuaModalVisible] = useState<boolean>(false);

  // Audio players from expo-audio (Standard Adhan and Fajr Adhan)
  const standardPlayer = useAudioPlayer(standardAdhanAudio);
  const fajrPlayer = useAudioPlayer(fajrAdhanAudio);
  const standardStatus = useAudioPlayerStatus(standardPlayer);
  const fajrStatus = useAudioPlayerStatus(fajrPlayer);

  // Track currently playing prayer name
  const [localPlayingPrayer, setLocalPlayingPrayer] = useState<PrayerName | null>(null);
  const currentAppVersion = getCurrentAppVersion();
  const [isUpdateModalVisible, setIsUpdateModalVisible] = useState<boolean>(false);
  const [updateCheckResult, setUpdateCheckResult] = useState<UpdateCheckResult | null>(null);
  const [isUpdateBannerVisible, setIsUpdateBannerVisible] = useState<boolean>(false);

  // Alert Coordinator & Android Reliability state (React 19 external store)
  const coordinator = useMemo(() => getSharedPrayerAlertCoordinator(), []);
  const alertSnapshot = useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getSnapshot,
    coordinator.getSnapshot
  );

  const currentlyPlayingPrayer: PrayerName | null = alertSnapshot.nativePlayback.isPlaying
    ? alertSnapshot.nativePlayback.prayerName
    : localPlayingPrayer;

  const [isLocationResolved, setIsLocationResolved] = useState<boolean>(false);
  const [isReliabilityExpanded, setIsReliabilityExpanded] = useState<boolean>(false);

  const reliabilityStatus = alertSnapshot.readiness;
  const isBatteryBannerDismissed = alertSnapshot.bannerDismissed;
  const isNativeAdhanPlaying = alertSnapshot.nativePlayback.isPlaying;
  const isTestAlarmPending = alertSnapshot.testAlarm.pending;
  const testAlarmMessage = alertSnapshot.testAlarm.message;

  // Connect coordinator for native playback, foreground transitions, and notification taps
  useEffect(() => {
    const disconnect = coordinator.connect();
    const unsubscribeTap = coordinator.onNotificationTap((tap) => {
      if (tap.type === 'post_salah_dua') {
        setIsDuaModalVisible(true);
      } else if (tap.type === 'adhan_prayer') {
        setLocalPlayingPrayer(tap.prayerName);
        try {
          if (tap.prayerName === 'Fajr') {
            standardPlayer.pause();
            standardPlayer.seekTo(0);
            fajrPlayer.seekTo(0);
            fajrPlayer.play();
          } else {
            fajrPlayer.pause();
            fajrPlayer.seekTo(0);
            standardPlayer.seekTo(0);
            standardPlayer.play();
          }
        } catch (err) {
          console.warn('[Notifications] Failed to start Adhan playback on notification response:', err);
        }
      }
    });

    return () => {
      unsubscribeTap();
      disconnect();
    };
  }, [coordinator, standardPlayer, fajrPlayer]);

  const allReliabilityChecksPassed = reliabilityStatus.allPassed;

  const handleFixNotifications = async () => {
    await coordinator.remediate('notifications');
  };

  const handleFixExactAlarms = async () => {
    await coordinator.remediate('exact_alarm');
  };

  const handleFixFullScreenIntent = async () => {
    await coordinator.remediate('full_screen_intent');
  };

  const handleRequestBatteryOptimization = async () => {
    await coordinator.remediate('battery_optimization');
  };

  const handleOpenOemBackgroundSettings = async () => {
    await coordinator.remediate('oem_background');
  };

  const handleDismissBatteryBanner = async () => {
    await coordinator.dismissReadinessBanner();
    setIsReliabilityExpanded(false);
  };

  const handleTestNativeAlarm = async () => {
    const outcome = await coordinator.triggerTestAlarm();
    if (!outcome.scheduled && outcome.reason === 'native_unavailable') {
      Alert.alert(
        'Native Alarm Requires Android APK Build',
        'Install the compiled Android APK (not Expo Go) to test native AlarmManager & lockscreen Adhan delivery.'
      );
    }
  };

  // Check for updates in the background on startup
  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        const result = await checkForUpdate();
        if (isMounted) {
          setUpdateCheckResult(result);
          if (result.hasUpdate && result.latestVersion) {
            const dismissedKey = `@sambayang_update_dismissed_${result.latestVersion}`;
            const dismissed = await AsyncStorage.getItem(dismissedKey);
            if (dismissed !== 'true') {
              setIsUpdateBannerVisible(true);
            }
          }
        }
      } catch {
        // Fallback gracefully on network error
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleDismissUpdate = async () => {
    try {
      if (updateCheckResult?.latestVersion) {
        await AsyncStorage.setItem(
          `@sambayang_update_dismissed_${updateCheckResult.latestVersion}`,
          'true'
        );
      }
      setIsUpdateBannerVisible(false);
    } catch {
      setIsUpdateBannerVisible(false);
    }
  };

  const handleApplyUpdate = () => {
    setIsUpdateModalVisible(true);
  };

  // Persistent tracking of last auto-played prayer key: "YYYY-MM-DD-PrayerName"
  const lastAutoPlayedKey = useRef<string | null>(null);
  const wasAudioPlayingRef = useRef<boolean>(false);

  // Configure audio mode on mount
  useEffect(() => {
    void (async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'doNotMix',
        });
      } catch {
        // Fallback gracefully
      }
    })();
  }, []);



  // Keep current time updated every second for live countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);



  // Fetch location & reverse geocode
  const fetchLocationAndWeather = useCallback(async () => {
    let lat = FALLBACK_LOCATION.latitude;
    let lng = FALLBACK_LOCATION.longitude;
    let resolvedName = FALLBACK_LOCATION.name;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
        setCoords({ latitude: lat, longitude: lng });

        try {
          const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          if (rev && rev.length > 0) {
            const first = rev[0];
            const city =
              first.city || first.subregion || first.district || first.region || 'Philippines';
            const country = first.country || 'Philippines';
            resolvedName = `${city}, ${country}`;
          }
        } catch {
          resolvedName = `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;
        }
      }
      } catch {
        // Use fallback coordinates smoothly
      } finally {
        setIsLocationResolved(true);
      }

      setLocationName(resolvedName);

    // Fetch Open-Meteo weather
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code`
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.current) {
          const temp = Math.round(data.current.temperature_2m);
          const code = data.current.weather_code ?? 0;
          const { label, icon } = getWeatherInfo(code);
          setWeather({
            temperature: temp,
            weatherCode: code,
            conditionLabel: label,
            iconName: icon,
          });
        }
      }
    } catch {
      // Keep previous weather or null gracefully
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    void (async () => {
      if (!isCancelled) {
        await fetchLocationAndWeather();
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [fetchLocationAndWeather]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.allSettled([
      fetchLocationAndWeather(),
      (async () => {
        try {
          const result = await checkForUpdate();
          setUpdateCheckResult(result);
          if (result.hasUpdate && result.latestVersion) {
            setIsUpdateBannerVisible(true);
          }
        } catch {
          // Ignore network errors gracefully on pull-to-refresh
        }
      })(),
    ]);
    setIsRefreshing(false);
  }, [fetchLocationAndWeather]);

  // Stable calendar date key (e.g. "2026-10-18") so prayer times do not thrash every second
  const calendarDateKey = `${currentTime.getFullYear()}-${String(currentTime.getMonth() + 1).padStart(2, '0')}-${String(currentTime.getDate()).padStart(2, '0')}`;

  // 1. Daily Prayer Times (Today & Tomorrow)
  // Computed using Muslim World League + Shafi madhab via pure prayer-calendar domain.
  // Memoized strictly on coordinates and calendar date key (changes at midnight), NOT on 1-second clock!
  const dailyPrayers = useMemo(() => {
    const window = computeDailyPrayerWindow(coords, calendarDateKey);

    const prayerIconMap: Record<PrayerName, keyof typeof Ionicons.glyphMap> = {
      Fajr: 'sunny-outline',
      Dhuhr: 'sunny',
      Asr: 'partly-sunny-outline',
      Maghrib: 'cloudy-night-outline',
      Isha: 'moon-outline',
    };

    const prayersList: PrayerItem[] = window.prayersList.map((p) => ({
      id: p.name,
      name: p.name,
      time: p.time,
      formattedTime: p.formattedTime,
      iconName: prayerIconMap[p.name],
    }));

    return {
      window,
      prayersList,
      tomorrowPrayerMap: window.tomorrowPrayerMap,
      tomorrowPrayers: window.tomorrowPrayerMap,
    };
  }, [coords, calendarDateKey]);

  // 2. Dynamic live countdown & upcoming prayer cycle (updated per second with currentTime)
  const prayerData = useMemo(() => {
    const { prayersList, tomorrowPrayers } = dailyPrayers;
    const nowMs = currentTime.getTime();

    // Determine upcoming Fard prayer
    let nextPrayerItem: PrayerItem | null = null;
    for (const item of prayersList) {
      if (nowMs < item.time.getTime()) {
        nextPrayerItem = item;
        break;
      }
    }

    // If after Isha, next prayer is Fajr tomorrow
    const targetTime = nextPrayerItem ? nextPrayerItem.time : tomorrowPrayers.Fajr;
    const upcomingName: PrayerName = nextPrayerItem ? nextPrayerItem.id : 'Fajr';

    // Countdown calculation
    const diffMs = Math.max(0, targetTime.getTime() - nowMs);
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const countdownString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
      2,
      '0'
    )}:${String(seconds).padStart(2, '0')} remaining time`;

    // Dynamic gradient colors matching current prayer cycle
    let gradientColors: [string, string, ...string[]] = ['#1D4ED8', '#2563EB', '#38BDF8'];
    switch (upcomingName) {
      case 'Fajr':
        gradientColors = ['#1E1B4B', '#312E81', '#4F46E5'];
        break;
      case 'Dhuhr':
        gradientColors = ['#1E40AF', '#2563EB', '#38BDF8'];
        break;
      case 'Asr':
        gradientColors = ['#0369A1', '#0284C7', '#38BDF8'];
        break;
      case 'Maghrib':
        gradientColors = ['#7C2D12', '#C2410C', '#7C3AED'];
        break;
      case 'Isha':
        gradientColors = ['#0F172A', '#1E1B4B', '#1E293B'];
        break;
    }

    return {
      prayersList,
      upcomingName,
      targetTime,
      totalSeconds,
      countdownString,
      gradientColors,
    };
  }, [dailyPrayers, currentTime]);

  const isStandardPlaying = Boolean(standardStatus?.playing);
  const isFajrPlaying = Boolean(fajrStatus?.playing);
  const isAudioPlaying = isStandardPlaying || isFajrPlaying || isNativeAdhanPlaying;

  const activePlayer = isFajrPlaying
    ? fajrPlayer
    : isStandardPlaying
    ? standardPlayer
    : currentlyPlayingPrayer === 'Fajr'
    ? fajrPlayer
    : standardPlayer;

  const activePlayerStatus = isFajrPlaying
    ? fajrStatus
    : isStandardPlaying
    ? standardStatus
    : currentlyPlayingPrayer === 'Fajr'
    ? fajrStatus
    : standardStatus;

  // Islamic Event Countdown data (Ramadan -> Eid al-Fitr -> Eid al-Adha)
  const todayDateString = currentTime.toDateString();
  const islamicEventData = useMemo(() => {
    const raw = getIslamicEventInfo(new Date(todayDateString));
    const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
      ramadan_countdown: 'moon',
      eid_fitr_countdown: 'sparkles',
      eid_fitr_celebration: 'gift',
      eid_adha_countdown: 'star',
    };
    return {
      ...raw,
      iconName: iconMap[raw.eventToken] || 'moon',
    };
  }, [todayDateString]);

  // Synchronize single authoritative alarm queue + post-Salah Du'a reminders via coordinator
  useEffect(() => {
    void coordinator.syncSchedule({
      enabled: isNotificationsEnabled,
      locationResolved: isLocationResolved,
      coords,
      locationName,
      calendarDateKey,
    });
  }, [
    coordinator,
    isNotificationsEnabled,
    isLocationResolved,
    coords,
    locationName,
    calendarDateKey,
  ]);

  // Trigger Adhan auto-play when a Fard prayer time arrives (robust 2-minute arrival window)
  useEffect(() => {
    if (!isNotificationsEnabled) return;

    const arrival = evaluatePrayerArrival(
      dailyPrayers.window,
      currentTime.getTime(),
      lastAutoPlayedKey.current
    );
    lastAutoPlayedKey.current = arrival.nextPlayedKey;

    if (arrival.arrivedPrayer) {
      const arrivedName = arrival.arrivedPrayer;
      setLocalPlayingPrayer(arrivedName);

      try {
        if (arrivedName === 'Fajr') {
          standardPlayer.pause();
          void standardPlayer.seekTo(0);
          void fajrPlayer.seekTo(0);
          fajrPlayer.play();
        } else {
          fajrPlayer.pause();
          void fajrPlayer.seekTo(0);
          void standardPlayer.seekTo(0);
          standardPlayer.play();
        }
      } catch (err) {
        console.warn(`[Adhan Auto-Play] Failed to start Adhan for ${arrivedName}:`, err);
      }
    }
  }, [
    currentTime,
    isNotificationsEnabled,
    dailyPrayers.window,
    standardPlayer,
    fajrPlayer,
  ]);

  // When Adhan playback finishes naturally, automatically prompt / open Post-Salah Du'a modal
  useEffect(() => {
    const wasPlaying = wasAudioPlayingRef.current;
    wasAudioPlayingRef.current = isAudioPlaying;

    if (wasPlaying && !isAudioPlaying) {
      const duration = activePlayerStatus?.duration ?? 0;
      const currentPos = activePlayerStatus?.currentTime ?? 0;
      // If stopped near the end of the track (completed naturally)
      if (duration > 0 && currentPos >= duration - 3) {
        const timer = setTimeout(() => {
          setIsDuaModalVisible(true);
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [isAudioPlaying, activePlayerStatus]);

  const handleToggleNotification = async () => {
    const newState = !isNotificationsEnabled;
    setIsNotificationsEnabled(newState);

    if (newState) {
      const granted = await coordinator.requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          'Permission Required',
          'Please enable notifications in device settings to receive Adhan prayer alerts.'
        );
        return;
      }
    }

    Alert.alert(
      newState ? 'Notifications & Adhan Active' : 'Notifications Silenced',
      newState
        ? `Adhan reminders scheduled for all 5 Fard prayers in ${locationName}.`
        : 'Prayer time notification alerts are muted.'
    );
  };

  const handleToggleAdhan = async () => {
    try {
      if (isAudioPlaying) {
        await handleStopAdhan();
      } else {
        void activePlayer.seekTo(0);
        activePlayer.play();
      }
    } catch {
      // Audio fallback
    }
  };

  const handleStopAdhan = async () => {
    try {
      await coordinator.stopNativePlayback();
      fajrPlayer.pause();
      void fajrPlayer.seekTo(0);
      standardPlayer.pause();
      void standardPlayer.seekTo(0);
      setLocalPlayingPrayer(null);
    } catch {
      // Audio fallback
    }
  };

  const handlePreviewPrayerAdhan = async (prayerId: PrayerName) => {
    try {
      if (currentlyPlayingPrayer === prayerId && isAudioPlaying) {
        await handleStopAdhan();
        return;
      }

      await coordinator.stopNativePlayback();
      setLocalPlayingPrayer(prayerId);

      if (prayerId === 'Fajr') {
        standardPlayer.pause();
        void standardPlayer.seekTo(0);
        void fajrPlayer.seekTo(0);
        fajrPlayer.play();
      } else {
        fajrPlayer.pause();
        void fajrPlayer.seekTo(0);
        void standardPlayer.seekTo(0);
        standardPlayer.play();
      }
    } catch (err) {
      console.warn(`[Adhan Preview] Failed to preview Adhan for ${prayerId}:`, err);
    }
  };

  const currentDisplayPrayerTime = prayerData.targetTime
    ? formatPrayerTime(prayerData.targetTime)
    : '--:--';

  const themeContainerStyle = isDark ? styles.darkContainer : styles.lightContainer;
  const themeCardStyle = isDark ? styles.darkScheduleCard : styles.lightScheduleCard;
  const themeTextColor = isDark ? '#FFFFFF' : '#0F172A';
  const themeSecondaryTextColor = isDark ? '#94A3B8' : '#64748B';

  return (
    <SafeAreaView style={[styles.safeArea, themeContainerStyle]} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? '#FFFFFF' : '#2563EB'}
          />
        }>
        {/* TOP HERO CARD WITH DYNAMIC SKY GRADIENT */}
        <LinearGradient
          colors={prayerData.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}>
          {/* TOP HEADER ROW: Dates & In-App Update Trigger */}
          <View style={styles.heroHeaderRow}>
            <View style={styles.dateBlock}>
              <Text style={styles.gregorianDateText}>{formatGregorianDate(currentTime)}</Text>
              <Text style={styles.hijriDateText}>{formatHijriDate(currentTime)}</Text>
            </View>
            <Pressable
              onPress={() => setIsUpdateModalVisible(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Check for App Updates"
              style={({ pressed }) => [
                styles.heroUpdatePill,
                pressed && { opacity: 0.75, transform: [{ scale: 0.96 }] },
              ]}>
              <Ionicons name="sparkles" size={13} color="#FFFFFF" />
              <Text style={styles.heroUpdatePillText}>
                {updateCheckResult?.hasUpdate
                  ? `v${updateCheckResult.latestVersion} Available`
                  : `v${currentAppVersion}`}
              </Text>
            </Pressable>
          </View>

          {/* MIDDLE ROW: Prayer Info & Weather */}
          <View style={styles.heroMiddleRow}>
            {/* Middle Left: Next Prayer Info */}
            <View style={styles.prayerHeroInfo}>
              <View style={styles.prayerTitleRow}>
                <Text style={styles.heroPrayerName}>{prayerData.upcomingName}</Text>
                <Pressable
                  onPress={handleToggleNotification}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isNotificationsEnabled
                      ? 'Adhan reminders enabled. Tap to mute.'
                      : 'Adhan reminders muted. Tap to enable.'
                  }
                  style={({ pressed }) => [
                    styles.bellButton,
                    pressed && { opacity: 0.7 },
                  ]}>
                  <Ionicons
                    name={isNotificationsEnabled ? 'notifications' : 'notifications-off-outline'}
                    size={20}
                    color="#FFFFFF"
                  />
                </Pressable>
              </View>

              <Text style={styles.heroLargeTime}>{currentDisplayPrayerTime}</Text>

              <View style={styles.countdownRow}>
                <Ionicons name="timer-outline" size={15} color="rgba(255, 255, 255, 0.9)" />
                <Text style={styles.countdownText}>{prayerData.countdownString}</Text>
              </View>
            </View>

            {/* Middle Right: Weather Card */}
            <View
              style={styles.weatherBadge}
              accessible={true}
              accessibilityLabel={
                weather
                  ? `Weather: ${weather.temperature} degrees Celsius, ${weather.conditionLabel}`
                  : 'Weather loading'
              }>
              {weather ? (
                <>
                  <Ionicons name={weather.iconName} size={36} color="#FFFFFF" />
                  <Text style={styles.weatherTempText}>{weather.temperature}°C</Text>
                  <Text style={styles.weatherConditionText}>{weather.conditionLabel}</Text>
                </>
              ) : (
                <View style={styles.weatherLoading}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.weatherConditionText}>Open-Meteo</Text>
                </View>
              )}
            </View>
          </View>

          {/* BOTTOM ROW: Location Info */}
          <View style={styles.heroBottomRow}>
            <Pressable
              onPress={onRefresh}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Location: ${locationName}. Tap to refresh coordinates.`}
              style={({ pressed }) => [
                styles.locationContainer,
                pressed && { opacity: 0.7 },
              ]}>
              <Ionicons name="location-sharp" size={16} color="#FFFFFF" />
              <Text style={styles.locationText} numberOfLines={1}>
                {locationName}
              </Text>
              {isRefreshing && (
                <ActivityIndicator size="small" color="#FFFFFF" style={{ marginLeft: 4 }} />
              )}
            </Pressable>
          </View>
        </LinearGradient>

        {/* IN-APP ADHAN PLAYBACK CONTROL BAR (WHEN AUDIO IS ACTIVE) */}
        {isAudioPlaying && (
          <View style={[styles.audioPlayerCard, isDark ? styles.audioCardDark : styles.audioCardLight]}>
            <View style={styles.audioInfo}>
              <View style={styles.audioWaveIcon}>
                <Ionicons name="musical-notes" size={20} color="#2563EB" />
              </View>
              <View style={styles.audioTextWrapper}>
                <Text style={[styles.audioTitle, { color: themeTextColor }]}>
                  {currentlyPlayingPrayer === 'Fajr'
                    ? 'Fajr Adhan (Prayer is Better than Sleep)'
                    : currentlyPlayingPrayer
                    ? `${currentlyPlayingPrayer} Adhan Recitation Playing`
                    : 'Adhan Recitation Playing'}
                </Text>
                <Text style={[styles.audioTime, { color: themeSecondaryTextColor }]}>
                  {formatAudioDuration(activePlayerStatus?.currentTime ?? 0)} /{' '}
                  {formatAudioDuration(activePlayerStatus?.duration || 170)}
                </Text>
              </View>
            </View>

            <View style={styles.audioControls}>
              <Pressable
                onPress={handleToggleAdhan}
                hitSlop={8}
                style={styles.audioControlButton}
                accessibilityRole="button"
                accessibilityLabel="Pause Adhan">
                <Ionicons name="pause" size={20} color={themeTextColor} />
              </Pressable>
              <Pressable
                onPress={handleStopAdhan}
                hitSlop={8}
                style={[styles.audioControlButton, styles.stopButton]}
                accessibilityRole="button"
                accessibilityLabel="Stop Adhan">
                <Ionicons name="stop" size={18} color="#EF4444" />
              </Pressable>
            </View>
          </View>
        )}

        {/* PROMINENT UPDATE CARD (HIGH VISIBILITY AT TOP) */}
        {isUpdateBannerVisible && updateCheckResult && updateCheckResult.hasUpdate && (
          <View
            style={[
              styles.updateCard,
              { marginTop: 14, marginBottom: 4 },
              isDark ? styles.updateCardDark : styles.updateCardLight,
            ]}>
            <View style={styles.updateCardContent}>
              <View style={styles.updateIconContainer}>
                <Ionicons name="sparkles" size={22} color="#3B82F6" />
              </View>
              <View style={styles.updateTextContainer}>
                <View style={styles.updateBadgeRow}>
                  <Text style={[styles.updateTitle, { color: themeTextColor }]}>
                    New Update Available
                  </Text>
                  <View style={styles.updateVersionBadge}>
                    <Text style={styles.updateVersionBadgeText}>
                      v{updateCheckResult.latestVersion}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.updateDescription, { color: themeSecondaryTextColor }]}>
                  {updateCheckResult.releaseTitle || 'A new production build is ready for installation.'}
                </Text>
              </View>
              <Pressable
                onPress={handleDismissUpdate}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Dismiss update banner"
                style={styles.updateDismissButton}>
                <Ionicons name="close" size={18} color={themeSecondaryTextColor} />
              </Pressable>
            </View>

            <Pressable
              onPress={handleApplyUpdate}
              accessibilityRole="button"
              accessibilityLabel={`Install update v${updateCheckResult.latestVersion} directly`}
              style={({ pressed }) => [
                styles.updateActionButton,
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}>
              <LinearGradient
                colors={['#2563EB', '#1D4ED8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.updateGradientButton}>
                <Ionicons name="cloud-download-outline" size={17} color="#FFFFFF" />
                <Text style={styles.updateButtonText}>
                  Update to v{updateCheckResult.latestVersion}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}

        {/* ANDROID 15 & OEM ALARM RELIABILITY HUB */}
        {Platform.OS === 'android' && (
          <View
            style={[
              styles.batteryBannerCard,
              { marginTop: 12, marginBottom: 4 },
              allReliabilityChecksPassed
                ? (isDark ? styles.reliabilityReadyDark : styles.reliabilityReadyLight)
                : (isDark ? styles.batteryCardDark : styles.batteryCardLight),
            ]}>
            <View
              style={[
                styles.batteryCardContent,
                !(isReliabilityExpanded || (!allReliabilityChecksPassed && !isBatteryBannerDismissed)) && {
                  marginBottom: 0,
                },
              ]}>
              <View
                style={[
                  styles.batteryIconContainer,
                  allReliabilityChecksPassed && { backgroundColor: 'rgba(16, 185, 129, 0.16)' },
                ]}>
                <Ionicons
                  name={allReliabilityChecksPassed ? 'shield-checkmark-outline' : 'warning-outline'}
                  size={22}
                  color={allReliabilityChecksPassed ? '#10B981' : '#F59E0B'}
                />
              </View>
              <View style={styles.batteryTextContainer}>
                <Text style={[styles.batteryTitle, { color: themeTextColor }]}>
                  {allReliabilityChecksPassed
                    ? 'Android Adhan Alarms Ready'
                    : 'Enable Reliable Adhan Alerts'}
                </Text>
                <Text style={[styles.batteryDescription, { color: themeSecondaryTextColor }]}>
                  {allReliabilityChecksPassed
                    ? `All 4 Android safeguards active${reliabilityStatus.oemInfo.hasOemRestrictions ? ` (${reliabilityStatus.oemInfo.manufacturer} detected — check Autostart)` : ''}.`
                    : 'Android 14/15 & OEM phones require these permissions so locked-screen prayer alarms fire reliably.'}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  if (!allReliabilityChecksPassed && !isBatteryBannerDismissed && !isReliabilityExpanded) {
                    void handleDismissBatteryBanner();
                  } else {
                    setIsReliabilityExpanded((prev) => !prev);
                  }
                }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Toggle Android reliability checklist"
                style={styles.batteryDismissButton}>
                <Ionicons
                  name={
                    isReliabilityExpanded || (!allReliabilityChecksPassed && !isBatteryBannerDismissed)
                      ? 'chevron-up'
                      : 'chevron-down'
                  }
                  size={18}
                  color={themeSecondaryTextColor}
                />
              </Pressable>
            </View>

            {(isReliabilityExpanded || (!allReliabilityChecksPassed && !isBatteryBannerDismissed)) && (
              <View style={styles.reliabilityChecklist}>
                {[
                  {
                    key: 'notifications',
                    label: 'Notifications Permission',
                    detail: 'Required on Android 13–15 to display and sound alerts.',
                    ok: reliabilityStatus.notificationsEnabled,
                    onFix: handleFixNotifications,
                  },
                  {
                    key: 'exact',
                    label: 'Exact Prayer Alarms',
                    detail: 'Lets prayers wake Doze Mode at exact minute boundaries.',
                    ok: reliabilityStatus.canScheduleExactAlarms,
                    onFix: handleFixExactAlarms,
                  },
                  {
                    key: 'fsi',
                    label: 'Lockscreen Full-Screen Alerts',
                    detail: 'Required on Android 14+ to wake and surface alarm UI.',
                    ok: reliabilityStatus.canUseFullScreenIntent,
                    onFix: handleFixFullScreenIntent,
                  },
                  {
                    key: 'battery',
                    label: 'Unrestricted Battery',
                    detail: 'Prevents Android from putting alarm background tasks to sleep.',
                    ok: reliabilityStatus.isBatteryOptimizationIgnored,
                    onFix: handleRequestBatteryOptimization,
                  },
                ].map((item) => (
                  <View key={item.key} style={styles.reliabilityRow}>
                    <Ionicons
                      name={item.ok ? 'checkmark-circle' : 'alert-circle'}
                      size={18}
                      color={item.ok ? '#10B981' : '#F59E0B'}
                    />
                    <View style={styles.reliabilityRowText}>
                      <Text style={[styles.reliabilityRowTitle, { color: themeTextColor }]}>
                        {item.label}
                      </Text>
                      <Text style={[styles.reliabilityRowSubtitle, { color: themeSecondaryTextColor }]}>
                        {item.detail}
                      </Text>
                    </View>
                    {!item.ok && (
                      <Pressable
                        onPress={() => void item.onFix()}
                        style={styles.reliabilityFixButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Fix ${item.label}`}>
                        <Text style={styles.reliabilityFixButtonText}>Allow</Text>
                      </Pressable>
                    )}
                  </View>
                ))}

                {reliabilityStatus.oemInfo.hasOemRestrictions && (
                  <View style={styles.reliabilityRow}>
                    <Ionicons name="phone-portrait-outline" size={18} color="#3B82F6" />
                    <View style={styles.reliabilityRowText}>
                      <Text style={[styles.reliabilityRowTitle, { color: themeTextColor }]}>
                        {reliabilityStatus.oemInfo.manufacturer || 'Device'} Autostart / Background
                      </Text>
                      <Text style={[styles.reliabilityRowSubtitle, { color: themeSecondaryTextColor }]}>
                        Allow Autostart & disable background sleep in device settings.
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => void handleOpenOemBackgroundSettings()}
                      style={[styles.reliabilityFixButton, { backgroundColor: '#2563EB' }]}
                      accessibilityRole="button"
                      accessibilityLabel="Open device OEM background settings">
                      <Text style={styles.reliabilityFixButtonText}>Open</Text>
                    </Pressable>
                  </View>
                )}

                {testAlarmMessage && (
                  <Text style={[styles.testAlarmStatusText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
                    {testAlarmMessage}
                  </Text>
                )}

                <Pressable
                  onPress={() => void handleTestNativeAlarm()}
                  disabled={isTestAlarmPending}
                  accessibilityRole="button"
                  accessibilityLabel="Test native alarm in 5 seconds"
                  style={({ pressed }) => [
                    styles.batteryActionButton,
                    (pressed || isTestAlarmPending) && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                  ]}>
                  <LinearGradient
                    colors={isTestAlarmPending ? ['#6B7280', '#4B5563'] : ['#2563EB', '#1D4ED8']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.batteryGradientButton}>
                    <Ionicons name="alarm-outline" size={17} color="#FFFFFF" />
                    <Text style={styles.batteryButtonText}>
                      {isTestAlarmPending ? 'Test Alarm Armed (5s)...' : 'Test Native Alarm (5s)'}
                    </Text>
                  </LinearGradient>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* ISLAMIC EVENT COUNTDOWN CARD (RAMADAN -> EID AL-FITR -> EID AL-ADHA) */}
        <View
          style={[styles.eventCountdownCard, isDark ? styles.eventCardDark : styles.eventCardLight]}
          accessible={true}
          accessibilityLabel={`${islamicEventData.targetTitle}, ${islamicEventData.days} days remaining until ${islamicEventData.targetHijriLabel}`}>
          <View style={styles.eventHeaderRow}>
            <View style={styles.eventTitleLeft}>
              <View
                style={[
                  styles.eventIconContainer,
                  isDark ? styles.eventIconDark : styles.eventIconLight,
                ]}>
                <Ionicons name={islamicEventData.iconName} size={20} color="#F59E0B" />
              </View>
              <View style={styles.eventTextColumn}>
                {islamicEventData.greeting ? (
                  <Text style={styles.eventGreetingText}>{islamicEventData.greeting}</Text>
                ) : null}
                <Text style={[styles.eventTitleText, { color: themeTextColor }]}>
                  {islamicEventData.targetTitle}
                </Text>
              </View>
            </View>
            <View style={styles.eventMilestoneBadge}>
              <Text style={styles.eventMilestoneBadgeText}>
                {islamicEventData.targetHijriLabel}
              </Text>
            </View>
          </View>

          <MonthWindowCountdown
            targetDate={islamicEventData.targetDate}
            isDark={isDark}
          />

          <Text style={[styles.eventTargetDateText, { color: themeSecondaryTextColor }]}>
            Expected: {islamicEventData.targetDateFormatted}
          </Text>

          {/* ANTICIPATING RAMADAN SPIRITUAL PREPARATION SECTION */}
          {islamicEventData.isAnticipatingRamadan && (
            <View style={styles.anticipationContainer}>
              <View style={styles.anticipationHeaderRow}>
                <View style={styles.anticipationBadgeRow}>
                  <Ionicons name="sparkles" size={13} color="#D97706" />
                  <Text style={styles.anticipationLabel}>Anticipating Ramadan</Text>
                </View>
                <Text style={styles.anticipationShabanBadge}>
                  {islamicEventData.daysUntilShaban > 0
                    ? `${islamicEventData.daysUntilShaban}d until Sha'ban`
                    : "In Sha'ban (Month of Preparation)"}
                </Text>
              </View>

              {/* Progress Bar towards Ramadan */}
              <View
                style={[
                  styles.progressBarTrack,
                  isDark ? styles.progressTrackDark : styles.progressTrackLight,
                ]}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${islamicEventData.preparationProgressPercent}%` },
                  ]}
                />
              </View>

              {/* Supplication Box */}
              <View style={[styles.duaBox, isDark ? styles.duaBoxDark : styles.duaBoxLight]}>
                <Text style={styles.duaArabicText}>{islamicEventData.duaArabic}</Text>
                <Text style={[styles.duaTranslationText, { color: themeSecondaryTextColor }]}>
                  {`"${islamicEventData.duaTranslation}"`}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* QUICK ACCESS: POST-SALAH DU'A & ADHKAR CARD */}
        <Pressable
          onPress={() => setIsDuaModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Open Post-Salah Du'a and Adhkar modal"
          style={({ pressed }) => [
            styles.postSalahActionCard,
            isDark ? styles.postSalahCardDark : styles.postSalahCardLight,
            pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
          ]}>
          <View style={styles.postSalahCardLeft}>
            <View style={styles.postSalahIconBox}>
              <Ionicons name="book-outline" size={20} color="#2563EB" />
            </View>
            <View style={styles.postSalahTextWrap}>
              <Text style={[styles.postSalahCardTitle, { color: themeTextColor }]}>
                {"Post-Salah Du'a & Adhkar"}
              </Text>
              <Text style={[styles.postSalahCardSubtitle, { color: themeSecondaryTextColor }]}>
                {"Authentic Sunnah Du'a, Ayat al-Kursi & 33x Tasbih"}
              </Text>
            </View>
          </View>
          <View style={styles.postSalahArrowBox}>
            <Ionicons name="chevron-forward" size={18} color={themeSecondaryTextColor} />
          </View>
        </Pressable>

        {/* BOTTOM SECTION: 5 FARD PRAYERS SCHEDULE */}
        <View style={styles.scheduleSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: themeTextColor }]}>Fard Prayers</Text>
            <Text style={[styles.calculationMethodText, { color: themeSecondaryTextColor }]}>
              Muslim World League
            </Text>
          </View>

          <View style={[styles.scheduleCardGroup, themeCardStyle]}>
            {prayerData.prayersList.map((item, index) => {
              const isNext = item.id === prayerData.upcomingName;
              const isLast = index === prayerData.prayersList.length - 1;
              const isPrayerAudioActive = isAudioPlaying && currentlyPlayingPrayer === item.id;

              return (
                <View
                  key={item.id}
                  accessible={true}
                  accessibilityLabel={`${item.name} prayer at ${item.formattedTime}${
                    isNext ? ', next upcoming prayer' : ''
                  }`}
                  style={[
                    styles.prayerRow,
                    isNext && (isDark ? styles.activeRowDark : styles.activeRowLight),
                    !isLast && (isDark ? styles.rowBorderDark : styles.rowBorderLight),
                  ]}>
                  {/* Left: Prayer Icon and Name */}
                  <View style={styles.prayerRowLeft}>
                    <View
                      style={[
                        styles.iconCircle,
                        isNext
                          ? styles.activeIconCircle
                          : isDark
                          ? styles.iconCircleDark
                          : styles.iconCircleLight,
                      ]}>
                      <Ionicons
                        name={item.iconName}
                        size={18}
                        color={isNext ? '#FFFFFF' : isDark ? '#94A3B8' : '#2563EB'}
                      />
                    </View>
                    <Text
                      style={[
                        styles.prayerRowName,
                        { color: isNext ? (isDark ? '#38BDF8' : '#2563EB') : themeTextColor },
                        isNext && styles.activePrayerRowName,
                      ]}>
                      {item.name}
                    </Text>
                  </View>

                  {/* Right: Time, Next Indicator & Dedicated Adhan Audio Preview Button */}
                  <View style={styles.prayerRowRight}>
                    {isNext && (
                      <View style={styles.nextBadge}>
                        <Text style={styles.nextBadgeText}>NEXT</Text>
                      </View>
                    )}
                    <Text
                      style={[
                        styles.prayerRowTime,
                        { color: isNext ? (isDark ? '#38BDF8' : '#2563EB') : themeTextColor },
                        isNext && styles.activePrayerRowTime,
                      ]}>
                      {item.formattedTime}
                    </Text>
                    <Pressable
                      onPress={() => void handlePreviewPrayerAdhan(item.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={
                        isPrayerAudioActive
                          ? `Pause ${item.name} Adhan`
                          : `Play ${item.name} Adhan audio preview`
                      }
                      style={[
                        styles.prayerPreviewButton,
                        isPrayerAudioActive && styles.prayerPreviewButtonActive,
                      ]}>
                      <Ionicons
                        name={isPrayerAudioActive ? 'pause-circle' : 'play-circle-outline'}
                        size={22}
                        color={
                          isPrayerAudioActive
                            ? '#2563EB'
                            : isDark
                            ? '#94A3B8'
                            : '#64748B'
                        }
                      />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

      </ScrollView>

      {/* POST-SALAH DU'A & ADHKAR MODAL */}
      <PostSalahDuaModal
        visible={isDuaModalVisible}
        onClose={() => setIsDuaModalVisible(false)}
        isDark={isDark}
      />

      {/* IN-APP UPDATER MODAL (NATIVE APK PACKAGE INSTALLER) */}
      <InAppUpdateModal
        visible={isUpdateModalVisible}
        onClose={() => setIsUpdateModalVisible(false)}
        isDark={isDark}
        initialCheckResult={updateCheckResult}
        onUpdateAvailable={(res) => {
          setUpdateCheckResult(res);
          setIsUpdateBannerVisible(true);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  lightContainer: {
    backgroundColor: '#F8FAFC',
  },
  darkContainer: {
    backgroundColor: '#0B0F19',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },

  // HERO CARD STYLES
  heroCard: {
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 22,
    ...Platform.select({
      ios: {
        shadowColor: '#1D4ED8',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.28,
        shadowRadius: 18,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateBlock: {
    gap: 3,
  },
  gregorianDateText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  hijriDateText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
  },

  heroMiddleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 18,
  },
  prayerHeroInfo: {
    flex: 1,
    paddingRight: 12,
  },
  prayerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroPrayerName: {
    fontSize: 22,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  bellButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  heroLargeTime: {
    fontSize: 38,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginVertical: 4,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
  },

  // Weather Pill Badge
  weatherBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 104,
  },
  weatherLoading: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  weatherTempText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
  },
  weatherConditionText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    marginTop: 1,
  },

  // Bottom row inside hero card
  heroBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.25)',
    paddingTop: 12,
    marginTop: 4,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ADHAN ACTIVE PLAYER BAR
  audioPlayerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  audioCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#93C5FD',
  },
  audioCardDark: {
    backgroundColor: '#161F30',
    borderColor: '#1D4ED8',
  },
  audioInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  audioWaveIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioTextWrapper: {
    flex: 1,
  },
  audioTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  audioTime: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  audioControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  audioControlButton: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
  },
  stopButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },

  // SCHEDULE SECTION STYLES
  scheduleSection: {
    marginTop: 26,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  calculationMethodText: {
    fontSize: 12,
    fontWeight: '500',
  },
  scheduleCardGroup: {
    borderRadius: 22,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  lightScheduleCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  darkScheduleCard: {
    backgroundColor: '#131C2E',
    borderWidth: 1,
    borderColor: '#1E293B',
  },

  prayerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  rowBorderLight: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  rowBorderDark: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1E293B',
  },
  activeRowLight: {
    backgroundColor: '#EFF6FF',
  },
  activeRowDark: {
    backgroundColor: '#1E293B',
  },

  prayerRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleLight: {
    backgroundColor: '#F1F5F9',
  },
  iconCircleDark: {
    backgroundColor: '#0F172A',
  },
  activeIconCircle: {
    backgroundColor: '#2563EB',
  },
  prayerRowName: {
    fontSize: 16,
    fontWeight: '500',
  },
  activePrayerRowName: {
    fontWeight: '700',
  },

  prayerRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nextBadge: {
    backgroundColor: '#2563EB',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  nextBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  prayerRowTime: {
    fontSize: 15,
    fontWeight: '600',
  },
  activePrayerRowTime: {
    fontSize: 16,
    fontWeight: '700',
  },
  prayerPreviewButton: {
    padding: 4,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  prayerPreviewButtonActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
  },

  // ISLAMIC EVENT COUNTDOWN CARD STYLES
  eventCountdownCard: {
    marginTop: 18,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  eventCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  eventCardDark: {
    backgroundColor: '#131C2E',
    borderColor: '#1E293B',
  },
  eventHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  eventIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventIconLight: {
    backgroundColor: '#FEF3C7',
  },
  eventIconDark: {
    backgroundColor: '#1E1B4B',
  },
  eventTextColumn: {
    flex: 1,
  },
  eventGreetingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  eventTitleText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  eventMilestoneBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  eventMilestoneBadgeText: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '700',
  },
  eventTargetDateText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },

  // ANTICIPATION SECTION STYLES
  anticipationContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(245, 158, 11, 0.25)',
  },
  anticipationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  anticipationBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  anticipationLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
    letterSpacing: 0.2,
  },
  anticipationShabanBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: 6,
  },
  progressTrackLight: {
    backgroundColor: '#FEF3C7',
  },
  progressTrackDark: {
    backgroundColor: '#1E293B',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 3,
  },
  duaBox: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  duaBoxLight: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  duaBoxDark: {
    backgroundColor: '#172236',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  duaArabicText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#D97706',
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 4,
    lineHeight: 28,
  },
  duaTranslationText: {
    fontSize: 12,
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 18,
  },

  // POST-SALAH ACTION CARD STYLES
  postSalahActionCard: {
    marginTop: 18,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  postSalahCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  postSalahCardDark: {
    backgroundColor: '#131C2E',
    borderColor: '#1E293B',
  },
  postSalahCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  postSalahIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postSalahTextWrap: {
    flex: 1,
  },
  postSalahCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  postSalahCardSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  postSalahArrowBox: {
    marginLeft: 8,
  },

  // UPDATE CARD STYLES
  updateCard: {
    marginTop: 20,
    marginBottom: 8,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  updateCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DBEAFE',
  },
  updateCardDark: {
    backgroundColor: '#0F172A',
    borderColor: '#1E293B',
  },
  updateCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 14,
  },
  updateIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  updateTextContainer: {
    flex: 1,
  },
  updateBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  updateTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  updateVersionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.18)',
  },
  updateVersionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
  },
  updateDescription: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17,
  },
  updateActionButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  updateGradientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  heroUpdatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  heroUpdatePillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  updateDismissButton: {
    padding: 6,
    marginLeft: 6,
  },
  batteryBannerCard: {
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 16,
  },
  batteryCardLight: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  batteryCardDark: {
    backgroundColor: '#1E1B18',
    borderColor: '#78350F',
  },
  batteryCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  batteryIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  batteryTextContainer: {
    flex: 1,
  },
  batteryTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  batteryDescription: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17,
  },
  batteryDismissButton: {
    padding: 6,
    marginLeft: 6,
  },
  batteryActionButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  batteryGradientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  batteryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  reliabilityReadyLight: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  reliabilityReadyDark: {
    backgroundColor: '#0F1F18',
    borderColor: '#065F46',
  },
  reliabilityChecklist: {
    gap: 10,
    marginTop: 4,
  },
  reliabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reliabilityRowText: {
    flex: 1,
  },
  reliabilityRowTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  reliabilityRowSubtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
  reliabilityFixButton: {
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  reliabilityFixButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  testAlarmStatusText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
