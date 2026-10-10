import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PostSalahDuaModalProps {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
}

type DhikrStage = 'subhanallah' | 'alhamdulillah' | 'allahuakbar' | 'completed';

export function PostSalahDuaModal({
  visible,
  onClose,
  isDark,
}: PostSalahDuaModalProps) {
  // Tasbih Counter State
  const [stage, setStage] = useState<DhikrStage>('subhanallah');
  const [subhanallahCount, setSubhanallahCount] = useState<number>(0);
  const [alhamdulillahCount, setAlhamdulillahCount] = useState<number>(0);
  const [allahuakbarCount, setAllahuakbarCount] = useState<number>(0);

  const handleIncrement = () => {
    if (stage === 'subhanallah') {
      const next = subhanallahCount + 1;
      setSubhanallahCount(next);
      if (next >= 33) {
        setStage('alhamdulillah');
      }
    } else if (stage === 'alhamdulillah') {
      const next = alhamdulillahCount + 1;
      setAlhamdulillahCount(next);
      if (next >= 33) {
        setStage('allahuakbar');
      }
    } else if (stage === 'allahuakbar') {
      const next = allahuakbarCount + 1;
      setAllahuakbarCount(next);
      if (next >= 33) {
        setStage('completed');
      }
    }
  };

  const handleReset = () => {
    setSubhanallahCount(0);
    setAlhamdulillahCount(0);
    setAllahuakbarCount(0);
    setStage('subhanallah');
  };

  const currentCount =
    stage === 'subhanallah'
      ? subhanallahCount
      : stage === 'alhamdulillah'
      ? alhamdulillahCount
      : stage === 'allahuakbar'
      ? allahuakbarCount
      : 33;

  const currentDhikrArabic =
    stage === 'subhanallah'
      ? 'سُبْحَانَ اللَّهِ'
      : stage === 'alhamdulillah'
      ? 'الْحَمْدُ لِلَّهِ'
      : stage === 'allahuakbar'
      ? 'اللَّهُ أَكْبَرُ'
      : 'تَمَامَ الْمِائَةِ (Seal of 100)';

  const currentDhikrTranslit =
    stage === 'subhanallah'
      ? 'SubḥānAllāh'
      : stage === 'alhamdulillah'
      ? 'Alḥamdulillāh'
      : stage === 'allahuakbar'
      ? 'Allāhu Akbar'
      : 'Completion Seal';

  const currentDhikrMeaning =
    stage === 'subhanallah'
      ? 'Glory be to Allah'
      : stage === 'alhamdulillah'
      ? 'All praise is for Allah'
      : stage === 'allahuakbar'
      ? 'Allah is the Greatest'
      : 'Final Hadith Supplication';

  const totalCompleted = subhanallahCount + alhamdulillahCount + allahuakbarCount;

  const themeContainer = isDark ? styles.modalDark : styles.modalLight;
  const themeCard = isDark ? styles.cardDark : styles.cardLight;
  const themeTextColor = isDark ? '#FFFFFF' : '#0F172A';
  const themeSecondaryColor = isDark ? '#94A3B8' : '#64748B';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={[styles.container, themeContainer]}>
        {/* TOP BAR / DRAG HANDLE */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="sparkles" size={18} color="#D97706" />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: themeTextColor }]}>
                {"Post-Salah Du'a & Adhkar"}
              </Text>
              <Text style={[styles.headerSubtitle, { color: themeSecondaryColor }]}>
                Authentic Sunnah Supplications
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close post-salah modal"
            style={({ pressed }) => [
              styles.closeButton,
              isDark ? styles.closeDark : styles.closeLight,
              pressed && { opacity: 0.7 },
            ]}>
            <Ionicons name="close" size={20} color={themeTextColor} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* 1. ISTIGHFAR & SALAM */}
          <View style={[styles.card, themeCard]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>1</Text>
              </View>
              <Text style={[styles.cardSectionTitle, { color: themeTextColor }]}>
                Istighfar & As-Salam
              </Text>
              <Text style={styles.hadithRef}>Sahih Muslim 591</Text>
            </View>

            <View style={styles.contentBlock}>
              <Text style={styles.arabicHeading}>أَسْتَغْفِرُ اللَّهَ (٣×)</Text>
              <Text style={styles.translitText}>Astaghfirullāh (3 times)</Text>
              <Text style={[styles.transText, { color: themeSecondaryColor }]}>
                {'"I ask Allah for forgiveness."'}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.contentBlock}>
              <Text style={styles.arabicBody}>
                اللَّهُمَّ أَنْتَ السَّلاَمُ وَمِنْكَ السَّلاَمُ تَبَارَكْتَ يَا ذَا الْجَلاَلِ وَالإِكْرَامِ
              </Text>
              <Text style={styles.translitText}>
                Allāhumma Antas-Salām wa minkas-salām, tabārakta yā Dhal-Jalāli wal-Ikrām.
              </Text>
              <Text style={[styles.transText, { color: themeSecondaryColor }]}>
                {'"O Allah, You are Peace and from You comes peace. Blessed are You, O Possessor of Glory and Honor."'}
              </Text>
            </View>
          </View>

          {/* 2. DUA FOR WORSHIP & GRATITUDE */}
          <View style={[styles.card, themeCard]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>2</Text>
              </View>
              <Text style={[styles.cardSectionTitle, { color: themeTextColor }]}>
                {"Du'a for Remembrance & Worship"}
              </Text>
              <Text style={styles.hadithRef}>Abu Dawud 1522</Text>
            </View>

            <View style={styles.contentBlock}>
              <Text style={styles.arabicHeading}>
                اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ
              </Text>
              <Text style={styles.translitText}>
                {"Allāhumma a'innī 'alā dhikrika wa shukrika wa ḥusni 'ibādatik."}
              </Text>
              <Text style={[styles.transText, { color: themeSecondaryColor }]}>
                {'"O Allah, assist me in remembering You, expressing gratitude to You, and worshipping You with excellence."'}
              </Text>
            </View>
          </View>

          {/* 3. AYAT AL-KURSI */}
          <View style={[styles.card, themeCard]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>3</Text>
              </View>
              <Text style={[styles.cardSectionTitle, { color: themeTextColor }]}>
                Ayat al-Kursi (2:255)
              </Text>
              <Text style={styles.hadithRef}>{"An-Nasa'i"}</Text>
            </View>

            <View style={styles.virtueBadge}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#059669" />
              <Text style={styles.virtueText}>
                Guaranteed entrance to Jannah when recited after each Fard prayer.
              </Text>
            </View>

            <View style={styles.contentBlock}>
              <Text style={styles.arabicBodyLong}>
                اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ
                لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَنْ ذَا الَّذِي يَشْفَعُ عِنْدَهُ
                إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ
                بِشَيْءٍ مِنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ
                ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ
              </Text>
              <Text style={[styles.transText, { color: themeSecondaryColor, marginTop: 8 }]}>
                {'"Allah! There is no deity except Him, the Ever-Living, the Sustainer of all existence. Neither drowsiness overtakes Him nor sleep. To Him belongs whatever is in the heavens and earth. He is the Most High, the Most Great."'}
              </Text>
            </View>
          </View>

          {/* 4. INTERACTIVE 33x TASBIH COUNTER */}
          <View style={[styles.card, themeCard, styles.tasbihCard]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>4</Text>
              </View>
              <Text style={[styles.cardSectionTitle, { color: themeTextColor }]}>
                33x Tasbih Counter
              </Text>
              <Pressable
                onPress={handleReset}
                hitSlop={8}
                style={styles.resetButton}
                accessibilityRole="button"
                accessibilityLabel="Reset tasbih counter">
                <Ionicons name="refresh" size={14} color="#D97706" />
                <Text style={styles.resetText}>Reset</Text>
              </Pressable>
            </View>

            {/* Stepper Progress Bar */}
            <View style={styles.stageIndicatorRow}>
              <View
                style={[
                  styles.stagePill,
                  stage === 'subhanallah' && styles.stagePillActive,
                  subhanallahCount >= 33 && styles.stagePillDone,
                ]}>
                <Text
                  style={[
                    styles.stagePillText,
                    stage === 'subhanallah' && styles.stagePillTextActive,
                  ]}>
                  SubhanAllah ({subhanallahCount}/33)
                </Text>
              </View>
              <View
                style={[
                  styles.stagePill,
                  stage === 'alhamdulillah' && styles.stagePillActive,
                  alhamdulillahCount >= 33 && styles.stagePillDone,
                ]}>
                <Text
                  style={[
                    styles.stagePillText,
                    stage === 'alhamdulillah' && styles.stagePillTextActive,
                  ]}>
                  Alhamdulillah ({alhamdulillahCount}/33)
                </Text>
              </View>
              <View
                style={[
                  styles.stagePill,
                  stage === 'allahuakbar' && styles.stagePillActive,
                  allahuakbarCount >= 33 && styles.stagePillDone,
                ]}>
                <Text
                  style={[
                    styles.stagePillText,
                    stage === 'allahuakbar' && styles.stagePillTextActive,
                  ]}>
                  Allahu Akbar ({allahuakbarCount}/33)
                </Text>
              </View>
            </View>

            {/* Tap-to-count Card */}
            {stage !== 'completed' ? (
              <Pressable
                onPress={handleIncrement}
                accessibilityRole="button"
                accessibilityLabel={`Tap to recite ${currentDhikrTranslit}, count is ${currentCount} of 33`}
                style={({ pressed }) => [
                  styles.counterTapArea,
                  isDark ? styles.tapAreaDark : styles.tapAreaLight,
                  pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                ]}>
                <Text style={styles.counterArabic}>{currentDhikrArabic}</Text>
                <Text style={styles.counterTranslit}>{currentDhikrTranslit}</Text>
                <Text style={[styles.counterMeaning, { color: themeSecondaryColor }]}>
                  {currentDhikrMeaning}
                </Text>

                <View style={styles.countCircle}>
                  <Text style={styles.countNumber}>{currentCount}</Text>
                  <Text style={styles.countTarget}>/ 33</Text>
                </View>

                <Text style={styles.tapToCountHint}>Tap to count (+1)</Text>
              </Pressable>
            ) : (
              /* Seal of 100 on Completion */
              <View style={[styles.sealBox, isDark ? styles.sealDark : styles.sealLight]}>
                <Ionicons name="checkmark-circle" size={32} color="#10B981" />
                <Text style={styles.sealTitle}>100th Completion Seal</Text>
                <Text style={styles.sealArabic}>
                  لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ،
                  وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ
                </Text>
                <Text style={styles.translitText}>
                  {"Lā ilāha illallāhu waḥdahu lā sharīka lahu, lahul-mulku wa lahul-ḥamdu, wa huwa 'alā kulli shay'in qadīr."}
                </Text>
                <Text style={[styles.sealReward, { color: themeSecondaryColor }]}>
                  {'"Whoever says this after 33x tasbih, his sins are forgiven even if they were like the foam of the sea." (Muslim 597)'}
                </Text>
                <Pressable
                  onPress={handleReset}
                  style={styles.repeatButton}
                  accessibilityRole="button">
                  <Text style={styles.repeatButtonText}>Start Again</Text>
                </Pressable>
              </View>
            )}

            <Text style={[styles.totalCountFooter, { color: themeSecondaryColor }]}>
              Total Progress: {totalCompleted} / 99 completed
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  modalLight: {
    backgroundColor: '#F8FAFC',
  },
  modalDark: {
    backgroundColor: '#0B0F19',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(100, 116, 139, 0.2)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLight: {
    backgroundColor: '#E2E8F0',
  },
  closeDark: {
    backgroundColor: '#1E293B',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  cardDark: {
    backgroundColor: '#131C2E',
    borderColor: '#1E293B',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  hadithRef: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
  },
  contentBlock: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  arabicHeading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#D97706',
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 32,
    marginBottom: 6,
  },
  arabicBody: {
    fontSize: 18,
    fontWeight: '600',
    color: '#D97706',
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 30,
    marginBottom: 6,
  },
  arabicBodyLong: {
    fontSize: 17,
    fontWeight: '600',
    color: '#D97706',
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 30,
  },
  translitText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  transText: {
    fontSize: 12,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
    marginVertical: 12,
  },
  virtueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  virtueText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    flex: 1,
  },
  // TASBIH COUNTER STYLES
  tasbihCard: {
    paddingBottom: 16,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
  },
  resetText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  stageIndicatorRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  stagePill: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stagePillActive: {
    backgroundColor: '#2563EB',
  },
  stagePillDone: {
    backgroundColor: '#10B981',
  },
  stagePillText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  stagePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  counterTapArea: {
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2563EB',
  },
  tapAreaLight: {
    backgroundColor: '#EFF6FF',
  },
  tapAreaDark: {
    backgroundColor: '#172236',
  },
  counterArabic: {
    fontSize: 26,
    fontWeight: '700',
    color: '#D97706',
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 6,
  },
  counterTranslit: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2563EB',
    marginBottom: 2,
  },
  counterMeaning: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 14,
  },
  countCircle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 24,
    marginBottom: 10,
  },
  countNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  countTarget: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginLeft: 4,
  },
  tapToCountHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
    letterSpacing: 0.3,
  },
  sealBox: {
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealLight: {
    backgroundColor: '#ECFDF5',
  },
  sealDark: {
    backgroundColor: '#064E3B',
  },
  sealTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#10B981',
    marginTop: 6,
    marginBottom: 8,
  },
  sealArabic: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D97706',
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 28,
    marginBottom: 8,
  },
  sealReward: {
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 16,
  },
  repeatButton: {
    marginTop: 12,
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  repeatButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  totalCountFooter: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 12,
  },
});
