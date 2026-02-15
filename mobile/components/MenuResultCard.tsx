import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { AnalysisResult, MenuItem, Verdict, VERDICT_CONFIG, BRAND_COLORS } from '../constants/verdicts';

interface MenuResultCardProps {
  result: AnalysisResult;
}

const VERDICT_EMOJI: Record<Verdict, string> = {
  safe: '🟢',
  caution: '🟡',
  unsafe: '🔴',
};

function groupItems(items: MenuItem[]): { safe: MenuItem[]; caution: MenuItem[]; unsafe: MenuItem[] } {
  return {
    safe: items.filter(i => i.verdict === 'safe'),
    caution: items.filter(i => i.verdict === 'caution'),
    unsafe: items.filter(i => i.verdict === 'unsafe'),
  };
}

function SummaryBadge({ items }: { items: MenuItem[] }) {
  const groups = groupItems(items);
  const parts: string[] = [];
  if (groups.safe.length > 0) parts.push(`${groups.safe.length} safe`);
  if (groups.caution.length > 0) parts.push(`${groups.caution.length} caution`);
  if (groups.unsafe.length > 0) parts.push(`${groups.unsafe.length} unsafe`);

  return (
    <View style={styles.summaryBadge} accessibilityRole="header" accessibilityLabel={`Menu summary: ${parts.join(', ')}`}>
      <Text style={styles.summaryTitle}>Menu Scan</Text>
      <View style={styles.summaryCountsRow}>
        {groups.safe.length > 0 && (
          <View style={[styles.countChip, { backgroundColor: VERDICT_CONFIG.safe.backgroundColor }]}>
            <Text style={[styles.countChipText, { color: VERDICT_CONFIG.safe.color }]}>
              {VERDICT_EMOJI.safe} {groups.safe.length} safe
            </Text>
          </View>
        )}
        {groups.caution.length > 0 && (
          <View style={[styles.countChip, { backgroundColor: VERDICT_CONFIG.caution.backgroundColor }]}>
            <Text style={[styles.countChipText, { color: VERDICT_CONFIG.caution.color }]}>
              {VERDICT_EMOJI.caution} {groups.caution.length} caution
            </Text>
          </View>
        )}
        {groups.unsafe.length > 0 && (
          <View style={[styles.countChip, { backgroundColor: VERDICT_CONFIG.unsafe.backgroundColor }]}>
            <Text style={[styles.countChipText, { color: VERDICT_CONFIG.unsafe.color }]}>
              {VERDICT_EMOJI.unsafe} {groups.unsafe.length} unsafe
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function MenuItemRow({ item }: { item: MenuItem }) {
  const config = VERDICT_CONFIG[item.verdict];

  return (
    <View style={[styles.menuItemRow, { borderLeftColor: config.color }]} accessibilityLabel={`${item.name}: ${item.verdict}. ${item.notes}`}>
      <View style={styles.menuItemHeader}>
        <Text style={styles.menuItemEmoji}>{VERDICT_EMOJI[item.verdict]}</Text>
        <Text style={styles.menuItemName}>{item.name}</Text>
      </View>
      {item.notes ? <Text style={styles.menuItemNotes}>{item.notes}</Text> : null}
    </View>
  );
}

function ItemGroup({ title, items, verdict }: { title: string; items: MenuItem[]; verdict: Verdict }) {
  if (items.length === 0) return null;
  const config = VERDICT_CONFIG[verdict];

  return (
    <View style={styles.itemGroup}>
      <Text style={[styles.groupTitle, { color: config.color }]} accessibilityRole="header">{title}</Text>
      {items.map((item, index) => (
        <MenuItemRow key={index} item={item} />
      ))}
    </View>
  );
}

export function MenuResultCard({ result }: MenuResultCardProps) {
  const items = result.menu_items || [];
  const groups = groupItems(items);
  const hasWarnings = result.allergen_warnings.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SummaryBadge items={items} />

      {/* Server disclaimer banner */}
      {hasWarnings && (
        <View style={styles.disclaimerBanner} accessibilityRole="alert">
          <Text style={styles.disclaimerIcon}>💬</Text>
          <Text style={styles.disclaimerText}>
            {result.allergen_warnings[0]}
          </Text>
        </View>
      )}

      {/* Item groups: safe first, then caution, then unsafe */}
      {items.length > 0 ? (
        <>
          <ItemGroup title="Safe to eat" items={groups.safe} verdict="safe" />
          <ItemGroup title="Ask your server" items={groups.caution} verdict="caution" />
          <ItemGroup title="Contains gluten" items={groups.unsafe} verdict="unsafe" />
        </>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            {result.explanation || 'Could not identify individual menu items. Try capturing the menu again with items clearly visible.'}
          </Text>
        </View>
      )}

      {/* Explanation summary */}
      {result.explanation ? (
        <Text style={styles.summaryLine}>{result.explanation}</Text>
      ) : null}

      {/* Always confirm note instead of confidence */}
      <Text style={styles.confirmNote}>Always confirm with your server</Text>
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
  summaryBadge: {
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: BRAND_COLORS.text,
    marginBottom: 12,
  },
  summaryCountsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  countChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  disclaimerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  disclaimerIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  disclaimerText: {
    fontSize: 14,
    color: '#0369A1',
    flex: 1,
    lineHeight: 20,
  },
  itemGroup: {
    marginBottom: 20,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  menuItemRow: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    borderLeftWidth: 3,
    padding: 12,
    marginBottom: 6,
  },
  menuItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemEmoji: {
    fontSize: 16,
    marginRight: 8,
  },
  menuItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND_COLORS.text,
    flex: 1,
  },
  menuItemNotes: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    marginLeft: 24,
    lineHeight: 20,
  },
  emptyState: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  },
  emptyStateText: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
    textAlign: 'center',
  },
  summaryLine: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 20,
  },
  confirmNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
    fontStyle: 'italic',
  },
});
