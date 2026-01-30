import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ResultCard } from '../components/ResultCard';
import { AnalysisResult } from '../constants/verdicts';

export default function ResultScreen() {
  const { result } = useLocalSearchParams<{ result: string }>();
  const router = useRouter();

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
  } catch {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Invalid result data</Text>
      </View>
    );
  }

  const handleScanAnother = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      <ResultCard result={analysisResult} />

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.button}
          onPress={handleScanAnother}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>Scan Another</Text>
        </TouchableOpacity>
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
    backgroundColor: '#2d7d46',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
