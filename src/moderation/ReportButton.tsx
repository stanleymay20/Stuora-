import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../backend/supabase';
import type { Database } from '../backend/database.types';

type Reason = Database['public']['Enums']['report_reason'];
export type ReportTarget = 'listing' | 'group_message' | 'message' | 'user';
const reasons: { value: Reason; label: string }[] = [
  { value: 'fraud', label: 'Scam or fraud' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'unsafe', label: 'Unsafe' },
  { value: 'prohibited', label: 'Prohibited item or content' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Something else' },
];

/** Reports content through report_content; the reported student never learns who reported. */
export default function ReportButton({ kind, targetId, label = 'Report', compact = false }: {
  kind: ReportTarget; targetId: string; label?: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const close = () => { setOpen(false); setReason(null); setDetails(''); setStatus(null); };
  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true); setStatus(null);
    const { error } = await supabase.rpc('report_content', {
      p_target_kind: kind, p_target_id: targetId, p_reason: reason, p_details: details.trim().slice(0, 1000),
    });
    setBusy(false);
    if (error) {
      setStatus({ ok: false, text: error.code === 'P0001' ? 'You have sent many reports recently. Please try again later.'
        : error.code === '23505' ? 'You have already reported this.' : 'We could not send this report. Please try again.' });
      return;
    }
    setStatus({ ok: true, text: 'Thank you. A Stuora moderator will review this. You will see the outcome in your notices.' });
  };
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} this ${kind.replace('_', ' ')}`}
        onPress={() => setOpen(true)} style={({ pressed }) => [compact ? styles.compact : styles.trigger, pressed && styles.pressed]}>
        <Text style={styles.triggerText}>{label}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.card} accessibilityViewIsModal>
            <Text accessibilityRole="header" style={styles.title}>Report to Stuora</Text>
            {status?.ok ? <Text accessibilityRole="alert" style={styles.ok}>{status.text}</Text> : (
              <>
                <Text style={styles.hint}>Choose what is wrong. The other student is not told who reported them.</Text>
                <View style={styles.reasons}>
                  {reasons.map(r => (
                    <Pressable key={r.value} accessibilityRole="radio" accessibilityState={{ checked: reason === r.value }}
                      onPress={() => setReason(r.value)} style={[styles.reason, reason === r.value && styles.reasonActive]}>
                      <Text style={[styles.reasonText, reason === r.value && styles.reasonTextActive]}>{r.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput accessibilityLabel="Optional details for moderators" value={details} onChangeText={setDetails}
                  maxLength={1000} multiline placeholder="Optional details" placeholderTextColor="#6B7287" style={styles.input} />
                {status ? <Text accessibilityRole="alert" style={styles.error}>{status.text}</Text> : null}
              </>
            )}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={close} style={styles.secondary}>
                <Text style={styles.secondaryText}>{status?.ok ? 'Close' : 'Cancel'}</Text>
              </Pressable>
              {!status?.ok ? (
                <Pressable accessibilityRole="button" accessibilityState={{ disabled: !reason || busy }} disabled={!reason || busy}
                  onPress={() => void submit()} style={[styles.primary, (!reason || busy) && styles.disabled]}>
                  <Text style={styles.primaryText}>{busy ? 'Sending…' : 'Send report'}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#E9EAF1', backgroundColor: '#FFFFFF' },
  compact: { minHeight: 44, minWidth: 44, paddingHorizontal: 6, justifyContent: 'center' },
  triggerText: { color: '#8A1C3A', fontWeight: '800', fontSize: 12 },
  pressed: { opacity: 0.7 },
  backdrop: { flex: 1, backgroundColor: 'rgba(17,22,47,0.4)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 440, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: '900', color: '#11162F' },
  hint: { fontSize: 13, color: '#4A5166', lineHeight: 19 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reason: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: '#D8DAE5' },
  reasonActive: { backgroundColor: '#EEE9FF', borderColor: '#5635E7' },
  reasonText: { fontSize: 13, color: '#3D4459', fontWeight: '700' },
  reasonTextActive: { color: '#4325C9' },
  input: { minHeight: 80, borderWidth: 1, borderColor: '#D8DAE5', borderRadius: 12, padding: 12, fontSize: 14, color: '#11162F', textAlignVertical: 'top' },
  error: { color: '#A3123A', fontSize: 13 },
  ok: { color: '#0E6B45', fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  secondary: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 11, backgroundColor: '#EEE9FF' },
  secondaryText: { color: '#4325C9', fontWeight: '800' },
  primary: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 11, backgroundColor: '#5635E7' },
  primaryText: { color: '#FFFFFF', fontWeight: '800' },
  disabled: { opacity: 0.45 },
});
