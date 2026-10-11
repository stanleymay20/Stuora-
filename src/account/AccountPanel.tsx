import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../backend/supabase';
import { useAuth } from './AuthProvider';
import { credentialsError, profileError } from './validation';

export default function AccountPanel() {
  const { session, initializing, profile, profileLoading, error, reloadProfile } = useAuth();
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('Berlin');
  const [bio, setBio] = useState('');
  const [discoverable, setDiscoverable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [issue, setIssue] = useState('');
  useEffect(() => {
    setName(profile?.display_name ?? ''); setCity(profile?.city ?? 'Berlin');
    setBio(profile?.bio ?? ''); setDiscoverable(profile?.is_discoverable ?? true);
  }, [profile]);
  useEffect(() => { setPassword(''); setNotice(''); setIssue(''); }, [session?.user.id]);

  async function authenticate() {
    const validation = credentialsError(email, password, signup);
    if (validation) { setIssue(validation); return; }
    setBusy(true); setIssue(''); setNotice('');
    try {
      const result = signup
        ? await supabase.auth.signUp({ email: email.trim(), password, options: Platform.OS === 'web' && typeof window !== 'undefined' ? { emailRedirectTo: window.location.origin } : undefined })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) { setIssue(result.error.message); return; }
      setPassword('');
      if (signup && !result.data.session) {
        setNotice('Check your email and confirm your account, then return here to sign in.');
        setSignup(false);
      }
    } catch { setIssue('Unable to connect. Please try again.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!session || error || profileLoading) return;
    const validation = profileError(name, city, bio);
    if (validation) { setIssue(validation); return; }
    setBusy(true); setIssue(''); setNotice('');
    const values = { display_name: name.trim(), city: city.trim(), bio: bio.trim(), is_discoverable: discoverable };
    try {
      const query = profile
        ? supabase.from('profiles').update(values).eq('id', session.user.id)
        : supabase.from('profiles').insert({ id: session.user.id, ...values });
      const result = await query.select('*').single();
      if (result.error) { setIssue('Your profile could not be saved. Please retry.'); return; }
      reloadProfile();
      setNotice('Your profile has been saved.');
    } catch { setIssue('Unable to connect. Your changes have not been saved.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setIssue('');
    try {
      const { error: issue } = await supabase.auth.signOut({ scope: 'local' });
      if (issue) setIssue('Could not sign out. Please retry.');
    } catch { setIssue('Could not sign out. Check your connection.'); }
    finally { setBusy(false); }
  }
  const button = (label: string, action: () => void, disabled = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy || disabled} onPress={action} style={[styles.button, (busy || disabled) && styles.disabled]}><Text style={styles.buttonText}>{busy ? 'Please wait…' : label}</Text></Pressable>
  );
  if (initializing) return <View style={styles.card}><ActivityIndicator /><Text>Restoring your session…</Text></View>;
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>{session ? 'Your Stuora Passport' : signup ? 'Create your Stuora account' : 'Welcome to Stuora'}</Text>
    <Text style={styles.description}>{session ? 'Your profile is saved to your account and available across devices.' : 'Core student participation is free. No university connection is required.'}</Text>
    {(issue || error) ? <Text accessibilityRole="alert" style={styles.error}>{issue || error}</Text> : null}
    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
    {!session ? <>
      <Text style={styles.label}>Email</Text>
      <TextInput accessibilityLabel="Email" autoComplete="email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} editable={!busy} style={styles.input} />
      <Text style={styles.label}>Password</Text>
      <TextInput accessibilityLabel="Password" autoComplete={signup ? 'new-password' : 'current-password'} secureTextEntry value={password} onChangeText={setPassword} editable={!busy} style={styles.input} />
      {button(signup ? 'Create account' : 'Sign in', authenticate)}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setSignup(v => !v); setIssue(''); setNotice(''); }}><Text style={styles.link}>{signup ? 'Already have an account? Sign in' : 'New here? Create an account'}</Text></Pressable>
    </> : <>
      <Text style={styles.description}>{session.user.email}</Text>
      <Text style={styles.trust}>{session.user.email_confirmed_at ? 'Email confirmed' : 'Email not confirmed'} · Student status: {profile?.student_status ?? 'unverified'}</Text>
      {profileLoading ? <ActivityIndicator /> : error ? button('Retry profile', reloadProfile) : <>
        <Text style={styles.label}>{profile ? 'Edit your profile' : 'Build your profile'}</Text>
        <Text style={styles.label}>Display name</Text>
        <TextInput accessibilityLabel="Display name" maxLength={80} value={name} onChangeText={setName} editable={!busy} style={styles.input} />
        <Text style={styles.label}>City</Text>
        <TextInput accessibilityLabel="City" maxLength={120} value={city} onChangeText={setCity} editable={!busy} style={styles.input} />
        <Text style={styles.label}>Bio (optional)</Text>
        <TextInput accessibilityLabel="Bio" maxLength={600} multiline value={bio} onChangeText={setBio} editable={!busy} style={[styles.input, styles.bio]} />
        <Pressable accessibilityRole="switch" aria-checked={discoverable} accessibilityState={{ checked: discoverable, disabled: busy }} accessibilityLabel="Profile discoverable" disabled={busy} onPress={() => setDiscoverable(v => !v)}><Text style={styles.link}>{discoverable ? '✓' : '○'} Let signed-in students discover my profile</Text></Pressable>
        <Text style={styles.description}>Your display name, city and bio are visible when discovery is enabled. Your email is not part of your public profile.</Text>
        {button(profile ? 'Save profile' : 'Create profile', save)}
      </>}
      {button('Sign out', logout)}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 24, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#E9EAF1', gap: 12 },
  heading: { color: '#11162F', fontSize: 24, fontWeight: '800' },
  description: { color: '#747B91', fontSize: 13, lineHeight: 20 },
  label: { color: '#11162F', fontWeight: '700' },
  input: { backgroundColor: '#F7F7FB', borderColor: '#E9EAF1', borderWidth: 1, borderRadius: 12, padding: 14, color: '#11162F', fontSize: 16 },
  bio: { minHeight: 90, textAlignVertical: 'top' },
  button: { backgroundColor: '#7048FF', padding: 15, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '800' }, disabled: { opacity: 0.45 },
  link: { color: '#7048FF', paddingVertical: 8, fontWeight: '700' },
  error: { color: '#B42318', lineHeight: 20 }, notice: { color: '#167348', lineHeight: 20 },
  trust: { color: '#252B4A', fontSize: 13, lineHeight: 20 },
});
