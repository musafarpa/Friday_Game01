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
  min_questions_per_topic?: number; // Minimum 7 questions per topic requirement
  selected_topics?: string[]; // IDs of topics selected for this game
  topics_question_pool?: Record<
    string,
    {
      topic_id?: string;
      topic_name: string;
      questions: PoolQuestion[];
      status: 'pending' | 'generating' | 'complete' | 'incomplete' | 'failed';
      error?: string;
    }
  >;
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
  assignment_id?: string | null;
  game_id?: string;
  topic_id?: string;
  topic_category: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option?: 'A' | 'B' | 'C' | 'D'; // Hidden before reveal
  explanation?: string;
  difficulty: DifficultyLevel;
  sequence_num?: number;
  is_used?: boolean;
  created_at: string;
}

export interface PoolQuestion {
  id?: string;
  topic_id?: string;
  topic_category: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: DifficultyLevel;
  sequence_num?: number;
  is_used?: boolean;
  source?: string;
  created_at?: string;
}

export interface GameTopicProgress {
  topic_id: string;
  topic_name: string;
  required_count: number;
  current_count: number;
  status: 'pending' | 'generating' | 'complete' | 'incomplete' | 'failed';
  difficulty_counts: {
    easy: number;
    medium: number;
    hard: number;
  };
  error?: string;
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
  total_questions?: number;
  answered_questions?: number;
  current_score?: number;
  sender?: Participant;
  receiver?: Participant;
  topic?: Topic;
  question?: Question;
  questions?: Question[];
  answer?: Answer;
  answers?: Answer[];
}

export interface Answer {
  id: string;
  assignment_id: string;
  question_id: string;
  participant_id: string;
  selected_option: 'A' | 'B' | 'C' | 'D';
  is_correct?: boolean;
  question_num?: number;
  submitted_at: string;
}

export interface ChallengeData {
  assignment: Assignment;
  game: Game;
  round: GameRound & { is_revealed?: boolean };
  sender: Participant;
  receiver: Participant;
  topic: Topic;
  questions: Question[];
  question?: Question;
  answers: Answer[];
  user_answer?: Answer;
  progress?: {
    total: number;
    answered: number;
    is_completed: boolean;
    current_score: number;
  };
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

