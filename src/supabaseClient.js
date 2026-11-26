import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gbhzwcidelizaoljagwq.supabase.co';
const supabaseAnonKey = 'sb_publishable__P4D9wW85PASp9fFYuW9XQ_0W06PliX';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
