import { LogIn } from 'lucide-react';

export default function AuthGate({ supabase, configError }) {
  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          hd: 'goodstuph.org',
        },
      },
    });
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <img src="/goodstuph-logo.png" alt="GOODSTUPH" className="auth-logo" />
        <p className="eyebrow">GOODSTUPH</p>
        <h1>Claim to Fame</h1>
        <p className="auth-copy">Claims, approvals, receipts, and paid status in one dark little corner of order.</p>
        {configError ? (
          <div className="notice">
            Add your Supabase runtime environment variables before signing in.
          </div>
        ) : (
          <button className="primary-button" onClick={signIn}>
            <LogIn size={18} />
            Sign in with Google
          </button>
        )}
      </section>
    </main>
  );
}
