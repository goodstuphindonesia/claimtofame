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
      <div className="auth-page">
        <section className="auth-panel">
          <img src="/claimtofame-logo.png" alt="Claim to Fame" className="auth-logo" />
          <p className="eyebrow">GOODSTUPH</p>
          <h1>CLAIM TO FAME</h1>
          <p className="auth-copy">We promise this is as painless as it gets.</p>
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
      </div>
    </main>
  );
}
