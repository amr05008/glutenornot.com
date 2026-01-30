import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { AnalysisResult, VERDICT_CONFIG } from '../constants/verdicts';

interface ResultCardProps {
  result: AnalysisResult;
}

export function ResultCard({ result }: ResultCardProps) {
  const config = VERDICT_CONFIG[result.verdict];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Verdict Badge */}
      <View style={[styles.badge, { backgroundColor: config.backgroundColor }]}>
        <Text style={[styles.badgeIcon, { color: config.color }]}>{config.icon}</Text>
        <Text style={[styles.badgeLabel, { color: config.color }]}>{config.label}</Text>
      </View>

      {/* Explanation */}
      <Text style={styles.explanation}>{result.explanation}</Text>

      {/* Flagged Ingredients */}
      {result.flagged_ingredients.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Flagged Ingredients</Text>
          {result.flagged_ingredients.map((ingredient, index) => (
            <View key={index} style={styles.listItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listItemText}>{ingredient}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Allergen Warnings */}
      {result.allergen_warnings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Allergen Warnings</Text>
          {result.allergen_warnings.map((warning, index) => (
            <View key={index} style={styles.listItem}>
              <Text style={styles.bullet}>⚠</Text>
              <Text style={styles.listItemText}>{warning}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Confidence */}
      <Text style={styles.confidence}>
        Confidence: {result.confidence}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 20,
  },
  badgeIcon: {
    fontSize: 28,
    fontWeight: 'bold',
    marginRight: 12,
  },
  badgeLabel: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  explanation: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    marginBottom: 20,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  bullet: {
    fontSize: 16,
    color: '#666',
    marginRight: 8,
    width: 20,
  },
  listItemText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  confidence: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 20,
    textTransform: 'capitalize',
  },
});
