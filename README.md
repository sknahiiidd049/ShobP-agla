# সব পাগলা — পাগলের দুনিয়া 😂

বন্ধুদের মজার ছবি, ফানি ক্যাপশন, প্রোফাইল এবং নিরাপদ অ্যাডমিন মডারেশনসহ একটি পূর্ণাঙ্গ স্ট্যাটিক + Supabase কমিউনিটি ওয়েবসাইট। এটি সম্পূর্ণ GitHub Pages-compatible এবং কোনো Node.js সার্ভার ছাড়াই চলে।

---

## ১. ফোল্ডার কাঠামো

```text
shob-pagla/
├── index.html
├── style.css
├── README.md
├── js/
│   ├── config.js
│   ├── app.js
│   ├── auth.js
│   ├── gallery.js
│   ├── upload.js
│   ├── profile.js
│   └── admin.js
├── admin/
│   └── index.html
├── supabase/
│   ├── schema.sql
│   └── functions/
│       └── log-activity/
│           └── index.ts
└── assets/
    ├── logo/
    │   ├── logo.jpg
    │   └── hero-squad.jpg
    └── default-avatar/
        └── default-avatar.jpg
```

---

## ২. কনফিগারেশন (`js/config.js`)

`js/config.js` ফাইলে প্রজেক্টের Supabase URL ও Publishable Key বসানো আছে:

- `SUPABASE_URL`: `https://nyidmtcvyvwsyarrntxu.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: `sb_publishable_uw9sJRKNlcXE_Faf4iNdOw_OVKlj-tc`

> **নিরাপত্তা নোট:** ফ্রন্টএন্ড কোডে কখনোই `service_role` কী বা অ্যাডমিনের প্লেইনটেক্সট পাসওয়ার্ড রাখা হয়নি।

---

## ৩. Supabase সেটআপ ধাপ

1. **Create Supabase Project:** Supabase Dashboard-এ লগইন করে আপনার প্রজেক্ট ওপেন করুন।
2. **Open SQL Editor:** বাম পাশের মেনু থেকে **SQL Editor** খুলুন এবং `New Query` ক্লিক করুন।
3. **Run `schema.sql`:** `supabase/schema.sql` ফাইলের সম্পূর্ণ SQL কোড পেস্ট করে **Run** করুন।
   - এটি `profiles`, `photos`, `activity_logs`, `admin_settings`, `admin_sessions`, `site_settings` টেবিল তৈরি করবে।
   - `pgcrypto` ব্যবহার করে প্রাথমিক অ্যাডমিন পাসওয়ার্ড (`Admin1122`) bcrypt হ্যাশ হিসেবে সংরক্ষণ করবে।
   - Row Level Security (RLS) এবং সুরক্ষিত `SECURITY DEFINER` RPC ফাংশন সেটআপ করবে।
4. **Create/Verify Storage:** **Storage** সেকশনে গিয়ে `photos` নামের public bucket তৈরি হয়েছে কিনা নিশ্চিত করুন (SQL স্ক্রিপ্ট এটি স্বয়ংক্রিয়ভাবে তৈরি করে)।
5. **Configure Auth (খুব গুরুত্বপূর্ণ):**
   - যেহেতু ওয়েবসাইটে ইউজারকে কোনো Email ফিল্ড দেখানো হয় না (শুধুমাত্র Username ও Password দিয়ে সাইন-আপ), তাই:
   - **Authentication → Providers → Email** অপশনে গিয়ে **"Confirm email"** টগলটি **OFF** করে সেভ করুন।
   - এতে নতুন বন্ধুরা রেজিস্ট্রেশন করার সাথে সাথেই সরাসরি লগইন অবস্থায় চলে যাবে।
6. **Verify RLS:** প্রতিটি টেবিলে **RLS Enabled** স্ট্যাটাস সবুজ আছে কিনা চেক করুন।
7. **(ঐচ্ছিক) Server-side IP Logging Edge Function:**
   - ব্রাউজার থেকে কখনোই ভুয়া IP তৈরি করা হয় না। প্রকৃত সার্ভার-সাইড IP লগ করতে চাইলে `supabase/functions/log-activity/index.ts` ডিপ্লয় করুন (`supabase functions deploy log-activity`) এবং `js/config.js`-এ `USE_EDGE_ACTIVITY_LOGGER = true` করে দিন।

---

## ৪. GitHub Pages ডিপ্লয়মেন্ট ধাপ

1. GitHub-এ একটি নতুন Repository তৈরি করুন (যেমন: `shob-pagla`)।
2. উপরের সব ফাইল (`index.html`, `style.css`, `js/`, `admin/`, `assets/`, `supabase/`, `README.md`) Repository-এর `main` ব্রাঞ্চে আপলোড/পুশ করুন।
3. Repository-র **Settings → Pages** সেকশনে যান।
4. **Source** হিসেবে **Deploy from a branch** নির্বাচন করুন।
5. Branch হিসেবে `main` এবং Folder হিসেবে `/ (root)` দিয়ে **Save** করুন।
6. ১–২ মিনিটের মধ্যে আপনার সাইট লাইভ হবে:
   - মূল ওয়েবসাইট: `https://<username>.github.io/<repo-name>/`
   - অ্যাডমিন প্যানেল: `https://<username>.github.io/<repo-name>/admin/`

---

## ৫. অ্যাডমিন অ্যাক্সেস ও নিরাপত্তা

- সাধারণ ইউজারদের নেভিগেশনে কোনো **Admin** বাটন দেখানো হয় না।
- **গোপন অ্যাক্সেস:** হোমপেজের বাম পাশের **"সব পাগলা" লোগোতে ৩ সেকেন্ডের মধ্যে পরপর ৫ বার ক্লিক করলে** সরাসরি `/admin/` পেজ খুলে যাবে (অথবা সরাসরি `/admin/` URL-এ যাওয়া যাবে)।
- প্রাথমিক অ্যাডমিন পাসওয়ার্ড: `Admin1122` (যা ডাটাবেজে bcrypt হ্যাশ হিসেবে সংরক্ষিত)।
- লগইন করার পর **⚙️ Settings** ট্যাব থেকে পাসওয়ার্ড পরিবর্তন করা যাবে।
