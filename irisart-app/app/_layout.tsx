import 'react-native-url-polyfill/auto';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Buffer } from 'buffer';
import 'react-native-reanimated';

import { AppThemeProvider, useAppColors } from '@/lib/appTheme';
import { AuthProvider } from '@/lib/auth';
import { LocaleProvider } from '@/lib/i18n';
import { AppAccountButton } from '@/components/AppAccountButton';
import { View } from 'react-native';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Some libs (jpeg-js, etc.) expect Buffer to exist.
globalThis.Buffer = globalThis.Buffer ?? Buffer;

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNavInner() {
  const c = useAppColors();

  return (
    <ThemeProvider
      value={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: c.background,
          card: c.surface,
          text: c.pageText,
          primary: c.tint,
          border: c.border,
        },
      }}>
      <View style={{ flex: 1 }}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="library" options={{ headerShown: false }} />
          <Stack.Screen name="account" options={{ headerShown: false }} />
          <Stack.Screen name="privacy" options={{ headerShown: false }} />
          <Stack.Screen name="terms" options={{ headerShown: false }} />
          <Stack.Screen name="capture" options={{ headerShown: false }} />
          <Stack.Screen name="iris" options={{ headerShown: false }} />
          <Stack.Screen name="review" options={{ headerShown: false }} />
          <Stack.Screen name="gallery" options={{ headerShown: false }} />
          <Stack.Screen name="shop" options={{ headerShown: false }} />
          <Stack.Screen name="checkout" options={{ headerShown: false }} />
          <Stack.Screen name="order-success" options={{ headerShown: false }} />
          <Stack.Screen name="results" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <AppAccountButton />
      </View>
    </ThemeProvider>
  );
}

function RootLayoutNav() {
  return (
    <LocaleProvider>
      <AppThemeProvider>
        <AuthProvider>
          <RootLayoutNavInner />
        </AuthProvider>
      </AppThemeProvider>
    </LocaleProvider>
  );
}
