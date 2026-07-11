CREATE TABLE profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Adventurer',
  level INT NOT NULL DEFAULT 1,
  xp INT NOT NULL DEFAULT 0,
  xp_next INT NOT NULL DEFAULT 100,
  hp INT NOT NULL DEFAULT 100,
  max_hp INT NOT NULL DEFAULT 100,
  atk INT NOT NULL DEFAULT 10,
  def INT NOT NULL DEFAULT 5,
  gold INT NOT NULL DEFAULT 50,
  potions INT NOT NULL DEFAULT 3
);

CREATE TABLE items (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  atk_bonus INT DEFAULT 0,
  def_bonus INT DEFAULT 0,
  hp_bonus INT DEFAULT 0,
  value INT NOT NULL DEFAULT 10
);

CREATE TABLE player_inventory (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  equipped BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO items (name, type, description, atk_bonus, def_bonus, hp_bonus, value) VALUES
  ('Wooden Sword', 'weapon', 'A basic wooden sword', 5, 0, 0, 30),
  ('Iron Sword', 'weapon', 'A sturdy iron sword', 12, 0, 0, 100),
  ('Steel Blade', 'weapon', 'A sharp steel blade', 20, 0, 0, 250),
  ('Leather Armor', 'armor', 'Light leather protection', 0, 5, 0, 40),
  ('Chain Mail', 'armor', 'Good chain mail armor', 0, 12, 0, 150),
  ('Plate Armor', 'armor', 'Heavy plate armor', 0, 22, 0, 350),
  ('Health Potion', 'consumable', 'Restores 50 HP', 0, 0, 50, 20),
  ('Great Potion', 'consumable', 'Restores 150 HP', 0, 0, 150, 60);

CREATE TABLE enemies (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  hp INT NOT NULL,
  atk INT NOT NULL,
  def INT NOT NULL,
  xp_reward INT NOT NULL,
  gold_reward INT NOT NULL,
  min_level INT NOT NULL DEFAULT 1
);

INSERT INTO enemies (name, hp, atk, def, xp_reward, gold_reward, min_level) VALUES
  ('Slime', 20, 3, 1, 15, 5, 1),
  ('Goblin', 35, 6, 3, 30, 12, 2),
  ('Wolf', 50, 9, 4, 45, 18, 3),
  ('Skeleton', 70, 12, 6, 65, 25, 4),
  ('Orc', 100, 16, 9, 90, 35, 6),
  ('Dark Knight', 150, 22, 14, 150, 60, 8),
  ('Dragon', 300, 35, 25, 500, 200, 12);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE enemies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile select" ON profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own profile update" ON profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own profile insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own inventory select" ON player_inventory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own inventory insert" ON player_inventory FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own inventory update" ON player_inventory FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "items all" ON items FOR SELECT TO authenticated USING (true);
CREATE POLICY "enemies all" ON enemies FOR SELECT TO authenticated USING (true);

-- Chat profiles for LiveMe video chat app
CREATE TABLE chat_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Anonymous',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  share_name BOOLEAN NOT NULL DEFAULT false,
  share_bio BOOLEAN NOT NULL DEFAULT false,
  date_of_birth DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles select" ON chat_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own chat profile insert" ON chat_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own chat profile update" ON chat_profiles FOR UPDATE USING (auth.uid() = user_id);

ALTER TABLE chat_profiles ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE chat_profiles ADD COLUMN IF NOT EXISTS flag_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE chat_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Server-side age check: SECURITY DEFINER so signaling server (no JWT) can check bans
CREATE OR REPLACE FUNCTION is_user_banned(check_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM banned_users WHERE user_id = check_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE POLICY "admin update chat profiles" ON chat_profiles FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);

-- Banned users (checked on every find)
CREATE TABLE banned_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  banned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE banned_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins banned_users" ON banned_users FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);

-- Action logs for admin accountability
CREATE TABLE action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_id UUID,
  details TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_action_logs_admin ON action_logs(admin_id, created_at DESC);

ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins action_logs" ON action_logs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);
CREATE POLICY "admins action_logs insert" ON action_logs FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);

-- Reported messages from live calls
CREATE TABLE reported_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  call_session_id TEXT NOT NULL DEFAULT '',
  dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reported_messages_undismissed ON reported_messages(dismissed, created_at DESC);

ALTER TABLE reported_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert own reports" ON reported_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "admins view reports" ON reported_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);
CREATE POLICY "admins update reports" ON reported_messages FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);

-- Persistent inbox messages (auto-cleared after 1 hour)
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_chat_messages_participants ON chat_messages(sender_id, receiver_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX idx_chat_messages_unread ON chat_messages(receiver_id, read) WHERE read = false;

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "msg select" ON chat_messages FOR SELECT TO authenticated USING (
  (auth.uid() = sender_id OR auth.uid() = receiver_id)
  AND created_at > now() - interval '1 hour'
);

CREATE POLICY "msg insert" ON chat_messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id
);

CREATE POLICY "msg update read" ON chat_messages FOR UPDATE TO authenticated USING (
  auth.uid() = receiver_id
) WITH CHECK (
  auth.uid() = receiver_id AND read = true
);

-- Recent live history (per-account, across devices)
CREATE TABLE recent_live (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL,
  partner_name TEXT NOT NULL DEFAULT '',
  partner_bio TEXT NOT NULL DEFAULT '',
  partner_avatar TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recent_live_user ON recent_live(user_id, created_at DESC);

ALTER TABLE recent_live ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recent_live select" ON recent_live FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "recent_live insert" ON recent_live FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "recent_live delete" ON recent_live FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Download all messages for the current user (bypasses 1-hour RLS)
CREATE TABLE admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

INSERT INTO admins VALUES ('YOUR-SUPABASE-USER-ID-HERE');

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION get_my_all_messages()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()) THEN
    SELECT json_agg(json_build_object(
      'id', m.id,
      'sender_id', m.sender_id,
      'receiver_id', m.receiver_id,
      'content', m.content,
      'created_at', m.created_at,
      'read', m.read,
      'sender_name', cp.display_name
    ) ORDER BY m.created_at DESC)
    INTO result
    FROM chat_messages m
    LEFT JOIN chat_profiles cp ON cp.user_id = m.sender_id;
    RETURN COALESCE(result, '[]'::json);
  ELSE
    SELECT json_agg(json_build_object(
      'id', m.id,
      'sender_id', m.sender_id,
      'receiver_id', m.receiver_id,
      'content', m.content,
      'created_at', m.created_at,
      'read', m.read
    ) ORDER BY m.created_at DESC)
    INTO result
    FROM chat_messages m
    WHERE m.sender_id = auth.uid() OR m.receiver_id = auth.uid();
    RETURN COALESCE(result, '[]'::json);
  END IF;
END;
$$;

-- Admin: get dashboard stats
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()) THEN
    RETURN '{"error":"unauthorized"}'::json;
  END IF;
  SELECT json_build_object(
    'total_users', (SELECT count(*) FROM chat_profiles),
    'total_messages', (SELECT count(*) FROM chat_messages),
    'messages_today', (SELECT count(*) FROM chat_messages WHERE created_at > now() - interval '24 hours'),
    'flagged_users', (SELECT count(*) FROM chat_profiles WHERE flagged = true),
    'banned_users', (SELECT count(*) FROM banned_users),
    'pending_reports', (SELECT count(*) FROM reported_messages WHERE dismissed = false)
  ) INTO result;
  RETURN result;
END;
$$;

-- Admin: search users by name or id
CREATE OR REPLACE FUNCTION search_users(search_term TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()) THEN
    RETURN '{"error":"unauthorized"}'::json;
  END IF;
  SELECT json_agg(json_build_object(
    'user_id', cp.user_id,
    'display_name', cp.display_name,
    'bio', cp.bio,
    'avatar_url', cp.avatar_url,
    'flagged', cp.flagged,
    'flag_reason', cp.flag_reason,
    'updated_at', cp.updated_at
  ) ORDER BY cp.updated_at DESC)
  INTO result
  FROM chat_profiles cp
  WHERE cp.display_name ILIKE '%' || search_term || '%' OR cp.user_id::text ILIKE '%' || search_term || '%';
  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Admin: get messages for a specific user
CREATE OR REPLACE FUNCTION get_user_messages(target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()) THEN
    RETURN '{"error":"unauthorized"}'::json;
  END IF;
  SELECT json_agg(json_build_object(
    'id', m.id,
    'sender_id', m.sender_id,
    'receiver_id', m.receiver_id,
    'content', m.content,
    'created_at', m.created_at,
    'read', m.read,
    'sender_name', (SELECT display_name FROM chat_profiles WHERE user_id = m.sender_id),
    'receiver_name', (SELECT display_name FROM chat_profiles WHERE user_id = m.receiver_id)
  ) ORDER BY m.created_at DESC)
  INTO result
  FROM chat_messages m
  WHERE m.sender_id = target_user_id OR m.receiver_id = target_user_id;
  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Fix linter warnings: restrict SECURITY DEFINER functions to appropriate roles
REVOKE EXECUTE ON FUNCTION is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION get_my_all_messages() FROM anon;
REVOKE EXECUTE ON FUNCTION get_admin_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION search_users(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION get_user_messages(UUID) FROM anon;
-- is_user_banned needs anon access for the signaling server (no user JWT)
GRANT EXECUTE ON FUNCTION is_user_banned(UUID) TO anon, authenticated;

-- RPC for signaling server to check date_of_birth (bypasses RLS)
CREATE OR REPLACE FUNCTION get_dob(target_id UUID)
RETURNS DATE
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (SELECT date_of_birth FROM chat_profiles WHERE user_id = target_id);
END;
$$;

GRANT EXECUTE ON FUNCTION get_dob(UUID) TO anon;

-- RPC for signaling server (anon) to submit reports without JWT
CREATE OR REPLACE FUNCTION submit_report(p_reporter_id UUID, p_reported_id UUID, p_message_text TEXT, p_session_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO reported_messages (reporter_id, reported_user_id, message_text, call_session_id)
  VALUES (p_reporter_id, p_reported_id, p_message_text, p_session_id);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_report(UUID, UUID, TEXT, TEXT) TO anon;
