/* Menu scan result — no single verdict. Summary tally + grouped dishes.
 * Ported from A_MenuResult in the V2 design package. */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { AnalysisResult, MenuItem, Verdict, verdictColors } from '../constants/verdicts';
import { theme } from '../constants/theme';
import { sans, mono } from '../constants/fonts';

interface MenuResultCardProps {
  result: AnalysisResult;
  scanCount: number;
  onClose: () => void;
  onFeedback: () => void;
}

type Groups = Record<Verdict, MenuItem[]>;

function groupItems(items: MenuItem[]): Groups {
  return {
    safe: items.filter((i) => i.verdict === 'safe'),
    caution: items.filter((i) => i.verdict === 'caution'),
    unsafe: items.filter((i) => i.verdict === 'unsafe'),
  };
}

function Tally({ groups }: { groups: Groups }) {
  const segs = (['safe', 'caution', 'unsafe'] as Verdict[])
    .map((k) => ({ k, n: groups[k].length, c: verdictColors[k].accent }))
    .filter((s) => s.n > 0);
  return (
    <View style={styles.tally}>
      {segs.map((s) => (
        <View key={s.k} style={{ flex: s.n, backgroundColor: s.c, borderRadius: 5 }} />
      ))}
    </View>
  );
}

function MenuGroup({ label, items, color }: { label: string; items: MenuItem[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <View style={[styles.groupDot, { backgroundColor: color }]} />
        <Text style={styles.groupLabel}>{label}</Text>
        <Text style={styles.groupCount}>{items.length}</Text>
      </View>
      {items.map((it, i) => (
        <View key={`${it.name}-${i}`} style={[styles.dish, i > 0 && styles.dishDivider]}>
          <Text style={styles.dishName}>{it.name}</Text>
          {!!it.notes && <Text style={styles.dishNotes}>{it.notes}</Text>}
        </View>
      ))}
    </View>
  );
}

export function MenuResultCard({ result, scanCount, onClose, onFeedback }: MenuResultCardProps) {
  const insets = useSafeAreaInsets();
  const items = result.menu_items || [];
  const groups = groupItems(items);
  const counts: Array<[Verdict, string]> = [
    ['safe', 'safe'],
    ['caution', 'ask'],
    ['unsafe', 'avoid'],
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: theme.space[10] }}>
      {/* neutral top strip */}
      <View style={[styles.topBar, { paddingTop: insets.top + theme.space[3] }]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onClose}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Icon name="close" size={19} color={theme.color.ink} stroke={2} />
        </TouchableOpacity>
        <Text style={styles.headerLabel} numberOfLines={2}>
          {result.product_name || 'Menu'}
        </Text>
        <View style={styles.topBarSpacer} />
      </View>

      {items.length > 0 ? (
        <>
          {/* summary header — tally instead of one loud verdict */}
          <View style={styles.summary}>
            <View style={styles.summaryTop}>
              <Text style={styles.summaryEyebrow}>MENU SCAN</Text>
              <Text style={styles.summaryCount}>{items.length} dishes</Text>
            </View>
            <Tally groups={groups} />
            <View style={styles.legend}>
              {counts.map(([k, lbl]) => (
                <View key={k} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: verdictColors[k].accent }]} />
                  <Text style={styles.legendText}>
                    <Text style={styles.legendNum}>{groups[k].length}</Text>{' '}
                    <Text style={styles.legendLabel}>{lbl}</Text>
                  </Text>
                </View>
              ))}
            </View>
            {!!result.explanation && <Text style={styles.summaryLine}>{result.explanation}</Text>}
          </View>

          {/* server-facing note (allergen guidance / show-your-server phrase) */}
          {result.allergen_warnings.length > 0 && (
            <View style={styles.noteBox}>
              <View style={styles.noteIcon}>
                <Icon name="message" size={16} color={theme.color.sub} stroke={1.8} />
              </View>
              <Text style={styles.noteText}>{result.allergen_warnings[0]}</Text>
            </View>
          )}

          {/* grouped dishes — safe first */}
          <View style={styles.groups}>
            <MenuGroup label="Safe to eat" items={groups.safe} color={verdictColors.safe.accent} />
            <MenuGroup label="Ask your server" items={groups.caution} color={verdictColors.caution.accent} />
            <MenuGroup label="Contains gluten" items={groups.unsafe} color={verdictColors.unsafe.accent} />

            <Text style={styles.disclaimer}>
              AI can miss prep details — always confirm with your server.
            </Text>
            {renderFooter()}
          </View>
        </>
      ) : (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>
            {result.explanation ||
              'Could not identify individual menu items. Try capturing the menu again with items clearly visible.'}
          </Text>
          {renderFooter()}
        </View>
      )}
    </ScrollView>
  );

  function renderFooter() {
    return (
      <>
        <TouchableOpacity
          style={styles.scanAnother}
          onPress={onClose}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Scan another"
        >
          <Icon name="refresh" size={20} color="#fff" stroke={2} />
          <Text style={styles.scanAnotherText}>Scan another</Text>
        </TouchableOpacity>
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
      </>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.surface,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space[4],
    paddingBottom: theme.space[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
    backgroundColor: theme.color.surface,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLabel: {
    flex: 1,
    fontFamily: sans('700'),
    fontSize: 11.5,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: theme.color.faint,
    textAlign: 'center',
    lineHeight: 15,
    marginHorizontal: theme.space[2],
  },
  topBarSpacer: {
    width: 38,
  },
  summary: {
    paddingHorizontal: theme.space[6],
    paddingTop: theme.space[5] + 2,
    paddingBottom: theme.space[2] - 2,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: theme.space[3],
  },
  summaryEyebrow: {
    fontFamily: sans('700'),
    fontSize: 12,
    letterSpacing: 1.6,
    color: theme.color.sub,
  },
  summaryCount: {
    fontFamily: sans('700'),
    fontSize: 13,
    color: theme.color.ink,
  },
  tally: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 5,
    overflow: 'hidden',
    gap: 2,
  },
  legend: {
    flexDirection: 'row',
    gap: theme.space[4],
    marginTop: theme.space[3],
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  legendText: {
    fontSize: 13.5,
  },
  legendNum: {
    fontFamily: sans('700'),
    color: theme.color.ink,
  },
  legendLabel: {
    fontFamily: sans('400'),
    color: theme.color.sub,
  },
  summaryLine: {
    fontFamily: sans('400'),
    fontSize: 13.5,
    lineHeight: 20,
    color: theme.color.sub,
    marginTop: theme.space[3],
  },
  noteBox: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginHorizontal: theme.space[6],
    marginTop: theme.space[4] + 2,
    padding: theme.space[3],
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surfaceMuted,
  },
  noteIcon: {
    flexShrink: 0,
    marginTop: 1,
  },
  noteText: {
    flex: 1,
    fontFamily: sans('500'),
    fontSize: 13.5,
    lineHeight: 19,
    color: theme.color.ink,
  },
  groups: {
    paddingHorizontal: theme.space[6],
    paddingTop: theme.space[2] - 2,
  },
  group: {
    marginTop: theme.space[5] + 2,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
    marginBottom: theme.space[1],
  },
  groupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  groupLabel: {
    fontFamily: sans('700'),
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.color.ink,
  },
  groupCount: {
    marginLeft: 'auto',
    fontFamily: mono('600'),
    fontSize: 11,
    color: theme.color.faint,
  },
  dish: {
    paddingVertical: theme.space[3],
  },
  dishDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  dishName: {
    fontFamily: sans('600'),
    fontSize: 15,
    color: theme.color.ink,
    lineHeight: 20,
  },
  dishNotes: {
    fontFamily: sans('400'),
    fontSize: 13,
    color: theme.color.sub,
    lineHeight: 19,
    marginTop: 2,
  },
  disclaimer: {
    marginTop: theme.space[5] + 2,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
    fontFamily: sans('400'),
    fontSize: 12.5,
    color: theme.color.faint,
    textAlign: 'center',
  },
  emptyWrap: {
    paddingHorizontal: theme.space[6],
    paddingTop: theme.space[6],
  },
  emptyText: {
    fontFamily: sans('400'),
    fontSize: 15,
    lineHeight: 22,
    color: theme.color.sub,
    textAlign: 'center',
  },
  scanAnother: {
    marginTop: theme.space[5] + 2,
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
