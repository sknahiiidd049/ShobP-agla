import {
  supabase,
  APP_CONSTANTS,
  FUNNY_QUOTES,
  showToast,
  logActivity,
} from './config.js';
import {
  getCurrentSessionAndProfile,
  registerUser,
  loginUser,
  logoutUser,
} from './auth.js';
import { loadGallery, closeLightbox } from './gallery.js';
import { initUploadController } from './upload.js';
import {
  loadFriendsDirectory,
  renderFriendsGrid,
  getCachedFriends,
  openUserProfileView,
} from './profile.js';

const state = {
  user: null,
  profile: null,
  siteSettings: {
    site_name: APP_CONSTANTS.DEFAULT_SITE_NAME,
    tagline: APP_CONSTANTS.DEFAULT_TAGLINE,
    gallery_page_size: APP_CONSTANTS.DEFAULT_PAGE_SIZE,
    max_upload_mb: APP_CONSTANTS.DEFAULT_MAX_UPLOAD_MB,
  },
  activeSection: 'home',
  quoteIndex: 0,
  secretClicks: [],
};

function setActiveSection(sectionName) {
  const validSections = ['home', 'gallery', 'friends', 'upload', 'profile', 'auth'];
  const target = validSections.includes(sectionName) ? sectionName : 'home';
  state.activeSection = target;

  document.querySelectorAll('[data-section-view]').forEach((el) => {
    const isMatch = el.getAttribute('data-section-view') === target;
    el.hidden = !isMatch;
  });

  document.querySelectorAll('[data-nav-target]').forEach((btn) => {
    const isMatch = btn.getAttribute('data-nav-target') === target;
    btn.classList.toggle('nav-active', isMatch);
    if (isMatch) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  // Close mobile menu when navigating
  const navMenu = document.getElementById('primary-nav');
  const menuBtn = document.getElementById('mobile-menu-toggle');
  if (navMenu && menuBtn) {
    navMenu.classList.remove('nav-open');
    menuBtn.setAttribute('aria-expanded', 'false');
  }

  // Update upload auth gate visibility
  updateUploadGate();

  // Trigger section data loads when entering views
  if (target === 'gallery') {
    loadGallery({
      reset: true,
      pageSize: state.siteSettings.gallery_page_size,
      onSelectUploader: handleOpenFriendProfile,
    });
  } else if (target === 'friends') {
    loadFriendsDirectory({
      searchQuery: document.getElementById('friends-search-input')?.value || '',
      onOpenProfile: handleOpenFriendProfile,
    });
  } else if (target === 'profile' && state.user) {
    openUserProfileView(state.user.id, state.user.id, refreshAfterProfileChange);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateUploadGate() {
  const uploadForm = document.getElementById('upload-form');
  const uploadAuthNotice = document.getElementById('upload-auth-notice');
  if (!uploadForm || !uploadAuthNotice) return;

  if (!state.user || !state.profile) {
    uploadForm.hidden = true;
    uploadAuthNotice.hidden = false;
  } else {
    uploadForm.hidden = false;
    uploadAuthNotice.hidden = true;
  }
}

function updateAuthUI() {
  const guestActions = document.getElementById('nav-guest-actions');
  const userActions = document.getElementById('nav-user-actions');
  const navUsername = document.getElementById('nav-username-label');
  const navProfileBtn = document.getElementById('nav-profile-btn');
  const profileGuestNotice = document.getElementById('profile-guest-notice');
  const profileContent = document.getElementById('profile-view-content');

  const isLoggedIn = Boolean(state.user && state.profile);

  if (guestActions) guestActions.hidden = isLoggedIn;
  if (userActions) userActions.hidden = !isLoggedIn;
  if (navProfileBtn) navProfileBtn.hidden = !isLoggedIn;
  if (navUsername && state.profile) {
    navUsername.textContent = `👤 ${state.profile.username}`;
  }

  if (profileGuestNotice && profileContent && state.activeSection === 'profile' && !isLoggedIn) {
    profileGuestNotice.hidden = false;
    profileContent.innerHTML = '';
  } else if (profileGuestNotice) {
    profileGuestNotice.hidden = true;
  }

  updateUploadGate();
}

async function refreshSiteSettings() {
  try {
    const { data } = await supabase.from('site_settings').select('*').eq('id', 1).maybeSingle();
    if (data) {
      state.siteSettings = data;
      document.querySelectorAll('[data-site-name]').forEach((el) => {
        el.textContent = data.site_name || APP_CONSTANTS.DEFAULT_SITE_NAME;
      });
      document.querySelectorAll('[data-site-tagline]').forEach((el) => {
        el.textContent = data.tagline || APP_CONSTANTS.DEFAULT_TAGLINE;
      });
      const limitHint = document.getElementById('upload-limit-hint');
      if (limitHint) {
        limitHint.textContent = `সাপোর্টেড: JPG, JPEG, PNG, WEBP (সর্বোচ্চ ${data.max_upload_mb || 8}MB)`;
      }
    }
  } catch (err) {
    console.warn('[Site settings fallback used]', err);
  }
}

async function refreshPublicStats() {
  try {
    const { data, error } = await supabase.rpc('get_public_stats');
    if (error || !data) return;

    const totalFriendsEl = document.getElementById('stat-total-friends');
    const approvedPhotosEl = document.getElementById('stat-approved-photos');
    const pendingPhotosEl = document.getElementById('stat-pending-photos');

    if (totalFriendsEl) totalFriendsEl.textContent = String(data.total_friends ?? 0);
    if (approvedPhotosEl) approvedPhotosEl.textContent = String(data.approved_photos ?? 0);
    if (pendingPhotosEl) pendingPhotosEl.textContent = String(data.pending_photos ?? 0);
  } catch (err) {
    console.warn('[Public stats unavailable]', err);
  }
}

function rotateFunnyQuote() {
  const quoteEl = document.getElementById('funny-quote-text');
  if (!quoteEl) return;
  let nextIdx = Math.floor(Math.random() * FUNNY_QUOTES.length);
  if (FUNNY_QUOTES.length > 1 && nextIdx === state.quoteIndex) {
    nextIdx = (nextIdx + 1) % FUNNY_QUOTES.length;
  }
  state.quoteIndex = nextIdx;
  quoteEl.textContent = `"${FUNNY_QUOTES[nextIdx]}"`;
}

async function handleOpenFriendProfile(userId) {
  const profileGuestNotice = document.getElementById('profile-guest-notice');
  if (profileGuestNotice) profileGuestNotice.hidden = true;
  setActiveSection('profile');
  await openUserProfileView(userId, state.user?.id || null, refreshAfterProfileChange);
}

async function handleRandomFriend() {
  let friends = getCachedFriends();
  if (!friends || friends.length === 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, username, bio, avatar_url, created_at')
      .eq('is_blocked', false)
      .limit(100);
    friends = data || [];
  }

  if (friends.length === 0) {
    showToast('এখনও কোনো পাগলা বন্ধু রেজিস্টার করেনি! প্রথমে তুমিই যোগ দাও 😂', 'info');
    setActiveSection('auth');
    return;
  }

  const chosen = friends[Math.floor(Math.random() * friends.length)];
  showToast(`🎲 আজকের র‍্যান্ডম পাগলা: ${chosen.display_name}!`, 'info');
  await handleOpenFriendProfile(chosen.id);
}

async function refreshAfterProfileChange() {
  const sessionInfo = await getCurrentSessionAndProfile();
  state.user = sessionInfo.user;
  state.profile = sessionInfo.profile;
  updateAuthUI();
  await refreshPublicStats();
}

function initSecretAdminTrigger() {
  const trigger = document.getElementById('brand-secret-trigger');
  if (!trigger) return;

  trigger.addEventListener('click', (e) => {
    const now = Date.now();
    const { clicksRequired, windowMs, targetUrl } = APP_CONSTANTS.SECRET_ADMIN;
    state.secretClicks = state.secretClicks.filter((ts) => now - ts <= windowMs);
    state.secretClicks.push(now);

    if (state.secretClicks.length >= clicksRequired) {
      e.preventDefault();
      state.secretClicks = [];
      window.location.href = targetUrl;
    } else {
      setActiveSection('home');
    }
  });
}

function initAuthForms() {
  const loginTab = document.getElementById('auth-tab-login');
  const registerTab = document.getElementById('auth-tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const authFeedback = document.getElementById('auth-feedback');

  function setFeedback(msg, type = 'error') {
    if (!authFeedback) return;
    if (!msg) {
      authFeedback.hidden = true;
      authFeedback.textContent = '';
      return;
    }
    authFeedback.hidden = false;
    authFeedback.className = `form-feedback feedback-${type}`;
    authFeedback.textContent = msg;
  }

  function switchAuthMode(mode) {
    setFeedback('');
    const isLogin = mode === 'login';
    if (loginForm) loginForm.hidden = !isLogin;
    if (registerForm) registerForm.hidden = isLogin;
    if (loginTab) loginTab.classList.toggle('tab-active', isLogin);
    if (registerTab) registerTab.classList.toggle('tab-active', !isLogin);
  }

  loginTab?.addEventListener('click', () => switchAuthMode('login'));
  registerTab?.addEventListener('click', () => switchAuthMode('register'));

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFeedback('');
    const btn = loginForm.querySelector('button[type="submit"]');
    const username = loginForm.elements.username.value;
    const password = loginForm.elements.password.value;

    btn.disabled = true;
    btn.textContent = 'প্রবেশ হচ্ছে... ⏳';

    const res = await loginUser({ username, password });
    btn.disabled = false;
    btn.textContent = '🔓 লগইন করো';

    if (!res.ok) {
      setFeedback(res.error, 'error');
      return;
    }

    state.user = res.user;
    state.profile = res.profile;
    updateAuthUI();
    loginForm.reset();
    showToast(`স্বাগতম ${res.profile?.display_name || username}! পাগলামি শুরু হোক 😂`, 'success');
    setActiveSection('gallery');
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFeedback('');
    const btn = registerForm.querySelector('button[type="submit"]');
    const displayName = registerForm.elements.display_name.value;
    const username = registerForm.elements.username.value;
    const password = registerForm.elements.password.value;
    const bio = registerForm.elements.bio.value;
    const avatarFile = registerForm.elements.avatar.files?.[0] || null;

    btn.disabled = true;
    btn.textContent = 'অ্যাকাউন্ট তৈরি হচ্ছে... ⏳';

    const res = await registerUser({ displayName, username, password, bio, avatarFile });
    btn.disabled = false;
    btn.textContent = '🚀 পাগলা দলে যোগ দাও';

    if (!res.ok) {
      setFeedback(res.error, 'error');
      return;
    }

    state.user = res.user;
    state.profile = res.profile;
    updateAuthUI();
    registerForm.reset();
    await refreshPublicStats();
    showToast(`অভিনন্দন ${res.profile.display_name}! এখন তুমিও আমাদের পাগলা দলের সদস্য 🎉`, 'success');
    setActiveSection('profile');
  });
}

function initEventListeners() {
  // Nav links & Hero CTAs
  document.querySelectorAll('[data-nav-target]').forEach((el) => {
    el.addEventListener('click', () => {
      const target = el.getAttribute('data-nav-target');
      if (target) setActiveSection(target);
    });
  });

  // Mobile Menu toggle
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const primaryNav = document.getElementById('primary-nav');
  menuToggle?.addEventListener('click', () => {
    const isOpen = primaryNav?.classList.toggle('nav-open');
    menuToggle.setAttribute('aria-expanded', String(Boolean(isOpen)));
  });

  // Logout
  document.getElementById('nav-logout-btn')?.addEventListener('click', async () => {
    const ok = await logoutUser();
    if (ok) {
      state.user = null;
      state.profile = null;
      updateAuthUI();
      setActiveSection('home');
    }
  });

  // Random Quote & Random Friend
  document.getElementById('new-quote-btn')?.addEventListener('click', rotateFunnyQuote);
  document.getElementById('hero-random-friend-btn')?.addEventListener('click', handleRandomFriend);
  document.getElementById('friends-random-btn')?.addEventListener('click', handleRandomFriend);

  // Gallery pagination
  document.getElementById('gallery-load-more')?.addEventListener('click', () => {
    loadGallery({
      reset: false,
      pageSize: state.siteSettings.gallery_page_size,
      onSelectUploader: handleOpenFriendProfile,
    });
  });

  // Friends search
  document.getElementById('friends-search-input')?.addEventListener('input', (e) => {
    renderFriendsGrid(getCachedFriends(), e.target.value, handleOpenFriendProfile);
  });

  // Lightbox controls
  document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
  document.getElementById('lightbox-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'lightbox-modal') closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });
}

async function bootstrap() {
  initSecretAdminTrigger();
  initEventListeners();
  initAuthForms();
  rotateFunnyQuote();

  initUploadController({
    getCurrentState: () => ({ user: state.user, profile: state.profile }),
    getSiteSettings: () => state.siteSettings,
    onUploadSuccess: async () => {
      await refreshPublicStats();
    },
  });

  await refreshSiteSettings();
  await refreshPublicStats();

  const sessionInfo = await getCurrentSessionAndProfile();
  if (sessionInfo.blocked) {
    showToast('তোমার অ্যাকাউন্টটি অ্যাডমিন দ্বারা ব্লক করা হয়েছে।', 'error');
  }
  state.user = sessionInfo.user;
  state.profile = sessionInfo.profile;
  updateAuthUI();

  // Load initial gallery preview on home/gallery readiness
  await loadGallery({
    reset: true,
    pageSize: state.siteSettings.gallery_page_size,
    onSelectUploader: handleOpenFriendProfile,
  });

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      state.user = null;
      state.profile = null;
      updateAuthUI();
    }
  });

  logActivity('page_visit', { page: 'home' });
}

bootstrap();
