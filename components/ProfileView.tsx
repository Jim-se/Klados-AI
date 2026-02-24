import React from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

export const goPro = () => {
  window.location.href = "https://buy.stripe.com/test_00wcN5bYu8Ky3TH0qLgA800";
};

export const handleLogout = async () => {
  if (confirm("Are you sure you want to log out?")) {
    await supabase.auth.signOut();
  }
};

interface ProfileViewProps {
  fullName: string | null;
  email: string | null;
  createdAt: string | null;
  onBack: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ fullName, email, createdAt }) => {
  const navigate = useNavigate();

  return (
    <div className="w-full h-screen bg-black flex items-center justify-center">
      <div className="w-full max-w-2xl px-8">
        <button
          onClick={() => navigate('/')}
          className="mb-8 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-semibold">Back</span>
        </button>

        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 space-y-8">
          {/* Header */}
          <div className="flex items-center gap-6">
            <div className="h-24 w-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-3xl shadow-inner">
              {fullName?.charAt(0) || 'U'}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{fullName || 'User'}</h1>
              <p className="text-zinc-400 mt-1">Profile Settings</p>
            </div>
          </div>

          {/* Profile Info */}
          <div className="space-y-4">
            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 block mb-2">
                Email
              </label>
              <p className="text-white">{email || 'No email provided'}</p>
            </div>

            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 block mb-2">
                Plan
              </label>
              <p className="text-white">Free Plan</p>
            </div>

            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 block mb-2">
                Member Since
              </label>
              <p className="text-white">
                {createdAt ? new Date(createdAt).toLocaleDateString() : 'Loading...'}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4 border-t border-zinc-800">
            <button onClick={goPro}
              className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors">
              Upgrade to Pro
            </button>
            <button onClick={handleLogout}
              className="flex-1 py-3 px-4 bg-red-600/10 hover:bg-red-600/20 text-red-400 font-semibold rounded-xl transition-colors border border-red-600/30">
              Log Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
