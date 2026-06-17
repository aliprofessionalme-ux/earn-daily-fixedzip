import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppSplash } from "@/components/AppSplash";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GoogleAuthScreen } from "@/components/GoogleAuthScreen";
import { Onboarding } from "@/components/Onboarding";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { UserProvider, useUser } from "@/contexts/UserContext";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

function RootStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="avatar" options={{ headerShown: false }} />
      <Stack.Screen name="transactions" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="task-history" options={{ headerShown: false }} />
      <Stack.Screen name="support" options={{ headerShown: false }} />
      <Stack.Screen name="leaderboard" options={{ headerShown: false }} />
      <Stack.Screen name="referral" options={{ headerShown: false }} />
      <Stack.Screen name="how-it-works" options={{ headerShown: false }} />
      <Stack.Screen name="terms" options={{ headerShown: false }} />
    </Stack>
  );
}

function AppGate() {
  const { isLoading, error, retryInit, onboardingComplete, completeOnboarding, user, firebaseUid } = useUser();
  const hasRequiredProfile = Boolean(user?.displayName?.trim() && user.displayName.trim().length >= 2);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  if (isLoading) return <AppSplash />;
  if (!firebaseUid || !user) return <GoogleAuthScreen />;
  if (error) return <AppSplash error={error} onRetry={retryInit} />;
  if (!onboardingComplete || !hasRequiredProfile) return <Onboarding onDone={() => void completeOnboarding()} />;
  return <RootStack />;
}

function FontLoadingFallback() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#050607", paddingHorizontal: 24 }}>
      <ActivityIndicator color="#F2C94C" size="large" />
      <Text style={{ color: "#FFF9EA", fontSize: 18, fontWeight: "700", marginTop: 16, textAlign: "center" }}>Earn Daily</Text>
      <Text style={{ color: "#B8B0A0", fontSize: 13, marginTop: 6, textAlign: "center" }}>Starting your reward account...</Text>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (!fontsLoaded && !fontError) return <FontLoadingFallback />;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <UserProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <StatusBar style="light" />
                  <AppGate />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </UserProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
