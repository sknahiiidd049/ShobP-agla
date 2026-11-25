import {
  supabase,
  APP_CONSTANTS,
  validateUsername,
  buildSyntheticEmail,
  validateImageFile,
  logActivity,
  showToast,
} from './config.js';

export async function fetchProfileById(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Profile fetch error]', error);
    return null;
  }
  return data;
}

export async function getCurrentSessionAndProfile() {
  const { data: sessionData, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[Session restore error]', error);
    return { user: null, profile: null, blocked: false };
  }

  const user = sessionData?.session?.user || null;
  if (!user) return { user: null, profile: null, blocked: false };

  let profile = await fetchProfileById(user.id);

  // Auto-heal profile if user metadata exists but profile insert was interrupted
  if (!profile && user.user_metadata?.username) {
    const { data: inserted } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        display_name: user.user_metadata.display_name || user.user_metadata.username,
        username: user.user_metadata.username,
        bio: '',
        avatar_url: '',
      })
      .select()
      .maybeSingle();
    profile = inserted || null;
  }

  if (profile?.is_blocked) {
    await supabase.auth.signOut();
    return { user: null, profile: null, blocked: true };
  }

  return { user, profile, blocked: false };
}

export async function registerUser({ displayName, username, password, bio = '', avatarFile = null }) {
  const cleanName = String(displayName || '').trim();
  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanBio = String(bio || '').trim();

  if (cleanName.length < 1 || cleanName.length > 60) {
    return { ok: false, error: 'তোমার নাম ১ থেকে ৬০ অক্ষরের মধ্যে হতে হবে।' };
  }
  if (!validateUsername(cleanUsername)) {
    return {
      ok: false,
      error: 'Username ৩–২০ অক্ষরের হতে হবে এবং শুধু ইংরেজি অক্ষর, সংখ্যা ও _ ব্যবহার করা যাবে।',
    };
  }
  if (!password || password.length < 6) {
    return { ok: false, error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' };
  }
  if (cleanBio.length > 240) {
    return { ok: false, error: 'বায়ো সর্বোচ্চ ২৪০ অক্ষরের মধ্যে হতে হবে।' };
  }

  if (avatarFile) {
    const imgCheck = validateImageFile(avatarFile, APP_CONSTANTS.DEFAULT_MAX_UPLOAD_MB);
    if (!imgCheck.valid) {
      return { ok: false, error: imgCheck.error };
    }
  }

  // Verify username uniqueness before calling Auth signUp
  const { data: available, error: availErr } = await supabase.rpc('is_username_available', {
    p_username: cleanUsername,
  });
  if (availErr) {
    console.error('[Username check error]', availErr);
    return { ok: false, error: 'ডেটাবেজের সাথে সংযোগ করা যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করো।' };
  }
  if (!available) {
    return { ok: false, error: 'এই username আগে থেকেই নেওয়া হয়েছে! অন্য একটি বেছে নাও।' };
  }

  const syntheticEmail = buildSyntheticEmail(cleanUsername);
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: syntheticEmail,
    password,
    options: {
      data: {
        display_name: cleanName,
        username: cleanUsername,
      },
    },
  });

  if (signUpError) {
    console.error('[Registration Auth error]', signUpError);
    if (signUpError.message?.toLowerCase().includes('already registered')) {
      return { ok: false, error: 'এই username দিয়ে আগেই অ্যাকাউন্ট খোলা হয়েছে!' };
    }
    return { ok: false, error: 'রেজিস্ট্রেশন ব্যর্থ হয়েছে। আবার চেষ্টা করো।' };
  }

  const user = signUpData?.user;
  if (!user) {
    return { ok: false, error: 'অ্যাকাউন্ট তৈরি করা যায়নি।' };
  }

  if (!signUpData.session) {
    return {
      ok: false,
      error:
        'অ্যাকাউন্ট তৈরি হয়েছে, তবে Supabase Auth-এ Email Confirmation চালু থাকায় সরাসরি লগইন হয়নি। Supabase Dashboard -> Authentication -> Providers -> Email থেকে "Confirm email" বন্ধ করুন।',
    };
  }

  let avatarUrl = '';
  if (avatarFile) {
    const imgCheck = validateImageFile(avatarFile, APP_CONSTANTS.DEFAULT_MAX_UPLOAD_MB);
    const storagePath = `${user.id}/${crypto.randomUUID()}.${imgCheck.ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('photos')
      .upload(storagePath, avatarFile, { cacheControl: '3600', upsert: false });

    if (!uploadErr) {
      const { data: urlData } = supabase.storage.from('photos').getPublicUrl(storagePath);
      avatarUrl = urlData?.publicUrl || '';
    } else {
      console.warn('[Optional avatar upload failed]', uploadErr);
    }
  }

  const { data: profileData, error: profileErr } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      display_name: cleanName,
      username: cleanUsername,
      bio: cleanBio,
      avatar_url: avatarUrl,
      is_blocked: false,
    })
    .select()
    .single();

  if (profileErr) {
    console.error('[Profile creation error]', profileErr);
    return { ok: false, error: 'প্রোফাইল সংরক্ষণে সমস্যা হয়েছে। অন্য username দিয়ে চেষ্টা করো।' };
  }

  await logActivity('registration', { username: cleanUsername });
  return { ok: true, user, profile: profileData };
}

export async function loginUser({ username, password }) {
  const cleanUsername = String(username || '').trim().toLowerCase();
  if (!validateUsername(cleanUsername) || !password) {
    return { ok: false, error: 'সঠিক username এবং password লিখো।' };
  }

  const syntheticEmail = buildSyntheticEmail(cleanUsername);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password,
  });

  if (error || !data?.user) {
    console.error('[Login error]', error);
    return { ok: false, error: 'Username অথবা password ভুল।' };
  }

  const profile = await fetchProfileById(data.user.id);
  if (profile?.is_blocked) {
    await logActivity('blocked_login_attempt', { username: cleanUsername });
    await supabase.auth.signOut();
    return {
      ok: false,
      error: 'তোমার অ্যাকাউন্টটি অ্যাডমিন দ্বারা ব্লক করা হয়েছে। তাই প্রবেশ করা যাবে না।',
    };
  }

  await logActivity('login', { username: cleanUsername });
  return { ok: true, user: data.user, profile };
}

export async function logoutUser() {
  await logActivity('logout');
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('[Logout error]', error);
    showToast('লগআউট করতে সমস্যা হয়েছে।', 'error');
    return false;
  }
  showToast('সফলভাবে লগআউট হয়েছো! আবার দেখা হবে 😂', 'success');
  return true;
}
