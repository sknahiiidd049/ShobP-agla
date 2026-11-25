import {
  supabase,
  APP_CONSTANTS,
  validateImageFile,
  logActivity,
  showToast,
} from './config.js';

let selectedUploadFile = null;
let previewObjectUrl = null;

async function compressImageIfLarge(file) {
  // Only compress JPEG/WEBP larger than 1.5MB to keep gallery snappy
  if (file.size <= 1.5 * 1024 * 1024 || file.type === 'image/png') {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1600;
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim) {
        resolve(file);
        return;
      }
      const ratio = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const outType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            resolve(new File([blob], file.name, { type: outType }));
          } else {
            resolve(file);
          }
        },
        outType,
        0.84
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export function initUploadController({ getCurrentState, getSiteSettings, onUploadSuccess }) {
  const form = document.getElementById('upload-form');
  const fileInput = document.getElementById('upload-file-input');
  const dropZone = document.getElementById('upload-dropzone');
  const previewWrap = document.getElementById('upload-preview-wrap');
  const previewImg = document.getElementById('upload-preview-img');
  const clearFileBtn = document.getElementById('upload-clear-file');
  const captionInput = document.getElementById('upload-caption');
  const submitBtn = document.getElementById('upload-submit-btn');
  const statusBox = document.getElementById('upload-status');

  if (!form || !fileInput) return;

  function setStatus(msg, type = 'info') {
    if (!statusBox) return;
    if (!msg) {
      statusBox.hidden = true;
      statusBox.textContent = '';
      return;
    }
    statusBox.hidden = false;
    statusBox.className = `form-feedback feedback-${type}`;
    statusBox.textContent = msg;
  }

  function handleSelectedFile(file) {
    setStatus('');
    const maxMb = getSiteSettings()?.max_upload_mb || APP_CONSTANTS.DEFAULT_MAX_UPLOAD_MB;
    const check = validateImageFile(file, maxMb);
    if (!check.valid) {
      selectedUploadFile = null;
      if (previewWrap) previewWrap.hidden = true;
      setStatus(check.error, 'error');
      return;
    }

    selectedUploadFile = file;
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(file);

    if (previewImg && previewWrap) {
      previewImg.src = previewObjectUrl;
      previewWrap.hidden = false;
    }
  }

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleSelectedFile(file);
  });

  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dropzone-active');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dropzone-active');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dropzone-active');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleSelectedFile(file);
    });
  }

  if (clearFileBtn) {
    clearFileBtn.addEventListener('click', () => {
      selectedUploadFile = null;
      fileInput.value = '';
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
      }
      if (previewWrap) previewWrap.hidden = true;
      setStatus('');
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('');

    const { user, profile } = getCurrentState();
    if (!user || !profile) {
      setStatus('ছবি আপলোড করতে আগে লগইন করো।', 'error');
      return;
    }
    if (profile.is_blocked) {
      setStatus('তোমার অ্যাকাউন্ট ব্লক থাকায় ছবি আপলোড বন্ধ রয়েছে।', 'error');
      return;
    }

    const maxMb = getSiteSettings()?.max_upload_mb || APP_CONSTANTS.DEFAULT_MAX_UPLOAD_MB;
    const check = validateImageFile(selectedUploadFile, maxMb);
    if (!check.valid) {
      setStatus(check.error, 'error');
      return;
    }

    const caption = String(captionInput?.value || '').trim();
    if (caption.length > 300) {
      setStatus('ক্যাপশন সর্বোচ্চ ৩০০ অক্ষরের মধ্যে হতে হবে।', 'error');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'আপলোড হচ্ছে... ⏳';
    }

    try {
      const processedFile = await compressImageIfLarge(selectedUploadFile);
      const storagePath = `${user.id}/${crypto.randomUUID()}.${check.ext}`;

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(storagePath, processedFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('photos').getPublicUrl(storagePath);
      const publicUrl = urlData?.publicUrl;
      if (!publicUrl) throw new Error('Could not resolve public image URL');

      const { error: insertError } = await supabase.from('photos').insert({
        user_id: user.id,
        image_url: publicUrl,
        storage_path: storagePath,
        caption,
        status: 'pending',
      });

      if (insertError) throw insertError;

      await logActivity('photo_upload', { storage_path: storagePath });

      selectedUploadFile = null;
      form.reset();
      if (previewWrap) previewWrap.hidden = true;
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
      }

      const okMsg =
        'দারুণ! ছবি আপলোড হয়েছে 🎉 অ্যাডমিন অ্যাপ্রুভ করলেই সবার জন্য ফানি গ্যালারিতে দেখা যাবে।';
      setStatus(okMsg, 'success');
      showToast('ছবি আপলোড সম্পন্ন! অ্যাপ্রুভালের জন্য অপেক্ষমাণ ⏳', 'success');

      if (onUploadSuccess) await onUploadSuccess();
    } catch (err) {
      console.error('[Photo upload error]', err);
      setStatus('ছবি আপলোড ব্যর্থ হয়েছে। ইন্টারনেট বা ফাইল সাইজ দেখে আবার চেষ্টা করো।', 'error');
      showToast('আপলোড ব্যর্থ হয়েছে!', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '📸 পাগলামি আপলোড করো';
      }
    }
  });
}
