import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StateScreen } from '../components/StateScreen';
import { Icon } from '../components/Icon';
import {
  getRecentScans,
  clearRecentScans,
  getLifetimeScanCount,
  RecentScan,
  RECENT_SCANS_CAP,
} from '../services/storage';
import { AnalysisResult, VERDICT_META } from '../constants/verdicts';
import { theme, verdictColors } from '../constants/theme';
import { sans } from '../constants/fonts';

/** Row title: barcode scans have a product name; OCR scans don't. */
function scanTitle(result: AnalysisResult): string {
  if (result.product_name) return result.product_name;
  if (result.mode === 'menu') return `Menu · ${result.menu_items?.length ?? 0} items`;
  return 'Ingredient label';
}

function scanSubtitle(scan: RecentScan): string {
  const kind = scan.result.mode === 'menu' ? 'Menu' : 'Label';
  const date = new Date(scan.savedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return `${VERDICT_META[scan.result.verdict].word} · ${kind} · ${date}`;
}

export default function RecentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // null = still loading — avoids flashing the empty state before the read lands
  const [scans, setScans] = useState<RecentScan[] | null>(null);
  const [scanCount, setScanCount] = useState(0);

  useEffect(() => {
    (async () => {
      setScanCount(await getLifetimeScanCount());
      setScans(await getRecentScans());
    })();
  }, []);

  const openScan = useCallback(
    (scan: RecentScan) => {
      router.push({
        pathname: '/result',
        // fromHistory suppresses the rating prompt — reopening an old scan
        // isn't the "happy moment" the ask is reserved for.
        params: { result: JSON.stringify(scan.result), scanCount: String(scanCount), fromHistory: '1' },
      });
    },
    [router, scanCount]
  );

  const handleClear = useCallback(() => {
    Alert.alert('Clear recents?', 'This removes your scan history from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearRecentScans();
          setScans([]);
        },
      },
    ]);
  }, []);

  if (scans === null) {
    return <View style={styles.container} />;
  }

  if (scans.length === 0) {
    return (
      <StateScreen
        icon="history"
        title="No scans yet"
        body={`Your recent scans will show up here — the last ${RECENT_SCANS_CAP}, stored only on this device.`}
        primary="Start scanning"
        onPrimary={() => router.back()}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.space[2] }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back to camera"
        >
          <Icon name="arrowLeft" size={22} color={theme.color.ink} stroke={2} />
        </TouchableOpacity>
        <Text style={styles.title}>Recents</Text>
        <TouchableOpacity
          style={styles.clearButton}
          onPress={handleClear}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Clear all recent scans"
        >
          <Text style={styles.clearText}>Clear</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={scans}
        keyExtractor={(item) => String(item.savedAt)}
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.space[6] }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => openScan(item)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`${scanTitle(item.result)}, ${scanSubtitle(item)}`}
            accessibilityHint="Opens the saved scan result"
          >
            <View
              style={[styles.dot, { backgroundColor: verdictColors[item.result.verdict].accent }]}
            />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {scanTitle(item.result)}
              </Text>
              <Text style={styles.rowSub}>{scanSubtitle(item)}</Text>
            </View>
            <Icon name="arrowRight" size={18} color={theme.color.faint} stroke={1.8} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.space[4],
    paddingBottom: theme.space[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
  },
  backButton: {
    width: theme.touchMin,
    height: theme.touchMin,
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: sans('800'),
    fontSize: 18,
    letterSpacing: -0.3,
    color: theme.color.ink,
  },
  clearButton: {
    width: theme.touchMin,
    height: theme.touchMin,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  clearText: {
    fontFamily: sans('600'),
    fontSize: 14.5,
    color: theme.color.sub,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    paddingHorizontal: theme.space[5],
    paddingVertical: theme.space[4],
  },
  separator: {
    height: 1,
    backgroundColor: theme.color.line,
    marginLeft: theme.space[5],
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: sans('600'),
    fontSize: 16,
    color: theme.color.ink,
  },
  rowSub: {
    fontFamily: sans('500'),
    fontSize: 13,
    color: theme.color.sub,
    marginTop: 2,
  },
});
