import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProfilePhotoAvatar } from "@/components/ProfilePhotoAvatar";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import { getProfilePhotoUri, setProfilePhotoUri } from "@/services/profilePhoto";

export default function AvatarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, deviceId } = useUser();
  const [photoUri, setPhotoUriState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const topPad = Platform.OS === "web" ? 24 : insets.top + 8;
  const publicName = (user?.displayName || "Earn Daily User").trim();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPhotoUriState(await getProfilePhotoUri());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pickFromGallery = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setNotice({ text: "Gallery permission is required to choose a profile photo.", ok: false });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.86,
      });

      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) {
        setNotice({ text: "Could not read selected image.", ok: false });
        return;
      }

      await setProfilePhotoUri(uri);
      setPhotoUriState(uri);
      setNotice({ text: "Profile photo updated.", ok: true });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : "Unable to choose photo.", ok: false });
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const removePhoto = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await setProfilePhotoUri(null);
      setPhotoUriState(null);
      setNotice({ text: "Profile photo removed.", ok: true });
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}> 
      <ScrollView contentContainerStyle={{ paddingTop: topPad, paddingBottom: Platform.OS === "web" ? 34 : 42, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Profile Photo</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Choose a clean photo from your gallery</Text>
          </View>
        </View>

        <LinearGradient colors={[colors.card, colors.background]} style={[styles.previewCard, { borderColor: colors.border }]}> 
          {loading ? (
            <View style={styles.previewLoading}>
              <ActivityIndicator color={colors.gold} />
              <Text style={[styles.previewText, { color: colors.mutedForeground }]}>Loading photo...</Text>
            </View>
          ) : (
            <>
              <ProfilePhotoAvatar uri={photoUri} name={publicName} fallback={deviceId} size={138} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.previewTitle, { color: colors.foreground }]}>Your account photo</Text>
                <Text style={[styles.previewBody, { color: colors.mutedForeground }]}>This replaces the temporary generated avatar. It stays on this device for now and keeps the app clean until we build a proper premium avatar studio.</Text>
              </View>
            </>
          )}
        </LinearGradient>

        {notice ? <Text style={[styles.notice, { color: notice.ok ? colors.green : colors.destructive }]}>{notice.text}</Text> : null}

        <View style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Pressable disabled={busy} onPress={pickFromGallery} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: busy ? 0.68 : pressed ? 0.82 : 1 }]}> 
            {busy ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Feather name="image" size={18} color={colors.primaryForeground} />}
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Choose From Gallery</Text>
          </Pressable>
          <Pressable disabled={busy || !photoUri} onPress={removePhoto} style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.background, opacity: !photoUri ? 0.45 : pressed ? 0.78 : 1 }]}> 
            <Feather name="trash-2" size={16} color={colors.destructive} />
            <Text style={[styles.secondaryButtonText, { color: colors.destructive }]}>Remove Photo</Text>
          </Pressable>
        </View>

        <View style={[styles.noteCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="info" size={18} color={colors.gold} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.noteTitle, { color: colors.foreground }]}>Temporary clean setup</Text>
            <Text style={[styles.noteBody, { color: colors.mutedForeground }]}>Later we can build a real Snap-style avatar studio with professional assets. For now, gallery photo gives better quality immediately.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  iconButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Inter_800ExtraBold", fontSize: 22, lineHeight: 28 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16, marginTop: 1 },
  previewCard: { minHeight: 168, borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 10 },
  previewLoading: { minHeight: 138, flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  previewText: { fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 16 },
  previewTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 18, lineHeight: 23 },
  previewBody: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, marginTop: 7 },
  notice: { fontFamily: "Inter_700Bold", fontSize: 12, lineHeight: 16, textAlign: "center", marginBottom: 10 },
  actionCard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  primaryButton: { minHeight: 46, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryButtonText: { fontFamily: "Inter_800ExtraBold", fontSize: 14, lineHeight: 18 },
  secondaryButton: { minHeight: 42, borderWidth: 1, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  secondaryButtonText: { fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  noteCard: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: "row", gap: 10, marginTop: 14 },
  noteTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 14, lineHeight: 18 },
  noteBody: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, marginTop: 2 },
});
