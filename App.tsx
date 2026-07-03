import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';

const supabase = createClient(
  'https://btkcubibosbtpxcronnd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0a2N1Ymlib3NidHB4Y3Jvbm5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMzI1ODAsImV4cCI6MjA5ODYwODU4MH0.IqR7dJbZJm83c_XHz923GQrBWdf5GCaNDYMPg6z8kj0'
);

type Screen = 'login' | 'menu' | 'battle' | 'inventory' | 'shop';

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [enemies, setEnemies] = useState([]);
  const [battle, setBattle] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setUser(data.session.user);
        loadGameData(data.session.user);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadGameData(session.user);
    });
    return () => listener?.subscription.unsubscribe();
  }, []);

  async function loadGameData(u) {
    let { data: p } = await supabase.from('profiles').select('*').eq('user_id', u.id).single();
    if (!p) {
      await supabase.from('profiles').insert({ user_id: u.id });
      const { data: p2 } = await supabase.from('profiles').select('*').eq('user_id', u.id).single();
      p = p2;
    }
    setProfile(p);
    const { data: i } = await supabase.from('items').select('*');
    setItems(i);
    const { data: inv } = await supabase.from('player_inventory').select('*').eq('user_id', u.id);
    setInventory(inv || []);
    const { data: e } = await supabase.from('enemies').select('*').order('min_level');
    setEnemies(e);
    setScreen('menu');
  }

  async function signUp() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) Alert.alert('Error', error.message);
    else Alert.alert('Welcome!', 'You can now sign in.');
  }

  async function signIn() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Error', error.message);
  }

  function getTotalAtk() {
    let bonus = 0;
    inventory.filter(i => i.equipped).forEach(inv => {
      const item = items.find(x => x.id === inv.item_id);
      if (item) bonus += item.atk_bonus;
    });
    return (profile?.atk || 10) + bonus;
  }

  function getTotalDef() {
    let bonus = 0;
    inventory.filter(i => i.equipped).forEach(inv => {
      const item = items.find(x => x.id === inv.item_id);
      if (item) bonus += item.def_bonus;
    });
    return (profile?.def || 5) + bonus;
  }

  function getEquippedWeapon() {
    const eq = inventory.find(i => {
      const item = items.find(x => x.id === i.item_id);
      return item?.type === 'weapon' && i.equipped;
    });
    return eq ? items.find(x => x.id === eq.item_id) : null;
  }

  function getEquippedArmor() {
    const eq = inventory.find(i => {
      const item = items.find(x => x.id === i.item_id);
      return item?.type === 'armor' && i.equipped;
    });
    return eq ? items.find(x => x.id === eq.item_id) : null;
  }

  async function startBattle() {
    const available = enemies.filter(e => e.min_level <= (profile?.level || 1));
    const enemy = available[Math.floor(Math.random() * available.length)];
    const p = { ...profile };
    const e = { ...enemy };
    setBattle({ player: p, enemy: e, log: [`A wild ${e.name} appears!`], turn: 'player' });
  }

  async function attack() {
    const b = { ...battle };
    const dmg = Math.max(1, getTotalAtk() - b.enemy.def + Math.floor(Math.random() * 5));
    b.enemy.hp -= dmg;
    b.log.push(`You hit ${b.enemy.name} for ${dmg} damage!`);
    if (b.enemy.hp <= 0) {
      const xpGain = b.enemy.xp_reward + Math.floor(Math.random() * 10);
      const goldGain = b.enemy.gold_reward + Math.floor(Math.random() * 5);
      b.log.push(`You defeated ${b.enemy.name}! +${xpGain} XP, +${goldGain} Gold`);
      setBattle(b);
      const newProfile = { ...profile, xp: profile.xp + xpGain, gold: profile.gold + goldGain };
      while (newProfile.xp >= newProfile.xp_next) {
        newProfile.xp -= newProfile.xp_next;
        newProfile.level += 1;
        newProfile.xp_next = Math.floor(newProfile.xp_next * 1.5);
        newProfile.max_hp += 20;
        newProfile.hp = newProfile.max_hp;
        newProfile.atk += 3;
        newProfile.def += 2;
        b.log.push(`LEVEL UP! You are now level ${newProfile.level}!`);
      }
      setProfile(newProfile);
      await supabase.from('profiles').update({
        xp: newProfile.xp, level: newProfile.level, gold: newProfile.gold,
        max_hp: newProfile.max_hp, hp: newProfile.hp, atk: newProfile.atk, def: newProfile.def,
        xp_next: newProfile.xp_next
      }).eq('user_id', user.id);
      setBattle({ ...b, done: true });
      return;
    }
    b.turn = 'enemy';
    setBattle({ ...b });
    setTimeout(() => enemyAttack(b), 800);
  }

  function usePotion() {
    if ((profile?.potions || 0) <= 0) { Alert.alert('No potions!'); return; }
    const heal = 50;
    const newHp = Math.min(battle.player.hp + heal, battle.player.max_hp);
    const b = { ...battle };
    b.player.hp = newHp;
    b.log.push(`You used a potion! +${heal} HP`);
    const newProfile = { ...profile, potions: profile.potions - 1 };
    setProfile(newProfile);
    supabase.from('profiles').update({ potions: newProfile.potions }).eq('user_id', user.id);
    b.turn = 'enemy';
    setBattle({ ...b });
    setTimeout(() => enemyAttack(b), 800);
  }

  function enemyAttack(b) {
    const dmg = Math.max(1, b.enemy.atk - getTotalDef() + Math.floor(Math.random() * 3));
    b.player.hp -= dmg;
    b.log.push(`${b.enemy.name} hits you for ${dmg} damage!`);
    if (b.player.hp <= 0) {
      b.log.push('You were defeated...');
      setProfile({ ...profile, hp: profile.max_hp });
      supabase.from('profiles').update({ hp: profile.max_hp }).eq('user_id', user.id);
      setBattle({ ...b, done: true });
      return;
    }
    b.turn = 'player';
    setBattle({ ...b });
  }

  function flee() {
    setBattle(null);
  }

  async function buyItem(item) {
    if (profile.gold < item.value) { Alert.alert('Not enough gold!'); return; }
    const newGold = profile.gold - item.value;
    await supabase.from('profiles').update({ gold: newGold }).eq('user_id', user.id);
    await supabase.from('player_inventory').insert({ user_id: user.id, item_id: item.id });
    setProfile({ ...profile, gold: newGold });
    const { data: inv } = await supabase.from('player_inventory').select('*').eq('user_id', user.id);
    setInventory(inv || []);
    Alert.alert('Purchased!', `You bought ${item.name}`);
  }

  async function equipItem(invId) {
    const invItem = inventory.find(x => x.id === invId);
    const item = items.find(x => x.id === invItem?.item_id);
    if (!item || item.type === 'consumable') return;
    const sameType = inventory.filter(x => {
      const it = items.find(i => i.id === x.item_id);
      return it?.type === item.type && x.equipped;
    });
    for (const e of sameType) {
      await supabase.from('player_inventory').update({ equipped: false }).eq('id', e.id);
    }
    await supabase.from('player_inventory').update({ equipped: true }).eq('id', invId);
    const { data: inv } = await supabase.from('player_inventory').select('*').eq('user_id', user.id);
    setInventory(inv || []);
  }

  async function useConsumable(invId) {
    const invItem = inventory.find(x => x.id === invId);
    const item = items.find(x => x.id === invItem?.item_id);
    if (!item || item.type !== 'consumable') return;
    const heal = item.hp_bonus;
    const newHp = Math.min(profile.hp + heal, profile.max_hp);
    setProfile({ ...profile, hp: newHp });
    await supabase.from('profiles').update({ hp: newHp }).eq('user_id', user.id);
    await supabase.from('player_inventory').delete().eq('id', invId);
    const { data: inv } = await supabase.from('player_inventory').select('*').eq('user_id', user.id);
    setInventory(inv || []);
    Alert.alert('Used!', `Restored ${heal} HP`);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setScreen('login');
  }

  if (!user || screen === 'login') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>QuestCraft</Text>
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#999" value={email}
          onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#999" value={password}
          onChangeText={setPassword} secureTextEntry />
        {loading ? <ActivityIndicator size="large" color="#ffd700" /> : (
          <>
            <TouchableOpacity style={styles.button} onPress={signIn}><Text style={styles.buttonText}>Sign In</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.button2]} onPress={signUp}><Text style={styles.buttonText}>Sign Up</Text></TouchableOpacity>
          </>
        )}
        <StatusBar style="light" />
      </View>
    );
  }

  if (battle) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>⚔️ Battle</Text>
        <View style={styles.statsRow}>
          <Text style={styles.statText}>You: {battle.player.hp}/{battle.player.max_hp} HP</Text>
          <Text style={styles.statText}>{battle.enemy.name}: {Math.max(0, battle.enemy.hp)} HP</Text>
        </View>
        <View style={styles.hpBar}>
          <View style={[styles.hpFill, { width: `${(battle.player.hp / battle.player.max_hp) * 100}%`, backgroundColor: '#4CAF50' }]} />
        </View>
        <View style={styles.hpBar}>
          <View style={[styles.hpFill, { width: `${(battle.enemy.hp / (battle.enemy.xp_reward + 50)) * 100}%`, backgroundColor: '#f44336' }]} />
        </View>
        <ScrollView style={styles.logBox}>
          {battle.log.map((l, i) => (
            <Text key={i} style={styles.logText}>{l}</Text>
          ))}
        </ScrollView>
        {!battle.done ? (
          <View style={styles.battleBtns}>
            {battle.turn === 'player' ? (
              <>
                <TouchableOpacity style={styles.battleBtn} onPress={attack}><Text style={styles.buttonText}>⚔️ Attack</Text></TouchableOpacity>
                {(profile?.potions || 0) > 0 && (
                  <TouchableOpacity style={[styles.battleBtn, { backgroundColor: '#4CAF50' }]} onPress={usePotion}><Text style={styles.buttonText}>🧪 Potion ({profile.potions})</Text></TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.battleBtn, { backgroundColor: '#666' }]} onPress={flee}><Text style={styles.buttonText}>🏃 Flee</Text></TouchableOpacity>
              </>
            ) : (
              <Text style={{ color: '#ffd700', fontSize: 18 }}>Enemy's turn...</Text>
            )}
          </View>
        ) : (
          <TouchableOpacity style={styles.button} onPress={() => setBattle(null)}>
            <Text style={styles.buttonText}>Return to Town</Text>
          </TouchableOpacity>
        )}
        <StatusBar style="light" />
      </View>
    );
  }

  if (screen === 'battle') return null;
  if (screen === 'inventory') return (
    <View style={styles.container}>
      <Text style={styles.title}>🎒 Inventory</Text>
      <Text style={styles.statText}>Gold: {profile.gold} | HP: {profile.hp}/{profile.max_hp}</Text>
      <Text style={styles.statText}>Weapon: {getEquippedWeapon()?.name || 'None'} | Armor: {getEquippedArmor()?.name || 'None'}</Text>
      <ScrollView style={{ flex: 1, width: '100%' }}>
        {inventory.length === 0 && <Text style={{ color: '#888', textAlign: 'center', marginTop: 20 }}>Empty inventory</Text>}
        {inventory.map(inv => {
          const item = items.find(x => x.id === inv.item_id);
          if (!item) return null;
          return (
            <View key={inv.id} style={styles.itemCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name} {inv.equipped ? '✅' : ''}</Text>
                <Text style={styles.itemDesc}>{item.description}</Text>
              </View>
              {item.type !== 'consumable' ? (
                <TouchableOpacity style={styles.smallBtn} onPress={() => equipItem(inv.id)}>
                  <Text style={styles.smallBtnText}>{inv.equipped ? 'Unequip' : 'Equip'}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#4CAF50' }]} onPress={() => useConsumable(inv.id)}>
                  <Text style={styles.smallBtnText}>Use</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
      <TouchableOpacity style={styles.button2} onPress={() => setScreen('menu')}><Text style={styles.buttonText}>Back</Text></TouchableOpacity>
      <StatusBar style="light" />
    </View>
  );

  if (screen === 'shop') return (
    <View style={styles.container}>
      <Text style={styles.title}>🏪 Shop</Text>
      <Text style={styles.statText}>Gold: {profile.gold}</Text>
      <ScrollView style={{ flex: 1, width: '100%' }}>
        {items.filter(x => x.type !== 'consumable').concat(items.filter(x => x.type === 'consumable')).map(item => {
          const owned = inventory.filter(i => i.item_id === item.id).length;
          return (
            <View key={item.id} style={styles.itemCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemDesc}>{item.description} {owned > 0 ? `(x${owned})` : ''}</Text>
              </View>
              <TouchableOpacity style={styles.smallBtn} onPress={() => buyItem(item)}>
                <Text style={styles.smallBtnText}>{item.value}💰</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
      <TouchableOpacity style={styles.button2} onPress={() => setScreen('menu')}><Text style={styles.buttonText}>Back</Text></TouchableOpacity>
      <StatusBar style="light" />
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>QuestCraft</Text>
      <View style={styles.heroCard}>
        <Text style={styles.heroName}>{profile.name}</Text>
        <Text style={styles.heroLevel}>Lv.{profile.level} Adventurer</Text>
        <View style={styles.divider} />
        <Text style={styles.stat}>❤️ HP: {profile.hp}/{profile.max_hp}</Text>
        <Text style={styles.stat}>⚔️ ATK: {getTotalAtk()} (base {profile.atk})</Text>
        <Text style={styles.stat}>🛡️ DEF: {getTotalDef()} (base {profile.def})</Text>
        <Text style={styles.stat}>⭐ XP: {profile.xp}/{profile.xp_next}</Text>
        <Text style={styles.stat}>💰 Gold: {profile.gold}</Text>
        <Text style={styles.stat}>🧪 Potions: {profile.potions}</Text>
        <View style={styles.xpBar}>
          <View style={[styles.xpFill, { width: `${(profile.xp / profile.xp_next) * 100}%` }]} />
        </View>
      </View>
      <View style={styles.menuBtns}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => { startBattle(); setScreen('battle'); }}>
          <Text style={styles.menuBtnText}>⚔️ Fight</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setScreen('inventory')}>
          <Text style={styles.menuBtnText}>🎒 Inventory</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setScreen('shop')}>
          <Text style={styles.menuBtnText}>🏪 Shop</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuBtn, { backgroundColor: '#c0392b' }]} onPress={signOut}>
          <Text style={styles.menuBtnText}>🚪 Logout</Text>
        </TouchableOpacity>
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e', padding: 15, alignItems: 'center' },
  title: { fontSize: 32, color: '#ffd700', textAlign: 'center', marginVertical: 15, fontWeight: 'bold' },
  input: { backgroundColor: '#16213e', color: '#fff', padding: 15, borderRadius: 10, marginBottom: 12, fontSize: 16, width: '100%' },
  button: { backgroundColor: '#ffd700', padding: 14, borderRadius: 10, alignItems: 'center', width: '100%', marginBottom: 8 },
  button2: { backgroundColor: '#0f3460', padding: 14, borderRadius: 10, alignItems: 'center', width: '100%', marginBottom: 8 },
  buttonText: { color: '#000', fontSize: 16, fontWeight: '700' },
  heroCard: { backgroundColor: '#16213e', borderRadius: 15, padding: 20, width: '100%', marginBottom: 15 },
  heroName: { fontSize: 24, color: '#ffd700', fontWeight: 'bold', textAlign: 'center' },
  heroLevel: { fontSize: 16, color: '#aaa', textAlign: 'center', marginBottom: 10 },
  divider: { height: 1, backgroundColor: '#333', marginVertical: 10 },
  stat: { fontSize: 15, color: '#ddd', marginBottom: 4 },
  statText: { fontSize: 14, color: '#ddd', marginBottom: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  xpBar: { height: 8, backgroundColor: '#333', borderRadius: 4, marginTop: 8, overflow: 'hidden', width: '100%' },
  xpFill: { height: '100%', backgroundColor: '#ffd700', borderRadius: 4 },
  hpBar: { height: 10, backgroundColor: '#333', borderRadius: 5, marginVertical: 3, overflow: 'hidden', width: '100%' },
  hpFill: { height: '100%', borderRadius: 5 },
  menuBtns: { width: '100%', gap: 10 },
  menuBtn: { backgroundColor: '#0f3460', padding: 16, borderRadius: 12, alignItems: 'center' },
  menuBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  battleBtns: { width: '100%', gap: 8, marginTop: 10 },
  battleBtn: { backgroundColor: '#e74c3c', padding: 14, borderRadius: 10, alignItems: 'center' },
  logBox: { flex: 1, width: '100%', backgroundColor: '#0d0d1a', borderRadius: 10, padding: 10, marginVertical: 8 },
  logText: { color: '#aaa', fontSize: 13, marginBottom: 3 },
  itemCard: { flexDirection: 'row', backgroundColor: '#16213e', borderRadius: 10, padding: 12, marginBottom: 8, alignItems: 'center' },
  itemName: { color: '#ffd700', fontSize: 15, fontWeight: '600' },
  itemDesc: { color: '#aaa', fontSize: 12 },
  smallBtn: { backgroundColor: '#e74c3c', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginLeft: 8 },
  smallBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
