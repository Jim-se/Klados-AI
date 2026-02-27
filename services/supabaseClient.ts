import { createClient } from '@supabase/supabase-js'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// We'll initialize with placeholders and then update once we fetch the real config.
// Or we can just use a proxy.

let realClient: any = null;

const handler = {
    get: (target: any, prop: string) => {
        if (!realClient) {
            throw new Error("Supabase client not initialized. Call initSupabase() first.");
        }
        return realClient[prop];
    }
};

/**
 * AUTH-ONLY CLIENT:
 * For a senior cybersecurity architecture, we only expose the Supabase client
 * to the frontend for AUTHENTICATION purposes. 
 * Database CRUD operations are proxied through our backend to hide the keys and URL.
 */
export const supabase = new Proxy({}, handler);

export const initSupabase = async () => {
    if (realClient) return realClient;

    // Hardcode the public anon key for auth only if needed, 
    // but the most secure way is to keep it out of the bundle.
    // For now, we will still fetch the PUBLIC ANON key from the server
    // so that the frontend can handle user sessions.

    // NOTE: We are NOT using the service_role key here.
    const res = await fetch(`${API_BASE_URL}/api/config/supabase`);
    const { url, key } = await res.json();

    realClient = createClient(url, key);
    return realClient;
};