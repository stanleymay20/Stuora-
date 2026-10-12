import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { StuoraMark } from '../ui/Brand';
import { supabase } from '../backend/supabase';
import { useAuth } from './AuthProvider';
import { credentialsError, profileError } from './validation';

function confirmationRedirect() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return 'stuora://auth/callback';
}

export default function AccountPanel() {
  const { session, initializing, profile, profileLoading, error, recoveryMode, reloadProfile, requestPasswordReset, completePasswordRecovery, cancelPasswordRecovery } = useAuth();
  const [signup, setSignup] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
  useEffect(() => {
    setPassword(''); setConfirmPassword(''); setNotice(''); setIssue('');
  }, [session?.user.id]);
  useEffect(() => {
    if (recoveryMode) { setForgot(false); setSignup(false); setPassword(''); setConfirmPassword(''); setNotice(''); setIssue(''); }
  }, [recoveryMode]);

  async function authenticate() {
    const validation = credentialsError(email, password, signup);
    if (validation) { setIssue(validation); return; }
    setBusy(true); setIssue(''); setNotice('');
    try {
      const result = signup
        ? await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: confirmationRedirect() } })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) { setIssue(result.error.message); return; }
      setPassword('');
      if (signup && !result.data.session) {
        setNotice('Check your email and confirm your account, then return to Stuora.');
        setSignup(false);
      }
    } catch { setIssue('Unable to connect. Please try again.'); }
    finally { setBusy(false); }
  }

  async function sendReset() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setIssue('Enter a valid email address.'); return; }
    setBusy(true); setIssue(''); setNotice('');
    const result = await requestPasswordReset(email);
    if (result) setIssue(result);
    else setNotice('If an account exists for that email, a password-reset link has been sent. Check your inbox and spam folder.');
    setBusy(false);
  }

  async function saveRecoveredPassword() {
    setIssue(''); setNotice('');
    if (password.length < 8) { setIssue('Use at least 8 characters for your new password.'); return; }
    if (password !== confirmPassword) { setIssue('The two password entries do not match.'); return; }
    setBusy(true);
    const result = await completePasswordRecovery(password);
    if (result) setIssue(result);
    else {
      setPassword(''); setConfirmPassword(''); setNotice('Password updated. Sign in with your new password.');
    }
    setBusy(false);
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
      const { error: logoutIssue } = await supabase.auth.signOut({ scope: 'local' });
      if (logoutIssue) setIssue('Could not sign out. Please retry.');
    } catch { setIssue('Could not sign out. Check your connection.'); }
    finally { setBusy(false); }
  }
  const button = (label: string, action: () => void, disabled = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy || disabled} onPress={action} style={[styles.button, (busy || disabled) && styles.disabled]}><Text style={styles.buttonText}>{busy ? 'Please wait…' : label}</Text></Pressable>
  );
  if (initializing && !recoveryMode) return <View style={styles.card}><ActivityIndicator /><Text>Restoring your session…</Text></View>;

  if (recoveryMode) return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>Choose a new password</Text>
    <Text style={styles.description}>This screen is available only from a Stuora password-recovery link. Recovery links are single-purpose and may expire.</Text>
    {(issue || error) ? <Text accessibilityRole="alert" style={styles.error}>{issue || error}</Text> : null}
    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
    <Text style={styles.label}>New password</Text>
    <TextInput accessibilityLabel="New password" autoComplete="new-password" secureTextEntry value={password} onChangeText={setPassword} editable={!busy} style={styles.input} />
    <Text style={styles.label}>Confirm new password</Text>
    <TextInput accessibilityLabel="Confirm new password" autoComplete="new-password" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} editable={!busy} style={styles.input} />
    {button('Save new password', () => void saveRecoveredPassword(), !session)}
    {!session ? <Text accessibilityRole="alert" style={styles.error}>This recovery session is missing or expired. Request a new reset link.</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void cancelPasswordRecovery()}><Text style={styles.link}>Cancel recovery and return to sign in</Text></Pressable>
  </View>;

  return <View style={styles.card}>
    {!session ? <View style={styles.welcome}><Image source={require('../../assets/berlin-skyline.jpg')} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} resizeMode="cover" /><View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(17,22,47,0.35)' }]} /><View style={{ zIndex: 1 }}><StuoraMark size={58} /></View><Text style={styles.welcomeTitle}>Stuora</Text><Text style={styles.welcomeSubtitle}>Student life, all in one place.</Text></View> : null}
    <Text accessibilityRole="header" style={styles.heading}>{session ? 'Your Stuora Passport' : forgot ? 'Reset your password' : signup ? 'Create your Stuora account' : 'Welcome to Stuora'}</Text>
    <Text style={styles.description}>{session ? 'Your profile is saved to your account and available across devices.' : forgot ? 'Enter your account email. For privacy, Stuora gives the same response whether or not an account exists.' : 'Core student participation is free. No university connection is required.'}</Text>
    {(issue || error) ? <Text accessibilityRole="alert" style={styles.error}>{issue || error}</Text> : null}
    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
    {!session ? <>
      <Text style={styles.label}>Email</Text>
      <TextInput accessibilityLabel="Email" autoComplete="email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} editable={!busy} style={styles.input} />
      {forgot ? <>
        {button('Send reset link', () => void sendReset())}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setForgot(false); setIssue(''); setNotice(''); }}><Text style={styles.link}>Back to sign in</Text></Pressable>
      </> : <>
        <Text style={styles.label}>Password</Text>
        <TextInput accessibilityLabel="Password" autoComplete={signup ? 'new-password' : 'current-password'} secureTextEntry value={password} onChangeText={setPassword} editable={!busy} style={styles.input} />
        {button(signup ? 'Create account' : 'Sign in', authenticate)}
        {!signup ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setForgot(true); setIssue(''); setNotice(''); setPassword(''); }}><Text style={styles.link}>Forgot password?</Text></Pressable> : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setSignup(v => !v); setForgot(false); setIssue(''); setNotice(''); }}><Text style={styles.link}>{signup ? 'Already have an account? Sign in' : 'New here? Create an account'}</Text></Pressable>
      </>}
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
  welcome: { minHeight: 190, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#11162F' },
  welcomeTitle: { color: '#FFFFFF', fontSize: 30, fontWeight: '900' },
  welcomeSubtitle: { color: '#FFFFFF', fontSize: 14 },
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
