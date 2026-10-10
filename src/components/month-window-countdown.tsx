import React, { useSyncExternalStore, useMemo } from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';

let currentClockSnapshot = Date.now();
const listeners = new Set<() => void>();
let clockInterval: ReturnType<typeof setInterval> | null = null;

function subscribeToClock(callback: () => void) {
  listeners.add(callback);
  if (clockInterval === null) {
    clockInterval = setInterval(() => {
      currentClockSnapshot = Date.now();
      listeners.forEach((listener) => listener());
    }, 1000);
  }
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && clockInterval !== null) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
  };
}

function getClockSnapshot(): number {
  return currentClockSnapshot;
}

export interface MonthWindowCountdownProps {
  /** The target Date to count down to */
  targetDate?: Date | null;
  /** Whether the dark theme is active */
  isDark?: boolean;
  /** Optional container style */
  style?: StyleProp<ViewStyle>;
}

interface CountdownValues {
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Calculates calendar-aligned window countdown between current clock time and target date.
 * Advances full calendar months first, then computes remaining days, hours, minutes, and seconds.
 */
function computeCalendarWindow(target: Date | undefined | null, nowMs: number): CountdownValues {
  if (!target || !(target instanceof Date) || isNaN(target.getTime()) || nowMs >= target.getTime()) {
    return { months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const now = new Date(nowMs);
  let months = 0;
  let cursor = new Date(now.getTime());

  // Step full calendar months forward without overshooting target
  while (true) {
    const nextMonthYear = cursor.getFullYear() + Math.floor((cursor.getMonth() + 1) / 12);
    const nextMonthVal = (cursor.getMonth() + 1) % 12;

    // Handle variable days per month (e.g., February 28/29, April 30)
    const daysInNextMonth = new Date(nextMonthYear, nextMonthVal + 1, 0).getDate();
    const targetDay = Math.min(now.getDate(), daysInNextMonth);

    const nextMonthDate = new Date(
      nextMonthYear,
      nextMonthVal,
      targetDay,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds()
    );

    if (nextMonthDate.getTime() <= target.getTime()) {
      months++;
      cursor = nextMonthDate;
    } else {
      break;
    }
  }

  // Remainder calculation after whole calendar months
  let diffMs = Math.max(0, target.getTime() - cursor.getTime());

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  diffMs -= days * (1000 * 60 * 60 * 24);

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  diffMs -= hours * (1000 * 60 * 60);

  const minutes = Math.floor(diffMs / (1000 * 60));
  diffMs -= minutes * (1000 * 60);

  const seconds = Math.floor(diffMs / 1000);

  return { months, days, hours, minutes, seconds };
}

export function MonthWindowCountdown({
  targetDate,
  isDark = false,
  style,
}: MonthWindowCountdownProps) {
  // Synchronized with live device clock Date.now() every second
  const nowMs = useSyncExternalStore(subscribeToClock, getClockSnapshot);

  const values = useMemo(
    () => computeCalendarWindow(targetDate, nowMs),
    [targetDate, nowMs]
  );

  const blocks = [
    { key: 'months', label: 'MO', value: values.months },
    { key: 'days', label: 'DAYS', value: values.days },
    { key: 'hours', label: 'HOURS', value: values.hours },
    { key: 'minutes', label: 'MIN', value: values.minutes },
    { key: 'seconds', label: 'SEC', value: values.seconds },
  ];

  const valueColor = isDark ? '#38BDF8' : '#2563EB';
  const labelColor = isDark ? '#94A3B8' : '#64748B';
  const tileBackgroundStyle = isDark ? styles.tileDark : styles.tileLight;

  return (
    <View
      style={[styles.container, style]}
      accessible={true}
      accessibilityRole="timer"
      accessibilityLabel={`${values.months} months, ${values.days} days, ${values.hours} hours, ${values.minutes} minutes, ${values.seconds} seconds remaining`}>
      {blocks.map((block) => (
        <View key={block.key} style={[styles.counterTile, tileBackgroundStyle]}>
          <Text style={[styles.counterValue, { color: valueColor }]}>
            {String(block.value).padStart(2, '0')}
          </Text>
          <Text style={[styles.counterLabel, { color: labelColor }]}>{block.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 6,
    width: '100%',
    marginVertical: 10,
  },
  counterTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  tileLight: {
    backgroundColor: 'rgba(0, 0, 0, 0.035)',
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  tileDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.09)',
  },
  counterValue: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  counterLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginTop: 3,
    textTransform: 'uppercase',
  },
});
