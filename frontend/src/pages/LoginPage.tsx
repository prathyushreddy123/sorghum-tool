import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col sm:flex-row">
      {/* Left hero panel — full-width on mobile, half on desktop */}
      <div className="sm:w-1/2 sm:min-h-screen bg-gradient-to-br from-[#1a5e1e] via-primary to-[#43a047] text-white px-8 pt-14 pb-10 sm:pb-0 flex flex-col justify-between relative overflow-hidden">
        {/* Subtle grid/field pattern */}
        <div className="absolute inset-0 opacity-[0.07]">
          <svg className="w-full h-full" viewBox="0 0 500 600" preserveAspectRatio="none">
            {Array.from({ length: 18 }).map((_, i) => (
              <line key={i} x1="0" y1={i * 34} x2="500" y2={i * 34} stroke="white" strokeWidth="1.5" strokeDasharray="10 16" />
            ))}
            {Array.from({ length: 10 }).map((_, i) => (
              <line key={`v${i}`} x1={i * 56} y1="0" x2={i * 56} y2="600" stroke="white" strokeWidth="0.5" />
            ))}
          </svg>
        </div>

        {/* Brand mark */}
        <div className="relative z-[1]">
          <div className="w-14 h-14 mb-6 bg-white/20 rounded-2xl flex items-center justify-center">
            <svg className="w-8 h-8 text-white" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 14V7M8 7C8 7 6.5 5.5 5 6C5 7.5 6.5 8 8 7ZM8 7C8 7 9.5 5.5 11 6C11 7.5 9.5 8 8 7ZM8 10.5C8 10.5 6.5 9 5 9.5C5 11 6.5 11.5 8 10.5ZM8 10.5C8 10.5 9.5 9 11 9.5C11 11 9.5 11.5 8 10.5Z" />
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight leading-tight">FieldScout</h1>
          <p className="text-white/75 text-base mt-3 leading-relaxed max-w-[280px]">
            Smart field phenotyping for modern plant breeding research
          </p>
        </div>

        {/* Feature list — desktop only */}
        <div className="hidden sm:block relative z-[1] pb-14">
          <div className="space-y-5">
            {[
              { icon: '📱', title: 'Mobile-first design', desc: 'Built for the field — readable in bright sunlight, works with gloves' },
              { icon: '📡', title: 'Works offline', desc: 'Collect data anywhere. Observations sync automatically when back online' },
              { icon: '🤖', title: 'AI-assisted scoring', desc: 'Snap a photo and let AI suggest the disease severity score' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center text-lg flex-shrink-0">{icon}</div>
                <div>
                  <div className="font-semibold text-sm">{title}</div>
                  <div className="text-white/55 text-xs mt-0.5 leading-relaxed">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 sm:py-0">
        <div className="w-full max-w-sm">
          {/* Mobile-only mini feature row */}
          <div className="sm:hidden flex justify-center gap-8 mb-8">
            {[
              { icon: '📱', label: 'Mobile-first' },
              { icon: '📡', label: 'Offline' },
              { icon: '🤖', label: 'AI-powered' },
            ].map(({ icon, label }) => (
              <div key={label} className="text-center">
                <div className="text-2xl mb-1">{icon}</div>
                <div className="text-[11px] text-gray-400 font-semibold tracking-wide uppercase">{label}</div>
              </div>
            ))}
          </div>

          <h2 className="text-2xl font-bold text-neutral mb-1">
            {isRegister ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {isRegister ? 'Start collecting field data in minutes' : 'Sign in to continue your trials'}
          </p>

          <div className="bg-card rounded-2xl shadow-lg border border-gray-100 p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <div>
                  <label className="block text-sm font-semibold text-neutral mb-1.5">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm min-h-[48px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    placeholder="Your name"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-neutral mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm min-h-[48px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-neutral mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm min-h-[48px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  placeholder="Min 6 characters"
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <svg className="w-4 h-4 text-error flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <p className="text-error text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-primary to-[#43a047] text-white rounded-xl font-semibold text-base min-h-[48px] disabled:opacity-50 hover:opacity-90 transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Please wait...
                  </span>
                ) : isRegister ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-gray-100 text-center">
              <button
                type="button"
                onClick={() => { setIsRegister(!isRegister); setError(''); }}
                className="text-sm text-primary font-semibold hover:text-primary-dark transition-colors"
              >
                {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
