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
