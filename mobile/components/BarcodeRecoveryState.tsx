/* Barcode recovery states A / B (plans/barcode-recovery-2026-09-05.md, design
 * export090526 addendum §2). Same visual vocabulary as StateScreen — neutral
 * chip, title, body, filled primary, underlined secondary — plus what the
 * recovery states need and the generic system states don't: an optional
 * identity block (barcode chip + product name) and a scroll-centred container
 * so large Dynamic Type and a long product name push the layout instead of
 * hiding the primary action.
 *
 * Missing information is not a verdict: no verdict band, no confidence
 * meter, no empty ingredient sections, and the B icon is neutral ink, not
 * caution amber. */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from './Icon';
import { theme } from '../constants/theme';
import { sans, mono } from '../constants/fonts';
import type { RecoveryReason } from '../services/recovery';

export const RECOVERY_COPY: Record<
  RecoveryReason,
  { icon: IconName; title: string; body: string; primary: string; secondary: string }
> = {
  not_found: {
    icon: 'barcode',
    title: 'Product not found',
    body: "We couldn't find this barcode in our databases. Scan the ingredient label instead and we'll analyze the text.",
    primary: 'Scan ingredient label',
    secondary: 'Scan another product',
  },
  missing_context: {
    icon: 'alert',
    title: 'Not enough information',
    body: "We found this product, but we don't have enough ingredient information to assess it. We can't tell whether it's gluten-free.",
    primary: 'Scan ingredient label',
    secondary: 'Scan another product',
  },
};

/** Group digits the way they're printed under the bars (EAN-13: 1·6·6,
 *  UPC-A: 1·5·5·1, EAN-8: 4·4); anything else is shown as-is. Display only. */
export function formatBarcode(code: string): string {
  const d = code.replace(/\D/g, '');
  if (d.length === 13) return `${d[0]} ${d.slice(1, 7)} ${d.slice(7)}`;
  if (d.length === 12) return `${d[0]} ${d.slice(1, 6)} ${d.slice(6, 11)} ${d[11]}`;
  if (d.length === 8) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return code;
}

interface BarcodeRecoveryStateProps {
  reason: RecoveryReason;
  /** B only: what the database called the product. Display only. */
  productName?: string | null;
  /** B only: the scanned code, for the identity chip. Display only. */
  barcode?: string | null;
  onPrimary: () => void;
  onSecondary: () => void;
}

export function BarcodeRecoveryState({
  reason,
  productName,
  barcode,
  onPrimary,
  onSecondary,
}: BarcodeRecoveryStateProps) {
  const insets = useSafeAreaInsets();
  const copy = RECOVERY_COPY[reason];
  const showIdentity = reason === 'missing_context';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + theme.space[8], paddingBottom: insets.bottom + theme.space[8] },
      ]}
      alwaysBounceVertical={false}
    >
      <View style={styles.iconChip}>
        <Icon name={copy.icon} size={34} color={theme.color.ink} stroke={2} />
      </View>
      <View style={styles.copy}>
        {showIdentity && barcode ? (
          <View style={styles.barcodeChip} accessibilityLabel={`Barcode ${formatBarcode(barcode)}`}>
            <Icon name="barcode" size={13} color={theme.color.sub} stroke={1.9} />
            <Text style={styles.barcodeChipText}>BARCODE · {formatBarcode(barcode)}</Text>
          </View>
        ) : null}
        <Text style={styles.title} accessibilityRole="header">
          {copy.title}
        </Text>
        {showIdentity && productName ? <Text style={styles.name}>{productName}</Text> : null}
        <Text style={styles.body}>{copy.body}</Text>
      </View>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={onPrimary}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={copy.primary}
        accessibilityHint="Opens the camera in photo-only mode"
      >
        <Text style={styles.primaryText}>{copy.primary}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={onSecondary}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={copy.secondary}
        accessibilityHint="Returns to the camera with barcode scanning on"
      >
        <Text style={styles.secondaryText}>{copy.secondary}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: theme.color.surface,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.space[8] + 4,
  },
  iconChip: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: theme.color.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.space[6],
  },
  copy: {
    maxWidth: 340,
    alignItems: 'center',
  },
  barcodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 14,
    paddingVertical: 5,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surfaceMuted,
    maxWidth: '100%',
  },
  barcodeChipText: {
    fontFamily: mono('600'),
    fontSize: 10.5,
    letterSpacing: 0.4,
    color: theme.color.sub,
    flexShrink: 1, // wraps at large text sizes rather than hiding the chip
  },
  title: {
    fontFamily: sans('800'),
    fontSize: 24,
    letterSpacing: -0.6,
    lineHeight: 28,
    color: theme.color.ink,
    textAlign: 'center',
  },
  name: {
    fontFamily: sans('600'),
    fontSize: 16,
    lineHeight: 22,
    color: theme.color.ink,
    textAlign: 'center',
    marginTop: theme.space[2] + 2,
  },
  body: {
    fontFamily: sans('400'),
    fontSize: 15.5,
    lineHeight: 24,
    color: theme.color.sub,
    textAlign: 'center',
    marginTop: theme.space[3],
  },
  primaryButton: {
    marginTop: 28,
    width: '100%',
    maxWidth: 340,
    minHeight: 56,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryText: {
    fontFamily: sans('700'),
    fontSize: 16.5,
    lineHeight: 21,
    color: '#fff',
    textAlign: 'center',
  },
  secondaryButton: {
    marginTop: theme.space[2],
    minHeight: theme.touchMin,
    paddingVertical: theme.space[2],
    paddingHorizontal: theme.space[2],
    justifyContent: 'center',
  },
  secondaryText: {
    fontFamily: sans('600'),
    fontSize: 15,
    lineHeight: 20,
    color: theme.color.ink,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
