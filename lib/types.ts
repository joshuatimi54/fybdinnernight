export type Gender = "male" | "female";
export type ReviewStatus = "draft" | "pending" | "approved" | "rejected";
export type PairingStatus = "unpaired" | "paired";
export type InvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "expired"
  | "voided";
export type InvitationSource = "user" | "matchmaker";
export type ModerationStatus = "pending" | "approved" | "hidden";
export type ReportStatus = "open" | "reviewed" | "actioned" | "dismissed";

export type Prompt = { q: string; a: string };

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  gender: Gender | null;
  phone: string | null;
  email: string;
  photo_url: string | null;
  bio: string | null;
  prompts: Prompt[];
  department: string | null;
  level: string | null;
  review_status: ReviewStatus;
  rejection_reason: string | null;
  pairing_status: PairingStatus;
  active_pair_id: string | null;
  invites_sent_count: number;
  seeking_help: boolean;
  is_blocked: boolean;
  is_admin: boolean;
  created_at: string;
};

/** What discovery returns — surname, phone and email never leave the database. */
export type DiscoveryCard = {
  id: string;
  first_name: string;
  last_initial: string;
  photo_url: string | null;
  bio: string | null;
  prompts: Prompt[];
  department: string | null;
  level: string | null;
  has_pending_from_me: boolean;
};

export type Invitation = {
  id: string;
  sender_id: string;
  recipient_id: string;
  note: string;
  status: InvitationStatus;
  source: InvitationSource;
  expires_at: string;
  responded_at: string | null;
  created_at: string;
};

export type Pair = {
  id: string;
  user_a_id: string;
  user_b_id: string;
  status: "confirmed" | "dissolved";
  table_id: string | null;
  confirmed_at: string;
};

export type DinnerTable = {
  id: string;
  label: string;
  capacity: number;
  zone: string | null;
  is_open: boolean;
  notes: string | null;
  sort_order: number;
};

export type DateMessage = {
  id: string;
  pair_id: string;
  author_id: string;
  body: string;
  share_consent: boolean;
  anonymise: boolean;
  moderation_status: ModerationStatus;
  created_at: string;
};

export type Pass = {
  id: string;
  pair_id: string;
  code: string;
  checked_in_a_at: string | null;
  checked_in_b_at: string | null;
  issued_at: string;
};

export type EventConfig = {
  event_name: string;
  event_starts_at: string | null;
  venue: string | null;
  dress_code: string | null;
  registration_open: boolean;
  discovery_open: boolean;
  seat_selection_enabled: boolean;
  require_photo: boolean;
  max_lifetime_invites: number;
  max_outstanding_invites: number;
  invite_expiry_hours: number;
  /** The love-note gate: you cannot ask anyone without writing this much. */
  min_love_note_length: number;
  max_love_note_length: number;
  show_guest_wall: boolean;
  pairing_deadline: string | null;
  total_seats: number;
  hashtag: string;
  social_handle: string;
};

export type PublicStats = {
  registered: number;
  pairs: number;
  seats_taken: number;
  total_seats: number;
  seats_left: number;
  event_name: string;
  event_starts_at: string | null;
  venue: string | null;
  dress_code: string | null;
  registration_open: boolean;
  discovery_open: boolean;
  pairing_deadline: string | null;
  hashtag: string;
  social_handle: string;
};

export type WallPair = {
  pair_id: string;
  name_a: string;
  name_b: string;
  photo_a: string | null;
  photo_b: string | null;
  confirmed_at: string;
};

/** The three questions that make discovery about what someone wrote. */
export const PROMPT_QUESTIONS = [
  "My ideal table conversation is…",
  "The one song that gets me on the floor…",
  "I'm the friend who always…",
  "The way to my heart at dinner is…",
  "Something that always makes me laugh…",
  "If you sit with me, expect…",
] as const;
