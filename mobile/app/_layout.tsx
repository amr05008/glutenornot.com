import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BRAND_COLORS } from '../constants/verdicts';

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
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: BRAND_COLORS.primary,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'GlutenOrNot',
          }}
        />
        <Stack.Screen
          name="result"
          options={{
            title: 'Result',
            presentation: 'modal',
          }}
        />
      </Stack>
    </>
  );
}

export default Sentry.wrap(RootLayout);
