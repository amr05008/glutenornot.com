import React, { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ResultCard } from '../components/ResultCard';
import { MenuResultCard } from '../components/MenuResultCard';
import { reportError } from '../services/errorReporting';
import { maybeRequestReview, REVIEW_PROMPT_DELAY_MS } from '../services/review';
import { sendRecoveryEvent } from '../services/recovery';
import { AnalysisResult, Verdict, Confidence } from '../constants/verdicts';
import { theme } from '../constants/theme';
import { sans } from '../constants/fonts';

const VERDICTS: ReadonlySet<string> = new Set<Verdict>(['safe', 'caution', 'unsafe']);
const CONFIDENCES: ReadonlySet<string> = new Set<Confidence>(['high', 'medium', 'low']);

function isMenuResult(r: AnalysisResult): boolean {
  return (
    r.mode?.toLowerCase() === 'menu' ||
    (Array.isArray(r.menu_items) && r.menu_items.length > 0)
  );
}

export default function ResultScreen() {
  // recoveryFlowId / recoveryReason (plans/barcode-recovery-2026-09-05.md):
  // transient route metadata from the camera screen when this result completes
  // a barcode-to-photo recovery flow. Route params only — never part of the
  // result object, never persisted to Recents (a reopen carries neither).
  const { result, scanCount, fromHistory, recoveryFlowId, recoveryReason } = useLocalSearchParams<{
    result: string;
    scanCount: string;
    fromHistory?: string;
    recoveryFlowId?: string;
    recoveryReason?: string;
  }>();
  const router = useRouter();
  const count = scanCount ? parseInt(scanCount, 10) : 0;

  // A FRESH verdict on screen is the app's happiest moment — ask for a rating
  // here, after a beat so the sheet never preempts reading the result.
  // Reopens from Recents don't count. Must run before the early returns below
  // (hooks rules), so it re-checks validity.
  useEffect(() => {
    if (!result || fromHistory === '1') return;
    try {
      JSON.parse(result);
    } catch {
      return;
    }
    const timer = setTimeout(() => { maybeRequestReview(count); }, REVIEW_PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useFocusEffect(useCallback(() => {
    if (!result || fromHistory === '1') return;
    let parsed: AnalysisResult;
    try {
      parsed = JSON.parse(result);
    } catch {
      return;
    }
    // Mount alone is not proof of display: the route must also be focused.
    // Recovery funnel: a validated, fresh result is on screen. Bounded enums
    // only — never the explanation, the product, or anything from the result
    // beyond its verdict class. Once per flow (the service dedupes remounts).
    if (
      recoveryFlowId &&
      (recoveryReason === 'not_found' || recoveryReason === 'missing_context') &&
      parsed &&
      VERDICTS.has(parsed.verdict)
    ) {
      sendRecoveryEvent(recoveryFlowId, recoveryReason, 'result_displayed', {
        resultMode: isMenuResult(parsed) ? 'menu' : 'label',
        verdict: parsed.verdict,
        ...(CONFIDENCES.has(parsed.confidence) ? { confidence: parsed.confidence } : {}),
      });
    }
  }, [result, fromHistory, recoveryFlowId, recoveryReason]));

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

  const isMenu = isMenuResult(analysisResult);

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
