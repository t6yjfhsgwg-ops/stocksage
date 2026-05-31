export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    period: "forever",
    tagline: "Start researching with core tools",
    features: [
      "5 watchlist stocks",
      "10 AI chat messages / day",
      "Daily pick & basic signals",
      "1M & 3M chart timeframes",
      "Local AI assistant",
    ],
    limits: {
      watchlist: 5,
      chatPerDay: 10,
      timeframes: ["1M", "3M"],
      predictions: "basic",
      exportCsv: false,
      refreshMin: [0, 5, 15],
      fullIndicators: true,
    },
  },
  plus: {
    id: "plus",
    name: "Plus",
    price: 29,
    period: "month",
    tagline: "Full analytics for active investors",
    featured: true,
    features: [
      "20 watchlist stocks",
      "Unlimited AI chat + Claude API",
      "All chart timeframes",
      "Full predictions & indicators",
      "Portfolio tracking & 1-min refresh",
      "CSV export",
    ],
    limits: {
      watchlist: 20,
      chatPerDay: Infinity,
      timeframes: ["1W", "1M", "3M", "6M", "1Y"],
      predictions: "full",
      exportCsv: true,
      refreshMin: [0, 1, 5, 15],
      fullIndicators: true,
    },
  },
};

const STORAGE_PLAN = "stocksage_plan";
const STORAGE_TRIAL_END = "stocksage_trial_end";
const STORAGE_CHAT_DAY = "stocksage_chat_day";
const STORAGE_CHAT_COUNT = "stocksage_chat_count";

export function getStoredPlan() {
  const trialEnd = localStorage.getItem(STORAGE_TRIAL_END);
  if (trialEnd && Date.now() < Number(trialEnd)) return "plus";
  return localStorage.getItem(STORAGE_PLAN) === "plus" ? "plus" : "free";
}

export function getPlanConfig(planId = getStoredPlan()) {
  return PLANS[planId] || PLANS.free;
}

export function isPlus(planId = getStoredPlan()) {
  return planId === "plus";
}

export function startPlusTrial(days = 14) {
  localStorage.setItem(STORAGE_PLAN, "plus");
  localStorage.setItem(STORAGE_TRIAL_END, String(Date.now() + days * 86400000));
}

export function setPlan(planId) {
  localStorage.setItem(STORAGE_PLAN, planId);
  if (planId !== "plus") localStorage.removeItem(STORAGE_TRIAL_END);
}

export function getTrialDaysLeft() {
  const end = Number(localStorage.getItem(STORAGE_TRIAL_END) || 0);
  if (!end || Date.now() >= end) return 0;
  return Math.ceil((end - Date.now()) / 86400000);
}

export function getChatUsageToday() {
  const today = new Date().toISOString().slice(0, 10);
  const storedDay = localStorage.getItem(STORAGE_CHAT_DAY);
  let count = Number(localStorage.getItem(STORAGE_CHAT_COUNT) || 0);
  if (storedDay !== today) {
    count = 0;
    localStorage.setItem(STORAGE_CHAT_DAY, today);
    localStorage.setItem(STORAGE_CHAT_COUNT, "0");
  }
  return count;
}

export function incrementChatUsage() {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem(STORAGE_CHAT_DAY, today);
  const next = getChatUsageToday() + 1;
  localStorage.setItem(STORAGE_CHAT_COUNT, String(next));
  return next;
}

export function canSendChat(planId = getStoredPlan()) {
  const plan = getPlanConfig(planId);
  if (plan.limits.chatPerDay === Infinity) return true;
  return getChatUsageToday() < plan.limits.chatPerDay;
}

export function chatRemaining(planId = getStoredPlan()) {
  const plan = getPlanConfig(planId);
  if (plan.limits.chatPerDay === Infinity) return null;
  return Math.max(0, plan.limits.chatPerDay - getChatUsageToday());
}
