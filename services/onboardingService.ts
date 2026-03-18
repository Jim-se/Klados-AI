const FIRST_RUN_PENDING_KEY = 'klados:first-run-onboarding:pending-user-id';
const FIRST_RUN_SEEN_PREFIX = 'klados:first-run-onboarding:seen:';
const NEW_ACCOUNT_GRACE_MS = 15 * 60 * 1000;

type OnboardingUserLike = {
  id?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

const hasWindow = () => typeof window !== 'undefined';

const normalizeUserId = (userId?: string | null) => {
  if (typeof userId !== 'string') {
    return null;
  }

  const trimmed = userId.trim();
  return trimmed || null;
};

const parseTimestamp = (value?: string | null) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getSeenKey = (userId: string) => `${FIRST_RUN_SEEN_PREFIX}${userId}`;

export const markFirstRunOnboardingPending = (userId?: string | null) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!hasWindow() || !normalizedUserId) {
    return;
  }

  window.localStorage.setItem(FIRST_RUN_PENDING_KEY, normalizedUserId);
};

export const hasSeenFirstRunOnboarding = (userId?: string | null) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!hasWindow() || !normalizedUserId) {
    return false;
  }

  return window.localStorage.getItem(getSeenKey(normalizedUserId)) === '1';
};

export const shouldShowFirstRunOnboarding = (userId?: string | null) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!hasWindow() || !normalizedUserId) {
    return false;
  }

  return (
    window.localStorage.getItem(FIRST_RUN_PENDING_KEY) === normalizedUserId &&
    !hasSeenFirstRunOnboarding(normalizedUserId)
  );
};

export const clearFirstRunOnboardingPending = (userId?: string | null) => {
  if (!hasWindow()) {
    return;
  }

  const normalizedUserId = normalizeUserId(userId);
  const pendingUserId = window.localStorage.getItem(FIRST_RUN_PENDING_KEY);
  if (!normalizedUserId || pendingUserId === normalizedUserId) {
    window.localStorage.removeItem(FIRST_RUN_PENDING_KEY);
  }
};

export const markFirstRunOnboardingSeen = (userId?: string | null) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!hasWindow() || !normalizedUserId) {
    return;
  }

  window.localStorage.setItem(getSeenKey(normalizedUserId), '1');
  clearFirstRunOnboardingPending(normalizedUserId);
};

export const maybeQueueFirstRunOnboarding = (user?: OnboardingUserLike | null) => {
  const normalizedUserId = normalizeUserId(user?.id);
  if (!hasWindow() || !normalizedUserId || hasSeenFirstRunOnboarding(normalizedUserId)) {
    return false;
  }

  if (shouldShowFirstRunOnboarding(normalizedUserId)) {
    return true;
  }

  const createdAt = parseTimestamp(user?.created_at);
  const lastSignInAt = parseTimestamp(user?.last_sign_in_at);

  if (createdAt == null || lastSignInAt == null) {
    return false;
  }

  if (Math.abs(lastSignInAt - createdAt) > NEW_ACCOUNT_GRACE_MS) {
    return false;
  }

  markFirstRunOnboardingPending(normalizedUserId);
  return true;
};
