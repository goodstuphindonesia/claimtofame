import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileText,
  Filter,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Upload,
  XCircle,
} from 'lucide-react';
import AuthGate from './components/AuthGate.jsx';
import StatusPill from './components/StatusPill.jsx';
import {
  ACCEPTED_RECEIPT_TYPES,
  CURRENCIES,
  MAX_FILE_SIZE,
  ROLES,
  STATUS_LABELS,
} from './lib/constants.js';
import { formatDate, formatMoney, monthValue } from './lib/format.js';
import { getSupabaseClient } from './lib/supabase.js';

const emptyClaim = {
  category_id: '',
  vendor_name: '',
  amount: '',
  currency: 'IDR',
  incurred_date: '',
  job_no: '',
  business_purpose: '',
  saveMode: 'submitted',
};

export default function App() {
  return <ClaimApp />;
}

function ClaimApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [claims, setClaims] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeView, setActiveView] = useState('claims');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [supabase, setSupabase] = useState(null);
  const [configError, setConfigError] = useState('');

  useEffect(() => {
    let subscription;

    getSupabaseClient()
      .then((client) => {
        setSupabase(client);
        client.auth.getSession().then(({ data }) => {
          setSession(data.session);
        });

        const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
          setSession(nextSession);
        });

        subscription = listener.subscription;
      })
      .catch((error) => {
        setConfigError(error.message);
        setLoading(false);
      });

    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setProfile(null);
      setClaims([]);
      setLoading(false);
      return;
    }

    bootstrap();
  }, [supabase, session?.user?.id]);

  async function bootstrap() {
    setLoading(true);
    const email = session.user.email || '';
    if (!email.endsWith('@goodstuph.org')) {
      await supabase.auth.signOut();
      setMessage('Only GOODSTUPH email addresses can access Claim to Fame.');
      setLoading(false);
      return;
    }

    const { data: currentProfile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (error || !currentProfile?.is_active) {
      setMessage('Your account is not active yet. Ask a Super Admin to add you.');
      setLoading(false);
      return;
    }

    setProfile(currentProfile);
    await Promise.all([loadCategories(), loadUsers(), loadClaims(currentProfile), loadAudit()]);
    setLoading(false);
  }

  async function loadCategories() {
    const { data } = await supabase.from('claim_categories').select('*').order('name');
    setCategories(data || []);
  }

  async function loadUsers() {
    const { data } = await supabase.from('profiles').select('*').order('full_name');
    setUsers(data || []);
  }

  async function loadAudit() {
    const { data } = await supabase
      .from('audit_logs')
      .select('*, actor:profiles!audit_logs_actor_id_fkey(full_name,email)')
      .order('created_at', { ascending: false })
      .limit(100);
    setAuditLogs(data || []);
  }

  async function loadClaims(currentProfile = profile) {
    if (!currentProfile) return;

    const query = supabase
      .from('claims')
      .select(`
        *,
        claimant:profiles!claims_claimant_id_fkey(full_name,email,manager_id,role),
        manager:profiles!claims_manager_id_fkey(full_name,email),
        category:claim_categories(name),
        receipts:claim_receipts(id,file_name,file_path,file_size,content_type),
        events:approval_events(id,action,comment,created_at,actor:profiles(full_name,email))
      `)
      .order('created_at', { ascending: false });

    const { data } = await query;
    setClaims(data || []);
  }

  async function refresh() {
    await Promise.all([loadCategories(), loadUsers(), loadClaims(), loadAudit()]);
  }

  if (!session || !profile) {
    if (loading) return <LoadingScreen />;
    return (
      <>
        <AuthGate supabase={supabase} configError={configError} />
        {message && <div className="toast">{message}</div>}
      </>
    );
  }

  const isManager = profile.role === 'manager' || profile.role === 'super_admin';
  const isSuperAdmin = profile.role === 'super_admin';

  const visibleClaims = claims.filter((claim) => {
    if (isSuperAdmin) return true;
    if (claim.claimant_id === profile.id) return true;
    return isManager && claim.manager_id === profile.id && claim.status === 'submitted';
  });

  const managerQueue = visibleClaims.filter(
    (claim) => claim.manager_id === profile.id && claim.status === 'submitted'
  );
  const adminQueue = isSuperAdmin ? claims.filter((claim) => claim.status === 'manager_approved') : [];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/claimtofame-logo.png" alt="Claim to Fame" />
          <div>
            <p>GOODSTUPH</p>
            <h1>Claim to Fame</h1>
          </div>
        </div>
        <nav>
          <button className={activeView === 'claims' ? 'active' : ''} onClick={() => setActiveView('claims')}>
            <FileText size={18} /> Claims
          </button>
          {isManager && (
            <button className={activeView === 'approvals' ? 'active' : ''} onClick={() => setActiveView('approvals')}>
              <CheckCircle2 size={18} /> Approvals
            </button>
          )}
          {isSuperAdmin && (
            <button className={activeView === 'reports' ? 'active' : ''} onClick={() => setActiveView('reports')}>
              <Download size={18} /> Reports
            </button>
          )}
          {isSuperAdmin && (
            <button className={activeView === 'settings' ? 'active' : ''} onClick={() => setActiveView('settings')}>
              <Settings size={18} /> Settings
            </button>
          )}
        </nav>
        <button className="ghost-button" onClick={() => supabase.auth.signOut()}>
          <LogOut size={18} /> Sign out
        </button>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p>{ROLES[profile.role]}</p>
            <h2>{profile.full_name || profile.email}</h2>
          </div>
          <div className="topbar-actions">
            <span className="rank-badge"><Sparkles size={15} /> Claim Crew</span>
            <button className="icon-button" onClick={refresh} aria-label="Refresh">
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {activeView === 'claims' && (
          <ClaimsView
            supabase={supabase}
            profile={profile}
            categories={categories}
            claims={visibleClaims}
            users={users}
            onChanged={refresh}
            isSuperAdmin={isSuperAdmin}
          />
        )}
        {activeView === 'approvals' && (
          <ApprovalsView
            supabase={supabase}
            profile={profile}
            managerQueue={managerQueue}
            adminQueue={adminQueue}
            onChanged={refresh}
            isSuperAdmin={isSuperAdmin}
          />
        )}
        {activeView === 'reports' && isSuperAdmin && <ReportsView supabase={supabase} claims={claims} auditLogs={auditLogs} />}
        {activeView === 'settings' && isSuperAdmin && (
          <SettingsView supabase={supabase} users={users} categories={categories} onChanged={refresh} />
        )}
      </main>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="auth-shell">
      <section className="auth-panel compact">
        <img src="/claimtofame-logo.png" alt="" className="auth-logo" />
        <p>Loading Claim to Fame...</p>
      </section>
    </main>
  );
}

function ClaimsView({ supabase, profile, categories, claims, users, onChanged, isSuperAdmin }) {
  const [form, setForm] = useState(emptyClaim);
  const [files, setFiles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({ search: '', status: '', category: '', month: '' });
  const [formError, setFormError] = useState('');
  const [selectedDraftIds, setSelectedDraftIds] = useState([]);

  const filtered = claims.filter((claim) => {
    const haystack = `${claim.title} ${claim.vendor_name} ${claim.job_no} ${claim.claimant?.full_name}`.toLowerCase();
    const matchesSearch = haystack.includes(filters.search.toLowerCase());
    const matchesStatus = !filters.status || claim.status === filters.status;
    const matchesCategory = !filters.category || claim.category_id === filters.category;
    const matchesMonth = !filters.month || claim.incurred_date?.startsWith(filters.month);
    return matchesSearch && matchesStatus && matchesCategory && matchesMonth;
  });
  const ownClaims = claims.filter((claim) => claim.claimant_id === profile.id);
  const bulkDraftClaims = filtered.filter((claim) => claim.status === 'draft' && (isSuperAdmin || claim.claimant_id === profile.id));
  const selectedDraftClaims = bulkDraftClaims.filter((claim) => selectedDraftIds.includes(claim.id));
  const filteredHistory = filtered.filter((claim) => !bulkDraftClaims.some((draft) => draft.id === claim.id));

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submissionRoute(claim = null) {
    const claimantIsManager = claim ? claim.claimant?.role === 'manager' : profile.role === 'manager';
    return {
      status: claimantIsManager ? 'manager_approved' : 'submitted',
      managerId: claimantIsManager ? null : claim?.manager_id || claim?.claimant?.manager_id || profile.manager_id || null,
      eventComment: claimantIsManager ? 'Manager claim routed to Super Admin' : null,
    };
  }

  function titleFromClaimForm() {
    const category = categories.find((item) => item.id === form.category_id)?.name || 'Claim';
    return `${category} - ${form.vendor_name || form.job_no || 'Untitled'}`;
  }

  function validateFiles(nextFiles) {
    const valid = [];
    for (const file of nextFiles) {
      if (!ACCEPTED_RECEIPT_TYPES.includes(file.type)) {
        alert(`${file.name} is not an allowed file type.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name} is larger than 5 MB.`);
        continue;
      }
      valid.push(file);
    }
    setFiles(valid);
  }

  async function submitClaim(event) {
    event.preventDefault();
    setFormError('');
    if (!editing && files.length === 0) {
      setFormError('Please upload at least one receipt or invoice.');
      return;
    }

    const route = submissionRoute();
    const saveMode = event.nativeEvent.submitter?.value || 'submitted';
    const status = saveMode === 'draft' ? 'draft' : route.status;

    if (status !== 'draft' && !confirm('Submit this claim for approval? You will not be able to edit it unless it is returned as Needs Changes.')) {
      return;
    }

    const payload = {
      title: titleFromClaimForm(),
      category_id: form.category_id,
      vendor_name: form.vendor_name,
      amount: Number(form.amount),
      currency: form.currency,
      incurred_date: form.incurred_date,
      job_no: form.job_no,
      business_purpose: form.business_purpose,
      notes: null,
      status,
      manager_id: route.managerId,
    };

    let claimId = editing?.id;
    if (editing) {
      const { error: updateError } = await supabase.from('claims').update(payload).eq('id', editing.id);
      if (updateError) {
        setFormError(updateError.message);
        return;
      }
      const { error: eventError } = await supabase.from('approval_events').insert({
        claim_id: editing.id,
        actor_id: profile.id,
        action: 'edited',
        comment: 'Claim details updated',
      });
      if (eventError) {
        setFormError(eventError.message);
        return;
      }
    } else {
      const { data, error } = await supabase.from('claims').insert(payload).select('id').single();
      if (error) {
        setFormError(error.message);
        return;
      }
      claimId = data.id;
      const { error: eventError } = await supabase.from('approval_events').insert({
        claim_id: claimId,
        actor_id: profile.id,
        action: status === 'draft' ? 'draft_created' : 'submitted',
        comment: status === route.status ? route.eventComment : null,
      });
      if (eventError) {
        setFormError(eventError.message);
        return;
      }
    }

    for (const file of files) {
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const path = `${profile.id}/${claimId}/${Date.now()}-${cleanName}`;
      const uploaded = await supabase.storage.from('claim-receipts').upload(path, file);
      if (uploaded.error) {
        setFormError(uploaded.error.message);
        return;
      }

      const { error: receiptError } = await supabase.from('claim_receipts').insert({
        claim_id: claimId,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        content_type: file.type,
      });
      if (receiptError) {
        setFormError(receiptError.message);
        return;
      }
    }

    setForm(emptyClaim);
    setFiles([]);
    setEditing(null);
    onChanged();
  }

  function editClaim(claim) {
    setEditing(claim);
    setForm({
      category_id: claim.category_id,
      vendor_name: claim.vendor_name,
      amount: claim.amount,
      currency: claim.currency,
      incurred_date: claim.incurred_date,
      job_no: claim.job_no,
      business_purpose: claim.business_purpose,
      saveMode: claim.status === 'draft' ? 'draft' : 'submitted',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleDraftSelection(claimId) {
    setSelectedDraftIds((current) =>
      current.includes(claimId) ? current.filter((id) => id !== claimId) : [...current, claimId]
    );
  }

  function selectAllDrafts() {
    setSelectedDraftIds(bulkDraftClaims.map((claim) => claim.id));
  }

  function clearDraftSelection() {
    setSelectedDraftIds([]);
  }

  async function submitDraftClaims(drafts) {
    if (!drafts.length) return;
    const label = drafts.length === 1 ? 'this draft claim' : `${drafts.length} draft claims`;
    if (!confirm(`Submit ${label} for approval? You will not be able to edit submitted claims unless they are returned as Needs Changes.`)) {
      return;
    }

    setFormError('');

    for (const claim of drafts) {
      const route = submissionRoute(claim);
      let updateQuery = supabase
        .from('claims')
        .update({ status: route.status, manager_id: route.managerId })
        .eq('id', claim.id)
        .eq('status', 'draft');

      if (!isSuperAdmin) {
        updateQuery = updateQuery.eq('claimant_id', profile.id);
      }

      const { error: updateError } = await updateQuery;

      if (updateError) {
        setFormError(updateError.message);
        return;
      }

      const { error: eventError } = await supabase.from('approval_events').insert({
        claim_id: claim.id,
        actor_id: profile.id,
        action: 'submitted',
        comment: route.eventComment || (isSuperAdmin && claim.claimant_id !== profile.id ? 'Draft submitted by Super Admin' : null),
      });

      if (eventError) {
        setFormError(eventError.message);
        return;
      }
    }

    setSelectedDraftIds([]);
    onChanged();
  }

  async function cancelDraft(claim) {
    await supabase.from('claims').update({ status: 'cancelled' }).eq('id', claim.id);
    await supabase.from('approval_events').insert({
      claim_id: claim.id,
      actor_id: profile.id,
      action: 'cancelled',
      comment: 'Draft cancelled by claimant',
    });
    onChanged();
  }

  async function deleteClaim(claim) {
    if (!confirm('Permanently delete this claim and its receipt records?')) return;
    await supabase.from('claims').delete().eq('id', claim.id);
    onChanged();
  }

  const canEdit = (claim) =>
    (claim.claimant_id === profile.id && ['draft', 'needs_changes'].includes(claim.status))
    || (isSuperAdmin && claim.claimant_id !== profile.id && claim.status !== 'paid');

  async function markPaid(claim) {
    const comment = prompt('Comment optional:') || '';
    await supabase.from('claims').update({ status: 'paid' }).eq('id', claim.id);
    await supabase.from('approval_events').insert({
      claim_id: claim.id,
      actor_id: profile.id,
      action: 'paid',
      comment: comment || null,
    });
    onChanged();
  }

  return (
    <section className="view-stack">
      <ClaimQuestPanel claims={ownClaims} />
      <form className="claim-form" onSubmit={submitClaim}>
        <div className="section-heading">
          <div>
            <p>New claim</p>
            <h3>{editing ? 'Edit Claim' : 'Submit a Claim'}</h3>
          </div>
          {editing && <button type="button" className="ghost-button" onClick={() => setEditing(null)}>Cancel edit</button>}
        </div>
        <div className="help-panel">
          <strong>Before you submit</strong>
          <span>Use one form per claim item. Add the vendor or merchant, Job No., business purpose, amount, date, and at least one receipt. Save Draft keeps it editable; Submit sends it for approval and locks your edits unless it is returned as Needs Changes.</span>
        </div>
        <div className="form-grid">
          <label>
            Category
            <select required value={form.category_id} onChange={(e) => updateField('category_id', e.target.value)}>
              <option value="">Select category</option>
              {categories.filter((item) => item.is_active).map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label>
            Vendor / Merchant
            <input required value={form.vendor_name} onChange={(e) => updateField('vendor_name', e.target.value)} />
          </label>
          <label>
            Amount
            <input required min="0" step="0.01" type="number" value={form.amount} onChange={(e) => updateField('amount', e.target.value)} />
          </label>
          <label>
            Currency
            <select required value={form.currency} onChange={(e) => updateField('currency', e.target.value)}>
              {CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}
            </select>
          </label>
          <label>
            Date incurred
            <input required type="date" value={form.incurred_date} onChange={(e) => updateField('incurred_date', e.target.value)} />
          </label>
          <label>
            Job No.
            <input required value={form.job_no} onChange={(e) => updateField('job_no', e.target.value)} />
          </label>
          <label className="wide">
            Business purpose
            <textarea required value={form.business_purpose} onChange={(e) => updateField('business_purpose', e.target.value)} />
          </label>
          <label className="upload-box wide">
            <Upload size={18} />
            Receipt / invoice files
            <input multiple type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif" onChange={(e) => validateFiles(Array.from(e.target.files || []))} />
            <span>{files.length ? `${files.length} selected` : editing ? 'Optional when editing' : 'PDF, JPG, PNG, HEIC, max 5 MB each'}</span>
          </label>
        </div>
        <div className="button-row">
          <button type="submit" name="saveMode" value="submitted" className="primary-button">
            <CheckCircle2 size={18} /> Submit
          </button>
          <button type="submit" name="saveMode" value="draft" className="secondary-button">
            <Archive size={18} /> Save Draft
          </button>
        </div>
        {formError && <div className="notice">{formError}</div>}
      </form>

      <ClaimFilters filters={filters} setFilters={setFilters} categories={categories} />

      {bulkDraftClaims.length > 0 && (
        <section className="draft-section">
          <div className="section-heading">
            <div>
              <p>Draft submissions</p>
              <h3>Finish These Claims</h3>
            </div>
            <div className="button-row">
              <button type="button" className="secondary-button" onClick={selectAllDrafts}>
                Select All Drafts
              </button>
              <button type="button" className="secondary-button" onClick={clearDraftSelection} disabled={!selectedDraftClaims.length}>
                Clear
              </button>
              <button type="button" className="primary-button" onClick={() => submitDraftClaims(bulkDraftClaims)}>
                <CheckCircle2 size={16} /> Submit All Drafts
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!selectedDraftClaims.length}
                onClick={() => submitDraftClaims(selectedDraftClaims)}
              >
                <CheckCircle2 size={16} /> Submit Selected Drafts
              </button>
            </div>
          </div>
          <div className="draft-bulk-bar">
            <button type="button" className="secondary-button" onClick={selectAllDrafts}>
              Select All Drafts
            </button>
            <span>{selectedDraftClaims.length} of {bulkDraftClaims.length} selected</span>
            <span>Use Submit All Drafts to send the full draft stack at once.</span>
          </div>
          <div className="claim-list">
            {bulkDraftClaims.map((claim) => (
              <ClaimCard
                key={claim.id}
                claim={claim}
                canEdit={canEdit(claim)}
                onEdit={() => editClaim(claim)}
                onDelete={() => deleteClaim(claim)}
                onCancel={() => cancelDraft(claim)}
                canCancel
                canDelete={isSuperAdmin}
                canViewReceipts={isSuperAdmin}
                selectionControl={
                  <label className="draft-check">
                    <input
                      type="checkbox"
                      checked={selectedDraftIds.includes(claim.id)}
                      onChange={() => toggleDraftSelection(claim.id)}
                    />
                    Select
                  </label>
                }
                actions={
                  <button className="primary-button" onClick={() => submitDraftClaims([claim])}>
                    <CheckCircle2 size={16} /> Submit Draft
                  </button>
                }
              />
            ))}
          </div>
        </section>
      )}

      <div className="claim-list">
        {filteredHistory.map((claim) => (
          <ClaimCard
            key={claim.id}
            claim={claim}
            canEdit={canEdit(claim)}
            onEdit={() => editClaim(claim)}
            onDelete={() => deleteClaim(claim)}
            onCancel={() => cancelDraft(claim)}
            canCancel={claim.claimant_id === profile.id && claim.status === 'draft'}
            canDelete={isSuperAdmin}
            canViewReceipts={isSuperAdmin}
            actions={
              <>
                {isSuperAdmin && claim.status === 'admin_approved' && (
                  <button className="primary-button" onClick={() => markPaid(claim)}>
                    <CheckCircle2 size={16} /> Mark Paid
                  </button>
                )}
              </>
            }
          />
        ))}
      </div>
    </section>
  );
}

function ClaimQuestPanel({ claims }) {
  const submitted = claims.filter((claim) => claim.status === 'submitted').length;
  const approved = claims.filter((claim) => ['manager_approved', 'admin_approved', 'paid'].includes(claim.status)).length;
  const needsWork = claims.filter((claim) => ['draft', 'needs_changes'].includes(claim.status)).length;
  const total = claims.length;
  const completion = total ? Math.round((approved / total) * 100) : 0;

  return (
    <section className="quest-panel">
      <div className="quest-copy">
        <p>Claim board</p>
        <h3>Take back what belongs to you.</h3>
        <span>{completion}% of your claim items are approved or paid.</span>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${completion}%` }} />
        </div>
      </div>
      <div className="quest-stats">
        <QuestStat icon={<Trophy size={18} />} label="Approved" value={approved} />
        <QuestStat icon={<Target size={18} />} label="Submitted" value={submitted} />
        <QuestStat icon={<CircleDollarSign size={18} />} label="To finish" value={needsWork} />
      </div>
    </section>
  );
}

function QuestStat({ icon, label, value }) {
  return (
    <article className="quest-stat">
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
  );
}

function ClaimFilters({ filters, setFilters, categories }) {
  return (
    <div className="filters">
      <label className="search-field">
        <Search size={16} />
        <input placeholder="Search title, vendor, Job No., employee" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
      </label>
      <label>
        <Filter size={16} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>
        Category
        <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
          <option value="">All categories</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>
      <label>
        Month
        <input type="month" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })} />
      </label>
    </div>
  );
}

function ClaimCard({ claim, canEdit, onEdit, onDelete, onCancel, canCancel, canDelete, canViewReceipts = false, actions, selectionControl }) {
  return (
    <article className="claim-card">
      <div className="claim-main">
        <div>
          <p>{claim.category?.name || 'Category'}</p>
          <h3>{claim.title}</h3>
          <span>{claim.vendor_name} · Job {claim.job_no}</span>
        </div>
        <div className="claim-card-side">
          {selectionControl}
          <StatusPill status={claim.status} />
        </div>
      </div>
      <div className="claim-meta">
        <span>{formatMoney(claim.amount, claim.currency)}</span>
        <span>{formatDate(claim.incurred_date)}</span>
        <span>{claim.claimant?.full_name || claim.claimant?.email}</span>
      </div>
      <p className="purpose">{claim.business_purpose}</p>
      {claim.events?.length > 0 && (
        <details>
          <summary>History and comments</summary>
          {claim.events.map((event) => (
            <p key={event.id} className="history-line">
              <strong>{event.action}</strong> by {event.actor?.full_name || event.actor?.email || 'System'} on {formatDate(event.created_at)}
              {event.comment ? `: ${event.comment}` : ''}
            </p>
          ))}
        </details>
      )}
      <div className="button-row wrap">
        {canViewReceipts && <ReceiptLinks receipts={claim.receipts || []} />}
        {canEdit && <button className="secondary-button" onClick={onEdit}><Pencil size={16} /> Edit</button>}
        {canCancel && <button className="secondary-button" onClick={onCancel}><XCircle size={16} /> Cancel Draft</button>}
        {canDelete && <button className="danger-button" onClick={onDelete}><Trash2 size={16} /> Delete</button>}
        {actions}
      </div>
    </article>
  );
}

function ReceiptLinks({ receipts }) {
  async function openReceipt(receipt) {
    const client = await getSupabaseClient();
    const { data, error } = await client.storage.from('claim-receipts').createSignedUrl(receipt.file_path, 60);
    if (error) {
      alert(error.message);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  if (!receipts.length) return null;
  return receipts.map((receipt) => (
    <button key={receipt.id} className="secondary-button" onClick={() => openReceipt(receipt)}>
      <FileText size={16} /> {receipt.file_name}
    </button>
  ));
}

function ApprovalsView({ supabase, profile, managerQueue, adminQueue, onChanged, isSuperAdmin }) {
  const [selectedManagerClaimIds, setSelectedManagerClaimIds] = useState([]);
  const [selectedAdminClaimIds, setSelectedAdminClaimIds] = useState([]);

  const selectedManagerClaims = managerQueue.filter((claim) => selectedManagerClaimIds.includes(claim.id));
  const selectedAdminClaims = adminQueue.filter((claim) => selectedAdminClaimIds.includes(claim.id));

  async function act(claim, action, status) {
    const requiresReason = ['rejected', 'needs_changes'].includes(status);
    const comment = prompt(requiresReason ? 'Reason required:' : 'Comment optional:') || '';
    if (requiresReason && !comment.trim()) return;

    await supabase.from('claims').update({ status }).eq('id', claim.id);
    await supabase.from('approval_events').insert({
      claim_id: claim.id,
      actor_id: profile.id,
      action,
      comment: comment || null,
    });
    onChanged();
  }

  function toggleSelection(queue, claimId) {
    const setSelected = queue === 'manager' ? setSelectedManagerClaimIds : setSelectedAdminClaimIds;
    setSelected((current) =>
      current.includes(claimId) ? current.filter((id) => id !== claimId) : [...current, claimId]
    );
  }

  function selectQueue(queue, checked) {
    if (queue === 'manager') {
      setSelectedManagerClaimIds(checked ? managerQueue.map((claim) => claim.id) : []);
      return;
    }
    setSelectedAdminClaimIds(checked ? adminQueue.map((claim) => claim.id) : []);
  }

  async function bulkApprove(claimsToApprove, action, status, queue) {
    if (!claimsToApprove.length) return;
    const label = claimsToApprove.length === 1 ? 'this claim' : `${claimsToApprove.length} claims`;
    if (!confirm(`Approve ${label}?`)) return;

    for (const claim of claimsToApprove) {
      const { error: updateError } = await supabase.from('claims').update({ status }).eq('id', claim.id);
      if (updateError) {
        alert(updateError.message);
        return;
      }

      const { error: eventError } = await supabase.from('approval_events').insert({
        claim_id: claim.id,
        actor_id: profile.id,
        action,
        comment: claimsToApprove.length > 1 ? 'Bulk approved' : null,
      });

      if (eventError) {
        alert(eventError.message);
        return;
      }
    }

    if (queue === 'manager') {
      setSelectedManagerClaimIds([]);
    } else {
      setSelectedAdminClaimIds([]);
    }
    onChanged();
  }

  const managerActions = (claim) => (
    <>
      <button className="primary-button" onClick={() => act(claim, 'manager_approved', 'manager_approved')}><CheckCircle2 size={16} /> Approve</button>
      <button className="secondary-button" onClick={() => act(claim, 'needs_changes', 'needs_changes')}>Needs Changes</button>
      <button className="danger-button" onClick={() => act(claim, 'rejected', 'rejected')}><XCircle size={16} /> Reject</button>
    </>
  );

  const adminActions = (claim) => (
    <>
      <button className="primary-button" onClick={() => act(claim, 'admin_approved', 'admin_approved')}><CheckCircle2 size={16} /> Final Approve</button>
      <button className="secondary-button" onClick={() => act(claim, 'needs_changes', 'needs_changes')}>Needs Changes</button>
      <button className="danger-button" onClick={() => act(claim, 'rejected', 'rejected')}><XCircle size={16} /> Reject</button>
    </>
  );

  return (
    <section className="view-stack">
      <div className="section-heading"><div><p>Manager queue</p><h3>Claims Waiting for You</h3></div></div>
      {managerQueue.length > 0 && (
        <div className="approval-bulk-bar">
          <label className="draft-check">
            <input
              type="checkbox"
              checked={selectedManagerClaims.length === managerQueue.length}
              onChange={(event) => selectQueue('manager', event.target.checked)}
            />
            Select all manager approvals
          </label>
          <span>{selectedManagerClaims.length} of {managerQueue.length} selected</span>
          <button
            type="button"
            className="primary-button"
            disabled={!selectedManagerClaims.length}
            onClick={() => bulkApprove(selectedManagerClaims, 'manager_approved', 'manager_approved', 'manager')}
          >
            <CheckCircle2 size={16} /> Bulk Approve
          </button>
        </div>
      )}
      <div className="claim-list">
        {managerQueue.map((claim) => (
          <ClaimCard
            key={claim.id}
            claim={claim}
            canViewReceipts
            selectionControl={
              <label className="draft-check">
                <input
                  type="checkbox"
                  checked={selectedManagerClaimIds.includes(claim.id)}
                  onChange={() => toggleSelection('manager', claim.id)}
                />
                Select
              </label>
            }
            actions={managerActions(claim)}
          />
        ))}
        {!managerQueue.length && <EmptyState text="No manager approvals waiting." />}
      </div>

      {isSuperAdmin && (
        <>
          <div className="section-heading"><div><p>Super Admin queue</p><h3>Final Approval</h3></div></div>
          {adminQueue.length > 0 && (
            <div className="approval-bulk-bar">
              <label className="draft-check">
                <input
                  type="checkbox"
                  checked={selectedAdminClaims.length === adminQueue.length}
                  onChange={(event) => selectQueue('admin', event.target.checked)}
                />
                Select all final approvals
              </label>
              <span>{selectedAdminClaims.length} of {adminQueue.length} selected</span>
              <button
                type="button"
                className="primary-button"
                disabled={!selectedAdminClaims.length}
                onClick={() => bulkApprove(selectedAdminClaims, 'admin_approved', 'admin_approved', 'admin')}
              >
                <CheckCircle2 size={16} /> Bulk Final Approve
              </button>
            </div>
          )}
          <div className="claim-list">
            {adminQueue.map((claim) => (
              <ClaimCard
                key={claim.id}
                claim={claim}
                canViewReceipts
                selectionControl={
                  <label className="draft-check">
                    <input
                      type="checkbox"
                      checked={selectedAdminClaimIds.includes(claim.id)}
                      onChange={() => toggleSelection('admin', claim.id)}
                    />
                    Select
                  </label>
                }
                actions={adminActions(claim)}
              />
            ))}
            {!adminQueue.length && <EmptyState text="No final approvals waiting." />}
          </div>
        </>
      )}
    </section>
  );
}

function ReportsView({ supabase, claims, auditLogs }) {
  const [month, setMonth] = useState(monthValue());
  const approvedClaims = claims.filter((claim) => claim.status === 'admin_approved');
  const paidClaims = claims.filter((claim) => claim.status === 'paid');
  const exportableClaims = claims.filter(
    (claim) => ['admin_approved', 'paid'].includes(claim.status) && claim.incurred_date?.startsWith(month)
  );
  const totals = useMemo(() => summarizeClaims(claims), [claims]);

  async function exportMonth() {
    const { data } = await supabase.auth.getSession();
    const response = await fetch(`/.netlify/functions/export-approved?month=${month}`, {
      headers: {
        Authorization: `Bearer ${data.session?.access_token || ''}`,
      },
    });
    if (!response.ok) {
      alert(await response.text());
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GOODSTUPH-approved-claims-${month}.zip`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="view-stack">
      <div className="metric-grid">
        <Metric label="Admin Approved" value={approvedClaims.length} />
        <Metric label="Paid" value={paidClaims.length} />
        <Metric label="Total Claims" value={claims.length} />
      </div>
      <div className="report-panel">
        <div className="section-heading">
          <div><p>Monthly export</p><h3>Approved Claims ZIP</h3></div>
          <div className="button-row">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <button className="primary-button" onClick={exportMonth} disabled={!exportableClaims.length}><Download size={18} /> Export</button>
          </div>
        </div>
        <p className="muted">
          {exportableClaims.length
            ? `${exportableClaims.length} admin-approved or paid claim${exportableClaims.length === 1 ? '' : 's'} will be exported for ${month}.`
            : `No admin-approved or paid claims found for ${month}. Choose another month after final approval.`}
        </p>
      </div>
      <div className="report-grid">
        {totals.map((row) => (
          <article key={row.key} className="mini-card">
            <p>{row.label}</p>
            <h3>{row.value}</h3>
          </article>
        ))}
      </div>
      <div className="report-panel">
        <div className="section-heading"><div><p>Latest activity</p><h3>Audit Log</h3></div></div>
        {auditLogs.map((log) => (
          <p key={log.id} className="history-line">
            <strong>{log.action}</strong> by {log.actor?.full_name || log.actor?.email || 'System'} on {formatDate(log.created_at)}
          </p>
        ))}
      </div>
    </section>
  );
}

function summarizeClaims(claims) {
  const byStatus = claims.reduce((acc, claim) => {
    acc[claim.status] = (acc[claim.status] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(byStatus).map(([status, count]) => ({
    key: status,
    label: STATUS_LABELS[status] || status,
    value: count,
  }));
}

function Metric({ label, value }) {
  return <article className="metric"><p>{label}</p><h3>{value}</h3></article>;
}

function SettingsView({ supabase, users, categories, onChanged }) {
  const [newCategory, setNewCategory] = useState('');
  const [invite, setInvite] = useState({ email: '', full_name: '', role: 'employee', manager_id: '' });
  const [settingsMessage, setSettingsMessage] = useState('');

  async function updateUser(user, patch) {
    setSettingsMessage('');
    const { data } = await supabase.auth.getSession();
    const response = await fetch('/.netlify/functions/invite-user', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session?.access_token || ''}`,
      },
      body: JSON.stringify({ id: user.id, patch }),
    });
    if (!response.ok) {
      setSettingsMessage(await response.text());
      return;
    }
    setSettingsMessage('User settings saved.');
    onChanged();
  }

  async function deleteUser(user) {
    if (!confirm(`Permanently delete ${user.full_name || user.email}? This removes their login account.`)) return;
    setSettingsMessage('');
    const { data } = await supabase.auth.getSession();
    const response = await fetch('/.netlify/functions/invite-user', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session?.access_token || ''}`,
      },
      body: JSON.stringify({ id: user.id }),
    });
    if (!response.ok) {
      setSettingsMessage(await response.text());
      return;
    }
    setSettingsMessage('User deleted.');
    onChanged();
  }

  async function addCategory() {
    if (!newCategory.trim()) return;
    await supabase.from('claim_categories').insert({ name: newCategory.trim() });
    setNewCategory('');
    onChanged();
  }

  async function updateCategory(category, patch) {
    await supabase.from('claim_categories').update(patch).eq('id', category.id);
    onChanged();
  }

  async function deleteCategory(category) {
    if (!confirm(`Delete "${category.name}" from claim categories?`)) return;
    setSettingsMessage('');
    const { error } = await supabase.from('claim_categories').delete().eq('id', category.id);
    if (error) {
      setSettingsMessage('This category cannot be deleted because it is already used by existing claims. You can turn it inactive instead.');
      return;
    }
    setSettingsMessage('Category deleted.');
    onChanged();
  }

  async function inviteUser(event) {
    event.preventDefault();
    const { data } = await supabase.auth.getSession();
    const response = await fetch('/.netlify/functions/invite-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session?.access_token || ''}`,
      },
      body: JSON.stringify(invite),
    });
    if (!response.ok) {
      alert(await response.text());
      return;
    }
    setInvite({ email: '', full_name: '', role: 'employee', manager_id: '' });
    onChanged();
  }

  return (
    <section className="view-stack">
      <div className="settings-grid">
        <div className="report-panel">
          <div className="section-heading"><div><p>People</p><h3>Users and Managers</h3></div></div>
          <form className="invite-form" onSubmit={inviteUser}>
            <label>
              Full name
              <input required placeholder="Full name" value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} />
            </label>
            <label className="invite-email">
              Email
              <input required type="email" placeholder="name@goodstuph.org" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </label>
            <label>
              Role
              <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                {Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              Manager
              <select value={invite.manager_id} onChange={(e) => setInvite({ ...invite, manager_id: e.target.value })}>
                <option value="">No manager</option>
                {users.filter((item) => item.role === 'manager' || item.role === 'super_admin').map((manager) => (
                  <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>
                ))}
              </select>
            </label>
            <button className="primary-button invite-submit" type="submit"><Plus size={18} /> Invite</button>
          </form>
          {settingsMessage && <div className="notice">{settingsMessage}</div>}
          {users.map((user) => (
            <div className="settings-row" key={user.id}>
              <div className="user-identity">
                <strong>{user.full_name || user.email}</strong>
                <span>{user.email}</span>
              </div>
              <select value={user.role} onChange={(e) => updateUser(user, { role: e.target.value })}>
                {Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select value={user.manager_id || ''} onChange={(e) => updateUser(user, { manager_id: e.target.value || null })}>
                <option value="">No manager</option>
                {users.filter((item) => item.role === 'manager' || item.role === 'super_admin').map((manager) => (
                  <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>
                ))}
              </select>
              <label className="toggle">
                <input type="checkbox" checked={user.is_active} onChange={(e) => updateUser(user, { is_active: e.target.checked })} />
                Active
              </label>
              <button className="danger-button" type="button" onClick={() => deleteUser(user)}><Trash2 size={16} /> Delete</button>
            </div>
          ))}
        </div>
        <div className="report-panel">
          <div className="section-heading"><div><p>Categories</p><h3>Claim Categories</h3></div></div>
          <div className="button-row">
            <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category" />
            <button className="primary-button" onClick={addCategory}><Plus size={18} /> Add</button>
          </div>
          {categories.map((category) => (
            <div className="category-row" key={category.id}>
              <input value={category.name} onChange={(e) => updateCategory(category, { name: e.target.value })} />
              <label className="toggle">
                <input type="checkbox" checked={category.is_active} onChange={(e) => updateCategory(category, { is_active: e.target.checked })} />
                Active
              </label>
              <button className="danger-button" type="button" onClick={() => deleteCategory(category)}><Trash2 size={16} /> Delete</button>
            </div>
          ))}
          <div className="notice">
            Domain: goodstuph.org · Digest: weekdays at 9:00 AM Asia/Jakarta
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}
