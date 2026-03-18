import { API_BASE_URL, STRIPE_PAYMENT_LINK } from './frontendConfig';
import { supabase } from './supabaseClient';
import { ApiRequestError } from './openRouterService';

const buildUpgradeFallbackUrl = async () => {
  const rawPaymentLink = STRIPE_PAYMENT_LINK.trim();
  if (!rawPaymentLink) {
    return '';
  }

  try {
    const url = new URL(rawPaymentLink);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : '';
    const userEmail = typeof session?.user?.email === 'string' ? session.user.email.trim() : '';

    if (userId && !url.searchParams.has('client_reference_id')) {
      url.searchParams.set('client_reference_id', userId);
    }

    if (
      userEmail &&
      !url.searchParams.has('locked_prefilled_email') &&
      !url.searchParams.has('prefilled_email')
    ) {
      url.searchParams.set('locked_prefilled_email', userEmail);
    }

    return url.toString();
  } catch {
    return rawPaymentLink;
  }
};

const openUpgradeFallback = async () => {
  if (typeof window === 'undefined' || !STRIPE_PAYMENT_LINK) {
    return false;
  }

  const paymentLink = await buildUpgradeFallbackUrl();
  if (!paymentLink) {
    return false;
  }

  window.open(paymentLink, '_blank', 'noopener,noreferrer');
  return true;
};

const getBillingHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token ?? ''}`,
  };
};

const parseBillingResponse = async (response: Response) => {
  const rawText = await response.text();
  let data: any = null;

  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }

  return { rawText, data };
};

const postBillingAction = async (path: string) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: await getBillingHeaders(),
    body: JSON.stringify({}),
  });

  const { rawText, data } = await parseBillingResponse(response);

  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      data?.error || 'Billing request failed.',
      data,
      rawText
    );
  }

  return data;
};

export const startProCheckout = async () => {
  const response = await fetch(`${API_BASE_URL}/api/stripe/create-checkout-session`, {
    method: 'POST',
    headers: await getBillingHeaders(),
    body: JSON.stringify({}),
  });

  const { rawText, data } = await parseBillingResponse(response);

  if (!response.ok) {
    if (data?.fallback_url && typeof window !== 'undefined') {
      window.open(data.fallback_url, '_blank', 'noopener,noreferrer');
      return;
    }

    throw new ApiRequestError(
      response.status,
      data?.error || 'Failed to start checkout.',
      data,
      rawText
    );
  }

  const checkoutUrl = typeof data?.url === 'string' ? data.url.trim() : '';
  if (!checkoutUrl) {
    if (await openUpgradeFallback()) {
      return;
    }

    throw new Error('Stripe checkout session did not return a redirect URL.');
  }

  if (typeof window !== 'undefined') {
    window.location.assign(checkoutUrl);
  }
};

export const openProUpgrade = async () => {
  try {
    await startProCheckout();
  } catch (error) {
    if (await openUpgradeFallback()) {
      return;
    }

    throw error;
  }
};

export const cancelProSubscription = async () => (
  postBillingAction('/api/stripe/cancel-subscription')
);

export const resumeProSubscription = async () => (
  postBillingAction('/api/stripe/resume-subscription')
);
