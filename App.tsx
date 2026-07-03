import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';

const supabase = createClient(
  'https://btkcubibosbtpxcronnd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0a2N1Ymlib3NidHB4Y3Jvbm5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMzI1ODAsImV4cCI6MjA5ODYwODU4MH0.IqR7dJbZJm83c_XHz923GQrBWdf5GCaNDYMPg6z8kj0'
);

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener?.subscription.unsubscribe();
  }, []);

  async function signUp() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) Alert.alert('Error', error.message);
    else Alert.alert('Check your email', 'Confirmation link sent!');
  }

  async function signIn() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Error', error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Logged In!</Text>
        <Text style={styles.email}>{user.email}</Text>
        <TouchableOpacity style={styles.button} onPress={signOut}>
          <Text style={styles.buttonText}>Sign Out</Text>
        </TouchableOpacity>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Roblox App</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#999"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#999"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {loading ? (
        <ActivityIndicator size="large" color="#208AEF" />
      ) : (
        <>
          <TouchableOpacity style={styles.button} onPress={signIn}>
            <Text style={styles.buttonText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.signUpButton]} onPress={signUp}>
            <Text style={styles.buttonText}>Sign Up</Text>
          </TouchableOpacity>
        </>
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#1a1a2e' },
  title: { fontSize: 28, color: '#fff', textAlign: 'center', marginBottom: 30, fontWeight: 'bold' },
  email: { fontSize: 18, color: '#fff', textAlign: 'center', marginBottom: 20 },
  input: { backgroundColor: '#16213e', color: '#fff', padding: 15, borderRadius: 10, marginBottom: 15, fontSize: 16 },
  button: { backgroundColor: '#208AEF', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  signUpButton: { backgroundColor: '#0f3460' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
