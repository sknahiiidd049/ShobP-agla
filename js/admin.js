import {
  supabase,
  formatDateBn,
  formatDateTimeBn,
  sanitizeUrl,
  showToast,
} from './config.js';

// Admin session token kept strictly in JS memory (cleared on logout/reload)
let adminToken = null;
let dashboardCache = null;
let activePhotoFilter = 'all';
let activeUserSearch = '';

function resolveAdminAsset(url) {
  const fallback = '../assets/default-avatar/default-avatar.jpg';
  if (!url) return fallback;
  if (url.startsWith('./')) return `..${url.slice(1)}`;
  return sanitizeUrl(url, fallback);
}

function setAdminView(sectionName) {
  document.querySelectorAll('[data-admin-view]').forEach((el) => {
    el.hidden = el.getAttribute('data-admin-view') !== sectionName;
  });
  document.querySelectorAll('[data-admin-nav]').forEach((btn) => {
    const active = btn.getAttribute('data-admin-nav') === sectionName;
    btn.classList.toggle('admin-nav-active', active);
  });

  const breadcrumb = document.getElementById('admin-breadcrumb');
  const titles = {
    dashboard: '📊 Dashboard',
    users: '👥 Users',
    photos: '📸 Photos',
    pending: '⏳ Pending Approval',
    blocked: '🚫 Blocked Users',
    logs: '🕐 Activity Logs',
    statistics: '📈 Statistics',
    settings: '⚙️ Settings',
  };
  if (breadcrumb) breadcrumb.textContent = titles[sectionName] || '📊 Dashboard';
}

async function fetchDashboardData() {
  if (!adminToken) return;
  const { data, error } = await supabase.rpc('admin_get_dashboard_data', {
    p_admin_token: adminToken,
  });

  if (error || !data) {
    console.error('[Admin data fetch error]', error);
    showToast('অ্যাডমিন সেশন মেয়াদোত্তীর্ণ বা ডেটা লোডে সমস্যা হয়েছে।', 'error');
    if (String(error?.message || '').includes('Unauthorized')) {
      handleAdminLogout(false);
    }
    return;
  }

  dashboardCache = data;
  renderAllAdminSections(data);
}

function renderAllAdminSections(data) {
  renderDashboardOverview(data);
  renderUsersTable(data.users || []);
  renderBlockedUsersTable(data.users || []);
  renderPhotosModeration(data.photos || [], 'admin-photos-grid', activePhotoFilter);
  renderPhotosModeration(data.photos || [], 'admin-pending-grid', 'pending');
  renderActivityLogs(data.logs || []);
  renderStatistics(data);
  populateSettingsForm(data.settings || {});
}

function renderDashboardOverview(data) {
  const stats = data.stats || {};
  const map = {
    'kpi-total-users': stats.total_users ?? 0,
    'kpi-total-photos': stats.total_photos ?? 0,
    'kpi-approved-photos': stats.approved_photos ?? 0,
    'kpi-pending-photos': stats.pending_photos ?? 0,
    'kpi-rejected-photos': stats.rejected_photos ?? 0,
    'kpi-blocked-users': stats.blocked_users ?? 0,
  };
  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  });

  const pendingBadge = document.getElementById('nav-pending-count');
  if (pendingBadge) pendingBadge.textContent = String(stats.pending_photos ?? 0);

  const recentFeed = document.getElementById('admin-recent-activity');
  if (!recentFeed) return;
  recentFeed.innerHTML = '';

  const recent = (data.logs || []).slice(0, 8);
  if (recent.length === 0) {
    recentFeed.innerHTML = '<p class="empty-state">কোনো সাম্প্রতিক অ্যাক্টিভিটি নেই।</p>';
    return;
  }

  recent.forEach((log) => {
    const row = document.createElement('div');
    row.className = 'activity-item';

    const left = document.createElement('div');
    left.className = 'activity-item-main';
    const userLabel = log.username ? `@${log.username}` : 'অতিথি/অ্যাডমিন';
    left.textContent = `${userLabel} · ${log.event}`;

    const right = document.createElement('span');
    right.className = 'activity-item-time tabular-nums';
    right.textContent = formatDateTimeBn(log.created_at);

    row.append(left, right);
    recentFeed.appendChild(row);
  });
}

function renderUsersTable(users) {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const q = activeUserSearch.trim().toLowerCase();
  const filtered = q
    ? users.filter(
        (u) =>
          (u.display_name || '').toLowerCase().includes(q) ||
          (u.username || '').toLowerCase().includes(q)
      )
    : users;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">কোনো ইউজার পাওয়া যায়নি।</td></tr>';
    return;
  }

  filtered.forEach((user) => {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = user.display_name;

    const tdUser = document.createElement('td');
    tdUser.className = 'mono-cell';
    tdUser.textContent = `@${user.username}`;

    const tdDate = document.createElement('td');
    tdDate.className = 'tabular-nums';
    tdDate.textContent = formatDateBn(user.created_at);

    const tdStatus = document.createElement('td');
    tdStatus.textContent = user.is_blocked ? '🚫 Blocked' : '✅ Active';
    tdStatus.className = user.is_blocked ? 'text-danger' : 'text-success';

    const tdCount = document.createElement('td');
    tdCount.className = 'tabular-nums';
    tdCount.textContent = `${user.photo_count ?? 0} (${user.approved_count ?? 0} অ্যাপ্রুভড)`;

    const tdActions = document.createElement('td');
    tdActions.className = 'table-actions';

    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'btn btn-xs btn-secondary';
    viewBtn.textContent = 'View';
    viewBtn.addEventListener('click', () => openAdminUserModal(user));

    const blockBtn = document.createElement('button');
    blockBtn.type = 'button';
    blockBtn.className = user.is_blocked ? 'btn btn-xs btn-success' : 'btn btn-xs btn-danger';
    blockBtn.textContent = user.is_blocked ? 'Unblock' : 'Block';
    blockBtn.addEventListener('click', () => handleToggleBlock(user.id, !user.is_blocked));

    tdActions.append(viewBtn, blockBtn);
    tr.append(tdName, tdUser, tdDate, tdStatus, tdCount, tdActions);
    tbody.appendChild(tr);
  });
}

function renderBlockedUsersTable(users) {
  const tbody = document.getElementById('admin-blocked-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const blocked = users.filter((u) => u.is_blocked);
  if (blocked.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="table-empty">বর্তমানে কোনো ব্লকড ইউজার নেই 🎉</td></tr>';
    return;
  }

  blocked.forEach((user) => {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.textContent = user.display_name;

    const tdUser = document.createElement('td');
    tdUser.className = 'mono-cell';
    tdUser.textContent = `@${user.username}`;

    const tdDate = document.createElement('td');
    tdDate.className = 'tabular-nums';
    tdDate.textContent = formatDateBn(user.created_at);

    const tdAct = document.createElement('td');
    const unblockBtn = document.createElement('button');
    unblockBtn.type = 'button';
    unblockBtn.className = 'btn btn-xs btn-success';
    unblockBtn.textContent = 'Unblock করো';
    unblockBtn.addEventListener('click', () => handleToggleBlock(user.id, false));
    tdAct.appendChild(unblockBtn);

    tr.append(tdName, tdUser, tdDate, tdAct);
    tbody.appendChild(tr);
  });
}

function renderPhotosModeration(photos, containerId, filterStatus) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  grid.innerHTML = '';

  const list =
    filterStatus === 'all' ? photos : photos.filter((p) => p.status === filterStatus);

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent =
      filterStatus === 'pending'
        ? 'কোনো পেন্ডিং ছবি বাকি নেই! সব ক্লিয়ার ✅'
        : 'এই ক্যাটাগরিতে কোনো ছবি পাওয়া যায়নি।';
    grid.appendChild(empty);
    return;
  }

  list.forEach((photo) => {
    const card = document.createElement('article');
    card.className = 'admin-photo-card';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'admin-photo-media';
    const img = document.createElement('img');
    img.src = sanitizeUrl(photo.image_url, '');
    img.alt = photo.caption || 'ছবি প্রিভিউ';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    imgWrap.appendChild(img);

    const body = document.createElement('div');
    body.className = 'admin-photo-body';

    const cap = document.createElement('p');
    cap.className = 'admin-photo-caption';
    cap.textContent = photo.caption || 'ক্যাপশন নেই';

    const statusText =
      photo.status === 'approved'
        ? '✅ Approved'
        : photo.status === 'pending'
          ? '⏳ Pending'
          : '❌ Rejected';

    const meta = document.createElement('p');
    meta.className = 'admin-photo-meta';
    meta.textContent = `${photo.uploader_name || 'অজানা'} (@${photo.uploader_username || 'user'}) · ${formatDateBn(photo.created_at)} · ${statusText}`;

    const actions = document.createElement('div');
    actions.className = 'admin-photo-actions';

    if (photo.status !== 'approved') {
      const approveBtn = document.createElement('button');
      approveBtn.type = 'button';
      approveBtn.className = 'btn btn-xs btn-success';
      approveBtn.textContent = 'Approve';
      approveBtn.addEventListener('click', () => handleModeratePhoto(photo.id, 'approve'));
      actions.appendChild(approveBtn);
    }

    if (photo.status !== 'rejected') {
      const rejectBtn = document.createElement('button');
      rejectBtn.type = 'button';
      rejectBtn.className = 'btn btn-xs btn-warning';
      rejectBtn.textContent = 'Reject';
      rejectBtn.addEventListener('click', () => handleModeratePhoto(photo.id, 'reject'));
      actions.appendChild(rejectBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-xs btn-danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => handleModeratePhoto(photo.id, 'delete'));
    actions.appendChild(delBtn);

    body.append(cap, meta, actions);
    card.append(imgWrap, body);
    grid.appendChild(card);
  });
}

function renderActivityLogs(logs) {
  const tbody = document.getElementById('admin-logs-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const eventFilter = document.getElementById('logs-event-filter')?.value || 'all';
  const filtered =
    eventFilter === 'all' ? logs : logs.filter((l) => l.event === eventFilter);

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">কোনো লগ রেকর্ড নেই।</td></tr>';
    return;
  }

  filtered.forEach((log) => {
    const tr = document.createElement('tr');

    const tdTime = document.createElement('td');
    tdTime.className = 'tabular-nums';
    tdTime.textContent = formatDateTimeBn(log.created_at);

    const tdUser = document.createElement('td');
    tdUser.className = 'mono-cell';
    tdUser.textContent = log.username ? `@${log.username}` : 'guest/system';

    const tdEvent = document.createElement('td');
    tdEvent.className = 'mono-cell';
    tdEvent.textContent = log.event;

    const tdAgent = document.createElement('td');
    tdAgent.className = 'truncate-cell';
    tdAgent.title = log.user_agent || '';
    tdAgent.textContent = (log.user_agent || '-').slice(0, 48);

    const tdRef = document.createElement('td');
    tdRef.className = 'truncate-cell';
    tdRef.textContent = log.referrer || 'Direct';

    const tdIp = document.createElement('td');
    tdIp.className = 'mono-cell tabular-nums';
    tdIp.textContent = log.ip_address || 'Server Edge Off';

    tr.append(tdTime, tdUser, tdEvent, tdAgent, tdRef, tdIp);
    tbody.appendChild(tr);
  });
}

function renderStatistics(data) {
  const stats = data.stats || {};
  const photos = data.photos || [];
  const users = data.users || [];
  const logs = data.logs || [];

  // 1. Photo status bar chart
  const chartBox = document.getElementById('stats-photo-bars');
  if (chartBox) {
    const total = Math.max(1, Number(stats.total_photos || 0));
    const items = [
      { label: 'Approved', count: Number(stats.approved_photos || 0), cls: 'bar-success' },
      { label: 'Pending', count: Number(stats.pending_photos || 0), cls: 'bar-warning' },
      { label: 'Rejected', count: Number(stats.rejected_photos || 0), cls: 'bar-danger' },
    ];
    chartBox.innerHTML = '';
    items.forEach((item) => {
      const pct = Math.round((item.count / total) * 100);
      const row = document.createElement('div');
      row.className = 'stat-bar-row';
      row.innerHTML = `
        <div class="stat-bar-label">
          <span>${item.label}</span>
          <span class="tabular-nums">${item.count} (${pct}%)</span>
        </div>
        <div class="stat-bar-track">
          <div class="stat-bar-fill ${item.cls}" style="width: ${pct}%"></div>
        </div>
      `;
      chartBox.appendChild(row);
    });
  }

  // 2. Top uploaders leaderboard
  const topBox = document.getElementById('stats-top-uploaders');
  if (topBox) {
    topBox.innerHTML = '';
    const sorted = [...users].sort((a, b) => (b.photo_count || 0) - (a.photo_count || 0)).slice(0, 6);
    if (sorted.length === 0) {
      topBox.innerHTML = '<p class="empty-state">কোনো ডেটা নেই।</p>';
    } else {
      sorted.forEach((u, idx) => {
        const row = document.createElement('div');
        row.className = 'activity-item';
        const left = document.createElement('span');
        left.textContent = `${idx + 1}. ${u.display_name} (@${u.username})`;
        const right = document.createElement('span');
        right.className = 'tabular-nums';
        right.textContent = `${u.photo_count || 0} ছবি`;
        row.append(left, right);
        topBox.appendChild(row);
      });
    }
  }

  // 3. Activity breakdown
  const eventsBox = document.getElementById('stats-events-summary');
  if (eventsBox) {
    eventsBox.innerHTML = '';
    const counts = {};
    logs.forEach((l) => {
      counts[l.event] = (counts[l.event] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (entries.length === 0) {
      eventsBox.innerHTML = '<p class="empty-state">কোনো ইভেন্ট নেই।</p>';
    } else {
      const maxVal = Math.max(1, entries[0][1]);
      entries.forEach(([ev, cnt]) => {
        const pct = Math.round((cnt / maxVal) * 100);
        const row = document.createElement('div');
        row.className = 'stat-bar-row';
        const label = document.createElement('div');
        label.className = 'stat-bar-label';
        const evSpan = document.createElement('span');
        evSpan.textContent = ev;
        const cntSpan = document.createElement('span');
        cntSpan.className = 'tabular-nums';
        cntSpan.textContent = String(cnt);
        label.append(evSpan, cntSpan);

        const track = document.createElement('div');
        track.className = 'stat-bar-track';
        const fill = document.createElement('div');
        fill.className = 'stat-bar-fill bar-accent';
        fill.style.width = `${pct}%`;
        track.appendChild(fill);

        row.append(label, track);
        eventsBox.appendChild(row);
      });
    }
  }
}

function populateSettingsForm(settings) {
  const form = document.getElementById('admin-settings-form');
  if (!form) return;
  form.elements.site_name.value = settings.site_name || 'সব পাগলা';
  form.elements.tagline.value = settings.tagline || 'পাগলের দুনিয়া 😂';
  form.elements.gallery_page_size.value = settings.gallery_page_size || 12;
  form.elements.max_upload_mb.value = settings.max_upload_mb || 8;
}

function openAdminUserModal(user) {
  const modal = document.getElementById('admin-user-modal');
  const body = document.getElementById('admin-user-modal-body');
  if (!modal || !body) return;

  body.innerHTML = '';

  const img = document.createElement('img');
  img.className = 'profile-avatar-lg';
  img.src = resolveAdminAsset(user.avatar_url);
  img.alt = user.display_name;

  const title = document.createElement('h3');
  title.textContent = user.display_name;

  const meta = document.createElement('p');
  meta.className = 'profile-meta-line';
  meta.textContent = `@${user.username} · যোগ দিয়েছে ${formatDateBn(user.created_at)} · মোট ছবি: ${user.photo_count || 0}`;

  const bio = document.createElement('p');
  bio.textContent = user.bio || 'কোনো বায়ো নেই।';

  body.append(img, title, meta, bio);
  modal.hidden = false;
}

async function handleModeratePhoto(photoId, action) {
  if (!adminToken) return;
  if (action === 'delete') {
    const confirmBox = document.getElementById('admin-delete-confirm');
    if (confirmBox && confirmBox.dataset.armed !== photoId) {
      showToast('ডিলিট নিশ্চিত করতে আবার Delete ক্লিক করো।', 'info');
      confirmBox.dataset.armed = photoId;
      return;
    }
    if (confirmBox) confirmBox.dataset.armed = '';
  }

  const { error } = await supabase.rpc('admin_moderate_photo', {
    p_admin_token: adminToken,
    p_photo_id: photoId,
    p_action: action,
  });

  if (error) {
    console.error('[Moderation error]', error);
    showToast('মডারেশন অ্যাকশন ব্যর্থ হয়েছে।', 'error');
    return;
  }

  const labels = {
    approve: 'ছবি অ্যাপ্রুভ করা হয়েছে ✅',
    reject: 'ছবি রিজেক্ট করা হয়েছে ❌',
    delete: 'ছবি ডিলিট করা হয়েছে 🗑️',
  };
  showToast(labels[action] || 'সম্পন্ন হয়েছে', 'success');
  await fetchDashboardData();
}

async function handleToggleBlock(userId, block) {
  if (!adminToken) return;
  const { error } = await supabase.rpc('admin_toggle_block_user', {
    p_admin_token: adminToken,
    p_user_id: userId,
    p_block: block,
  });

  if (error) {
    console.error('[Toggle block error]', error);
    showToast('ইউজার স্ট্যাটাস পরিবর্তন করা যায়নি।', 'error');
    return;
  }

  showToast(block ? 'ইউজার ব্লক করা হয়েছে 🚫' : 'ইউজার আনব্লক করা হয়েছে ✅', 'success');
  await fetchDashboardData();
}

async function handleAdminLogout(callRpc = true) {
  if (callRpc && adminToken) {
    await supabase.rpc('admin_logout', { p_admin_token: adminToken }).catch(() => {});
  }
  adminToken = null;
  dashboardCache = null;
  document.getElementById('admin-app-shell').hidden = true;
  document.getElementById('admin-login-gate').hidden = false;
  document.getElementById('admin-login-form')?.reset();
  showToast('অ্যাডমিন সেশন লগআউট হয়েছে।', 'info');
}

function initAdminEvents() {
  // Login Gate
  const loginForm = document.getElementById('admin-login-form');
  const loginError = document.getElementById('admin-login-error');

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginError) loginError.hidden = true;

    const btn = loginForm.querySelector('button[type="submit"]');
    const password = loginForm.elements.password.value;
    btn.disabled = true;
    btn.textContent = 'যাচাই হচ্ছে...';

    try {
      const { data, error } = await supabase.rpc('verify_admin_login', {
        p_password: password,
        p_user_agent: navigator.userAgent || '',
        p_referrer: document.referrer || '',
      });

      if (error) throw error;
      if (!data?.success || !data?.token) {
        if (loginError) {
          loginError.hidden = false;
          loginError.textContent = data?.error || 'ভুল অ্যাডমিন পাসওয়ার্ড।';
        }
        return;
      }

      adminToken = data.token;
      document.getElementById('admin-login-gate').hidden = true;
      document.getElementById('admin-app-shell').hidden = false;
      setAdminView('dashboard');
      await fetchDashboardData();
      showToast('অ্যাডমিন প্যানেলে স্বাগতম, Nahid! 🛡️', 'success');
    } catch (err) {
      console.error('[Admin login error]', err);
      if (loginError) {
        loginError.hidden = false;
        loginError.textContent = 'সার্ভারের সাথে সংযোগ করা যাচ্ছে না। schema.sql চালানো হয়েছে কিনা দেখুন।';
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '🛡️ অ্যাডমিন প্রবেশ';
    }
  });

  // Sidebar navigation
  document.querySelectorAll('[data-admin-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setAdminView(btn.getAttribute('data-admin-nav'));
    });
  });

  // Logout & Refresh
  document.getElementById('admin-logout-btn')?.addEventListener('click', () => handleAdminLogout(true));
  document.getElementById('admin-refresh-btn')?.addEventListener('click', fetchDashboardData);

  // User search
  document.getElementById('admin-user-search')?.addEventListener('input', (e) => {
    activeUserSearch = e.target.value;
    if (dashboardCache) renderUsersTable(dashboardCache.users || []);
  });

  // Photo filter tabs
  document.querySelectorAll('[data-photo-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activePhotoFilter = btn.getAttribute('data-photo-filter');
      document.querySelectorAll('[data-photo-filter]').forEach((b) => {
        b.classList.toggle('tab-active', b === btn);
      });
      if (dashboardCache) {
        renderPhotosModeration(dashboardCache.photos || [], 'admin-photos-grid', activePhotoFilter);
      }
    });
  });

  // Activity logs filter
  document.getElementById('logs-event-filter')?.addEventListener('change', () => {
    if (dashboardCache) renderActivityLogs(dashboardCache.logs || []);
  });

  // User detail modal close
  document.getElementById('admin-user-modal-close')?.addEventListener('click', () => {
    document.getElementById('admin-user-modal').hidden = true;
  });

  // Site Settings update
  document.getElementById('admin-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!adminToken) return;
    const form = e.target;
    const { error } = await supabase.rpc('admin_update_settings', {
      p_admin_token: adminToken,
      p_site_name: form.elements.site_name.value,
      p_tagline: form.elements.tagline.value,
      p_gallery_page_size: Number(form.elements.gallery_page_size.value),
      p_max_upload_mb: Number(form.elements.max_upload_mb.value),
    });

    if (error) {
      console.error('[Settings save error]', error);
      showToast('সেটিংস সেভ করা যায়নি।', 'error');
      return;
    }
    showToast('ওয়েবসাইট সেটিংস আপডেট হয়েছে! ⚙️', 'success');
    await fetchDashboardData();
  });

  // Admin Password Change
  document.getElementById('admin-password-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!adminToken) return;
    const form = e.target;
    const oldPassword = form.elements.old_password.value;
    const newPassword = form.elements.new_password.value;
    const confirmPassword = form.elements.confirm_password.value;
    const msgBox = document.getElementById('admin-password-feedback');

    const showMsg = (msg, type) => {
      if (!msgBox) return;
      msgBox.hidden = false;
      msgBox.className = `form-feedback feedback-${type}`;
      msgBox.textContent = msg;
    };

    if (newPassword.length < 6) {
      showMsg('নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showMsg('নতুন পাসওয়ার্ড এবং কনফার্ম পাসওয়ার্ড মিলছে না।', 'error');
      return;
    }

    const { data, error } = await supabase.rpc('admin_change_password', {
      p_admin_token: adminToken,
      p_old_password: oldPassword,
      p_new_password: newPassword,
    });

    if (error || !data?.success) {
      showMsg(data?.error || 'পাসওয়ার্ড পরিবর্তন করা যায়নি।', 'error');
      return;
    }

    form.reset();
    showMsg('অ্যাডমিন পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে! 🔐', 'success');
    showToast('অ্যাডমিন পাসওয়ার্ড আপডেট হয়েছে!', 'success');
  });
}

initAdminEvents();
