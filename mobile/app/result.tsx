import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ResultCard } from '../components/ResultCard';
import { MenuResultCard } from '../components/MenuResultCard';
import { reportError } from '../services/errorReporting';
import { AnalysisResult, BRAND_COLORS } from '../constants/verdicts';

export default function ResultScreen() {
  const { result, scanCount } = useLocalSearchParams<{ result: string; scanCount: string }>();
  const router = useRouter();
  const count = scanCount ? parseInt(scanCount, 10) : 0;

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

  const handleScanAnother = () => {
    router.back();
  };

  const handleFeedback = () => {
    Linking.openURL('https://forms.gle/ZtSwSTuhCpAGwsHKA');
  };

  return (
    <View style={styles.container}>
      {analysisResult.mode === 'menu' && analysisResult.menu_items?.length ? (
        <MenuResultCard result={analysisResult} />
      ) : (
        <ResultCard result={analysisResult} />
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.button}
          onPress={handleScanAnother}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Scan another product"
        >
          <Text style={styles.buttonText}>Scan Another</Text>
        </TouchableOpacity>
        <Text style={styles.scanCounter}>
          {count === 1 ? '1 scan' : `${count} scans`}
        </Text>
        <Text style={styles.feedbackPrompt}>
          Run into an issue?{' '}
          <Text
            style={styles.feedbackLink}
            onPress={handleFeedback}
            accessibilityRole="link"
            accessibilityLabel="Share your feedback"
          >
            Share your feedback
          </Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  footer: {
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  button: {
    backgroundColor: BRAND_COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  scanCounter: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 14,
    color: '#888',
  },
  feedbackPrompt: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 14,
    color: '#888',
  },
  feedbackLink: {
    color: BRAND_COLORS.primary,
    textDecorationLine: 'underline',
  },
});
