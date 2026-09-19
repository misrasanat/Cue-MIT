import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dutkvelgcwmczaxbdyjm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1dGt2ZWxnY3dtY3pheGJkeWptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NzUwNDcsImV4cCI6MjEwNTE1MTA0N30.ZxJcYcBIwzDFn--IaPbBJI6IEqKPXc42AOwm3C6Ftac';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
