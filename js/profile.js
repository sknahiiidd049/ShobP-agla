import {
  supabase,
  APP_CONSTANTS,
  sanitizeUrl,
  formatDateBn,
  validateImageFile,
  logActivity,
  showToast,
} from './config.js';
import { openLightbox } from './gallery.js';

let cachedFriends = [];

export function getCachedFriends() {
  return cachedFriends;
}

export async function loadFriendsDirectory({ searchQuery = '', onOpenProfile = null } = {}) {
  const grid = document.getElementById('friends-grid');
  const emptyBox = document.getElementById('friends-empty');
  const loadingBox = document.getElementById('friends-loading');
  if (!grid) return;

  if (loadingBox) loadingBox.hidden = false;
  if (emptyBox) emptyBox.hidden = true;
  grid.innerHTML = '';

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, username, bio, avatar_url, created_at')
      .eq('is_blocked', false)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    cachedFriends = data || [];
    renderFriendsGrid(cachedFriends, searchQuery, onOpenProfile);
  } catch (err) {
    console.error('[Friends directory error]', err);
    if (emptyBox) {
      emptyBox.hidden = false;
      emptyBox.textContent = 'বন্ধুদের তালিকা লোড করা যাচ্ছে না।';
    }
  } finally {
    if (loadingBox) loadingBox.hidden = true;
  }
}

export function renderFriendsGrid(friends, searchQuery = '', onOpenProfile = null) {
  const grid = document.getElementById('friends-grid');
  const emptyBox = document.getElementById('friends-empty');
  if (!grid) return;

  const q = String(searchQuery || '').trim().toLowerCase();
  const filtered = q
    ? friends.filter(
        (f) =>
          f.display_name.toLowerCase().includes(q) ||
          f.username.toLowerCase().includes(q) ||
          (f.bio || '').toLowerCase().includes(q)
      )
    : friends;

  grid.innerHTML = '';
  if (filtered.length === 0) {
    if (emptyBox) {
      emptyBox.hidden = false;
      emptyBox.textContent = q
        ? 'এই নামে কোনো পাগলা খুঁজে পাওয়া যায়নি 😅'
        : 'এখনও কোনো পাগলা রেজিস্টার করেনি। প্রথমে তুমিই যোগ দাও! 😂';
    }
    return;
  }

  if (emptyBox) emptyBox.hidden = true;

  filtered.forEach((friend) => {
    const card = document.createElement('article');
    card.className = 'friend-card';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'friend-card-btn';
    btn.addEventListener('click', () => {
      if (onOpenProfile) onOpenProfile(friend.id);
    });

    const avatar = document.createElement('img');
    avatar.className = 'friend-avatar';
    avatar.src = sanitizeUrl(friend.avatar_url, APP_CONSTANTS.DEFAULT_AVATAR);
    avatar.alt = `${friend.display_name}-এর প্রোফাইল ছবি`;
    avatar.loading = 'lazy';
    avatar.referrerPolicy = 'no-referrer';
    avatar.addEventListener('error', () => {
      avatar.src = APP_CONSTANTS.DEFAULT_AVATAR;
    });

    const info = document.createElement('div');
    info.className = 'friend-card-info';

    const nameEl = document.createElement('h3');
    nameEl.className = 'friend-name';
    nameEl.textContent = friend.display_name;

    const handleEl = document.createElement('p');
    handleEl.className = 'friend-handle';
    handleEl.textContent = `@${friend.username} · যোগ দিয়েছে ${formatDateBn(friend.created_at)}`;

    const bioEl = document.createElement('p');
    bioEl.className = 'friend-bio';
    bioEl.textContent = friend.bio || 'জীবন একটাই, তাই ফুল স্পিডে পাগলামি! 😂';

    info.append(nameEl, handleEl, bioEl);
    btn.append(avatar, info);
    card.appendChild(btn);
    grid.appendChild(card);
  });
}

export async function openUserProfileView(userId, currentUserId = null, onProfileUpdated = null) {
  const container = document.getElementById('profile-view-content');
  if (!container) return;

  container.innerHTML = '<div class="loading-state">প্রোফাইল লোড হচ্ছে... ⏳</div>';

  try {
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (pErr || !profile || profile.is_blocked) {
      container.innerHTML = '<div class="empty-state">এই প্রোফাইলটি পাওয়া যায়নি।</div>';
      return;
    }

    const isOwner = Boolean(currentUserId && currentUserId === profile.id);

    let photosQuery = supabase
      .from('photos')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });

    if (!isOwner) {
      photosQuery = photosQuery.eq('status', 'approved');
    }

    const { data: photos, error: phErr } = await photosQuery;
    if (phErr) throw phErr;

    const allUserPhotos = photos || [];
    const approvedPhotos = allUserPhotos.filter((p) => p.status === 'approved');
    const pendingCount = allUserPhotos.filter((p) => p.status === 'pending').length;

    container.innerHTML = '';

    // Profile Header Card
    const headerCard = document.createElement('div');
    headerCard.className = 'profile-header-card';

    const avatarImg = document.createElement('img');
    avatarImg.className = 'profile-avatar-lg';
    avatarImg.src = sanitizeUrl(profile.avatar_url, APP_CONSTANTS.DEFAULT_AVATAR);
    avatarImg.alt = `${profile.display_name}-এর ছবি`;
    avatarImg.referrerPolicy = 'no-referrer';
    avatarImg.addEventListener('error', () => {
      avatarImg.src = APP_CONSTANTS.DEFAULT_AVATAR;
    });

    const details = document.createElement('div');
    details.className = 'profile-details';

    const nameHeading = document.createElement('h2');
    nameHeading.className = 'profile-display-name';
    nameHeading.textContent = profile.display_name;

    const metaRow = document.createElement('p');
    metaRow.className = 'profile-meta-line';
    metaRow.textContent = `@${profile.username} · যোগ দিয়েছে ${formatDateBn(profile.created_at)} · অ্যাপ্রুভড ছবি: ${approvedPhotos.length}${isOwner && pendingCount > 0 ? ` · পেন্ডিং: ${pendingCount}` : ''}`;

    const bioP = document.createElement('p');
    bioP.className = 'profile-bio-text';
    bioP.textContent = profile.bio || 'এখনও কোনো বায়ো লেখেনি, তবে মানুষটা ১০০% পাগলা! 😜';

    details.append(nameHeading, metaRow, bioP);

    if (isOwner) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-secondary';
      editBtn.textContent = '✏️ প্রোফাইল এডিট করো';
      editBtn.addEventListener('click', () => {
        const editPanel = document.getElementById('profile-edit-panel');
        if (editPanel) editPanel.hidden = !editPanel.hidden;
      });
      details.appendChild(editBtn);
    }

    headerCard.append(avatarImg, details);
    container.appendChild(headerCard);

    // Owner Edit Form
    if (isOwner) {
      const editPanel = buildEditProfilePanel(profile, async () => {
        await openUserProfileView(profile.id, currentUserId, onProfileUpdated);
        if (onProfileUpdated) await onProfileUpdated();
      });
      container.appendChild(editPanel);
    }

    // Approved Photos Section
    const galleryHeading = document.createElement('h3');
    galleryHeading.className = 'section-subheading';
    galleryHeading.textContent = isOwner
      ? `তোমার আপলোড করা ছবি (${allUserPhotos.length})`
      : `${profile.display_name}-এর অ্যাপ্রুভড ছবি (${approvedPhotos.length})`;
    container.appendChild(galleryHeading);

    const displayList = isOwner ? allUserPhotos : approvedPhotos;
    if (displayList.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = isOwner
        ? 'তুমি এখনও কোনো ছবি আপলোড করোনি। Upload ট্যাব থেকে শুরু করো! 📸'
        : 'এই বন্ধুর এখনও কোনো অ্যাপ্রুভড ছবি নেই।';
      container.appendChild(empty);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'gallery-grid';

    displayList.forEach((photo) => {
      const card = document.createElement('article');
      card.className = 'meme-card';

      const mediaBtn = document.createElement('button');
      mediaBtn.type = 'button';
      mediaBtn.className = 'meme-card-media';
      const img = document.createElement('img');
      img.src = sanitizeUrl(photo.image_url, '');
      img.alt = photo.caption || 'ছবি';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      mediaBtn.appendChild(img);
      mediaBtn.addEventListener('click', () =>
        openLightbox({
          ...photo,
          profiles: profile,
        })
      );

      const body = document.createElement('div');
      body.className = 'meme-card-body';

      const cap = document.createElement('p');
      cap.className = 'meme-card-caption';
      cap.textContent = photo.caption || 'ক্যাপশন নেই 😂';

      const meta = document.createElement('p');
      meta.className = 'meme-card-meta';
      const statusLabel =
        photo.status === 'approved'
          ? 'অ্যাপ্রুভড'
          : photo.status === 'pending'
            ? 'অ্যাপ্রুভালের অপেক্ষায় ⏳'
            : 'রিজেক্টেড ❌';
      meta.textContent = isOwner
        ? `${formatDateBn(photo.created_at)} · ${statusLabel}`
        : formatDateBn(photo.created_at);

      body.append(cap, meta);
      card.append(mediaBtn, body);
      grid.appendChild(card);
    });

    container.appendChild(grid);
  } catch (err) {
    console.error('[Profile view error]', err);
    container.innerHTML = '<div class="empty-state">প্রোফাইল লোড করতে সমস্যা হয়েছে।</div>';
  }
}

function buildEditProfilePanel(profile, onSaved) {
  const panel = document.createElement('form');
  panel.id = 'profile-edit-panel';
  panel.className = 'card-surface edit-profile-form';
  panel.hidden = true;

  panel.innerHTML = `
    <h3 class="form-title">প্রোফাইল আপডেট করো</h3>
    <div class="form-grid">
      <label class="field-group">
        <span class="field-label">তোমার নাম</span>
        <input type="text" name="display_name" required maxlength="60" class="input-control" />
      </label>
      <label class="field-group">
        <span class="field-label">Username (পরিবর্তনযোগ্য নয়)</span>
        <input type="text" name="username" disabled class="input-control input-disabled" />
      </label>
    </div>
    <label class="field-group">
      <span class="field-label">তোমার সম্পর্কে মজার বায়ো</span>
      <textarea name="bio" rows="3" maxlength="240" class="input-control" placeholder="যেমন: চা ছাড়া চলি না, আড্ডা পেলে ফিরি না 😂"></textarea>
    </label>
    <label class="field-group">
      <span class="field-label">নতুন প্রোফাইল ছবি (ঐচ্ছিক, JPG/PNG/WEBP, সর্বোচ্চ 8MB)</span>
      <input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" class="input-control" />
    </label>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">💾 পরিবর্তন সেভ করো</button>
    </div>
  `;

  panel.elements.display_name.value = profile.display_name || '';
  panel.elements.username.value = `@${profile.username}`;
  panel.elements.bio.value = profile.bio || '';

  panel.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = panel.querySelector('button[type="submit"]');
    const newName = String(panel.elements.display_name.value || '').trim();
    const newBio = String(panel.elements.bio.value || '').trim();
    const avatarFile = panel.elements.avatar.files?.[0] || null;

    if (!newName || newName.length > 60) {
      showToast('নাম ১–৬০ অক্ষরের মধ্যে হতে হবে।', 'error');
      return;
    }

    let newAvatarUrl = profile.avatar_url || '';
    if (avatarFile) {
      const check = validateImageFile(avatarFile, APP_CONSTANTS.DEFAULT_MAX_UPLOAD_MB);
      if (!check.valid) {
        showToast(check.error, 'error');
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'আপডেট হচ্ছে...';

      const path = `${profile.id}/avatar_${crypto.randomUUID()}.${check.ext}`;
      const { error: upErr } = await supabase.storage
        .from('photos')
        .upload(path, avatarFile, { cacheControl: '3600', upsert: false });

      if (upErr) {
        console.error('[Avatar upload error]', upErr);
        showToast('প্রোফাইল ছবি আপলোড করা যায়নি।', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '💾 পরিবর্তন সেভ করো';
        return;
      }

      const { data: urlData } = supabase.storage.from('photos').getPublicUrl(path);
      newAvatarUrl = urlData?.publicUrl || newAvatarUrl;
    } else {
      submitBtn.disabled = true;
      submitBtn.textContent = 'আপডেট হচ্ছে...';
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: newName,
        bio: newBio,
        avatar_url: newAvatarUrl,
      })
      .eq('id', profile.id);

    submitBtn.disabled = false;
    submitBtn.textContent = '💾 পরিবর্তন সেভ করো';

    if (error) {
      console.error('[Profile update error]', error);
      showToast('প্রোফাইল আপডেট ব্যর্থ হয়েছে।', 'error');
      return;
    }

    await logActivity('profile_update');
    showToast('প্রোফাইল সুন্দরভাবে আপডেট হয়েছে! ✨', 'success');
    if (onSaved) await onSaved();
  });

  return panel;
}
