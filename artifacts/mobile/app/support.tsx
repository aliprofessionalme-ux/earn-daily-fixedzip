import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import { getSupportTickets, submitSupportTicket, type SupportTicket } from "@/services/api";
import { SectionTitle } from "@/components/SectionTitle";

const issueTypes = ["Withdrawal", "Reward missing", "Offerwall", "Account", "Other"];
const SUPPORT_EMAIL = "support@earndaily.app";
function formatDate(ts: string) { try { return new Date(ts).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }); } catch { return "-"; } }

export default function SupportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { deviceId } = useUser();
  const [issueType, setIssueType] = useState(issueTypes[0]);
  const [message, setMessage] = useState("");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const topPad = Platform.OS === "web" ? 28 : insets.top + 8;

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true); setError(null);
    try { setTickets(await getSupportTickets(deviceId)); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load tickets."); }
    finally { setLoading(false); }
  }, [deviceId]);

  useEffect(() => { void load(); }, [load]);

  const submit = useCallback(async () => {
    if (!deviceId) return;
    if (message.trim().length < 5) { setNotice("Write at least 5 characters."); return; }
    setSubmitting(true); setNotice(null);
    try {
      await submitSupportTicket(deviceId, { issueType, message: message.trim() });
      setMessage(""); setNotice("Support ticket submitted."); await load();
    } catch (err) { setNotice(err instanceof Error ? err.message : "Unable to submit ticket."); }
    finally { setSubmitting(false); }
  }, [deviceId, issueType, load, message]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}> 
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Support</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Submit issues and view ticket status</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 34 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.emailCard, { backgroundColor: colors.gold + "12", borderColor: colors.gold + "32" }]}> 
          <Feather name="mail" size={18} color={colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.emailTitle, { color: colors.foreground }]}>Support email</Text>
            <Text style={[styles.emailText, { color: colors.gold }]}>{SUPPORT_EMAIL}</Text>
          </View>
        </View>

        <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Issue type</Text>
          <View style={styles.chips}>
            {issueTypes.map((type) => (
              <Pressable key={type} onPress={() => setIssueType(type)} style={[styles.chip, { borderColor: issueType === type ? colors.primary : colors.border, backgroundColor: issueType === type ? colors.primary : "transparent" }]}> 
                <Text style={[styles.chipText, { color: issueType === type ? "#fff" : colors.mutedForeground }]}>{type}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Message</Text>
          <TextInput value={message} onChangeText={setMessage} multiline placeholder="Explain your issue..." placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
          {notice ? <Text style={[styles.notice, { color: notice.includes("submitted") ? colors.green : colors.destructive }]}>{notice}</Text> : null}
          <Pressable disabled={submitting} onPress={submit} style={[styles.submit, { backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }]}> 
            {submitting ? <ActivityIndicator color="#fff" /> : <Feather name="send" size={18} color="#fff" />}
            <Text style={styles.submitText}>Submit Ticket</Text>
          </Pressable>
        </View>

        <SectionTitle title="Previous tickets" />
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={[styles.empty, { color: colors.mutedForeground }]}>Loading tickets...</Text></View>
        ) : error ? (
          <View style={styles.center}>
            <Feather name="alert-circle" size={42} color={colors.destructive} />
            <Text style={[styles.empty, { color: colors.destructive }]}>{error}</Text>
            <Pressable onPress={load} style={[styles.retry, { backgroundColor: colors.primary }]}> 
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : tickets.length === 0 ? (
          <View style={styles.center}>
            <Feather name="inbox" size={46} color={colors.mutedForeground} />
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>No tickets yet</Text>
          </View>
        ) : (
          <FlatList
            data={tickets}
            keyExtractor={(item) => item.ticketId}
            scrollEnabled={false}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => (
              <View style={[styles.ticket, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                <View style={styles.ticketTop}>
                  <Text style={[styles.ticketTitle, { color: colors.foreground }]} numberOfLines={1}>{item.issueType}</Text>
                  <Text style={[styles.status, { color: item.status === "closed" ? colors.mutedForeground : colors.gold }]}>{item.status.toUpperCase()}</Text>
                </View>
                <Text style={[styles.ticketMessage, { color: colors.mutedForeground }]}>{item.message}</Text>
                <Text style={[styles.ticketDate, { color: colors.mutedForeground }]}>{formatDate(item.createdAt)}</Text>
              </View>
            )}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, lineHeight: 28 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16, marginTop: 2 },
  emailCard: { borderWidth: 1, borderRadius: 16, padding: 13, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  emailTitle: { fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  emailText: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16, marginTop: 1 },
  form: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8, marginBottom: 14 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontFamily: "Inter_700Bold", fontSize: 12, lineHeight: 16 },
  input: { minHeight: 100, borderWidth: 1, borderRadius: 12, padding: 12, textAlignVertical: "top", fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 18 },
  notice: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16, textAlign: "center" },
  submit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, padding: 14 },
  submitText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  center: { padding: 20, alignItems: "center", gap: 10 },
  empty: { fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 17, textAlign: "center" },
  retry: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  ticket: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  ticketTop: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  ticketTitle: { fontFamily: "Inter_700Bold", fontSize: 15, lineHeight: 19, flexShrink: 1 },
  status: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 15 },
  ticketMessage: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  ticketDate: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15 },
});
