/* Label / barcode result screen — LOUD full-bleed verdict band over a white
 * sheet. Ported from A_Result in the V2 design package. Owns the top bar,
 * verdict band, result sheet, "Scan another" action, and the scan-count /
 * feedback footer. */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { AnalysisResult, VERDICT_META, CONFIDENCE_LEVEL, verdictColors } from '../constants/verdicts';
import { theme } from '../constants/theme';
import { sans, mono } from '../constants/fonts';

interface ResultCardProps {
  result: AnalysisResult;
  scanCount: number;
  onClose: () => void;
  onFeedback: () => void;
}

function ConfidenceMeter({ level, color }: { level: number; color: string }) {
  return (
    <View style={styles.meter}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={[styles.meterSeg, { backgroundColor: i <= level ? color : 'rgba(0,0,0,0.12)' }]}
        />
      ))}
    </View>
  );
}

function IngredientRow({
  children,
  dotColor,
  glyph,
}: {
  children: React.ReactNode;
  dotColor?: string;
  glyph?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      {dotColor && <View style={[styles.rowDot, { backgroundColor: dotColor }]} />}
      {glyph && <View style={styles.rowGlyph}>{glyph}</View>}
      <Text style={styles.rowText}>{children}</Text>
    </View>
  );
}

export function ResultCard({ result, scanCount, onClose, onFeedback }: ResultCardProps) {
  const insets = useSafeAreaInsets();
  const v = verdictColors[result.verdict];
  const meta = VERDICT_META[result.verdict];
  const level = CONFIDENCE_LEVEL[result.confidence];
  const isBarcode = !!result.barcode;
  const iconBorder = v.on === '#FFFFFF' ? 'rgba(255,255,255,0.5)' : 'rgba(28,20,7,0.35)';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: theme.space[10] }}>
      {/* LOUD full-bleed verdict band — runs to the top of the sheet; the close
          button floats over it so an absent product title leaves no white void. */}
      <View
        style={[styles.band, { backgroundColor: v.fill, paddingTop: insets.top + theme.space[10] }]}
        accessibilityRole="header"
        accessibilityLabel={`Verdict: ${meta.word}`}
      >
        <View style={[styles.bandIcon, { borderColor: iconBorder }]}>
          <Icon name={meta.glyph} size={30} color={v.on} stroke={2.4} />
        </View>
        <Text style={[styles.bandEyebrow, { color: v.on }]}>VERDICT</Text>
        <Text style={[styles.bandWord, { color: v.on }]}>{meta.word}</Text>
      </View>

      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + theme.space[3], borderColor: iconBorder }]}
        onPress={onClose}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Icon name="close" size={19} color={v.on} stroke={2} />
      </TouchableOpacity>

      {/* white sheet */}
      <View style={styles.sheet}>
        {/* source chip — how the product was identified */}
        <View style={styles.chip}>
          <Icon name={isBarcode ? 'barcode' : 'camera'} size={14} color={theme.color.sub} stroke={1.9} />
          <Text style={styles.chipText}>
            {isBarcode ? `BARCODE · ${result.barcode}` : 'PHOTO · LABEL'}
          </Text>
        </View>

        {!!result.product_name && (
          <Text style={styles.productName}>{result.product_name}</Text>
        )}

        <Text style={styles.explanation}>{result.explanation}</Text>

        {result.flagged_ingredients.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Flagged ingredients</Text>
            {result.flagged_ingredients.map((f, i) => (
              <IngredientRow key={`${f}-${i}`} dotColor={v.accent}>{f}</IngredientRow>
            ))}
          </View>
        )}

        {result.allergen_warnings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Allergen warnings</Text>
            {result.allergen_warnings.map((w, i) => (
              <IngredientRow
                key={`${w}-${i}`}
                glyph={<Icon name="alert" size={16} color={verdictColors.caution.accent} stroke={2} />}
              >
                {w}
              </IngredientRow>
            ))}
          </View>
        )}

        <View style={styles.confidenceRow}>
          <Text style={styles.confidenceLabel}>Confidence</Text>
          <View style={styles.confidenceValue}>
            <ConfidenceMeter level={level} color={v.accent} />
            <Text style={styles.confidenceLevel}>{result.confidence}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.scanAnother}
          onPress={onClose}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Scan another product"
        >
          <Icon name="refresh" size={20} color="#fff" stroke={2} />
          <Text style={styles.scanAnotherText}>Scan another</Text>
        </TouchableOpacity>

        {/* scan count + feedback */}
        <Text style={styles.scanCounter}>{scanCount === 1 ? '1 scan' : `${scanCount} scans`}</Text>
        <Text style={styles.feedbackPrompt}>
          Run into an issue?{' '}
          <Text
            style={styles.feedbackLink}
            onPress={onFeedback}
            accessibilityRole="link"
            accessibilityLabel="Share your feedback"
          >
            Share your feedback
          </Text>
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.surface,
  },
  closeButton: {
    position: 'absolute',
    left: theme.space[4],
    width: 38,
    height: 38,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  band: {
    paddingHorizontal: theme.space[6],
    paddingBottom: theme.space[10],
    alignItems: 'center',
  },
  bandIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.space[4],
  },
  bandEyebrow: {
    fontFamily: sans('700'),
    fontSize: 12,
    letterSpacing: 2.5,
    opacity: 0.72,
    marginBottom: theme.space[1],
  },
  bandWord: {
    fontFamily: sans('800'),
    fontSize: 60,
    letterSpacing: -1.8,
    lineHeight: 64,
  },
  sheet: {
    paddingHorizontal: theme.space[6],
    paddingTop: theme.space[6],
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: theme.space[4],
    paddingVertical: 5,
    paddingLeft: theme.space[2],
    paddingRight: theme.space[3] - 2,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surfaceMuted,
  },
  chipText: {
    fontFamily: mono('600'),
    fontSize: 11,
    letterSpacing: 0.4,
    color: theme.color.sub,
  },
  productName: {
    fontFamily: sans('800'),
    fontSize: 22,
    letterSpacing: -0.4,
    lineHeight: 27,
    color: theme.color.ink,
    marginBottom: theme.space[3],
  },
  explanation: {
    fontFamily: sans('400'),
    fontSize: 17,
    lineHeight: 26,
    color: theme.color.ink,
  },
  section: {
    marginTop: theme.space[6],
  },
  sectionHeader: {
    fontFamily: sans('700'),
    fontSize: 11.5,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: theme.color.sub,
    marginBottom: theme.space[1],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  rowDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  rowGlyph: {
    flexShrink: 0,
  },
  rowText: {
    flex: 1,
    fontFamily: sans('500'),
    fontSize: 16,
    color: theme.color.ink,
  },
  confidenceRow: {
    marginTop: theme.space[6],
    paddingTop: theme.space[4],
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  confidenceLabel: {
    fontFamily: sans('500'),
    fontSize: 13,
    color: theme.color.sub,
  },
  confidenceValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confidenceLevel: {
    fontFamily: sans('700'),
    fontSize: 13,
    color: theme.color.ink,
    textTransform: 'capitalize',
  },
  meter: {
    flexDirection: 'row',
    gap: 3,
  },
  meterSeg: {
    width: 16,
    height: 5,
    borderRadius: 2,
  },
  scanAnother: {
    marginTop: theme.space[8] - 2,
    height: 56,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  scanAnotherText: {
    fontFamily: sans('700'),
    fontSize: 16.5,
    color: '#fff',
  },
  scanCounter: {
    fontFamily: sans('500'),
    textAlign: 'center',
    marginTop: theme.space[4],
    fontSize: 13,
    color: theme.color.faint,
  },
  feedbackPrompt: {
    fontFamily: sans('400'),
    textAlign: 'center',
    marginTop: theme.space[2],
    fontSize: 13,
    color: theme.color.faint,
  },
  feedbackLink: {
    fontFamily: sans('600'),
    color: theme.color.sub,
    textDecorationLine: 'underline',
  },
});
