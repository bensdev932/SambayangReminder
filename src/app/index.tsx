import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { Coordinates, CalculationMethod, Madhab, PrayerTimes } from 'adhan';
import { MonthWindowCountdown } from '../components/month-window-countdown';
import { PostSalahDuaModal } from '../components/post-salah-dua-modal';
import {
  initNotificationHandler,
  setupNotificationChannel,
  requestNotificationPermissions,
  cancelAllPrayerNotifications,
  schedulePrayerNotification,
  schedulePostPrayerDuaNotification,
  addNotificationResponseListener,
} from '../services/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const UPDATE_BUTTON_DISMISSED_KEY = '@sambayang_update_button_dismissed_v1.0.1';

// Local Adhan audio files
const standardAdhanAudio = require('../../assets/audio/adhan.mp3');
const fajrAdhanAudio = require('../../assets/audio/fajr_adhan.mp3');

// Baseline fallback coordinates (Manila, Philippines)
const FALLBACK_LOCATION = {
  latitude: 14.5995,
  longitude: 120.9842,
  name: 'Manila, Philippines',
};

type PrayerName = 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';

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

const HIJRI_MONTH_NAMES = [
  'Muharram',
  'Safar',
  "Rabi' al-Awwal",
  "Rabi' al-Thani",
  'Jumada al-Ula',
  'Jumada al-Akhirah',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhu al-Qi'dah",
  'Dhu al-Hijjah',
];

function getHijriDate(d: Date): { year: number; month: number; day: number; monthName: string } {
  try {
    const formatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    const parts = formatter.formatToParts(d);
    const m = parseInt(parts.find((p) => p.type === 'month')?.value || '', 10);
    const day = parseInt(parts.find((p) => p.type === 'day')?.value || '', 10);
    const y = parseInt(parts.find((p) => p.type === 'year')?.value || '', 10);
    if (!isNaN(m) && !isNaN(day) && !isNaN(y) && m >= 1 && m <= 12) {
      return { year: y, month: m, day, monthName: HIJRI_MONTH_NAMES[m - 1] };
    }
  } catch {
    // Graceful fallback to astronomical calculation
  }

  // Astronomical / Kuweit tabular algorithmic conversion (100% offline & portable)
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();

  const jd =
    Math.floor((1461 * (year + 4800 + Math.floor((month - 14) / 12))) / 4) +
    Math.floor((367 * (month - 2 - 12 * Math.floor((month - 14) / 12))) / 12) -
    Math.floor((3 * Math.floor((year + 4900 + Math.floor((month - 14) / 12)) / 100)) / 4) +
    day -
    32075;

  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l1 = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l1) / 5316) * Math.floor((50 * l1) / 17719) +
    Math.floor(l1 / 5670) * Math.floor((43 * l1) / 15238);
  const l2 =
    l1 -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const m = Math.max(1, Math.min(12, Math.floor((24 * l2) / 709)));
  const dH = Math.max(1, Math.min(30, l2 - Math.floor((709 * m) / 24)));
  const yH = 30 * n + j - 30;

  return { year: yH, month: m, day: dH, monthName: HIJRI_MONTH_NAMES[m - 1] };
}

function formatHijriDate(date: Date): string {
  const h = getHijriDate(date);
  return `${h.day} ${h.monthName} ${h.year} AH`;
}

function formatPrayerTime(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, '0');
  const strMinutes = String(minutes).padStart(2, '0');
  return `${strHours}:${strMinutes} ${ampm}`;
}

interface IslamicEventInfo {
  targetTitle: string;
  targetHijriLabel: string;
  greeting: string | null;
  targetDate: Date;
  targetDateFormatted: string;
  days: number;
  hours: number;
  minutes: number;
  iconName: keyof typeof Ionicons.glyphMap;
  isAnticipatingRamadan: boolean;
  daysUntilShaban: number;
  preparationProgressPercent: number;
  duaArabic: string;
  duaTranslation: string;
}

function getIslamicEventInfo(now: Date): IslamicEventInfo {
  const { month, day } = getHijriDate(now);

  let targetTitle = 'Countdown to Ramadan';
  let targetHijriLabel = '1 Ramadan';
  let targetMonth = 9;
  let targetDay = 1;
  let greeting: string | null = null;
  let iconName: keyof typeof Ionicons.glyphMap = 'moon-outline';

  if (month < 9) {
    // Before Ramadan
    targetTitle = 'Countdown to Ramadan';
    targetHijriLabel = '1 Ramadan';
    targetMonth = 9;
    targetDay = 1;
    iconName = 'moon';
  } else if (month === 9) {
    // During Ramadan -> Count down to Eid al-Fitr (1 Shawwal)
    greeting = 'Ramadan Mubarak! 🌙';
    targetTitle = 'Countdown to Eid al-Fitr';
    targetHijriLabel = '1 Shawwal';
    targetMonth = 10;
    targetDay = 1;
    iconName = 'sparkles';
  } else if (month === 10 && day <= 3) {
    // During Eid al-Fitr days -> Count down to Eid al-Adha (10 Dhu al-Hijjah)
    greeting = 'Eid Mubarak! 🎉';
    targetTitle = 'Countdown to Eid al-Adha';
    targetHijriLabel = '10 Dhu al-Hijjah';
    targetMonth = 12;
    targetDay = 10;
    iconName = 'gift';
  } else if (month < 12 || (month === 12 && day < 10)) {
    // Between Eid al-Fitr and Eid al-Adha
    targetTitle = 'Countdown to Eid al-Adha';
    targetHijriLabel = '10 Dhu al-Hijjah';
    targetMonth = 12;
    targetDay = 10;
    iconName = 'star';
  } else if (month === 12 && day >= 10 && day <= 13) {
    // During Eid al-Adha days -> Count down to next Ramadan
    greeting = 'Eid al-Adha Mubarak! 🐑';
    targetTitle = 'Countdown to Ramadan';
    targetHijriLabel = '1 Ramadan';
    targetMonth = 9;
    targetDay = 1;
    iconName = 'moon';
  } else {
    // After Eid al-Adha through end of Hijri year -> Next Ramadan
    targetTitle = 'Countdown to Ramadan';
    targetHijriLabel = '1 Ramadan';
    targetMonth = 9;
    targetDay = 1;
    iconName = 'moon';
  }

  // Scan forward up to 400 days to find exact target Gregorian date
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let targetDate = new Date(startDay.getTime() + 86400000 * 30);
  for (let i = 1; i <= 400; i++) {
    const candidate = new Date(startDay.getTime() + i * 86400000);
    const h = getHijriDate(candidate);
    if (h.month === targetMonth && h.day === targetDay) {
      targetDate = candidate;
      break;
    }
  }

  const diffMs = Math.max(0, targetDate.getTime() - now.getTime());
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  const targetDateFormatted = targetDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Anticipating Ramadan calculations
  const isAnticipatingRamadan = month < 9;
  let daysUntilShaban = 0;
  if (isAnticipatingRamadan) {
    if (month < 8) {
      // Find 1 Sha'ban
      for (let i = 1; i <= 300; i++) {
        const candidate = new Date(startDay.getTime() + i * 86400000);
        const h = getHijriDate(candidate);
        if (h.month === 8 && h.day === 1) {
          daysUntilShaban = Math.max(
            0,
            Math.floor((candidate.getTime() - now.getTime()) / 86400000)
          );
          break;
        }
      }
    } else {
      daysUntilShaban = 0;
    }
  }

  // Progress percentage toward Ramadan based on Hijri year progress (Month 1-8 towards Month 9)
  const totalDaysIntoYear = (month - 1) * 30 + day;
  const targetDaysIntoYear = 8 * 30;
  const preparationProgressPercent = Math.min(
    100,
    Math.max(8, Math.round((totalDaysIntoYear / targetDaysIntoYear) * 100))
  );

  return {
    targetTitle,
    targetHijriLabel,
    greeting,
    targetDate,
    targetDateFormatted,
    days,
    hours,
    minutes,
    iconName,
    isAnticipatingRamadan,
    daysUntilShaban,
    preparationProgressPercent,
    duaArabic: 'اللَّهُمَّ بَلِّغْنَا رَمَضَان',
    duaTranslation: 'O Allah, allow us to reach Ramadan.',
  };
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
  const [currentlyPlayingPrayer, setCurrentlyPlayingPrayer] = useState<PrayerName | null>(null);
  const [isUpdateBannerVisible, setIsUpdateBannerVisible] = useState<boolean>(false);

  // Load update button visibility from persistent storage
  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        const dismissed = await AsyncStorage.getItem(UPDATE_BUTTON_DISMISSED_KEY);
        if (!dismissed && isMounted) {
          setIsUpdateBannerVisible(true);
        }
      } catch {
        // Fallback gracefully
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleApplyUpdate = async () => {
    try {
      await AsyncStorage.setItem(UPDATE_BUTTON_DISMISSED_KEY, 'true');
      setIsUpdateBannerVisible(false);
      Alert.alert(
        'App Up to Date',
        'You are running Sambayang Reminder v1.0.1 with the latest prayer times and Adhan auto-play fixes.'
      );
    } catch {
      setIsUpdateBannerVisible(false);
    }
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

  // Configure notifications on mount
  useEffect(() => {
    initNotificationHandler();
    void setupNotificationChannel();
  }, []);

  // Keep current time updated every second for live countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Listen for notification taps to open Post-Salah Dua modal
  useEffect(() => {
    const sub = addNotificationResponseListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.type === 'post_salah_dua') {
        setIsDuaModalVisible(true);
      }
    });
    return () => {
      sub.remove();
    };
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
    await fetchLocationAndWeather();
    setIsRefreshing(false);
  }, [fetchLocationAndWeather]);

  // Compute 5 Fard prayer times using adhan (Muslim World League + Standard Asr)
  const prayerData = useMemo(() => {
    const coordinates = new Coordinates(coords.latitude, coords.longitude);
    const params = CalculationMethod.MuslimWorldLeague();
    params.madhab = Madhab.Shafi;

    const todayPrayers = new PrayerTimes(coordinates, currentTime, params);

    const prayersList: PrayerItem[] = [
      {
        id: 'Fajr',
        name: 'Fajr',
        time: todayPrayers.fajr,
        formattedTime: formatPrayerTime(todayPrayers.fajr),
        iconName: 'sunny-outline',
      },
      {
        id: 'Dhuhr',
        name: 'Dhuhr',
        time: todayPrayers.dhuhr,
        formattedTime: formatPrayerTime(todayPrayers.dhuhr),
        iconName: 'sunny',
      },
      {
        id: 'Asr',
        name: 'Asr',
        time: todayPrayers.asr,
        formattedTime: formatPrayerTime(todayPrayers.asr),
        iconName: 'partly-sunny-outline',
      },
      {
        id: 'Maghrib',
        name: 'Maghrib',
        time: todayPrayers.maghrib,
        formattedTime: formatPrayerTime(todayPrayers.maghrib),
        iconName: 'cloudy-night-outline',
      },
      {
        id: 'Isha',
        name: 'Isha',
        time: todayPrayers.isha,
        formattedTime: formatPrayerTime(todayPrayers.isha),
        iconName: 'moon-outline',
      },
    ];

    // Determine upcoming Fard prayer
    let nextPrayerItem: PrayerItem | null = null;
    for (const item of prayersList) {
      if (currentTime.getTime() < item.time.getTime()) {
        nextPrayerItem = item;
        break;
      }
    }

    // If after Isha, next prayer is Fajr tomorrow
    let targetTime = nextPrayerItem ? nextPrayerItem.time : null;
    let upcomingName: PrayerName = nextPrayerItem ? nextPrayerItem.id : 'Fajr';

    if (!targetTime) {
      const tomorrow = new Date(currentTime);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowPrayers = new PrayerTimes(coordinates, tomorrow, params);
      targetTime = tomorrowPrayers.fajr;
      upcomingName = 'Fajr';
    }

    // Countdown calculation
    const diffMs = Math.max(0, targetTime.getTime() - currentTime.getTime());
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
  }, [coords, currentTime]);

  const isStandardPlaying = Boolean(standardStatus?.playing);
  const isFajrPlaying = Boolean(fajrStatus?.playing);
  const isAudioPlaying = isStandardPlaying || isFajrPlaying;

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
    return getIslamicEventInfo(new Date(todayDateString));
  }, [todayDateString]);

  // Schedule native notifications when prayers or settings change
  useEffect(() => {
    let isCancelled = false;
    void (async () => {
      try {
        if (!isNotificationsEnabled) {
          await cancelAllPrayerNotifications();
          return;
        }

        const granted = await requestNotificationPermissions();
        if (!granted || isCancelled) {
          return;
        }

        // Cancel previous to prevent duplicate schedules
        await cancelAllPrayerNotifications();

        const now = new Date();
        for (const prayer of prayerData.prayersList) {
          if (prayer.time.getTime() > now.getTime() && !isCancelled) {
            await schedulePrayerNotification(prayer.name, prayer.time, locationName);
            await schedulePostPrayerDuaNotification(prayer.name, prayer.time, locationName);
          }
        }
      } catch {
        // Notification scheduling fallback
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [isNotificationsEnabled, prayerData.prayersList, locationName]);

  // Trigger Adhan auto-play when a Fard prayer time arrives (robust 2-minute arrival window)
  useEffect(() => {
    if (!isNotificationsEnabled) return;

    const now = currentTime.getTime();
    const dateKey = `${currentTime.getFullYear()}-${currentTime.getMonth() + 1}-${currentTime.getDate()}`;

    for (const prayer of prayerData.prayersList) {
      const prayerTime = prayer.time.getTime();
      const elapsedSeconds = (now - prayerTime) / 1000;
      const prayerKey = `${dateKey}-${prayer.id}`;

      // Reset played key if time was wound back before the prayer (helps when testing with clock changes)
      if (elapsedSeconds < -10 && lastAutoPlayedKey.current === prayerKey) {
        lastAutoPlayedKey.current = null;
      }

      // Check arrival window: within [0s, 120s] (arrived in the last 2 minutes)
      if (elapsedSeconds >= 0 && elapsedSeconds <= 120) {
        if (lastAutoPlayedKey.current !== prayerKey) {
          lastAutoPlayedKey.current = prayerKey;
          setCurrentlyPlayingPrayer(prayer.id);

          try {
            if (prayer.id === 'Fajr') {
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
            console.warn(`[Adhan Auto-Play] Failed to start Adhan for ${prayer.name}:`, err);
          }
          break;
        }
      }
    }
  }, [
    currentTime,
    isNotificationsEnabled,
    prayerData.prayersList,
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
      const granted = await requestNotificationPermissions();
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

  const handleToggleAdhan = () => {
    try {
      if (isAudioPlaying) {
        standardPlayer.pause();
        fajrPlayer.pause();
      } else {
        activePlayer.play();
      }
    } catch {
      // Audio fallback
    }
  };

  const handleStopAdhan = () => {
    try {
      fajrPlayer.pause();
      fajrPlayer.seekTo(0);
      standardPlayer.pause();
      standardPlayer.seekTo(0);
      setCurrentlyPlayingPrayer(null);
    } catch {
      // Audio fallback
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
          {/* TOP HEADER ROW: Dates */}
          <View style={styles.heroHeaderRow}>
            <View style={styles.dateBlock}>
              <Text style={styles.gregorianDateText}>{formatGregorianDate(currentTime)}</Text>
              <Text style={styles.hijriDateText}>{formatHijriDate(currentTime)}</Text>
            </View>
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

                  {/* Right: Time & Next Indicator */}
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
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* PERSISTENT UPDATE BUTTON (DISAPPEARS PERMANENTLY AFTER TAP) */}
        {isUpdateBannerVisible && (
          <View
            style={[styles.updateCard, isDark ? styles.updateCardDark : styles.updateCardLight]}>
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
                    <Text style={styles.updateVersionBadgeText}>v1.0.1</Text>
                  </View>
                </View>
                <Text style={[styles.updateDescription, { color: themeSecondaryTextColor }]}>
                  Adhan auto-play engine fix, background audio support, and prayer notification improvements.
                </Text>
              </View>
            </View>

            <Pressable
              onPress={handleApplyUpdate}
              accessibilityRole="button"
              accessibilityLabel="Update now and dismiss button permanently"
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
                <Text style={styles.updateButtonText}>Update to v1.0.1</Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* POST-SALAH DU'A & ADHKAR MODAL */}
      <PostSalahDuaModal
        visible={isDuaModalVisible}
        onClose={() => setIsDuaModalVisible(false)}
        isDark={isDark}
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
});
