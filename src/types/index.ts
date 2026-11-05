export type GameStatus =
  | 'draft'
  | 'registration_open'
  | 'ready'
  | 'active'
  | 'waiting_for_answers'
  | 'completed'
  | 'cancelled';

export type ParticipantStatus = 'pending' | 'joined' | 'selected' | 'completed';

export type RoundStatus = 'active' | 'waiting_answers' | 'revealed' | 'closed';

export type AssignmentStatus = 'pending' | 'opened' | 'submitted' | 'expired';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface GameSettings {
  min_participants: number;
  max_participants: number;
  questions_per_participant: number;
  points_correct: number;
  points_wrong: number;
  difficulty_distribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  reveal_mode: string;
  allow_multiple_incoming: boolean;
  submission_deadline?: string;
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
  email_or_contact?: string;
  avatar_url?: string;
  invitation_token_hash: string;
  status: ParticipantStatus;
  joined_at?: string;
  created_at: string;
  // Raw token kept in admin cache or when generated for sharing
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
  assignment_id: string;
  topic_category: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option?: 'A' | 'B' | 'C' | 'D'; // Hidden before reveal
  explanation?: string;
  difficulty: DifficultyLevel;
  created_at: string;
}

export interface Assignment {
  id: string;
  game_id: string;
  round_id: string;
  sender_id: string;
  receiver_id: string;
  topic_id: string;
  challenge_token_hash: string;
  status: AssignmentStatus;
  created_at: string;
  raw_challenge_token?: string;
  sender?: Participant;
  receiver?: Participant;
  topic?: Topic;
  question?: Question;
  answer?: Answer;
}

export interface Answer {
  id: string;
  assignment_id: string;
  question_id: string;
  participant_id: string;
  selected_option: 'A' | 'B' | 'C' | 'D';
  is_correct?: boolean;
  submitted_at: string;
}

export interface Score {
  id: string;
  game_id: string;
  round_id: string;
  participant_id: string;
  correct_answers: number;
  wrong_answers: number;
  total_points: number;
  updated_at: string;
  participant?: Participant;
}

export interface GameEvent {
  id: string;
  game_id: string;
  actor_id?: string;
  event_type: string;
  metadata?: Record<string, any>;
  created_at: string;
}

