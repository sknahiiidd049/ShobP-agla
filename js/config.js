import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://nyidmtcvyvwsyarrntxu.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_uw9sJRKNlcXE_Faf4iNdOw_OVKlj-tc';

// Optional: Deploy supabase/functions/log-activity and set true to collect server-side IP logs
export const USE_EDGE_ACTIVITY_LOGGER = false;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export const APP_CONSTANTS = {
  DEFAULT_SITE_NAME: 'সব পাগলা',
  DEFAULT_TAGLINE: 'পাগলের দুনিয়া 😂',
  DEFAULT_AVATAR: './assets/default-avatar/default-avatar.jpg',
  DEFAULT_LOGO: './assets/logo/logo.jpg',
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_IMAGE_EXTENSIONS: ['jpg', 'jpeg', 'png', 'webp'],
  DEFAULT_MAX_UPLOAD_MB: 8,
  DEFAULT_PAGE_SIZE: 12,
  SYNTHETIC_EMAIL_DOMAIN: 'shobpagla.app',
  SECRET_ADMIN: {
    clicksRequired: 5,
    windowMs: 3000,
    targetUrl: './admin/',
  },
};

export const FUNNY_QUOTES = [
  'আমরা বন্ধু না, আমরা একে অপরের সমস্যা। 😂',
  'টাকা ধার নিলে ফেরত দেওয়ার নিয়ম আমাদের গ্রুপে নিষিদ্ধ! 🤣',
  'ট্যুরের প্ল্যান হয় কক্সবাজার, শেষমেশ চায়ের দোকানেই সমাপ্তি! ☕',
  'ছবি খারাপ আসলে দোষ ক্যামেরাম্যানের, আমার কিউট ফেসের না! 📸',
  'সিরিয়াস হওয়ার চেষ্টা করেছিলাম, ৫ মিনিট পর নিজেই হেসে দিলাম। 😜',
  'সব পাগলা একসাথে হলে ওয়াই-ফাইও ভয় পায়! 📶',
  'পড়াশোনা কাল থেকে শুরু করবো—এই কাল গত ৫ বছরেও আসেনি। 📚',
  'ভালো বন্ধু সে-ই, যে তোমার বাজে ছবিগুলো সযত্নে সেভ করে রাখে। 😈',
  'আমাদের আড্ডায় যুক্তি খুঁজতে আসা মানেই সময় নষ্ট! 🤪',
  'ডায়েট শুরু করবো... আগে এই বিরিয়ানিটা শেষ করি! 🍛',
];

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeUrl(url, fallback = APP_CONSTANTS.DEFAULT_AVATAR) {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  return fallback;
}

export function validateUsername(username) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(String(username || '').trim());
}

export function buildSyntheticEmail(username) {
  const clean = String(username || '').trim().toLowerCase();
  return `${clean}@${APP_CONSTANTS.SYNTHETIC_EMAIL_DOMAIN}`;
}

export function formatDateBn(isoString) {
  if (!isoString) return 'অজানা তারিখ';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('bn-BD', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(isoString).slice(0, 10);
  }
}

export function formatDateTimeBn(isoString) {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('bn-BD', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(isoString);
  }
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 220);
  }, 3800);
}

export async function logActivity(event, metadata = {}) {
  try {
    const userAgent = navigator.userAgent || '';
    const referrer = document.referrer || '';

    if (USE_EDGE_ACTIVITY_LOGGER) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      await fetch(`${SUPABASE_URL}/functions/v1/log-activity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_PUBLISHABLE_KEY,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ event, user_agent: userAgent, referrer, metadata }),
      });
      return;
    }

    await supabase.rpc('log_client_activity', {
      p_event: event,
      p_user_agent: userAgent,
      p_referrer: referrer,
      p_metadata: metadata,
    });
  } catch (err) {
    console.warn('[Activity Log skipped]', err);
  }
}

export function validateImageFile(file, maxMb = APP_CONSTANTS.DEFAULT_MAX_UPLOAD_MB) {
  if (!file) {
    return { valid: false, error: 'অনুগ্রহ করে একটি ছবি নির্বাচন করো।' };
  }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (
    !APP_CONSTANTS.ALLOWED_IMAGE_TYPES.includes(file.type) ||
    !APP_CONSTANTS.ALLOWED_IMAGE_EXTENSIONS.includes(ext)
  ) {
    return {
      valid: false,
      error: 'ভুল ফাইল ফরম্যাট! শুধুমাত্র JPG, JPEG, PNG বা WEBP ছবি আপলোড করা যাবে।',
    };
  }
  const maxBytes = maxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `ছবির সাইজ অনেক বড়! সর্বোচ্চ ${maxMb}MB সাইজের ছবি আপলোড করা যাবে।`,
    };
  }
  return { valid: true, ext: ext === 'jpeg' ? 'jpg' : ext };
}
