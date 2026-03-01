import React, { useEffect, useRef, useCallback } from 'react';
import { Animated, StyleSheet, Text, Pressable } from 'react-native';

interface ToastProps {
  message: string;
  visible: boolean;
  duration?: number;
  onHide: () => void;
}

export function Toast({ message, visible, duration = 4000, onHide }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissed = useRef(false);

  const fadeOutAndHide = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    Animated.timing(opacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onHide());
  }, [onHide, opacity]);

  useEffect(() => {
    if (visible) {
      dismissed.current = false;

      // Fade in
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      // Auto-dismiss after duration
      const timer = setTimeout(fadeOutAndHide, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, fadeOutAndHide, opacity]);

  if (!visible) return null;

  return (
    <Pressable
      onPress={fadeOutAndHide}
      accessibilityRole="alert"
      accessibilityHint="Tap to dismiss"
    >
      <Animated.View style={[styles.container, { opacity }]}>
        <Text style={styles.text}>{message}</Text>
        <Text style={styles.dismissHint}>Tap to dismiss</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 140,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 20,
  },
  dismissHint: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    marginTop: 6,
  },
});
