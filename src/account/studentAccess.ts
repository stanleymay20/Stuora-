import type { Session } from '@supabase/supabase-js';

// Mirrors private.has_gisma_student_email on the server. The server is the
// authority (RLS and Storage policies); this only decides which screen to show.
const GISMA_STUDENT_EMAIL = /^[^@\s]+@gisma-student\.com$/i;

export type CatalogueAccess = 'student' | 'signed-out' | 'not-eligible';

export function catalogueAccess(session: Session | null): CatalogueAccess {
  if (!session) return 'signed-out';
  const user = session.user;
  return user.email_confirmed_at && GISMA_STUDENT_EMAIL.test((user.email ?? '').trim()) ? 'student' : 'not-eligible';
}
