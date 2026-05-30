export type BadgeIcon = "star" | "zap" | "target" | "trending-up" | "users" | "credit-card" | "award" | "shield" | "check-circle";

export interface BadgeSource {
  totalEarnedCoins?: number | null;
  confirmedCoinsBalance?: number | null;
  pendingCoinsBalance?: number | null;
  coinsBalance?: number | null;
  lifetimeCompletedTasks?: number | null;
  currentDailyStreak?: number | null;
  dailyTasksCompletedToday?: number | null;
  referralBonusCoinsEarned?: number | null;
  firstWithdrawalCompleted?: boolean | null;
  rank?: number | null;
}

export interface BadgeInfo {
  id: string;
  label: string;
  detail: string;
  icon: BadgeIcon;
  color: string;
}

export interface UserLevelInfo {
  name: string;
  color: string;
  coins: number;
  nextName: string | null;
  coinsToNext: number;
  progress: number;
}

const LEVELS = [
  { name: "Starter", minCoins: 0, color: "#FACC15" },
  { name: "Bronze", minCoins: 10000, color: "#FB923C" },
  { name: "Silver", minCoins: 50000, color: "#CBD5E1" },
  { name: "Gold", minCoins: 100000, color: "#F59E0B" },
  { name: "Diamond", minCoins: 250000, color: "#60A5FA" },
];

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function earnedCoins(source: BadgeSource | null | undefined): number {
  if (!source) return 0;
  return Math.max(
    n(source.totalEarnedCoins),
    n(source.confirmedCoinsBalance ?? source.coinsBalance) + n(source.pendingCoinsBalance),
  );
}

export function getUserLevel(source: BadgeSource | null | undefined): UserLevelInfo {
  const coins = earnedCoins(source);
  const index = LEVELS.reduce((best, level, i) => (coins >= level.minCoins ? i : best), 0);
  const current = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  const span = next ? next.minCoins - current.minCoins : 1;
  const progress = next ? Math.min(1, Math.max(0, (coins - current.minCoins) / span)) : 1;

  return {
    name: current.name,
    color: current.color,
    coins,
    nextName: next?.name ?? null,
    coinsToNext: next ? Math.max(0, next.minCoins - coins) : 0,
    progress,
  };
}

export function getUnlockedBadges(source: BadgeSource | null | undefined, limit = 5): BadgeInfo[] {
  const coins = earnedCoins(source);
  const tasks = n(source?.lifetimeCompletedTasks);
  const streak = n(source?.currentDailyStreak);
  const dailyTasks = n(source?.dailyTasksCompletedToday);
  const referralCoins = n(source?.referralBonusCoinsEarned);
  const rank = n(source?.rank);

  const badges: Array<BadgeInfo & { unlocked: boolean }> = [
    { id: "starter", label: "Starter", detail: "Profile ready", icon: "star", color: "#FACC15", unlocked: true },
    { id: "daily_5", label: "Daily 5", detail: "5 tasks today", icon: "target", color: "#34D399", unlocked: dailyTasks >= 5 },
    { id: "task_runner", label: "Task Runner", detail: "25 lifetime tasks", icon: "check-circle", color: "#60A5FA", unlocked: tasks >= 25 },
    { id: "streak_7", label: "7 Day Streak", detail: "7 active days", icon: "zap", color: "#F97316", unlocked: streak >= 7 },
    { id: "high_earner", label: "High Earner", detail: "50k+ coins", icon: "trending-up", color: "#F59E0B", unlocked: coins >= 50000 },
    { id: "referral_pro", label: "Referral Pro", detail: "Referral bonus earned", icon: "users", color: "#A78BFA", unlocked: referralCoins > 0 },
    { id: "first_payout", label: "First Payout", detail: "Withdrawal completed", icon: "credit-card", color: "#10B981", unlocked: Boolean(source?.firstWithdrawalCompleted) },
    { id: "top_10", label: "Top 10", detail: "Leaderboard rank", icon: "award", color: "#FACC15", unlocked: rank > 0 && rank <= 10 },
    { id: "trusted", label: "Trusted", detail: "Clean account", icon: "shield", color: "#22C55E", unlocked: coins >= 10000 && streak >= 3 },
  ];

  return badges.filter((badge) => badge.unlocked).slice(0, Math.max(1, limit));
}
