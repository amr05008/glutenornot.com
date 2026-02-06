import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { BRAND_COLORS } from '../constants/verdicts';

interface LoadingSpinnerProps {
  message?: string;
  slowMessage?: string;
  slowThresholdMs?: number;
  onCancel?: () => void;
}

export function LoadingSpinner({
  message = 'Analyzing...',
  slowMessage,
  slowThresholdMs = 10000,
  onCancel,
}: LoadingSpinnerProps) {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (!slowMessage) return;
    const timer = setTimeout(() => setIsSlow(true), slowThresholdMs);
    return () => clearTimeout(timer);
  }, [slowMessage, slowThresholdMs]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
      <Text style={styles.message}>
        {isSlow && slowMessage ? slowMessage : message}
      </Text>
      {onCancel && (
        <TouchableOpacity
          style={[styles.cancelButton, isSlow && styles.cancelButtonProminent]}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel scan"
        >
          <Text style={[styles.cancelText, isSlow && styles.cancelTextProminent]}>
            Cancel
          </Text>
        </TouchableOpacity>
      )}
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
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  cancelButton: {
    marginTop: 24,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  cancelButtonProminent: {
    backgroundColor: BRAND_COLORS.primary,
    borderRadius: 8,
  },
  cancelText: {
    fontSize: 16,
    color: '#999',
  },
  cancelTextProminent: {
    color: '#fff',
    fontWeight: '600',
  },
});
