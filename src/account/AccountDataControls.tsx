import React, { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../backend/supabase';
import { invokeFunction, ServiceError } from '../backend/externalData';

const PHRASE = 'DELETE MY ACCOUNT';

/** GDPR Art. 15/20 export and Art. 17 erasure, both self-service. */
export default function AccountDataControls({ email }: { email: string }) {
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'done' | 'error' | 'limited'>('idle');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [phrase, setPhrase] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteIssue, setDeleteIssue] = useState('');

  async function exportData() {
    setExportState('busy');
    const { data, error } = await supabase.rpc('export_my_data');
    if (error) { setExportState(error.code === 'P0001' ? 'limited' : 'error'); return; }
    const text = JSON.stringify(data, null, 2);
    const name = `stuora-data-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url; a.download = name; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        await Share.share({ title: name, message: text });
      }
      setExportState('done');
    } catch { setExportState('error'); }
  }

  async function deleteAccount() {
    if (phrase.trim() !== PHRASE) { setDeleteIssue(`Type ${PHRASE} to confirm.`); return; }
    if (!password) { setDeleteIssue('Enter your password to confirm it is you.'); return; }
    setDeleteBusy(true); setDeleteIssue('');
    try {
      // A fresh sign-in proves the request comes from the account holder.
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) { setDeleteIssue('That password did not work.'); return; }
      await invokeFunction('delete-account', { confirmation: PHRASE });
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      setDeleteIssue(error instanceof ServiceError ? error.message : 'Your account could not be deleted. Please try again.');
    } finally { setDeleteBusy(false); setPassword(''); }
  }

  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={styles.heading}>Your data</Text>
      <Pressable accessibilityRole="button" disabled={exportState === 'busy'} onPress={() => void exportData()} style={styles.secondary}>
        <Text style={styles.secondaryText}>{exportState === 'busy' ? 'Preparing…' : 'Download my data'}</Text>
      </Pressable>
      {exportState === 'done' ? <Text accessibilityLiveRegion="polite" style={styles.ok}>Your data file is ready.</Text> : null}
      {exportState === 'limited' ? <Text accessibilityRole="alert" style={styles.error}>You can download your data up to 5 times a day.</Text> : null}
      {exportState === 'error' ? <Text accessibilityRole="alert" style={styles.error}>Your data could not be prepared. Please try again.</Text> : null}
      {!deleteOpen ? (
        <Pressable accessibilityRole="button" onPress={() => setDeleteOpen(true)} style={styles.dangerOutline}>
          <Text style={styles.dangerText}>Delete account</Text>
        </Pressable>
      ) : (
        <View style={styles.deleteBox} testID="delete-account-form">
          <Text style={styles.body}>This permanently deletes your profile, listings, photos, saved items, messages you sent, group posts and reports you filed. It cannot be undone.</Text>
          <Text style={styles.label}>Password</Text>
          <TextInput accessibilityLabel="Password to confirm deletion" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} editable={!deleteBusy} style={styles.input} />
          <Text style={styles.label}>Type {PHRASE}</Text>
          <TextInput accessibilityLabel="Confirmation phrase" autoCapitalize="characters" autoCorrect={false} value={phrase} onChangeText={setPhrase} editable={!deleteBusy} style={styles.input} />
          {deleteIssue ? <Text accessibilityRole="alert" style={styles.error}>{deleteIssue}</Text> : null}
          <View style={styles.row}>
            <Pressable accessibilityRole="button" disabled={deleteBusy} onPress={() => { setDeleteOpen(false); setPhrase(''); setPassword(''); setDeleteIssue(''); }} style={styles.secondary}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={deleteBusy} onPress={() => void deleteAccount()} style={styles.danger}>
              <Text style={styles.dangerSolidText}>{deleteBusy ? 'Deleting…' : 'Permanently delete'}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, borderTopWidth: 1, borderTopColor: '#E9EAF1', paddingTop: 14 },
  heading: { fontSize: 16, fontWeight: '900', color: '#11162F' },
  body: { fontSize: 13, color: '#3D4459', lineHeight: 19 },
  label: { color: '#11162F', fontWeight: '700' },
  input: { backgroundColor: '#F7F7FB', borderColor: '#E9EAF1', borderWidth: 1, borderRadius: 12, padding: 14, color: '#11162F', fontSize: 16 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  secondary: { minHeight: 46, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#EEE9FF', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  secondaryText: { color: '#4325C9', fontWeight: '800' },
  dangerOutline: { minHeight: 46, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E7B3C1', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  dangerText: { color: '#8A1C3A', fontWeight: '800' },
  danger: { minHeight: 46, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#A3123A', alignItems: 'center', justifyContent: 'center' },
  dangerSolidText: { color: '#FFFFFF', fontWeight: '800' },
  deleteBox: { gap: 8, padding: 14, borderRadius: 14, backgroundColor: '#FFF6F8', borderWidth: 1, borderColor: '#F2CCD6' },
  ok: { color: '#0E6B45' },
  error: { color: '#A3123A' },
});
