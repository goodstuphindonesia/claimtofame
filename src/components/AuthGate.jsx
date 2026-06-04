import { ArrowDown, ClipboardCheck, LogIn, ShieldCheck, UserRound } from 'lucide-react';

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
          <img src="/claimtofame-logo.svg" alt="Claim to Fame" className="auth-logo" />
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
          <a className="preview-link" href="#preview">
            Preview the workspace
            <ArrowDown size={16} />
          </a>
        </section>

        <section className="preview-section" id="preview">
          <div className="section-heading centered-heading">
            <div>
              <p>Preview</p>
              <h3>Three ways into the same claim flow.</h3>
            </div>
          </div>
          <div className="preview-grid">
            <PreviewCard
              icon={<UserRound size={22} />}
              title="Employee"
              items={['Submit one claim item at a time', 'Save drafts before sending', 'Track status and comments']}
            />
            <PreviewCard
              icon={<ClipboardCheck size={22} />}
              title="Manager"
              items={['Review assigned claims', 'Approve, reject, or request changes', 'Open receipts for context']}
            />
            <PreviewCard
              icon={<ShieldCheck size={22} />}
              title="Super Admin"
              items={['Final approval and paid status', 'User, manager, and category settings', 'Monthly approved-claim exports']}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function PreviewCard({ icon, title, items }) {
  return (
    <article className="preview-card">
      <span>{icon}</span>
      <h3>{title}</h3>
      {items.map((item) => (
        <p key={item}>{item}</p>
      ))}
    </article>
  );
}
