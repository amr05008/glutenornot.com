import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BRAND_COLORS } from '../constants/verdicts';

Sentry.init({
  dsn: 'https://a7fb22da073a8c413c68808439105cba@o4510828844417024.ingest.us.sentry.io/4510828848480256',
  enabled: !__DEV__,
  tracesSampleRate: 0,
  attachScreenshot: true,
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
