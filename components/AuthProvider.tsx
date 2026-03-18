import React, { useEffect, useState } from 'react';
import { supabase, initSupabase } from '../services/supabaseClient';
import { Session } from '@supabase/supabase-js';

interface AuthProviderProps {
  children: React.ReactNode;
}

const getAuthRedirectUrl = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return new URL('/', window.location.origin).toString();
};

const isPublicDemoRoute = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.pathname === '/demo';
};

const syncUserRecord = async (user: any) => {
  if (!user?.id) {
    return;
  }

  try {
    const { error } = await supabase.from('users').upsert({
      id: user.id,
      email: user.email ?? null,
      full_name: user.user_metadata?.full_name ?? null,
    });

    if (error) {
      console.warn('[AUTH] Could not sync public.users record:', error.message);
    }
  } catch (err: any) {
    console.warn('[AUTH] Failed to sync user record:', err.message);
  }
};

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
    if (isPublicDemoRoute()) {
      return <>{children}</>;
    }

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

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setMessage('');
    try {
      const redirectTo = getAuthRedirectUrl();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          ...(redirectTo ? { redirectTo } : {}),
        },
      });
      if (error) throw error;
    } catch (error: any) {
      setMessage(error.message);
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const redirectTo = getAuthRedirectUrl();

      if (mode === 'signup') {
        // 2. Pass metadata during sign up
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName, // This saves to auth.users metadata
            },
            ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
          },
        });

        if (error) throw error;

        // Check if user actually got created
        if (data.user?.identities && data.user.identities.length === 0) {
          setMessage('Email already exists. Please sign in instead.');
          setLoading(false);
          return;
        }

        // 3. Handle the public.users table safely
        if (data.user) {
          await syncUserRecord({
            ...data.user,
            user_metadata: {
              ...data.user.user_metadata,
              full_name: fullName || data.user.user_metadata?.full_name,
            },
          });
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
    <div className="flex flex-col min-h-screen w-screen bg-[var(--app-bg)] items-center justify-center px-4 overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Logo/Icon Area */}
        <div className="mb-10 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg mx-auto mb-6 transform hover:rotate-12 transition-transform overflow-hidden border border-[var(--border-color)]">
            <img src="/logo.png" alt="Klados Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--app-text)] mb-2">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-sm text-[var(--app-text-muted)] font-medium">
            {mode === 'signin' ? 'Log in to your Klados-AI account' : 'Experience the next generation of AI'}
          </p>
        </div>

        <div className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
          {/* Social Sign In Buttons */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--app-text-muted)] rounded-xl text-[var(--app-text)] font-semibold transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-[var(--border-color)]"></div>
            <span className="flex-shrink mx-4 text-[10px] font-bold uppercase tracking-widest text-[var(--app-text-muted)]">OR</span>
            <div className="flex-grow border-t border-[var(--border-color)]"></div>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {mode === 'signup' && (
              <div className="relative group">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--sidebar-bg)] border border-[var(--border-color)] rounded-xl text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:border-[var(--app-text-muted)] focus:bg-[var(--card-bg)] transition-all"
                  required
                />
              </div>
            )}

            <div className="relative group">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--sidebar-bg)] border border-[var(--border-color)] rounded-xl text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:border-[var(--app-text-muted)] focus:bg-[var(--card-bg)] transition-all"
                required
              />
            </div>

            <div className="relative group">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--sidebar-bg)] border border-[var(--border-color)] rounded-xl text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:border-[var(--app-text-muted)] focus:bg-[var(--card-bg)] transition-all"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--app-text-muted)]/20 disabled:text-[var(--app-text-muted)] text-white font-bold rounded-xl transition-all active:scale-[0.98] shadow-md shadow-[var(--accent-color)]/20"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </div>
              ) : (
                mode === 'signin' ? 'Continue' : 'Agree and continue'
              )}
            </button>

            {message && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-xs text-center text-red-500 font-medium leading-relaxed">{message}</p>
              </div>
            )}
          </form>

          <div className="pt-6 text-center">
            <p className="text-sm text-[var(--app-text-muted)]">
              {mode === 'signin' ? "Don't have an account?" : "Already have an account?"}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setMessage('');
                }}
                className="ml-2 font-semibold text-[var(--accent-color)] hover:underline transition-all"
              >
                {mode === 'signin' ? 'Sign up' : 'Log in'}
              </button>
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-20 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--app-text-muted)] opacity-50">
          <span>Terms of use</span>
          <span>Privacy policy</span>
        </div>
      </div>
    </div>
  );
};
