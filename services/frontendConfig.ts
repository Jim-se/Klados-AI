/**
 * Centralized Frontend Configuration
 * This ensures the API URL is handled consistently across all services.
 */

const DEFAULT_PRODUCTION_API_URL = 'https://klados-server-production.up.railway.app';
const DEFAULT_LOCAL_API_URL = 'http://localhost:3001';
const DEFAULT_STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/test_00wcN5bYu8Ky3TH0qLgA800';

const normalizeApiUrl = (value: string) => value.endsWith('/') ? value.slice(0, -1) : value;

const EXPLICIT_API_URL =
    import.meta.env.VITE_API_URL ||
    (process as any).env?.VITE_API_URL ||
    '';

const EXPLICIT_STRIPE_PAYMENT_LINK =
    import.meta.env.VITE_STRIPE_PAYMENT_LINK ||
    (process as any).env?.VITE_STRIPE_PAYMENT_LINK ||
    '';

const EXPLICIT_PRO_UPGRADE_URL =
    import.meta.env.VITE_PRO_UPGRADE_URL ||
    (process as any).env?.VITE_PRO_UPGRADE_URL ||
    '';

const getApiUrl = () => {
    const isLocalFrontend =
        typeof window !== 'undefined' &&
        ['localhost', '127.0.0.1'].includes(window.location.hostname);

    const rawUrl =
        EXPLICIT_API_URL ||
        (isLocalFrontend ? DEFAULT_LOCAL_API_URL : DEFAULT_PRODUCTION_API_URL);

    return normalizeApiUrl(rawUrl);
};

export const API_BASE_URL = getApiUrl();
export const hasExplicitApiUrl = Boolean(EXPLICIT_API_URL);
export const STRIPE_PAYMENT_LINK = String(
    EXPLICIT_STRIPE_PAYMENT_LINK || EXPLICIT_PRO_UPGRADE_URL || DEFAULT_STRIPE_PAYMENT_LINK || ''
).trim();

export const getApiBaseCandidates = () => {
    const isLocalFrontend =
        typeof window !== 'undefined' &&
        ['localhost', '127.0.0.1'].includes(window.location.hostname);

    const candidates: string[] = [];

    if (!hasExplicitApiUrl && isLocalFrontend) {
        candidates.push(normalizeApiUrl(DEFAULT_LOCAL_API_URL));
        candidates.push(normalizeApiUrl(DEFAULT_PRODUCTION_API_URL));
    } else {
        candidates.push(API_BASE_URL);
    }

    return candidates;
};

// Debug log to help identify where the app is calling
if (typeof window !== 'undefined') {
    (window as any).DEBUG_API_URL = API_BASE_URL;
}

// Intentionally no console logging; usage logs live elsewhere.
