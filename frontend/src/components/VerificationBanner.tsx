import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function VerificationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  if (!user || user.email_verified || dismissed) return null;

  async function handleResend() {
    setSending(true);
    setMessage('');
    try {
      await api.resendVerification();
      setMessage('Verification email sent!');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center justify-between gap-2 text-sm">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-yellow-700 font-medium shrink-0">Verify your email</span>
        <span className="text-yellow-600 truncate hidden sm:inline">Check your inbox for a verification link</span>
        {message && <span className="text-yellow-800 font-medium">{message}</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleResend}
          disabled={sending}
          className="text-yellow-800 underline hover:text-yellow-900 disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Resend'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-yellow-500 hover:text-yellow-700 p-1"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
