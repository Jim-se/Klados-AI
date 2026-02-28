import React, { useEffect, useState } from 'react';
import { supabase, initSupabase } from '../services/supabaseClient';
import { Session } from '@supabase/supabase-js';

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        await initSupabase();

        // Get initial session
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setLoading(false);

        // Listen for auth changes
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
          setSession(session);
        });

        return subscription;
      } catch (err) {
        console.error("Failed to initialize AuthProvider:", err);
      }
    };

    const initPromise = init();

    return () => {
      initPromise.then(subscription => subscription?.unsubscribe());
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-screen bg-zinc-50 items-center justify-center">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-t-2 border-blue-500 animate-spin" />
          <div className="absolute inset-0 m-auto w-8 h-8 bg-blue-500/10 rounded-full animate-pulse flex items-center justify-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return <>{children}</>;
};

const Auth: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // 1. Add state for the name
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [message, setMessage] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (mode === 'signup') {
        // 2. Pass metadata during sign up
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName, // This saves to auth.users metadata
              emailRedirectTo: `${window.location.origin}/`,
            },
          },
        });

        if (error) throw error;

        // 3. Handle the public.users table safely
        if (data.user) {
          // We use UPSERT instead of INSERT.
          // This fixes the 409 error by updating the row if the Trigger already created it.
          const { error: dbError } = await supabase
            .from('users')
            .upsert({
              id: data.user.id,
              full_name: fullName,
              // Add other fields here if needed, e.g. avatar_url: '',
            });

          if (dbError) {
            // Optional: Log this error, but don't block the user since Auth succeeded
            console.error('Error saving user details:', dbError);
          }
        }

        setMessage('Check your email for the confirmation link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-zinc-50 items-center justify-center">
      <div className="w-full max-w-md p-8 bg-white border border-zinc-200 rounded-3xl shadow-xl">
        <div className="mb-8 text-center">
          <div className="w-16 h-16 bg-zinc-50 border border-zinc-100 rounded-2xl flex items-center justify-center shadow-sm mx-auto mb-4">
            <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Klados-AI</h1>
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-400 mt-2">
            Alpha Version
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">

          {/* 4. Render Name Input only in Signup mode */}
          {mode === 'signup' && (
            <div>
              <input
                type="text"
                placeholder="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                required
              />
            </div>
          )}

          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              required
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-100 disabled:text-zinc-400 text-white font-bold rounded-xl transition-all uppercase tracking-widest text-sm shadow-sm"
          >
            {loading ? 'Loading...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
          </button>

          {message && (
            <p className="text-xs text-center text-zinc-400">{message}</p>
          )}

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setMessage(''); // Clear message on toggle
            }}
            className="w-full text-xs text-zinc-500 hover:text-blue-500 transition-colors uppercase tracking-wider"
          >
            {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
};