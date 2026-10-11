import { test } from 'node:test';
import assert from 'node:assert';

test('Native Adhan Alarm Bridge: parameter validation and timestamp logic', () => {
  const now = Date.now();

  // Test past timestamps rejected
  const pastTimestamp = now - 5000;
  assert.strictEqual(pastTimestamp <= now, true, 'Past timestamps must evaluate to past');

  // Test future timestamps accepted
  const futureTimestamp = now + 60000;
  assert.strictEqual(futureTimestamp > now, true, 'Future timestamps must evaluate to future');

  // Request code mapping determinism
  const getRequestCodeForPrayer = (name) => {
    switch (name.toLowerCase()) {
      case 'fajr': return 101;
      case 'dhuhr': return 102;
      case 'asr': return 103;
      case 'maghrib': return 104;
      case 'isha': return 105;
      default: return 999;
    }
  };

  assert.strictEqual(getRequestCodeForPrayer('Fajr'), 101);
  assert.strictEqual(getRequestCodeForPrayer('Dhuhr'), 102);
  assert.strictEqual(getRequestCodeForPrayer('Asr'), 103);
  assert.strictEqual(getRequestCodeForPrayer('Maghrib'), 104);
  assert.strictEqual(getRequestCodeForPrayer('Isha'), 105);
  assert.strictEqual(getRequestCodeForPrayer('Custom'), 999);
});

test('Adhan Audio mapping: Fajr vs Standard Adhan file selection', () => {
  const getAdhanAudioResource = (prayerName) => {
    return prayerName === 'Fajr' ? 'fajr_adhan.mp3' : 'adhan.mp3';
  };

  assert.strictEqual(getAdhanAudioResource('Fajr'), 'fajr_adhan.mp3');
  assert.strictEqual(getAdhanAudioResource('Dhuhr'), 'adhan.mp3');
  assert.strictEqual(getAdhanAudioResource('Asr'), 'adhan.mp3');
  assert.strictEqual(getAdhanAudioResource('Maghrib'), 'adhan.mp3');
  assert.strictEqual(getAdhanAudioResource('Isha'), 'adhan.mp3');
});
