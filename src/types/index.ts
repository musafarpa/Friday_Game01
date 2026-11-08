export type GameStatus =
  | 'draft'
  | 'registration_open'
  | 'ready'
  | 'active'
  | 'paused'
  | 'waiting_for_answers' // legacy – migrated to 'paused' by 20260104 migration
  | 'completed'
  | 'cancelled';

/** Lifecycle actions understood by the admin_set_game_status RPC. */
export type GameAction = 'open_registration' | 'start' | 'pause' | 'resume' | 'complete' | 'cancel';

export type ParticipantStatus = 'pending' | 'joined' | 'selected' | 'completed';

export type RoundStatus = 'active' | 'waiting_answers' | 'revealed' | 'closed';

export type AssignmentStatus = 'pending' | 'opened' | 'submitted' | 'expired';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

/** Rules stored on games.settings. The question pool is NOT stored here (it holds answers). */
export interface GameSettings {
  min_participants: number;
  max_participants: number;
  points_correct: number;
  points_wrong: number;
  questions_per_challenge?: number;
  min_questions_per_topic?: number;
  difficulty_mix?: { easy: number; medium: number; hard: number };
  reveal_mode?: string;
  allow_multiple_incoming?: boolean;
}

export interface DefaultRules {
  min_participants: number;
  max_participants: number;
  points_correct: number;
  points_wrong: number;
}

export interface Game {
  id: string;
  name: string;
  description?: string;
  game_date: string;
  status: GameStatus;
  settings: GameSettings;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Participant {
  id: string;
  game_id: string;
  display_name: string;
  player_code: string; // 'A', 'B', 'C', 'D'...
  email_or_contact?: string | null;
  avatar_url?: string | null;
  status: ParticipantStatus;
  joined_at?: string | null;
  created_at: string;
  /** Raw invitation token (admin only, from participant_secrets). Undefined for legacy rows → regenerate. */
  raw_invitation_token?: string;
}

export interface Topic {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  is_active: boolean;
  created_at: string;
}

export interface TopicStats {
  topic_id: string;
  games_using: number;
  pool_questions: number;
  challenges: number;
}

export interface GameRound {
  id: string;
  game_id: string;
  round_number: number;
  status: RoundStatus;
  deadline?: string;
  reveal_at?: string;
  created_at: string;
}

export interface Question {
  id: string;
  assignment_id?: string | null;
  game_id?: string;
  topic_id?: string;
  topic_category: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option?: 'A' | 'B' | 'C' | 'D' | null; // null until the game is completed
  explanation?: string | null;
  difficulty: DifficultyLevel;
  sequence_num?: number;
  created_at?: string;
}

/** A question as produced by the generator / saved into a game's pool. */
export interface PoolQuestion {
  topic_category: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: DifficultyLevel;
  source?: string;
}

export interface PoolTopicStatus {
  topic_id: string;
  topic_name: string;
  total: number;
  easy: number;
  medium: number;
  hard: number;
  is_complete: boolean;
}

export interface PoolStatus {
  required_per_topic: number;
  ready: boolean;
  topics: PoolTopicStatus[];
}

/** UI-facing progress record for the topic pool panel. */
export interface GameTopicProgress {
  topic_id: string;
  topic_name: string;
  required_count: number;
  current_count: number;
  status: 'pending' | 'generating' | 'complete' | 'incomplete' | 'failed';
  difficulty_counts: { easy: number; medium: number; hard: number };
  error?: string;
}

export interface Answer {
  id?: string;
  assignment_id?: string;
  question_id: string;
  participant_id?: string;
  selected_option: 'A' | 'B' | 'C' | 'D';
  is_correct?: boolean | null; // null until the game is completed
  question_num?: number;
  submitted_at?: string;
}

export interface Assignment {
  id: string;
  game_id: string;
  round_id: string;
  sender_id: string;
  receiver_id: string;
  topic_id: string;
  status: AssignmentStatus;
  created_at: string;
  total_questions: number;
  answered_questions: number;
  current_score: number;
  /** Raw challenge token (admin only, from assignment_secrets). */
  raw_challenge_token?: string;
  sender?: Pick<Participant, 'id' | 'display_name' | 'player_code'>;
  receiver?: Pick<Participant, 'id' | 'display_name' | 'player_code'>;
  topic?: Pick<Topic, 'id' | 'name'>;
  answers?: Answer[];
}

// ---------------------------------------------------------------------------------------
// Payloads returned by the participant RPCs (token based)
// ---------------------------------------------------------------------------------------
export interface PeerRef {
  id: string;
  display_name: string;
  player_code: string;
}

export interface ChallengeSummary {
  assignment_id: string;
  status: AssignmentStatus;
  raw_token: string | null;
  answered: number;
  total: number;
  topic: { id: string; name: string };
  sender?: PeerRef;
  receiver?: PeerRef;
}

export interface JoinPayload {
  participant: { id: string; display_name: string; player_code: string; status: ParticipantStatus };
  game: { id: string; name: string; description?: string; status: GameStatus; points_correct: number };
  round: { id: string; round_number: number; status: RoundStatus } | null;
  roster: PeerRef[];
  topics: Array<{ id: string; name: string; description?: string; icon?: string }>;
  outgoing: ChallengeSummary[];
  incoming: ChallengeSummary[];
  /** (friend, topic) pairs that can no longer be served (friend already got every unseen question). Absent before migration 20260105. */
  unavailable?: Array<{ receiver_id: string; topic_id: string }>;
  can_create: boolean;
}

export interface ChallengeData {
  assignment: { id: string; status: AssignmentStatus; total_questions: number; answered_questions: number };
  game: { id: string; name: string; status: GameStatus; points_correct: number };
  round: { id: string; round_number: number; status: RoundStatus; is_revealed: boolean };
  sender: PeerRef;
  receiver: PeerRef;
  topic: { id: string; name: string; icon?: string };
  questions: Question[];
  answers: Answer[];
  is_open: boolean;
  closed_reason: 'cancelled' | 'completed' | 'paused' | 'not_started' | null;
  progress: {
    total: number;
    answered: number;
    is_completed: boolean;
    current_score: number | null;
    max_score: number;
  };
}

export interface LeaderboardRow {
  participant_id: string;
  display_name: string;
  player_code: string;
  total_points: number;
  correct_answers: number;
  wrong_answers: number;
  challenges_completed: number;
  challenges_received: number;
  rank: number;
}

export interface LeaderboardPayload {
  game: { id: string; name: string; status: GameStatus; is_final: boolean };
  rows: LeaderboardRow[];
}

export interface GameEvent {
  id: string;
  game_id: string;
  actor_id?: string;
  event_type: string;
  metadata?: Record<string, any>;
  created_at: string;
}
