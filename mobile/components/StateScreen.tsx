/* Centered full-screen system state (camera permission / offline / couldn't-read).
 * Ported from A_StateScreen in the V2 design package. */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Icon, IconName } from './Icon';
import { theme } from '../constants/theme';
import { sans } from '../constants/fonts';

interface StateScreenProps {
  icon: IconName;
  iconColor?: string;
  iconBg?: string;
  title: string;
  body: string;
  primary: string;
  onPrimary: () => void;
  secondary?: string;
  onSecondary?: () => void;
}

export function StateScreen({
  icon,
  iconColor = theme.color.ink,
  iconBg = theme.color.surfaceMuted,
  title,
  body,
  primary,
  onPrimary,
  secondary,
  onSecondary,
}: StateScreenProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.iconChip, { backgroundColor: iconBg }]}>
        <Icon name={icon} size={34} color={iconColor} stroke={2} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={onPrimary}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={primary}
      >
        <Text style={styles.primaryText}>{primary}</Text>
      </TouchableOpacity>
      {secondary && (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onSecondary}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={secondary}
        >
          <Text style={styles.secondaryText}>{secondary}</Text>
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
    paddingHorizontal: theme.space[8] + 4,
    backgroundColor: theme.color.surface,
  },
  iconChip: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.space[6],
  },
  copy: {
    maxWidth: 310,
    alignItems: 'center',
  },
  title: {
    fontFamily: sans('800'),
    fontSize: 24,
    letterSpacing: -0.6,
    lineHeight: 28,
    color: theme.color.ink,
    textAlign: 'center',
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
    maxWidth: 320,
    height: 56,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryText: {
    fontFamily: sans('700'),
    fontSize: 16.5,
    color: '#fff',
  },
  secondaryButton: {
    marginTop: theme.space[4],
    paddingVertical: theme.space[2],
  },
  secondaryText: {
    fontFamily: sans('600'),
    fontSize: 15,
    color: theme.color.ink,
    textDecorationLine: 'underline',
  },
});
