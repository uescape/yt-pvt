import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider } from '../src/state';
import { useColors } from '../src/ui';

export default function RootLayout() {
  const c = useColors();
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: c.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Curato' }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="pair" options={{ title: 'Add a TV', presentation: 'modal' }} />
          <Stack.Screen name="profile/new" options={{ title: 'New profile', presentation: 'modal' }} />
          <Stack.Screen name="profile/[id]" options={{ title: 'Profile' }} />
          <Stack.Screen name="channels" options={{ title: 'Add channel', presentation: 'modal' }} />
          <Stack.Screen name="preview/[id]" options={{ title: 'What the TV shows' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
