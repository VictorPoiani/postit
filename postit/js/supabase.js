// js/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://cqhicorrkhdcjyifsrin.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxaGljb3Jya2hkY2p5aWZzcmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNDY5OTUsImV4cCI6MjEwMDkyMjk5NX0.MQsH-jDeDDhQgrJWo1KIBJ9UIsHxVliFzI5yNUPW5u8';

export const supabase = createClient(supabaseUrl, supabaseKey);