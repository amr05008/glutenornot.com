import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { BRAND_COLORS } from '../constants/verdicts';

interface LoadingSpinnerProps {
  message?: string;
}

export function LoadingSpinner({ message = 'Analyzing...' }: LoadingSpinnerProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  message: {
    marginTop: 16,
    fontSize: 18,
    color: '#666',
  },
});
