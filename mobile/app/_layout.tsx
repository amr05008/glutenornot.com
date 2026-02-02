import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BRAND_COLORS } from '../constants/verdicts';

export default function RootLayout() {
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
