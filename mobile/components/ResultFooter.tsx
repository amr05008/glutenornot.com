/* Footer shared by both result cards: the lifetime scan counter and, once the
 * app has proven useful (same 3-scan gate as the system rating prompt), a
 * plain link to the App Store's write-a-review sheet. Replaced the feedback-
 * form line on 2026-09-15 (zero submissions since launch — see
 * plans/review-prompt-visibility-2026-09-15.md D4). Deliberately a text link,
 * not a prompt: Apple 5.6.4 forbids custom review *prompts*. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';
import { sans } from '../constants/fonts';
import { REVIEW_SCAN_THRESHOLD } from '../services/review';

interface ResultFooterProps {
  scanCount: number;
  onRate: () => void;
}

export function ResultFooter({ scanCount, onRate }: ResultFooterProps) {
  return (
    <View>
      <Text style={styles.scanCounter}>{scanCount === 1 ? '1 scan' : `${scanCount} scans`}</Text>
      {scanCount >= REVIEW_SCAN_THRESHOLD && (
        <Text style={styles.ratePrompt}>
          Your feedback matters!{' '}
          <Text
            style={styles.rateLink}
            onPress={onRate}
            accessibilityRole="link"
            accessibilityLabel="Write us a review on the App Store"
          >
            Write us a review
          </Text>
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scanCounter: {
    fontFamily: sans('500'),
    textAlign: 'center',
    marginTop: theme.space[4],
    fontSize: 13,
    color: theme.color.faint,
  },
  ratePrompt: {
    fontFamily: sans('400'),
    textAlign: 'center',
    marginTop: theme.space[2],
    fontSize: 13,
    color: theme.color.faint,
  },
  rateLink: {
    fontFamily: sans('600'),
    color: theme.color.sub,
    textDecorationLine: 'underline',
  },
});
