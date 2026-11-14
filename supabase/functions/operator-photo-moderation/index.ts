import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token || token === authorization) return json({ error: "Sign in as an operator to continue." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return json({ error: "Photo moderation is not configured." }, 500);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Your session is invalid. Please sign in again." }, 401);
  const { data: operator, error: operatorError } = await authClient.rpc("is_admin");
  if (operatorError || operator !== true) return json({ error: "Operator access required." }, 403);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json();
    const action = body?.action;

    if (action === "list") {
      const { data: folders, error: folderError } = await admin.storage.from("profile-photos").list("", {
        limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" },
      });
      if (folderError) throw folderError;

      const userFolders = (folders || []).filter((item: any) =>
        item.id === null && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.name)
      );
      const results: any[] = [];
      for (const folder of userFolders) {
        const userId = folder.name;
        const { data: files, error: fileError } = await admin.storage.from("profile-photos").list(userId, {
          limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" },
        });
        if (fileError) throw fileError;
        for (const file of files || []) {
          if (!file.name || file.id === null) continue;
          const path = `${userId}/${file.name}`;
          const { data: signed, error: signedError } = await admin.storage.from("profile-photos").createSignedUrl(path, 300);
          if (signedError || !signed?.signedUrl) continue;
          const lower = file.name.toLowerCase();
          const category = lower === "avatar.webp" ? "Profile picture"
            : lower === "cover.webp" ? "Cover photo"
            : lower.startsWith("posts/") ? "Post photo" : "Gallery photo";
          results.push({
            path,
            user_id: userId,
            file_name: file.name,
            category,
            size: Number(file.metadata?.size || 0),
            created_at: file.created_at || file.updated_at || null,
            signed_url: signed.signedUrl,
          });
        }
      }

      const userIds = [...new Set(results.map(item => item.user_id))];
      const profilesById: Record<string, any> = {};
      for (let i = 0; i < userIds.length; i += 100) {
        const batch = userIds.slice(i, i + 100);
        const { data: profiles, error: profileError } = await admin.from("chat_profiles")
          .select("user_id,display_name,avatar_url").in("user_id", batch);
        if (profileError) throw profileError;
        for (const profile of profiles || []) profilesById[profile.user_id] = profile;
      }
      const photos = results.map(item => ({
        ...item,
        display_name: profilesById[item.user_id]?.display_name || "Unknown user",
      })).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      return json({ photos, total: photos.length });
    }

    if (action === "delete") {
      const path = typeof body?.path === "string" ? body.path : "";
      const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
      const parts = path.split("/");
      const userId = parts[0] || "";
      if (parts.length !== 2 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
        || !parts[1] || parts[1].includes("..") || path.includes("\\") || path.length > 500) {
        return json({ error: "Invalid photo path." }, 400);
      }
      const allowedReasons = ["Nudity or sexual content", "Explicit or adult content", "Violence or disturbing content", "Harassment or hateful content", "Other policy violation"];
      if (!allowedReasons.includes(reason)) return json({ error: "Choose a valid removal reason." }, 400);

      const { error: deleteError } = await admin.storage.from("profile-photos").remove([path]);
      if (deleteError) throw deleteError;

      const { data: profile } = await admin.from("chat_profiles").select("avatar_url,cover_url").eq("user_id", userId).maybeSingle();
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      const updates: Record<string, any> = {};
      if (profile?.avatar_url?.includes(encodedPath) || profile?.avatar_url?.includes(path)) updates.avatar_url = null;
      if (profile?.cover_url?.includes(encodedPath) || profile?.cover_url?.includes(path)) updates.cover_url = null;
      if (Object.keys(updates).length) {
        const { error: updateError } = await admin.from("chat_profiles").update(updates).eq("user_id", userId);
        if (updateError) throw updateError;
      }

      const { error: auditError } = await admin.from("action_logs").insert({
        admin_id: authData.user.id,
        action: "photo_removed",
        target_id: userId,
        details: `${path} · ${reason}`,
      });
      if (auditError) throw auditError;
      return json({ success: true, path });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("operator-photo-moderation error", error);
    return json({ error: error instanceof Error ? error.message : "Photo moderation request failed." }, 500);
  }
});
