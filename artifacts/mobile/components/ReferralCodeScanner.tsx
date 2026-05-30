import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { extractReferralCode } from "@/utils/referralCode";

type ScanEvent = { data?: string | null };

interface ReferralCodeScannerProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onCode: (code: string) => void;
}

export function ReferralCodeScanner({ visible, title = "Scan referral QR", onClose, onCode }: ReferralCodeScannerProps) {
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanLocked, setScanLocked] = useState(false);

  useEffect(() => {
    if (visible) setScanLocked(false);
  }, [visible]);

  const handleScan = (event: ScanEvent) => {
    if (scanLocked) return;
    const code = extractReferralCode(event.data ?? "");
    if (!code) return;
    setScanLocked(true);
    onCode(code);
    onClose();
  };

  const permissionBlocked = permission && !permission.granted && permission.canAskAgain === false;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <View style={styles.headerRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Point the camera at an Earn Daily referral QR.</Text>
            </View>
            <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.background, borderColor: colors.border }]}> 
              <Feather name="x" size={20} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={[styles.cameraFrame, { borderColor: colors.gold + "66", backgroundColor: colors.background }]}> 
            {!permission ? (
              <View style={styles.permissionBox}>
                <Feather name="camera" size={34} color={colors.gold} />
                <Text style={[styles.permissionText, { color: colors.mutedForeground }]}>Opening camera...</Text>
              </View>
            ) : !permission.granted ? (
              <View style={styles.permissionBox}>
                <Feather name={permissionBlocked ? "slash" : "camera"} size={34} color={colors.gold} />
                <Text style={[styles.permissionText, { color: colors.mutedForeground }]}> 
                  {permissionBlocked
                    ? "Camera permission is blocked. Enable it from app settings or paste the code manually."
                    : "Allow camera access to scan referral QR codes."}
                </Text>
                {!permissionBlocked ? (
                  <Pressable onPress={() => void requestPermission()} style={[styles.permissionBtn, { backgroundColor: colors.primary }]}> 
                    <Text style={styles.permissionBtnText}>Allow Camera</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={scanLocked ? undefined : handleScan}
              />
            )}

            <View pointerEvents="none" style={[styles.scanBox, { borderColor: colors.gold }]} />
          </View>

          <Text style={[styles.footerText, { color: colors.mutedForeground }]}> 
            {Platform.OS === "web" ? "If browser camera is unavailable, paste the referral code manually." : "Keep the QR inside the gold box until the code fills automatically."}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.72)" },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 16, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, lineHeight: 23 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, marginTop: 2 },
  closeBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cameraFrame: { height: 330, borderRadius: 18, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  camera: { width: "100%", height: "100%" },
  permissionBox: { padding: 22, alignItems: "center", justifyContent: "center", gap: 12 },
  permissionText: { fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 19, textAlign: "center" },
  permissionBtn: { minHeight: 42, borderRadius: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  permissionBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  scanBox: { position: "absolute", width: 210, height: 210, borderRadius: 18, borderWidth: 2 },
  footerText: { fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 17, textAlign: "center" },
});
