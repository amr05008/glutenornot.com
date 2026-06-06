import * as Sentry from '@sentry/react-native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { fontMap } from '../constants/fonts';
import { theme } from '../constants/theme';

Sentry.init({
  dsn: 'https://a7fb22da073a8c413c68808439105cba@o4510828844417024.ingest.us.sentry.io/4510828848480256',
  enabled: !__DEV__,
  tracesSampleRate: 0,
  attachScreenshot: true,
  beforeSend(event) {
    // Expected user flows, not real errors — filter at SDK level as belt-and-suspenders:
    // - not_found: barcode not in database
    // - ocr_failed: photo too blurry/off-angle to read; user is already prompted to refocus
    const errorType = event.tags?.error_type;
    if (errorType === 'not_found' || errorType === 'ocr_failed') return null;
    return event;
  },
});

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontMap);

  // Gate first render until fonts are ready so the type-led UI never flashes
  // in a system font. If loading errors, proceed anyway (RN falls back to the
  // system font) rather than leaving the app stuck on a blank screen.
  if (!fontsLoaded && !fontError) return null;

  return (
    <>
      {/* Capture screen is full-bleed dark; result/state screens are light and
          own their own top bars — so no native header chrome. */}
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.color.bg },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="result" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default Sentry.wrap(RootLayout);
