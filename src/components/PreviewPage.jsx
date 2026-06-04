import { CheckCircle2, ClipboardCheck, Download, Home, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { useState } from 'react';

export default function PreviewPage() {
  const [previewRole, setPreviewRole] = useState('employee');

  return (
    <main className="preview-page-shell">
      <section className="preview-page">
        <header className="preview-hero">
          <a className="preview-back" href="/">
            <Home size={16} />
            Back to login
          </a>
          <img src="/claimtofame-logo.png" alt="Claim to Fame" className="auth-logo" />
          <p className="eyebrow">Preview</p>
          <h1>CLAIM TO FAME</h1>
          <span>Explore the working surfaces before you sign in.</span>
        </header>

        <div className="preview-grid">
          <PreviewTab icon={<UserRound size={18} />} active={previewRole === 'employee'} onClick={() => setPreviewRole('employee')} title="Employee" />
          <PreviewTab icon={<ClipboardCheck size={18} />} active={previewRole === 'manager'} onClick={() => setPreviewRole('manager')} title="Manager" />
          <PreviewTab icon={<ShieldCheck size={18} />} active={previewRole === 'admin'} onClick={() => setPreviewRole('admin')} title="Super Admin" />
        </div>
        <PreviewWorkspace role={previewRole} />
      </section>
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
