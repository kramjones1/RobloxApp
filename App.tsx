import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Animated, Image } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';

const supabase = createClient(
  'https://btkcubibosbtpxcronnd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0a2N1Ymlib3NidHB4Y3Jvbm5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMzI1ODAsImV4cCI6MjA5ODYwODU4MH0.IqR7dJbZJm83c_XHz923GQrBWdf5GCaNDYMPg6z8kj0'
);

const ENEMY_SPRITES = {
  Slime: ['🟢', '#4CAF50'],
  Goblin: ['👺', '#8B4513'],
  Wolf: ['🐺', '#795548'],
  Skeleton: ['💀', '#BDBDBD'],
  Orc: ['👹', '#2E7D32'],
  'Dark Knight': ['⚫', '#212121'],
  Dragon: ['🐉', '#D32F2F'],
};

type Screen = 'login' | 'menu' | 'battle' | 'inventory' | 'shop';

function DamageNumber({ value, color, id }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.Text style={{
      position: 'absolute', fontSize: 24, fontWeight: 'bold', color: color || '#fff',
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -80] }) }],
      opacity: anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
    }}>
      {value > 0 ? `-${value}` : value === 0 ? 'Miss!' : `+${Math.abs(value)}`}
    </Animated.Text>
  );
}

function EnemySprite({ name, hp, maxHp, shake }) {
  const data = ENEMY_SPRITES[name] || ['👾', '#9C27B0'];
  const animVal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (shake > 0) {
      Animated.sequence([
        Animated.timing(animVal, { toValue: 1, duration: 50, useNativeDriver: true }),
        Animated.timing(animVal, { toValue: -1, duration: 50, useNativeDriver: true }),
        Animated.timing(animVal, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    }
  }, [shake]);
  return (
    <Animated.View style={{ alignItems: 'center', transform: [{ translateX: animVal.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }) }] }}>
      <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: data[1], justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#ffd700' }}>
        <Text style={{ fontSize: 50 }}>{data[0]}</Text>
      </View>
      <Text style={{ color: '#ffd700', fontSize: 16, fontWeight: 'bold', marginTop: 8 }}>{name}</Text>
      <View style={{ width: 120, height: 8, backgroundColor: '#333', borderRadius: 4, marginTop: 4, overflow: 'hidden' }}>
        <View style={{ width: `${(hp / maxHp) * 100}%`, height: '100%', backgroundColor: hp > 30 ? '#4CAF50' : hp > 10 ? '#FF9800' : '#f44336', borderRadius: 4 }} />
      </View>
    </Animated.View>
  );
}

function PlayerSprite({ atkAnim }) {
  const animVal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (atkAnim > 0) {
      Animated.sequence([
        Animated.timing(animVal, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.timing(animVal, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [atkAnim]);
  return (
    <Animated.View style={{ alignItems: 'center', transform: [{ translateX: animVal.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) }] }}>
      <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#2196F3', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff' }}>
        <Text style={{ fontSize: 40 }}>⚔️</Text>
      </View>
      <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: 6 }}>You</Text>
    </Animated.View>
  );
}

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
  const [shake, setShake] = useState(0);
  const [atkAnim, setAtkAnim] = useState(0);
  const [dmgNumbers, setDmgNumbers] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) { setUser(data.session.user); loadGameData(data.session.user); }
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

  async function startBattle() {
    const available = enemies.filter(e => e.min_level <= (profile?.level || 1));
    const enemy = available[Math.floor(Math.random() * available.length)];
    const maxHp = enemy.hp + Math.floor(Math.random() * 10);
    setBattle({
      playerHp: profile.hp,
      playerMaxHp: profile.max_hp,
      enemy: { ...enemy, hp: maxHp, maxHp: maxHp },
      log: [{ text: `A wild ${enemy.name} appeared!`, type: 'info' }],
      turn: 'player',
      done: false
    });
    setScreen('battle');
    setDmgNumbers([]);
  }

  async function attack() {
    const b = { ...battle };
    const dmg = Math.max(1, getTotalAtk() - b.enemy.def + Math.floor(Math.random() * 5));
    b.enemy.hp -= dmg;
    setAtkAnim(n => n + 1);
    setDmgNumbers(prev => [...prev, { id: Date.now(), value: dmg, color: '#ffd700' }]);
    b.log.push({ text: `You hit ${b.enemy.name} for ${dmg} damage!`, type: 'player' });
    if (b.enemy.hp <= 0) {
      const xpGain = b.enemy.xp_reward + Math.floor(Math.random() * 10);
      const goldGain = b.enemy.gold_reward + Math.floor(Math.random() * 5);
      b.log.push({ text: `Victory! +${xpGain} XP, +${goldGain} Gold`, type: 'win' });
      setBattle(b);
      const newProfile = { ...profile, xp: profile.xp + xpGain, gold: profile.gold + goldGain };
      while (newProfile.xp >= newProfile.xp_next) {
        newProfile.xp -= newProfile.xp_next; newProfile.level += 1;
        newProfile.xp_next = Math.floor(newProfile.xp_next * 1.5);
        newProfile.max_hp += 20; newProfile.hp = newProfile.max_hp;
        newProfile.atk += 3; newProfile.def += 2;
        b.log.push({ text: `🎉 LEVEL UP! You are now level ${newProfile.level}!`, type: 'levelup' });
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
    setTimeout(() => enemyAttack(b), 600);
  }

  function usePotion() {
    if ((profile?.potions || 0) <= 0) { Alert.alert('No potions!'); return; }
    const heal = 50;
    const newHp = Math.min(battle.playerHp + heal, battle.playerMaxHp);
    const b = { ...battle };
    b.playerHp = newHp;
    setDmgNumbers(prev => [...prev, { id: Date.now(), value: -heal, color: '#4CAF50' }]);
    b.log.push({ text: `You used a potion! +${heal} HP`, type: 'heal' });
    const newProfile = { ...profile, potions: profile.potions - 1 };
    setProfile(newProfile);
    supabase.from('profiles').update({ potions: newProfile.potions }).eq('user_id', user.id);
    b.turn = 'enemy';
    setBattle({ ...b });
    setTimeout(() => enemyAttack(b), 600);
  }

  function enemyAttack(b) {
    const dmg = Math.max(1, b.enemy.atk - getTotalDef() + Math.floor(Math.random() * 3));
    b.playerHp -= dmg;
    setShake(n => n + 1);
    setDmgNumbers(prev => [...prev, { id: Date.now(), value: dmg, color: '#f44336' }]);
    b.log.push({ text: `${b.enemy.name} hits you for ${dmg} damage!`, type: 'enemy' });
    if (b.playerHp <= 0) {
      b.log.push({ text: '💀 You were defeated...', type: 'lose' });
      setProfile({ ...profile, hp: profile.max_hp });
      supabase.from('profiles').update({ hp: profile.max_hp }).eq('user_id', user.id);
      setBattle({ ...b, done: true });
      return;
    }
    b.turn = 'player';
    setBattle({ ...b });
  }

  function flee() { setScreen('menu'); setBattle(null); }

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
    const sameType = inventory.filter(x => { const it = items.find(i => i.id === x.item_id); return it?.type === item.type && x.equipped; });
    for (const e of sameType) await supabase.from('player_inventory').update({ equipped: false }).eq('id', e.id);
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
    await supabase.auth.signOut(); setUser(null); setProfile(null); setScreen('login');
  }

  if (!user || screen === 'login') {
    return (
      <View style={s.container}>
        <View style={s.titleBlock}>
          <Text style={s.logo}>⚔️</Text>
          <Text style={s.title}>QuestCraft</Text>
          <Text style={s.subtitle}>A 2D RPG Adventure</Text>
        </View>
        <TextInput style={s.input} placeholder="Email" placeholderTextColor="#666" value={email}
          onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TextInput style={s.input} placeholder="Password" placeholderTextColor="#666" value={password}
          onChangeText={setPassword} secureTextEntry />
        {loading ? <ActivityIndicator size="large" color="#ffd700" /> : (
          <View style={{ width: '100%', gap: 10 }}>
            <TouchableOpacity style={s.btn} onPress={signIn}><Text style={s.btnText}>⚔️ Sign In</Text></TouchableOpacity>
            <TouchableOpacity style={[s.btn, { backgroundColor: '#0f3460' }]} onPress={signUp}><Text style={[s.btnText, { color: '#ffd700' }]}>🌟 Sign Up</Text></TouchableOpacity>
          </View>
        )}
        <StatusBar style="light" />
      </View>
    );
  }

  if (screen === 'battle' && battle) {
    return (
      <View style={[s.container, { backgroundColor: '#0a0a1a' }]}>
        <View style={s.battleArena}>
          <View style={s.enemyArea}>
            <EnemySprite name={battle.enemy.name} hp={Math.max(0, battle.enemy.hp)} maxHp={battle.enemy.maxHp} shake={shake} />
            {dmgNumbers.slice(-3).map(d => <DamageNumber key={d.id} value={d.value} color={d.color} id={d.id} />)}
          </View>
          <Text style={s.vsText}>⚔️ VS ⚔️</Text>
          <View style={s.playerArea}>
            <PlayerSprite atkAnim={atkAnim} />
            <View style={{ width: 120, marginTop: 8 }}>
              <View style={{ height: 8, backgroundColor: '#333', borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ width: `${(battle.playerHp / battle.playerMaxHp) * 100}%`, height: '100%', backgroundColor: battle.playerHp > 30 ? '#4CAF50' : '#f44336', borderRadius: 4 }} />
              </View>
              <Text style={{ color: '#aaa', fontSize: 10, textAlign: 'center' }}>{Math.max(0, battle.playerHp)}/{battle.playerMaxHp}</Text>
            </View>
          </View>
        </View>
        <ScrollView style={s.logBox}>
          {battle.log.map((l, i) => (
            <Text key={i} style={[s.logText,
              l.type === 'player' && { color: '#64B5F6' },
              l.type === 'enemy' && { color: '#f44336' },
              l.type === 'win' && { color: '#ffd700', fontWeight: 'bold' },
              l.type === 'lose' && { color: '#f44336', fontWeight: 'bold' },
              l.type === 'levelup' && { color: '#4CAF50', fontWeight: 'bold', fontSize: 16 },
              l.type === 'heal' && { color: '#4CAF50' },
              l.type === 'info' && { color: '#aaa' },
            ]}>{l.text}</Text>
          ))}
        </ScrollView>
        {!battle.done ? (
          <View style={s.battleBtns}>
            {battle.turn === 'player' ? (
              <>
                <TouchableOpacity style={s.atkBtn} onPress={attack}><Text style={s.btnText}>⚔️ Attack</Text></TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {(profile?.potions || 0) > 0 && (
                    <TouchableOpacity style={[s.battleBtn, { backgroundColor: '#2E7D32' }]} onPress={usePotion}><Text style={s.btnText}>🧪 Potion ({profile.potions})</Text></TouchableOpacity>
                  )}
                  <TouchableOpacity style={[s.battleBtn, { backgroundColor: '#555' }]} onPress={flee}><Text style={s.btnText}>🏃 Run</Text></TouchableOpacity>
                </View>
              </>
            ) : (
              <Text style={{ color: '#ffd700', fontSize: 18, textAlign: 'center' }}>Enemy's turn...</Text>
            )}
          </View>
        ) : (
          <TouchableOpacity style={s.btn} onPress={() => { setScreen('menu'); setBattle(null); setDmgNumbers([]); }}>
            <Text style={s.btnText}>Return to Town</Text>
          </TouchableOpacity>
        )}
        <StatusBar style="light" />
      </View>
    );
  }

  if (screen === 'inventory') return (
    <View style={s.container}>
      <Text style={s.title}>🎒 Inventory</Text>
      <View style={s.statBar}>
        <Text style={s.stat}>💰 {profile.gold} Gold</Text>
        <Text style={s.stat}>❤️ {profile.hp}/{profile.max_hp}</Text>
      </View>
      <Text style={{ color: '#888', marginBottom: 10 }}>
        Weapon: <Text style={{ color: '#ffd700' }}>{inventory.find(i => { const it = items.find(x => x.id === i.item_id); return it?.type === 'weapon' && i.equipped; }) ? items.find(x => x.id === inventory.find(i => { const it = items.find(x2 => x2.id === i.item_id); return it?.type === 'weapon' && i.equipped; })?.item_id)?.name || 'None' : 'None'}</Text>
        {' | '}Armor: <Text style={{ color: '#ffd700' }}>{inventory.find(i => { const it = items.find(x => x.id === i.item_id); return it?.type === 'armor' && i.equipped; }) ? items.find(x => x.id === inventory.find(i => { const it = items.find(x2 => x2.id === i.item_id); return it?.type === 'armor' && i.equipped; })?.item_id)?.name || 'None' : 'None'}</Text>
      </Text>
      <ScrollView style={{ flex: 1, width: '100%' }}>
        {inventory.length === 0 && <Text style={{ color: '#666', textAlign: 'center', marginTop: 40, fontSize: 16 }}>Your inventory is empty. Fight monsters and buy gear!</Text>}
        {inventory.map(inv => {
          const item = items.find(x => x.id === inv.item_id);
          if (!item) return null;
          return (
            <View key={inv.id} style={s.itemCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{item.type === 'weapon' ? '⚔️' : item.type === 'armor' ? '🛡️' : '🧪'} {item.name} {inv.equipped ? '✅' : ''}</Text>
                <Text style={s.itemDesc}>{item.description}</Text>
              </View>
              {item.type !== 'consumable' ? (
                <TouchableOpacity style={s.smallBtn} onPress={() => equipItem(inv.id)}>
                  <Text style={{ color: '#fff', fontSize: 12 }}>{inv.equipped ? 'Unequip' : 'Equip'}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[s.smallBtn, { backgroundColor: '#4CAF50' }]} onPress={() => useConsumable(inv.id)}>
                  <Text style={{ color: '#fff', fontSize: 12 }}>Use</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
      <TouchableOpacity style={[s.btn, { backgroundColor: '#0f3460' }]} onPress={() => setScreen('menu')}><Text style={[s.btnText, { color: '#ffd700' }]}>← Back</Text></TouchableOpacity>
      <StatusBar style="light" />
    </View>
  );

  if (screen === 'shop') return (
    <View style={s.container}>
      <Text style={s.title}>🏪 Shop</Text>
      <Text style={[s.stat, { textAlign: 'center', fontSize: 18 }]}>💰 {profile.gold} Gold</Text>
      <ScrollView style={{ flex: 1, width: '100%' }}>
        {items.filter(x => x.type !== 'consumable').concat(items.filter(x => x.type === 'consumable')).map(item => {
          const owned = inventory.filter(i => i.item_id === item.id).length;
          return (
            <View key={item.id} style={s.itemCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{item.type === 'weapon' ? '⚔️' : item.type === 'armor' ? '🛡️' : '🧪'} {item.name}</Text>
                <Text style={s.itemDesc}>{item.description}</Text>
                {item.atk_bonus > 0 && <Text style={{ color: '#FF9800', fontSize: 11 }}>+{item.atk_bonus} ATK</Text>}
                {item.def_bonus > 0 && <Text style={{ color: '#64B5F6', fontSize: 11 }}>+{item.def_bonus} DEF</Text>}
                {owned > 0 && <Text style={{ color: '#888', fontSize: 11 }}>Owned: x{owned}</Text>}
              </View>
              <TouchableOpacity style={[s.smallBtn, { backgroundColor: profile.gold >= item.value ? '#ffd700' : '#555' }]} onPress={() => buyItem(item)}>
                <Text style={{ color: profile.gold >= item.value ? '#000' : '#999', fontSize: 12, fontWeight: 'bold' }}>{item.value}💰</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
      <TouchableOpacity style={[s.btn, { backgroundColor: '#0f3460' }]} onPress={() => setScreen('menu')}><Text style={[s.btnText, { color: '#ffd700' }]}>← Back</Text></TouchableOpacity>
      <StatusBar style="light" />
    </View>
  );

  return (
    <View style={s.container}>
      <View style={s.heroCard}>
        <Text style={s.heroName}>⚔️ {profile.name}</Text>
        <Text style={s.heroLevel}>Lv.{profile.level} Adventurer</Text>
        <View style={s.divider} />
        <View style={s.statGrid}>
          <View style={s.statItem}><Text style={s.statIcon}>❤️</Text><Text style={s.statVal}>{profile.hp}/{profile.max_hp}</Text></View>
          <View style={s.statItem}><Text style={s.statIcon}>⚔️</Text><Text style={s.statVal}>{getTotalAtk()}</Text></View>
          <View style={s.statItem}><Text style={s.statIcon}>🛡️</Text><Text style={s.statVal}>{getTotalDef()}</Text></View>
          <View style={s.statItem}><Text style={s.statIcon}>⭐</Text><Text style={s.statVal}>{profile.level}</Text></View>
          <View style={s.statItem}><Text style={s.statIcon}>💰</Text><Text style={s.statVal}>{profile.gold}</Text></View>
          <View style={s.statItem}><Text style={s.statIcon}>🧪</Text><Text style={s.statVal}>{profile.potions}</Text></View>
        </View>
        <View style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ color: '#aaa', fontSize: 12 }}>XP</Text>
            <Text style={{ color: '#ffd700', fontSize: 12 }}>{profile.xp}/{profile.xp_next}</Text>
          </View>
          <View style={{ height: 12, backgroundColor: '#0a0a1a', borderRadius: 6, overflow: 'hidden' }}>
            <View style={{ width: `${(profile.xp / profile.xp_next) * 100}%`, height: '100%', backgroundColor: '#ffd700', borderRadius: 6 }} />
          </View>
        </View>
      </View>
      <View style={s.menuGrid}>
        <TouchableOpacity style={s.menuCard} onPress={() => { startBattle(); }}>
          <Text style={s.menuIcon}>⚔️</Text>
          <Text style={s.menuLabel}>Fight</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.menuCard} onPress={() => setScreen('inventory')}>
          <Text style={s.menuIcon}>🎒</Text>
          <Text style={s.menuLabel}>Inventory</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.menuCard} onPress={() => setScreen('shop')}>
          <Text style={s.menuIcon}>🏪</Text>
          <Text style={s.menuLabel}>Shop</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.menuCard, { backgroundColor: '#4a1525' }]} onPress={signOut}>
          <Text style={s.menuIcon}>🚪</Text>
          <Text style={s.menuLabel}>Logout</Text>
        </TouchableOpacity>
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e', padding: 15, alignItems: 'center' },
  titleBlock: { alignItems: 'center', marginBottom: 30, marginTop: 40 },
  logo: { fontSize: 60, marginBottom: 10 },
  title: { fontSize: 36, color: '#ffd700', fontWeight: 'bold' },
  subtitle: { fontSize: 14, color: '#888', marginTop: 4 },
  input: { backgroundColor: '#16213e', color: '#fff', padding: 15, borderRadius: 12, marginBottom: 12, fontSize: 16, width: '100%', borderWidth: 1, borderColor: '#2a2a4e' },
  btn: { backgroundColor: '#ffd700', padding: 16, borderRadius: 12, alignItems: 'center', width: '100%' },
  btnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  heroCard: { backgroundColor: '#16213e', borderRadius: 16, padding: 20, width: '100%', marginBottom: 15, borderWidth: 1, borderColor: '#2a2a4e' },
  heroName: { fontSize: 22, color: '#ffd700', fontWeight: 'bold', textAlign: 'center' },
  heroLevel: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 8 },
  divider: { height: 1, backgroundColor: '#2a2a4e', marginVertical: 10 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  statItem: { backgroundColor: '#0a0a1a', borderRadius: 10, padding: 10, alignItems: 'center', width: '30%' },
  statIcon: { fontSize: 20 },
  statVal: { color: '#ddd', fontSize: 13, marginTop: 2 },
  stat: { color: '#ddd', fontSize: 14 },
  statBar: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 10 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', width: '100%' },
  menuCard: { backgroundColor: '#0f3460', borderRadius: 16, padding: 20, alignItems: 'center', width: '46%', borderWidth: 1, borderColor: '#2a2a4e' },
  menuIcon: { fontSize: 32, marginBottom: 6 },
  menuLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  battleArena: { alignItems: 'center', width: '100%', paddingVertical: 10 },
  enemyArea: { alignItems: 'center', marginBottom: 10 },
  vsText: { color: '#ffd700', fontSize: 18, fontWeight: 'bold', marginVertical: 8 },
  playerArea: { alignItems: 'center', marginBottom: 10 },
  logBox: { flex: 1, width: '100%', backgroundColor: '#0a0a1a', borderRadius: 12, padding: 12, marginVertical: 8, borderWidth: 1, borderColor: '#2a2a4e' },
  logText: { fontSize: 13, marginBottom: 3 },
  battleBtns: { width: '100%', gap: 10, marginTop: 5 },
  atkBtn: { backgroundColor: '#e74c3c', padding: 16, borderRadius: 12, alignItems: 'center', borderWidth: 2, borderColor: '#ffd700' },
  battleBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  itemCard: { flexDirection: 'row', backgroundColor: '#16213e', borderRadius: 12, padding: 12, marginBottom: 8, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a4e' },
  itemName: { color: '#ffd700', fontSize: 14, fontWeight: '600' },
  itemDesc: { color: '#999', fontSize: 12 },
  smallBtn: { backgroundColor: '#e74c3c', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginLeft: 8 },
});
