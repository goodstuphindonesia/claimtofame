import { ArrowDown, CheckCircle2, ClipboardCheck, Download, LogIn, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { useState } from 'react';

export default function AuthGate({ supabase, configError }) {
  const [previewRole, setPreviewRole] = useState('employee');

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
            <PreviewTab icon={<UserRound size={18} />} active={previewRole === 'employee'} onClick={() => setPreviewRole('employee')} title="Employee" />
            <PreviewTab icon={<ClipboardCheck size={18} />} active={previewRole === 'manager'} onClick={() => setPreviewRole('manager')} title="Manager" />
            <PreviewTab icon={<ShieldCheck size={18} />} active={previewRole === 'admin'} onClick={() => setPreviewRole('admin')} title="Super Admin" />
          </div>
          <PreviewWorkspace role={previewRole} />
        </section>
      </div>
    </main>
  );
}

function PreviewTab({ icon, title, active, onClick }) {
  return (
    <button className={`preview-tab ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      {icon}
      {title}
    </button>
  );
}

function PreviewWorkspace({ role }) {
  if (role === 'manager') return <ManagerPreview />;
  if (role === 'admin') return <AdminPreview />;
  return <EmployeePreview />;
}

function EmployeePreview() {
  return (
    <div className="preview-workspace">
      <div className="preview-topbar">
        <div><p>Employee</p><h3>Submit a Claim</h3></div>
        <span className="status-chip warning">Draft</span>
      </div>
      <div className="preview-form-grid">
        <label>Title<input value="Client shoot transport" readOnly /></label>
        <label>Category<input value="Transport" readOnly /></label>
        <label>Amount<input value="SGD 42.00" readOnly /></label>
        <label>Job No.<input value="GS-2408" readOnly /></label>
        <label className="wide">Business purpose<textarea value="Taxi to location recce with production team." readOnly /></label>
      </div>
      <div className="preview-claim-row">
        <div><strong>Meals after edit session</strong><span>Needs Changes · Receipt attached</span></div>
        <button className="secondary-button" type="button">Edit</button>
      </div>
    </div>
  );
}

function ManagerPreview() {
  return (
    <div className="preview-workspace">
      <div className="preview-topbar">
        <div><p>Manager</p><h3>Approval Queue</h3></div>
        <span className="status-chip">3 waiting</span>
      </div>
      {['Production props', 'Courier to client', 'Software subscription'].map((title, index) => (
        <div className="preview-claim-row" key={title}>
          <div><strong>{title}</strong><span>{index === 0 ? 'SGD 180.00' : index === 1 ? 'IDR 95,000' : 'USD 24.00'} · Receipt ready</span></div>
          <div className="preview-actions">
            <button className="primary-button" type="button"><CheckCircle2 size={15} /> Approve</button>
            <button className="danger-button" type="button"><XCircle size={15} /> Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminPreview() {
  return (
    <div className="preview-workspace">
      <div className="preview-topbar">
        <div><p>Super Admin</p><h3>Final Approval</h3></div>
        <button className="primary-button" type="button"><Download size={16} /> Export</button>
      </div>
      <div className="preview-metrics">
        <article><p>Admin Approved</p><strong>18</strong></article>
        <article><p>Paid</p><strong>11</strong></article>
        <article><p>Pending</p><strong>7</strong></article>
      </div>
      <div className="preview-claim-row">
        <div><strong>Media buy reimbursement</strong><span>Manager approved · Awaiting final approval</span></div>
        <button className="primary-button" type="button">Final Approve</button>
      </div>
    </div>
  );
}
