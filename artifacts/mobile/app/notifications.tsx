import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUser } from "@/contexts/UserContext";
import { useColors } from "@/hooks/useColors";
import {
  getSupportTickets,
  getTransactions,
  getWithdrawals,
  type SupportTicket,
  type TransactionDocument,
  type WithdrawalDocument,
} from "@/services/api";

type NotificationFilter = "all" | "withdrawals" | "support" | "rewards";
type NoticePriority = "good" | "warn" | "danger" | "neutral";

type SupportTicketWithReply = SupportTicket & {
  adminReply?: string | null;
  lastReplyAt?: string | null;
  resolutionNotes?: string | null;
  adminAttachmentUrl?: string | null;
  adminAttachmentName?: string | null;
  adminAttachmentMimeType?: string | null;
  adminAttachmentExpiresAt?: string | null;
};

interface NoticeItem {
  id: string;
  filter: Exclude<NotificationFilter, "all">;
  title: string;
  message: string;
  date: string;
  priority: NoticePriority;
  icon: React.ComponentProps<typeof Feather>["name"];
  actionLabel?: string | null;
  actionUrl?: string | null;
}

const FILTERS: Array<{ id: NotificationFilter; label: string; icon: React.ComponentProps<typeof Feather>["name"] }> = [
  { id: "all", label: "All", icon: "grid" },
  { id: "withdrawals", label: "Withdrawals", icon: "credit-card" },
  { id: "support", label: "Support", icon: "message-circle" },
  { id: "rewards", label: "Rewards", icon: "gift" },
];

function dateMs(value?: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "-";
  }
}

function attachmentIsLive(expiresAt?: string | null) {
  if (!expiresAt) return false;
  const time = new Date(expiresAt).getTime();
  return Number.isFinite(time) && time > Date.now();
}

function withdrawalNotice(item: WithdrawalDocument): NoticeItem {
  const status = item.status;
  const amount = `PKR ${Number(item.amountPKR || 0).toFixed(2)}`;
  if (status === "rejected") {
    return {
      id: `withdrawal-${item.withdrawalId}`,
      filter: "withdrawals",
      title: "Withdrawal rejected",
      message: item.rejectionReason || item.adminNote || `${amount} request was rejected by admin.`,
      date: item.processedAt || item.updatedAt || item.createdAt,
      priority: "danger",
      icon: "x-circle",
    };
  }
  if (status === "paid") {
    return {
      id: `withdrawal-${item.withdrawalId}`,
      filter: "withdrawals",
      title: "Withdrawal paid",
      message: `${amount} has been marked paid. Check your payment account details if needed.`,
      date: item.paidAt || item.updatedAt || item.createdAt,
      priority: "good",
      icon: "check-circle",
    };
  }
  if (status === "approved") {
    return {
      id: `withdrawal-${item.withdrawalId}`,
      filter: "withdrawals",
      title: "Withdrawal approved",
      message: `${amount} request is approved and waiting for payment.`,
      date: item.processedAt || item.updatedAt || item.createdAt,
      priority: "good",
      icon: "thumbs-up",
    };
  }
  if (status === "review") {
    return {
      id: `withdrawal-${item.withdrawalId}`,
      filter: "withdrawals",
      title: "Withdrawal in review",
      message: `${amount} request is under admin review.`,
      date: item.updatedAt || item.createdAt,
      priority: "warn",
      icon: "eye",
    };
  }
  return {
    id: `withdrawal-${item.withdrawalId}`,
    filter: "withdrawals",
    title: "Withdrawal pending",
    message: `${amount} request is pending review.`,
    date: item.createdAt,
    priority: "warn",
    icon: "clock",
  };
}

function supportNotices(ticket: SupportTicketWithReply): NoticeItem[] {
  const notices: NoticeItem[] = [];
  const adminReply = ticket.adminReply?.trim();
  const attachmentLive = attachmentIsLive(ticket.adminAttachmentExpiresAt);
  if (adminReply) {
    notices.push({
      id: `support-reply-${ticket.ticketId}`,
      filter: "support",
      title: "Admin replied to your ticket",
      message: adminReply,
      date: ticket.lastReplyAt || ticket.updatedAt || ticket.createdAt,
      priority: "good",
      icon: "corner-up-left",
    });
  }
  if (ticket.adminAttachmentUrl && attachmentLive) {
    notices.push({
      id: `support-attachment-${ticket.ticketId}`,
      filter: "support",
      title: "Attachment ready to download",
      message: ticket.adminAttachmentName || "Your support reply includes a file attachment.",
      date: ticket.lastReplyAt || ticket.updatedAt || ticket.createdAt,
      priority: "good",
      icon: "download",
      actionLabel: "Download",
      actionUrl: ticket.adminAttachmentUrl,
    });
  }
  if (ticket.status === "closed") {
    notices.push({
      id: `support-closed-${ticket.ticketId}`,
      filter: "support",
      title: "Support ticket closed",
      message: ticket.resolutionNotes || ticket.issueType || "Your support ticket has been closed.",
      date: ticket.updatedAt || ticket.createdAt,
      priority: "neutral",
      icon: "check",
    });
  }
  if (ticket.status === "open") {
    notices.push({
      id: `support-open-${ticket.ticketId}`,
      filter: "support",
      title: "Support ticket received",
      message: ticket.issueType || ticket.message,
      date: ticket.createdAt,
      priority: "warn",
      icon: "message-square",
    });
  }
  return notices;
}

function transactionNotice(tx: TransactionDocument): NoticeItem | null {
  if (tx.type === "referral_bonus") {
    return {
      id: `tx-${tx.transactionId}`,
      filter: "rewards",
      title: "Referral bonus unlocked",
      message: `+${tx.coinsChange.toLocaleString()} pending coins added after referral qualification.`,
      date: tx.createdAt,
      priority: "good",
      icon: "users",
    };
  }
  if (tx.type === "offerwall_confirmed") {
    return {
      id: `tx-${tx.transactionId}`,
      filter: "rewards",
      title: "Reward confirmed",
      message: `+${tx.coinsChange.toLocaleString()} coins confirmed and added to your withdrawable balance.`,
      date: tx.createdAt,
      priority: "good",
      icon: "check-circle",
    };
  }
  if (tx.type === "offerwall_rejected" || tx.type === "offerwall_reversed") {
    return {
      id: `tx-${tx.transactionId}`,
      filter: "rewards",
      title: tx.type === "offerwall_reversed" ? "Reward reversed" : "Reward rejected",
      message: String(tx.metadata?.rejectionReason || tx.metadata?.reversalReason || "Advertiser/admin rejected this reward."),
      date: tx.createdAt,
      priority: "danger",
      icon: "alert-triangle",
    };
  }
  if (tx.type === "admin_adjustment") {
    return {
      id: `tx-${tx.transactionId}`,
      filter: "rewards",
      title: "Admin balance update",
      message: tx.coinsChange !== 0 ? `${tx.coinsChange > 0 ? "+" : ""}${tx.coinsChange.toLocaleString()} coins adjusted.` : "Energy or account balance adjusted by admin.",
      date: tx.createdAt,
      priority: tx.coinsChange < 0 ? "danger" : "neutral",
      icon: "settings",
    };
  }
  return null;
}

function priorityColor(priority: NoticePriority, colors: ReturnType<typeof useColors>) {
  if (priority === "good") return colors.green;
  if (priority === "warn") return colors.gold;
  if (priority === "danger") return colors.destructive;
  return colors.mutedForeground;
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { deviceId } = useUser();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [items, setItems] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const topPad = Platform.OS === "web" ? 28 : insets.top + 8;

  const load = useCallback(async () => {
    if (!deviceId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [withdrawals, tickets, transactions] = await Promise.all([
        getWithdrawals(deviceId),
        getSupportTickets(deviceId),
        getTransactions(deviceId),
      ]);
      const nextItems = [
        ...withdrawals.map(withdrawalNotice),
        ...(tickets as SupportTicketWithReply[]).flatMap(supportNotices),
        ...transactions.map(transactionNotice).filter((item): item is NoticeItem => Boolean(item)),
      ].sort((a, b) => dateMs(b.date) - dateMs(a.date));
      setItems(nextItems.slice(0, 100));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => { void load(); }, [load]);

  const visibleItems = useMemo(
    () => filter === "all" ? items : items.filter((item) => item.filter === filter),
    [filter, items],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}> 
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>Withdrawals, support replies and reward updates</Text>
        </View>
        <Pressable onPress={load} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((entry) => {
          const active = filter === entry.id;
          return (
            <Pressable key={entry.id} onPress={() => setFilter(entry.id)} style={[styles.filterChip, { backgroundColor: active ? colors.gold : colors.card, borderColor: active ? colors.gold : colors.border }]}> 
              <Feather name={entry.icon} size={13} color={active ? "#120900" : colors.mutedForeground} />
              <Text style={[styles.filterText, { color: active ? "#120900" : colors.mutedForeground }]}>{entry.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>Loading notifications...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={42} color={colors.destructive} />
          <Text style={[styles.empty, { color: colors.destructive }]}>{error}</Text>
          <Pressable onPress={load} style={[styles.retry, { backgroundColor: colors.primary }]}> 
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : visibleItems.length === 0 ? (
        <View style={styles.center}>
          <Feather name="inbox" size={46} color={colors.mutedForeground} />
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>No notifications in this filter</Text>
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 36 }}
          renderItem={({ item }) => {
            const accent = priorityColor(item.priority, colors);
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                <View style={[styles.iconWrap, { backgroundColor: accent + "18" }]}> 
                  <Feather name={item.icon} size={17} color={accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.cardMessage, { color: colors.mutedForeground }]}>{item.message}</Text>
                  {item.actionUrl && item.actionLabel ? (
                    <Pressable onPress={() => void Linking.openURL(item.actionUrl!)} style={[styles.actionButton, { backgroundColor: colors.gold + "18", borderColor: colors.gold + "40" }]}> 
                      <Feather name="download" size={13} color={colors.gold} />
                      <Text style={[styles.actionText, { color: colors.foreground }]}>{item.actionLabel}</Text>
                    </Pressable>
                  ) : null}
                  <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>{formatDate(item.date)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, lineHeight: 28 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16, marginTop: 2 },
  filterRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterChip: { minHeight: 34, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  filterText: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  empty: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 18, textAlign: "center" },
  retry: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  card: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  iconWrap: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 2 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  cardMessage: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, marginTop: 3 },
  cardDate: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 15, marginTop: 6 },
  actionButton: { marginTop: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start" },
  actionText: { fontFamily: "Inter_700Bold", fontSize: 12, lineHeight: 16 },
});