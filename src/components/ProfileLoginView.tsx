import { useEffect, useState } from 'react';
import { ArrowRight, LogIn, Trash2, UserPlus } from 'lucide-react';
import { ASSET_PATHS } from '../lib/seedData';

interface KnownAccountSummary {
  name: string;
  activityCount: number;
}

interface ProfileLoginViewProps {
  accounts: KnownAccountSummary[];
  lastAccountName?: string;
  onLogin: (accountName: string) => Promise<void> | void;
  onRequestDeleteAccount?: (accountName: string) => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AK';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function ProfileLoginView({
  accounts,
  lastAccountName = '',
  onLogin,
  onRequestDeleteAccount,
}: ProfileLoginViewProps) {
  const [nameInput, setNameInput] = useState(lastAccountName);
  const [error, setError] = useState('');
  const [avatarError, setAvatarError] = useState(false);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    setNameInput(lastAccountName);
  }, [lastAccountName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setError('Username wajib diisi untuk masuk.');
      return;
    }
    setError('');
    await onLogin(trimmed);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 gap-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {!logoError ? (
              <img
                src={ASSET_PATHS.appLogo}
                alt="Logo Timesheetly"
                referrerPolicy="no-referrer"
                onError={() => setLogoError(true)}
                className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-white object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white font-display font-bold text-base">
                TL
              </div>
            )}
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900">
                Masuk ke Timesheetly
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {accounts.length > 0
                  ? 'Pilih username tersimpan atau masukkan username baru'
                  : 'Masukkan username Anda terlebih dahulu untuk memulai'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {accounts.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-600">
                Profil Tersimpan
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                {accounts.map((acc) => (
                  <div
                    key={acc.name}
                    className="flex items-center gap-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => onLogin(acc.name)}
                      className="flex-1 min-w-0 flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 transition-colors text-left group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {!avatarError ? (
                          <img
                            src={ASSET_PATHS.profileDefault}
                            alt={acc.name}
                            referrerPolicy="no-referrer"
                            onError={() => setAvatarError(true)}
                            className="h-9 w-9 rounded-lg border border-slate-200 bg-white object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-blue-600 text-white font-display text-xs font-bold flex items-center justify-center shrink-0">
                            {getInitials(acc.name)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {acc.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {acc.activityCount} catatan aktivitas
                          </div>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 group-hover:translate-x-0.5 transition-transform shrink-0">
                        <span>Masuk</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </button>

                    {onRequestDeleteAccount && (
                      <button
                        type="button"
                        onClick={() => onRequestDeleteAccount(acc.name)}
                        title={`Hapus akun ${acc.name}`}
                        aria-label={`Hapus akun ${acc.name}`}
                        className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className={`${accounts.length > 0 ? 'pt-4 border-t border-slate-100' : ''} space-y-3`}
          >
            <label
              htmlFor="profile-login-name"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
            >
              <UserPlus className="h-3.5 w-3.5 text-slate-400" />
              <span>
                {accounts.length > 0 ? 'Masuk / Buat Username Baru' : 'Username'}
              </span>
            </label>

            {error && (
              <div className="p-2.5 rounded-lg border border-red-200 bg-red-50 text-xs font-medium text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <input
                id="profile-login-name"
                type="text"
                autoFocus={accounts.length === 0}
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Masukkan username..."
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                <LogIn className="h-4 w-4" />
                <span>Masuk</span>
              </button>
            </div>
          </form>
        </div>
      </div>
      <footer className="text-center text-xs text-slate-500">
        Copyright © {new Date().getFullYear()} by Januantara
      </footer>
    </div>
  );
}
