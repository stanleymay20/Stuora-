import type { Database, Json } from './database.types';

// Reviewed migration contract for PR deployment. database.types.ts remains the
// generated live schema until the pending migration is applied and read back.
export type PostingKind = Database['public']['Enums']['listing_kind'] | 'post';
export type PostingCategory = 'Housing' | 'Marketplace' | 'Trips' | 'Jobs' | 'Events' | 'Posts';
type ExtraTable<Row, Insert> = { Row: Row; Insert: Insert; Update: Partial<Row>; Relationships: [] };
type Request = { user_id: string; company_name: string; details: string; status: string; created_at: string; reviewed_at: string | null };
type Block = { blocker_id: string; blocked_id: string; created_at: string };
type Participant = { event_listing_id: string; user_id: string; joined_at: string };
export type PostingDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Functions' | 'Tables' | 'Enums'> & {
    Enums: Omit<Database['public']['Enums'], 'listing_kind'> & { listing_kind: PostingKind };
    Tables: Database['public']['Tables'] & {
      publisher_requests: ExtraTable<Request, Pick<Request, 'user_id' | 'company_name' | 'details'>>;
      user_blocks: ExtraTable<Block, Pick<Block, 'blocker_id' | 'blocked_id'>>;
      event_participants: ExtraTable<Participant, Pick<Participant, 'event_listing_id' | 'user_id'>>;
    };
    Functions: Database['public']['Functions'] & {
      save_community_listing: { Args: { p_id: string | null; p_kind: PostingKind; p_title: string; p_description: string; p_city: string; p_price_cents: number; p_details: Json }; Returns: string };
      listing_participation: { Args: { p_listing_id: string; p_action: string; p_note?: string }; Returns: Json };
      review_job_application: { Args: { p_application_id: string; p_status: Database['public']['Enums']['application_status'] }; Returns: undefined };
    };
  };
};
export const postingKinds: Record<PostingCategory, PostingKind> = {
  Housing: 'housing', Marketplace: 'marketplace', Trips: 'trip', Jobs: 'job', Events: 'event', Posts: 'post',
};
