import {
  supabase,
  APP_CONSTANTS,
  escapeHtml,
  sanitizeUrl,
  formatDateBn,
} from './config.js';

let currentPage = 0;
let hasMorePhotos = true;
let loadedPhotos = [];
let isFetching = false;

export function getLoadedPhotos() {
  return loadedPhotos;
}

export async function loadGallery({
  reset = false,
  pageSize = APP_CONSTANTS.DEFAULT_PAGE_SIZE,
  onSelectUploader = null,
} = {}) {
  if (isFetching) return;
  const grid = document.getElementById('gallery-grid');
  const loadMoreBtn = document.getElementById('gallery-load-more');
  const emptyBox = document.getElementById('gallery-empty');
  const errorBox = document.getElementById('gallery-error');
  const loadingBox = document.getElementById('gallery-loading');

  if (!grid) return;

  if (reset) {
    currentPage = 0;
    hasMorePhotos = true;
    loadedPhotos = [];
    grid.innerHTML = '';
  }

  if (!hasMorePhotos) {
    if (loadMoreBtn) loadMoreBtn.hidden = true;
    return;
  }

  isFetching = true;
  if (errorBox) errorBox.hidden = true;
  if (emptyBox) emptyBox.hidden = true;
  if (loadingBox && reset) loadingBox.hidden = false;
  if (loadMoreBtn) {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'লোড হচ্ছে...';
  }

  const from = currentPage * pageSize;
  const to = from + pageSize - 1;

  try {
    const { data, error } = await supabase
      .from('photos')
      .select(`
        id,
        image_url,
        caption,
        created_at,
        user_id,
        profiles (
          id,
          display_name,
          username,
          avatar_url,
          is_blocked
        )
      `)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const rows = (data || []).filter((item) => !item.profiles?.is_blocked);
    if (rows.length < pageSize) {
      hasMorePhotos = false;
    }

    loadedPhotos = [...loadedPhotos, ...rows];
    currentPage += 1;

    if (loadedPhotos.length === 0) {
      if (emptyBox) emptyBox.hidden = false;
      if (loadMoreBtn) loadMoreBtn.hidden = true;
      return;
    }

    rows.forEach((photo) => {
      const card = createGalleryCard(photo, onSelectUploader);
      grid.appendChild(card);
    });

    if (loadMoreBtn) {
      loadMoreBtn.hidden = !hasMorePhotos;
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = 'আরও মজার ছবি দেখো 👇';
    }
  } catch (err) {
    console.error('[Gallery load error]', err);
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = 'গ্যালারি লোড করা যাচ্ছে না। Supabase সংযোগ বা RLS সেটআপ পরীক্ষা করো।';
    }
  } finally {
    isFetching = false;
    if (loadingBox) loadingBox.hidden = true;
  }
}

function createGalleryCard(photo, onSelectUploader) {
  const card = document.createElement('article');
  card.className = 'meme-card';

  const imgWrap = document.createElement('button');
  imgWrap.type = 'button';
  imgWrap.className = 'meme-card-media';
  imgWrap.setAttribute('aria-label', `${photo.caption || 'ফানি ছবি'} বড় করে দেখুন`);

  const img = document.createElement('img');
  img.src = sanitizeUrl(photo.image_url, '');
  img.alt = photo.caption ? escapeHtml(photo.caption) : 'বন্ধুদের ফানি ছবি';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => {
    imgWrap.classList.add('media-fallback');
    img.remove();
    const fallbackText = document.createElement('span');
    fallbackText.className = 'media-fallback-label';
    fallbackText.textContent = 'ছবি লোড হয়নি 😅';
    imgWrap.appendChild(fallbackText);
  });

  imgWrap.appendChild(img);
  imgWrap.addEventListener('click', () => openLightbox(photo, onSelectUploader));

  const body = document.createElement('div');
  body.className = 'meme-card-body';

  const caption = document.createElement('p');
  caption.className = 'meme-card-caption';
  caption.textContent = photo.caption || 'ক্যাপশন ছাড়া পাগলামি 😂';

  const meta = document.createElement('div');
  meta.className = 'meme-card-meta';

  const uploaderBtn = document.createElement('button');
  uploaderBtn.type = 'button';
  uploaderBtn.className = 'link-inline';
  uploaderBtn.textContent = photo.profiles?.display_name || 'অজানা পাগলা';
  uploaderBtn.addEventListener('click', () => {
    if (onSelectUploader && photo.user_id) {
      onSelectUploader(photo.user_id);
    }
  });

  const sep = document.createElement('span');
  sep.setAttribute('aria-hidden', 'true');
  sep.textContent = ' · ';

  const dateSpan = document.createElement('span');
  dateSpan.textContent = formatDateBn(photo.created_at);

  meta.append(uploaderBtn, sep, dateSpan);
  body.append(caption, meta);
  card.append(imgWrap, body);
  return card;
}

export function openLightbox(photo, onSelectUploader = null) {
  const modal = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-img');
  const caption = document.getElementById('lightbox-caption');
  const author = document.getElementById('lightbox-author');
  const dateEl = document.getElementById('lightbox-date');

  if (!modal || !img || !caption || !author || !dateEl) return;

  img.src = sanitizeUrl(photo.image_url, '');
  img.alt = photo.caption || 'ফানি ছবি';
  caption.textContent = photo.caption || 'কোনো ক্যাপশন নেই 😂';
  author.textContent = `${photo.profiles?.display_name || 'বন্ধু'} (@${photo.profiles?.username || 'pagla'})`;
  dateEl.textContent = formatDateBn(photo.created_at);

  author.onclick = () => {
    closeLightbox();
    if (onSelectUploader && photo.user_id) {
      onSelectUploader(photo.user_id);
    }
  };

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  document.getElementById('lightbox-close')?.focus();
}

export function closeLightbox() {
  const modal = document.getElementById('lightbox-modal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}
