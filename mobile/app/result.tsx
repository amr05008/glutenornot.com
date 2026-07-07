import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ResultCard } from '../components/ResultCard';
import { MenuResultCard } from '../components/MenuResultCard';
import { reportError } from '../services/errorReporting';
import { maybeRequestReview, REVIEW_PROMPT_DELAY_MS } from '../services/review';
import { AnalysisResult } from '../constants/verdicts';
import { theme } from '../constants/theme';
import { sans } from '../constants/fonts';

export default function ResultScreen() {
  const { result, scanCount } = useLocalSearchParams<{ result: string; scanCount: string }>();
  const router = useRouter();
  const count = scanCount ? parseInt(scanCount, 10) : 0;

  // A verdict on screen is the app's happiest moment — ask for a rating here,
  // after a beat so the sheet never preempts reading the result. Must run
  // before the early returns below (hooks rules), so it re-checks validity.
  useEffect(() => {
    if (!result) return;
    try {
      JSON.parse(result);
    } catch {
      return;
    }
    const timer = setTimeout(() => { maybeRequestReview(count); }, REVIEW_PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!result) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No result data</Text>
      </View>
    );
  }

  let analysisResult: AnalysisResult;
  try {
    analysisResult = JSON.parse(result);
  } catch (error) {
    reportError(error, { rawResult: result?.substring(0, 500) });
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Invalid result data</Text>
      </View>
    );
  }

  const handleClose = () => router.back();
  const handleFeedback = () => Linking.openURL('https://forms.gle/ZtSwSTuhCpAGwsHKA');

  const isMenu =
    analysisResult.mode?.toLowerCase() === 'menu' ||
    (Array.isArray(analysisResult.menu_items) && analysisResult.menu_items.length > 0);

  return (
    <View style={styles.container}>
      {isMenu ? (
        <MenuResultCard
          result={analysisResult}
          scanCount={count}
          onClose={handleClose}
          onFeedback={handleFeedback}
        />
      ) : (
        <ResultCard
          result={analysisResult}
          scanCount={count}
          onClose={handleClose}
          onFeedback={handleFeedback}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.surface,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.space[5],
    backgroundColor: theme.color.surface,
  },
  errorText: {
    fontFamily: sans('500'),
    fontSize: 16,
    color: theme.color.sub,
  },
});
