import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { StuoraMark } from '../ui/Brand';
import { supabase } from '../backend/supabase';
import { useAuth } from './AuthProvider';
import { credentialsError, emailError, newPasswordError, profileError } from './validation';

const authRedirectUrl = () => Platform.OS === 'web' && typeof window !== 'undefined'
  ? window.location.origin
  : 'stuora://auth-callback';

export default function AccountPanel() {
  const { session, initializing, profile, profileLoading, recoveryMode, error, reloadProfile, finishRecovery } = useAuth();
  const [signup, setSignup] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [discoverable, setDiscoverable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [issue, setIssue] = useState('');
  // Preserve the password-reset confirmation across the forced SIGNED_OUT event.
  const preserveRecoveryNotice = useRef(false);

  useEffect(() => {
    setName(profile?.display_name ?? ''); setCity(profile?.city ?? '');
    setBio(profile?.bio ?? ''); setDiscoverable(profile?.is_discoverable ?? false);
  }, [profile]);
  useEffect(() => {
    setPassword(''); setNewPassword(''); setConfirmPassword('');
    if (!preserveRecoveryNotice.current) setNotice('');
    setIssue('');
    if (session) { setForgot(false); preserveRecoveryNotice.current = false; }
  }, [session?.user.id]);

  async function authenticate() {
    const validation = credentialsError(email, password, signup);
    if (validation) { setIssue(validation); return; }
    setBusy(true); setIssue(''); setNotice('');
    try {
      const result = signup
        ? await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: authRedirectUrl() } })
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

  async function requestRecovery() {
    const validation = emailError(email);
    if (validation) { setIssue(validation); return; }
    setBusy(true); setIssue(''); setNotice('');
    try {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl() });
      if (recoveryError) {
        setIssue('We could not send a reset link right now. Please wait a moment and retry.');
        return;
      }
      // Keep this response neutral so the UI does not disclose whether an address is registered.
      setNotice('If an account exists for that email, a password reset link has been sent.');
    } catch { setIssue('Unable to connect. Please try again.'); }
    finally { setBusy(false); }
  }

  async function updateRecoveredPassword() {
    const validation = newPasswordError(newPassword, confirmPassword);
    if (validation) { setIssue(validation); return; }
    setBusy(true); setIssue(''); setNotice('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setIssue('Your password could not be updated. Request a new recovery link and retry.');
        return;
      }
      setNewPassword(''); setConfirmPassword('');
      // Recovery grants a temporary authenticated session. Revoke it so a
      // copied or unattended recovery link cannot leave the account signed in.
      preserveRecoveryNotice.current = true;
      finishRecovery();
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) {
        setIssue('Password changed, but this device could not sign out. Please sign out manually.');
        return;
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState({}, '', window.location.pathname + window.location.search);
      }
      setNotice('Password updated successfully. Sign in again with your new password.');
    } catch { setIssue('Unable to connect. Your password was not changed.'); }
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
      const { error: logoutError } = await supabase.auth.signOut({ scope: 'local' });
      if (logoutError) setIssue('Could not sign out. Please retry.');
    } catch { setIssue('Could not sign out. Check your connection.'); }
    finally { setBusy(false); }
  }

  const button = (label: string, action: () => void, disabled = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy || disabled} onPress={action} style={[styles.button, (busy || disabled) && styles.disabled]}><Text style={styles.buttonText}>{busy ? 'Please wait…' : label}</Text></Pressable>
  );

  if (initializing) return <View style={styles.card}><ActivityIndicator /><Text>Restoring your session…</Text></View>;

  if (session && recoveryMode) return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>Choose a new password</Text>
    <Text style={styles.description}>Your recovery link was accepted. Set a new password to secure your Stuora account.</Text>
    {issue ? <Text accessibilityRole="alert" style={styles.error}>{issue}</Text> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    <Text style={styles.label}>New password</Text>
    <TextInput accessibilityLabel="New password" autoComplete="new-password" secureTextEntry value={newPassword} onChangeText={setNewPassword} editable={!busy} style={styles.input} />
    <Text style={styles.label}>Confirm new password</Text>
    <TextInput accessibilityLabel="Confirm new password" autoComplete="new-password" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} editable={!busy} style={styles.input} />
    {button('Update password', () => void updateRecoveredPassword())}
    <Text style={styles.description}>Use at least 8 characters. Stuora never asks you to send your password to another user.</Text>
  </View>;

  return <View style={styles.card}>
    {session && profile ? <View style={styles.passportHeader}>
      <View style={styles.passportAvatar}><Text style={styles.passportInitial}>{profile.display_name.charAt(0).toUpperCase()}</Text></View>
      <View style={styles.passportInfo}>
        <Text style={styles.passportName}>{profile.display_name}</Text>
        <Text style={styles.passportMeta}>{profile.city} · Verification: {profile.student_status}</Text>
        {profile.bio ? <Text style={styles.passportBio}>{profile.bio}</Text> : null}
      </View>
    </View> : null}
    {!session ? <View style={styles.welcome}><View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#252354' }]} /><View pointerEvents="none" style={styles.welcomeAura} /><View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(17,22,47,0.35)' }]} /><View style={{ zIndex: 1 }}><StuoraMark size={58} /></View><Text style={styles.welcomeTitle}>Stuora</Text><Text style={styles.welcomeSubtitle}>Student life, all in one place.</Text></View> : null}
    <Text accessibilityRole="header" style={styles.heading}>{session ? 'Your Stuora Passport' : forgot ? 'Reset your password' : signup ? 'Create your Stuora account' : 'Welcome to Stuora'}</Text>
    <Text style={styles.description}>{session ? 'Your profile is saved to your account and available across devices.' : forgot ? 'Enter your account email. We will send a secure recovery link if an account exists.' : 'Core student participation is free. No university connection is required.'}</Text>
    {(issue || error) ? <Text accessibilityRole="alert" style={styles.error}>{issue || error}</Text> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    {!session ? <>
      <Text style={styles.label}>Email</Text>
      <TextInput accessibilityLabel="Email" autoComplete="email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} editable={!busy} style={styles.input} />
      {forgot ? <>
        {button('Send password reset link', () => void requestRecovery())}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setForgot(false); setIssue(''); setNotice(''); }}><Text style={styles.link}>Back to sign in</Text></Pressable>
      </> : <>
        <Text style={styles.label}>Password</Text>
        <TextInput accessibilityLabel="Password" autoComplete={signup ? 'new-password' : 'current-password'} secureTextEntry value={password} onChangeText={setPassword} editable={!busy} style={styles.input} />
        {button(signup ? 'Create account' : 'Sign in', () => void authenticate())}
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
        <TextInput accessibilityLabel="City" placeholder="Enter your actual city" maxLength={120} value={city} onChangeText={setCity} editable={!busy} style={styles.input} />
        <Text style={styles.label}>Bio (optional)</Text>
        <TextInput accessibilityLabel="Bio" maxLength={600} multiline value={bio} onChangeText={setBio} editable={!busy} style={[styles.input, styles.bio]} />
        <Pressable accessibilityRole="switch" aria-checked={discoverable} accessibilityState={{ checked: discoverable, disabled: busy }} accessibilityLabel="Profile discoverable" disabled={busy} onPress={() => setDiscoverable(v => !v)}><Text style={styles.link}>{discoverable ? '✓' : '○'} Let signed-in students discover my profile</Text></Pressable>
        <Text style={styles.description}>Your profile is private by default. Only enable discovery if you want signed-in students to see your display name, city and bio. Your email is never shown in the directory.</Text>
        {button(profile ? 'Save profile' : 'Create profile', () => void save())}
      </>}
      {button('Sign out', () => void logout())}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  passportHeader: { flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: '#F7F5FF', padding: 20, borderRadius: 18, borderWidth: 1, borderColor: '#E9E5FF' },
  passportAvatar: { width: 72, height: 72, borderRadius: 26, backgroundColor: '#7048FF', alignItems: 'center', justifyContent: 'center' },
  passportInitial: { fontSize: 34, fontWeight: '900', color: '#FFFFFF' },
  passportInfo: { flex: 1, gap: 6 },
  passportName: { fontSize: 21, fontWeight: '900', color: '#11162F' },
  passportMeta: { fontSize: 12, color: '#6F7490', fontWeight: '600' },
  passportBio: { fontSize: 12, lineHeight: 19, color: '#252B4A' },
  welcome: { minHeight: 215, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#11162F' },
  welcomeAura: { position: 'absolute', width: 190, height: 190, top: -85, right: -30, backgroundColor: '#6359B4', opacity: 0.45, borderRadius: 100 },
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
