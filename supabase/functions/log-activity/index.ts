// Optional Supabase Edge Function for legitimate server-side IP & metadata logging
// Deploy via: supabase functions deploy log-activity

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server environment missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));

    const authHeader = req.headers.get('Authorization') ?? '';
    let userId: string | null = null;
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data: userData } = await adminClient.auth.getUser(token);
      userId = userData?.user?.id ?? null;
    }

    // Legitimate server-side IP extraction from proxy headers
    const forwardedFor = req.headers.get('x-forwarded-for') ?? '';
    const cfIp = req.headers.get('cf-connecting-ip') ?? '';
    const ipAddress = (cfIp || forwardedFor.split(',')[0] || '').trim() || null;

    const event = String(body.event ?? 'page_view').slice(0, 64);
    const userAgent = (req.headers.get('user-agent') ?? String(body.user_agent ?? '')).slice(0, 500);
    const referrer = String(body.referrer ?? req.headers.get('referer') ?? '').slice(0, 500);

    const { error } = await adminClient.from('activity_logs').insert({
      user_id: userId,
      event,
      user_agent: userAgent,
      referrer,
      ip_address: ipAddress,
      metadata: typeof body.metadata === 'object' && body.metadata !== null ? body.metadata : {},
    });

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
