import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#2d7d46',
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
