/* Reading state — dark capture surface, neutral spinner. Ported from A_Reading
 * in the V2 design package. Keeps the slow-threshold message + cancel props. */
import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';
import { sans } from '../constants/fonts';

interface LoadingSpinnerProps {
  message?: string;
  slowMessage?: string;
  slowThresholdMs?: number;
  onCancel?: () => void;
}

export function LoadingSpinner({
  message = 'Reading ingredients…',
  slowMessage,
  slowThresholdMs = 10000,
  onCancel,
}: LoadingSpinnerProps) {
  const [isSlow, setIsSlow] = useState(false);

  // The slow timer runs from mount, independent of the copy: the scan screen
  // swaps `slowMessage` when the upload finishes and the server takes over,
  // and a phase change at 25 s must not push the 30 s message out to 55 s.
  useEffect(() => {
    const timer = setTimeout(() => setIsSlow(true), slowThresholdMs);
    return () => clearTimeout(timer);
  }, [slowThresholdMs]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#fff" />
      <Text style={styles.message}>{isSlow && slowMessage ? slowMessage : message}</Text>
      {onCancel && (
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel scan"
        >
          <Text style={[styles.cancelText, isSlow && styles.cancelTextProminent]}>Cancel</Text>
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
    backgroundColor: theme.color.captureBg,
  },
  message: {
    marginTop: 22,
    fontFamily: sans('500'),
    fontSize: 16,
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
    paddingHorizontal: theme.space[8],
    lineHeight: 23,
  },
  cancelButton: {
    position: 'absolute',
    bottom: 54,
    paddingVertical: theme.space[2],
    paddingHorizontal: theme.space[6],
  },
  cancelText: {
    fontFamily: sans('600'),
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
  },
  cancelTextProminent: {
    color: '#fff',
  },
});
