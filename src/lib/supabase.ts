import { createClient } from '@supabase/supabase-js';

const getEnv = () => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    return (import.meta as any).env;
  }
  const proc = (globalThis as any).process;
  if (typeof proc !== 'undefined' && proc && proc.env) {
    return proc.env;
  }
  return {};
};

const env = getEnv();

// Support both new VITE_SUPABASE_PUBLISHABLE_KEY and legacy VITE_SUPABASE_ANON_KEY
export const supabaseUrl: string = env.VITE_SUPABASE_URL || '';
export const supabasePublishableKey: string =
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '';

// Validate that credentials are valid real keys and not placeholders
const isPlaceholderKey = (key: string) =>
  !key ||
  key.includes('placeholder') ||
  key.includes('YOUR_ACTUAL') ||
  key.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabasePublishableKey &&
  supabaseUrl.startsWith('https://') &&
  !isPlaceholderKey(supabasePublishableKey) &&
  (supabasePublishableKey.startsWith('sb_publishable_') ||
   supabasePublishableKey.startsWith('eyJ') ||
   supabasePublishableKey.length > 20)
);

// Single, singleton Supabase client
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabasePublishableKey : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

/**
 * Real database connection verification.
 * Performs an actual database query against the remote Supabase PostgreSQL instance.
 */
export async function verifySupabaseConnection(): Promise<{
  connected: boolean;
  error?: string;
  latencyMs?: number;
  projectUrl?: string;
}> {
  if (!isSupabaseConfigured) {
    return {
      connected: false,
      error: 'Supabase URL or Publishable API Key is missing or contains placeholder values.',
      projectUrl: supabaseUrl || undefined,
    };
  }

  const start = Date.now();
  try {
    const { error } = await supabase.from('topics').select('id').limit(1);
    if (error) {
      return {
        connected: false,
        error: `${error.code || 'DB_ERROR'}: ${error.message}`,
        latencyMs: Date.now() - start,
        projectUrl: supabaseUrl,
      };
    }
    return {
      connected: true,
      latencyMs: Date.now() - start,
      projectUrl: supabaseUrl,
    };
  } catch (err: any) {
    return {
      connected: false,
      error: err?.message || 'Network error connecting to Supabase',
      latencyMs: Date.now() - start,
      projectUrl: supabaseUrl,
    };
  }
}
