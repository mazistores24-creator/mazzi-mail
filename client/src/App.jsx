import { useEffect, useMemo, useRef, useState } from 'react';
import { AuthProvider, useAuth, ProtectedRoute } from './AuthContext';

const sampleCsv = 'email,name,opted_in,consent_source\nhello@example.com,Alex Morgan,true,Website signup\nsam@example.com,Sam Lee,true,Newsletter form\nold@example.com,Old Contact,false,Unknown';
const starterMessage = `Hi {{name}},\n\nWe have an update we thought you might find useful.\n\nYou’re receiving this because you opted in to hear from us.\n\nBest,\nMazzi Team\n\n{{unsubscribe_link}}`;
const starterHtml = `<h2>Hi {{name}},</h2><p>We have an update we thought you might find useful.</p><p>You’re receiving this because you opted in to hear from us.</p><p>Best,<br>Mazzi Team</p><p><a href="{{unsubscribe_link}}">Unsubscribe</a></p>`;
const apiBaseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const apiUrl = path => `${apiBaseUrl}${path}`;

function parseCsvObjects(text) {
  const rows = text.trim().split(/\r?\n/).map(line => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(cell => cell.trim().replace(/^"|"$/g, '').replaceAll('""', '"')));
  if (!rows.length) return [];
  const headers = rows.shift().map(value => value.toLowerCase());
  return rows.filter(row => row.some(Boolean)).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));
}

const headerAlias = (headers, aliases) => headers.find(header => aliases.includes(header.toLowerCase())) || '';
const asOptIn = value => ['true','yes','1','opted-in','subscribed'].includes(String(value || '').trim().toLowerCase());
function parseCsv(text) {
  const records = parseCsvObjects(text);
  if (!records.length) return [];
  const headers = Object.keys(records[0]);
  const mapping = { email: headerAlias(headers,['email','email_address','e-mail']), name: headerAlias(headers,['name','full_name','firstname']), optedIn: headerAlias(headers,['opted_in','consent','subscribed']), consentSource: headerAlias(headers,['consent_source','source']) };
  return records.map(row => ({ email: row[mapping.email], name: row[mapping.name] || '', optedIn: asOptIn(row[mapping.optedIn]), consentSource: row[mapping.consentSource] || '' })).filter(row => row.email);
}
function renderMessage(text, person) {
  return String(text || '').replaceAll('{{name}}', person.name || 'there').replaceAll('%FNAME%', (person.name || 'there').split(/\s+/)[0]).replaceAll('%EMAIL%', person.email || '').replaceAll('{{email}}', person.email || '').replaceAll('{{unsubscribe_link}}', '[unsubscribe link]');
}

function SignupPage({ onLoginClick }) {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setSubmitting(true);
    try {
      await register(email, password, name);
      setSuccess('Registration submitted! Waiting for admin approval.');
      setEmail(''); setPassword(''); setName('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <i className="bi bi-envelope-paper-fill"/>
          <h2>Mazzi Mail</h2>
          <p>Create your account</p>
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Name</label>
            <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} required autoComplete="name"/>
          </div>
          <div className="mb-3">
            <label className="form-label">Email</label>
            <input type="email" className="form-control" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"/>
          </div>
          <div className="mb-3">
            <label className="form-label">Password</label>
            <input type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" minLength={6}/>
            <div className="form-text">Minimum 6 characters</div>
          </div>
          <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
            {submitting ? <i className="bi bi-hourglass-split"/> : <i className="bi bi-person-plus"/>} Sign Up
          </button>
        </form>
        <div className="auth-footer">
          <p>Already have an account? <a href="#" onClick={e => { e.preventDefault(); onLoginClick(); }}>Sign in</a></p>
        </div>
      </div>
    </div>
  );
}

function LoginPage({ onSignupClick }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <i className="bi bi-envelope-paper-fill"/>
          <h2>Mazzi Mail</h2>
          <p>Sign in to your account</p>
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Email</label>
            <input type="email" className="form-control" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"/>
          </div>
          <div className="mb-3">
            <label className="form-label">Password</label>
            <input type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"/>
          </div>
          <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
            {submitting ? <i className="bi bi-hourglass-split"/> : <i className="bi bi-box-arrow-in-right"/>} Sign In
          </button>
        </form>
        <div className="auth-footer">
          <p>Don't have an account? <a href="#" onClick={e => { e.preventDefault(); onSignupClick(); }}>Sign up</a></p>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchUsers = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(apiUrl('/api/admin/users'), { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to load users');
      setUsers(await response.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleApprove = async (id) => {
    try {
      const response = await fetch(apiUrl(`/api/admin/users/${id}/approve`), { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Failed to approve');
      fetchUsers();
    } catch (err) { setError(err.message); }
  };

  const handleReject = async (id) => {
    try {
      const response = await fetch(apiUrl(`/api/admin/users/${id}/reject`), { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Failed to reject');
      fetchUsers();
    } catch (err) { setError(err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this user?')) return;
    try {
      const response = await fetch(apiUrl(`/api/admin/users/${id}`), { method: 'DELETE', credentials: 'include' });
      if (!response.ok) throw new Error('Failed to delete');
      fetchUsers();
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="admin-dashboard">
      <div className="title-line"><div><div className="overline">ADMIN</div><h1>User Management</h1><p>Approve, reject, or remove user accounts.</p></div><button className="btn btn-outline-secondary btn-sm" onClick={fetchUsers} disabled={loading}><i className="bi bi-arrow-clockwise me-1"/>Refresh</button></div>
      {error && <div className="alert alert-danger">{error}</div>}
      <section className="main-card">
        <div className="table-responsive">
          <table className="table user-management-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td><span className={`badge ${u.role === 'admin' ? 'bg-primary' : 'bg-secondary'}`}>{u.role}</span></td>
                  <td>
                    <span className={`badge ${u.status === 'approved' ? 'bg-success' : u.status === 'pending' ? 'bg-warning text-dark' : 'bg-danger'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td>{u.createdAt ? new Date(u.createdAt).toLocaleString() : '—'}</td>
                  <td>
                    <div className="btn-group btn-group-sm">
                      {u.status === 'pending' && (
                        <>
                          <button className="btn btn-success" onClick={() => handleApprove(u._id)}><i className="bi bi-check"/> Approve</button>
                          <button className="btn btn-danger" onClick={() => handleReject(u._id)}><i className="bi bi-x"/> Reject</button>
                        </>
                      )}
                      {u.status === 'approved' && u.role !== 'admin' && (
                        <button className="btn btn-outline-danger" onClick={() => handleDelete(u._id)}><i className="bi bi-trash"/></button>
                      )}
                      {u.role === 'admin' && <span className="text-muted">Protected</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && <div className="empty-list"><i className="bi bi-people"/><b>No users found</b></div>}
      </section>
    </div>
  );
}

function AppContent() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('Import');
  const [contacts, setContacts] = useState([]);
  const [importDraft, setImportDraft] = useState(null);
  const [columnMap, setColumnMap] = useState({ email: '', name: '', optedIn: '', consentSource: '', company: '' });
  const [emailFormat, setEmailFormat] = useState('Plain Text');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [view, setView] = useState('campaign');
  const [campaignHistory, setCampaignHistory] = useState([]);
  const [subject, setSubject] = useState('A quick update from Mazzi');
  const [messagePlain, setMessagePlain] = useState(starterMessage);
  const [messageHtml, setMessageHtml] = useState(starterHtml);
  const [messageAmp, setMessageAmp] = useState('');
  const [ccEmails, setCcEmails] = useState([]);
  const [bccEmails, setBccEmails] = useState([]);
  const [ccInput, setCcInput] = useState('');
  const [bccInput, setBccInput] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [senderName, setSenderName] = useState('Mazzi Team');
  const [senderEmail, setSenderEmail] = useState('hello@example.com');
  const [dailyLimit, setDailyLimit] = useState(100);
  const [batchSize, setBatchSize] = useState(50);
  const [requestDelayMs, setRequestDelayMs] = useState(1000);
  const [maxRetries, setMaxRetries] = useState(3);
  const [campaign, setCampaign] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [recipientStats, setRecipientStats] = useState({});
  const [status, setStatus] = useState('Ready');
  const [toast, setToast] = useState('');
  const [providers, setProviders] = useState([]);
  const [selectedProviderId, setSelectedProviderId] = useState(null);
  const [testMode, setTestMode] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState('inactive');
  const [licenseSent, setLicenseSent] = useState(0);
  const [licenseLimit, setLicenseLimit] = useState(30);
  const [licenseRemaining, setLicenseRemaining] = useState(0);
  const [licenseKey, setLicenseKey] = useState('');
  const [pollTimer, setPollTimer] = useState(null);
  const [showLogin, setShowLogin] = useState(true);
  const inputRef = useRef(null);
  const eligible = useMemo(() => contacts.filter(row => row.optedIn && row.email && !row.unsubscribed), [contacts]);
  const excluded = contacts.length - eligible.length;
  const counts = campaign || { total: eligible.length, success: 0, pending: eligible.length, failure: 0 };

  useEffect(() => {
    fetch(apiUrl('/api/contacts'), { credentials: 'include' }).then(response => response.ok ? response.json() : []).then(rows => {
      if (Array.isArray(rows) && rows.length) setContacts(rows.map(row => ({ ...row, id: row._id || row.id || row.email, optedIn: row.optedIn === true })));
    }).catch(() => {});
    loadProviders();
    loadLicense();
    return () => { if (pollTimer) clearInterval(pollTimer); };
  }, []);

  useEffect(() => {
    if (campaign && campaign.status === 'running') {
      const timer = setInterval(async () => {
        const stats = await loadCampaignStats(campaign._id || campaign.id);
        if (stats) {
          setCampaign(prev => prev && prev._id === campaign._id ? { ...prev, counts: stats } : prev);
          if (stats.status === 'completed' || stats.status === 'stopped') {
            clearInterval(timer);
            setStatus(stats.status === 'completed' ? 'Completed' : 'Stopped');
            setToast(`Campaign ${stats.status}.`);
          }
        }
      }, 3000);
      setPollTimer(timer);
      return () => clearInterval(timer);
    }
    return () => { if (pollTimer) clearInterval(pollTimer); };
  }, [campaign]);

  async function loadCampaignHistory() {
    try { const response = await fetch(apiUrl('/api/campaigns'), { credentials: 'include' }); if (response.ok) setCampaignHistory(await response.json()); }
    catch { setCampaignHistory([]); }
  }

  async function persistContacts(rows) {
    try {
      const response = await fetch(apiUrl('/api/contacts/import'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ contacts: rows }) });
      if (!response.ok) { const data = await response.json(); setToast(data.message || 'Contacts are loaded locally but could not be saved.'); }
    } catch { /* Local UI remains usable when the optional API is not running. */ }
  }

  async function loadProviders() {
    try {
      const response = await fetch(apiUrl('/api/providers'), { credentials: 'include' });
      if (response.ok) setProviders(await response.json());
    } catch { /* Providers optional when API unavailable. */ }
  }

  async function createProvider(provider) {
    const response = await fetch(apiUrl('/api/providers'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(provider) });
    if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'Could not save provider.'); }
    return await response.json();
  }

  async function updateProvider(id, provider) {
    const response = await fetch(apiUrl(`/api/providers/${id}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(provider) });
    if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'Could not update provider.'); }
    return await response.json();
  }

  async function deleteProvider(id) {
    const response = await fetch(apiUrl(`/api/providers/${id}`), { method: 'DELETE', credentials: 'include' });
    if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'Could not delete provider.'); }
    return await response.json();
  }

  async function testProvider(id) {
    const response = await fetch(apiUrl(`/api/providers/${id}/test`), { method: 'POST', credentials: 'include' });
    if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'Connection test failed.'); }
    return await response.json();
  }

  async function toggleProvider(id, isEnabled) {
    const response = await fetch(apiUrl(`/api/providers/${id}/toggle`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ isEnabled }) });
    if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'Could not toggle provider.'); }
    return await response.json();
  }

  async function loadLicense() {
    try {
      const response = await fetch(apiUrl('/api/license/status'), { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setLicenseStatus(data.status || 'inactive');
        setLicenseSent(data.trialEmailsSent || 0);
        setLicenseLimit(data.trialLimit || 30);
        setLicenseRemaining(data.remaining || 0);
        setLicenseKey(data.licenseKey || '');
      }
    } catch { /* License optional when API unavailable. */ }
  }

  async function activateLicense(key) {
    const response = await fetch(apiUrl('/api/license/activate'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ licenseKey: key }) });
    if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'Activation failed.'); }
    const data = await response.json();
    await loadLicense();
    return data;
  }

  async function startTrial() {
    const response = await fetch(apiUrl('/api/license/trial'), { method: 'POST', credentials: 'include' });
    if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'Trial activation failed.'); }
    const data = await response.json();
    await loadLicense();
    return data;
  }

  async function validateLicense() {
    try {
      const response = await fetch(apiUrl('/api/license/validate'), { method: 'POST', credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setLicenseStatus(data.status || 'inactive');
        return data;
      }
    } catch { /* validate optional. */ }
  }

  async function createLiveCampaign(campaignData) {
    const response = await fetch(apiUrl('/api/campaigns'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(campaignData) });
    if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'Could not create campaign.'); }
    return await response.json();
  }

  async function startCampaignApi(id) {
    const response = await fetch(apiUrl(`/api/campaigns/${id}/start`), { method: 'POST', credentials: 'include' });
    if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'Could not start campaign.'); }
    return await response.json();
  }

  async function pauseCampaignApi(id) {
    const response = await fetch(apiUrl(`/api/campaigns/${id}/pause`), { method: 'POST', credentials: 'include' });
    if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'Could not pause campaign.'); }
    return await response.json();
  }

  async function resumeCampaignApi(id) {
    const response = await fetch(apiUrl(`/api/campaigns/${id}/resume`), { method: 'POST', credentials: 'include' });
    if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'Could not resume campaign.'); }
    return await response.json();
  }

  async function stopCampaignApi(id) {
    const response = await fetch(apiUrl(`/api/campaigns/${id}/stop`), { method: 'POST', credentials: 'include' });
    if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'Could not stop campaign.'); }
    return await response.json();
  }

  async function loadCampaignStats(id) {
    try {
      const response = await fetch(apiUrl(`/api/campaigns/${id}/stats`), { credentials: 'include' });
      if (response.ok) return await response.json();
    } catch { return null; }
    return null;
  }

  async function loadCampaignRecipients(id) {
    try {
      const response = await fetch(apiUrl(`/api/campaigns/${id}/recipients`), { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setRecipients(data);
        return data;
      }
    } catch { return null; }
    return null;
  }

  async function loadSuppressionList() {
    try {
      const response = await fetch(apiUrl('/api/suppression'), { credentials: 'include' });
      if (response.ok) return await response.json();
    } catch { return []; }
    return [];
  }

  async function importFile(file) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { setToast('Please choose a CSV file.'); return; }
    try {
      const rows = parseCsvObjects(await file.text());
      if (!rows.length) { setToast('The CSV has no contact rows.'); return; }
      const headers = Object.keys(rows[0]);
      setImportDraft({ rows, headers });
      setColumnMap({ email: headerAlias(headers,['email','email_address','e-mail']), name: headerAlias(headers,['name','full_name','firstname']), optedIn: headerAlias(headers,['opted_in','consent','subscribed']), consentSource: headerAlias(headers,['consent_source','source']) });
      setToast('CSV loaded. Confirm the column mapping before importing.');
    } catch { setToast('Could not read this CSV file.'); }
  }

  async function applyImportMapping() {
    if (!importDraft || !columnMap.email) { setToast('Choose the column that contains email addresses.'); return; }
    const rows = importDraft.rows.map(row => ({ email: String(row[columnMap.email] || '').trim(), name: columnMap.name ? String(row[columnMap.name] || '').trim() : '', optedIn: columnMap.optedIn ? asOptIn(row[columnMap.optedIn]) : false, consentSource: columnMap.consentSource ? String(row[columnMap.consentSource] || '').trim() : '' }));
    const valid = rows.filter(row => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email));
    const imported = valid.map(row => ({ ...row, id: `${row.email}-${Math.random().toString(36).slice(2,7)}` }));
    setContacts(imported); await persistContacts(imported); setImportDraft(null);
    setToast(`Imported ${valid.length} contacts. ${valid.filter(row => !row.optedIn).length} are excluded because opt-in wasn’t recorded.`);
  }

  function loadSample() {
    const rows = parseCsv(sampleCsv);
    const imported = rows.map(row => ({ ...row, id: `${row.email}-${Math.random().toString(36).slice(2,7)}` }));
    setContacts(imported); persistContacts(imported);
    setToast('Sample list loaded. One contact is excluded because consent is not recorded.');
  }

  async function startCampaign() {
    if (!eligible.length) { setToast('Import contacts with opted_in=true before starting a campaign.'); setTab('Import'); return; }
    if (!subject.trim() || !messagePlain.trim()) { setToast('Add a subject and message first.'); setTab('Message'); return; }

    const isLive = !!selectedProviderId && (licenseStatus === 'active' || licenseStatus === 'trial');

    if (isLive) {
      setStatus('Creating campaign'); setTab('Configure'); setToast('Creating live campaign…');
      try {
        const created = await createLiveCampaign({
          subject, messagePlain, messageHtml, messageAmp, emailFormat,
          senderName, senderEmail, replyTo, cc: ccEmails, bcc: bccEmails,
          providerId: selectedProviderId, dailyLimit, batchSize, requestDelayMs, maxRetries,
          testMode, contacts: eligible,
        });
        setCampaign(created);
        const started = await startCampaignApi(created._id || created.id);
        setStatus('Running'); setToast('Live campaign started.');
        return;
      } catch (error) {
        setStatus('Error'); setToast(error.message);
        return;
      }
    }

    setStatus('Running preview'); setTab('Configure'); setToast('Preparing local preview…');
    try {
      const response = await fetch(apiUrl('/api/campaigns/preview'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ subject, message: messagePlain, contacts: eligible, senderName, senderEmail, replyTo, cc, bcc, emailFormat, dailyLimit }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Preview failed.');
      setCampaign(data); setStatus('Preview complete'); setToast('Preview complete. No email was sent.');
    } catch (error) {
      if (error.message === 'Failed to fetch') {
        const preview = eligible.map(person => ({ email: person.email, name: person.name, subject, message: renderMessage(messagePlain, person) }));
        setCampaign({ total: eligible.length, success: 0, pending: eligible.length, failure: 0, preview }); setStatus('Local preview'); setToast('API unavailable; showing a local preview. No email was sent.');
      } else { setStatus('Error'); setToast(error.message); }
    }
  }

  async function stopCampaign() {
    if (campaign && campaign._id) {
      try { await stopCampaignApi(campaign._id); setStatus('Stopped'); setToast('Campaign stopped.'); return; }
      catch { /* fall through to local stop */ }
    }
    setStatus('Stopped'); setToast('Preview stopped. No email was sent.');
  }

  function downloadCsv() {
    const rows = [['email','name','opted_in','consent_source'], ...contacts.map(({email,name,optedIn,consentSource}) => [email,name,optedIn,consentSource])];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"','""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'mazzi-mail-contacts.csv'; link.click(); URL.revokeObjectURL(link.href);
  }

  const tabs = ['Import','Message','Configure'];

  if (showLogin) {
    return (
      <LoginPage onSignupClick={() => setShowLogin(false)} />
    );
  }

  return (
    <div className="mail-app">
      <header className="mail-top">
        <a className="mail-brand" href="#"><span className="mail-logo"><i className="bi bi-envelope-paper-fill"/></span><span><b>Mazzi</b><small>MAIL</small></span></a>
        <div className="top-center"><span className="live-dot"/> {user?.role === 'admin' ? 'ADMIN WORKSPACE' : 'LIVE WORKSPACE'}</div>
        <div className="top-right">
          <div className="user-menu">
            <span className="me-2">{user?.name} ({user?.role})</span>
            <button className="btn btn-outline-secondary btn-sm" onClick={logout}><i className="bi bi-box-arrow-right"/> Logout</button>
          </div>
        </div>
      </header>
      <div className="mail-layout">
        <aside className="mail-rail">
          <div className="rail-title">CAMPAIGN</div>
          <button className={`rail-item ${view==='campaign'?'active':''}`} onClick={() => setView('campaign')}>
            <i className="bi bi-send"/>New campaign
          </button>
          <button className="rail-item" onClick={() => { setView('campaign'); setTab('Import'); }}>
            <i className="bi bi-people"/>Contacts <span>{contacts.length}</span>
          </button>
          <button className={`rail-item ${view==='history'?'active':''}`} onClick={() => { setView('history'); loadCampaignHistory(); }}>
            <i className="bi bi-clock-history"/>Campaign history <span>{campaignHistory.length}</span>
          </button>
          <button className="rail-item" onClick={() => setView('providers') }>
            <i className="bi bi-server"/>Providers <span>{providers.length}</span>
          </button>
          <button className="rail-item" onClick={() => setView('license') }>
            <i className="bi bi-key"/>License
          </button>
          {user?.role === 'admin' && (
            <button className={`rail-item ${view==='admin'?'active':''}`} onClick={() => setView('admin')}>
              <i className="bi bi-shield-lock"/>Admin
            </button>
          )}
          <div className="rail-bottom"><i className="bi bi-shield-check"/><span>LIVE WORKSPACE<br/>SMTP delivery enabled.</span></div>
        </aside>
        <main className="mail-main">
          {view === 'admin' && user?.role === 'admin' ? (
            <AdminDashboard />
          ) : view === 'history' ? (
            <>
              <div className="title-line"><div><div className="overline">WORKSPACE</div><h1>Campaign history</h1><p>Saved preview runs; these are not email deliveries.</p></div><button className="btn btn-outline-secondary btn-sm" onClick={loadCampaignHistory}><i className="bi bi-arrow-clockwise me-1"/>Refresh</button></div>
              <section className="main-card history-card">{campaignHistory.length ? <div className="table-responsive"><table className="table campaign-history-table"><thead><tr><th>Subject</th><th>Status</th><th>Total</th><th>Success</th><th>Pending</th><th>Failure</th><th>Created</th></tr></thead><tbody>{campaignHistory.map(item => <tr key={item._id}><td>{item.subject}</td><td><span className="preview-tag">PREVIEW</span></td><td>{item.counts?.total ?? 0}</td><td>{item.counts?.success ?? 0}</td><td>{item.counts?.pending ?? 0}</td><td>{item.counts?.failure ?? 0}</td><td>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}</td></tr>)}</tbody></table></div> : <div className="empty-list"><i className="bi bi-clock-history"/><b>No campaign previews yet</b><span>Preview runs will appear here when the API is available.</span></div>}</section>
            </>
          ) : view === 'providers' ? (
            <>
              <div className="title-line"><div><div className="overline">SETTINGS</div><h1>Email Providers</h1><p>Configure SMTP providers for live sending.</p></div><button className="btn btn-outline-secondary btn-sm" onClick={loadProviders}><i className="bi bi-arrow-clockwise me-1"/>Refresh</button></div>
              <section className="main-card">
                <div className="provider-form"><div className="card-title"><div><h2><i className="bi bi-server"/> Add SMTP Provider</h2><p>Enter your SMTP server details to enable live email delivery.</p></div></div>
                <div className="settings-form">
                  <div><label className="form-label">Provider name</label><input className="form-control" id="provName" placeholder="e.g. Gmail, SendGrid, Custom SMTP"/></div>
                  <div><label className="form-label">SMTP host</label><input className="form-control" id="provHost" placeholder="smtp.example.com"/></div>
                  <div><label className="form-label">Port</label><input className="form-control" type="number" id="provPort" value="587"/></div>
                  <div><label className="form-label">Encryption</label><select className="form-select" id="provEnc"><option>tls</option><option>ssl</option><option>none</option></select></div>
                  <div><label className="form-label">Username</label><input className="form-control" id="provUser" placeholder="your username"/></div>
                  <div><label className="form-label">Password</label><input className="form-control" type="password" id="provPass" placeholder="your password"/></div>
                  <div><label className="form-label">Sender name</label><input className="form-control" id="provSenderName" placeholder="Mazzi Team"/></div>
                  <div><label className="form-label">Sender email</label><input className="form-control" type="email" id="provSenderEmail" placeholder="hello@example.com"/></div>
                  <div className="d-flex gap-2"><label className="form-check"><input className="form-check-input" id="provDefault" type="checkbox"/> Default provider</label><label className="form-check"><input className="form-check-input" id="provEnabled" type="checkbox" checked/> Enabled</label></div>
                  <div><label className="form-label">Daily limit</label><input className="form-control" type="number" id="provDaily" value="500"/></div>
                  <div><label className="form-label">Hourly limit</label><input className="form-control" type="number" id="provHourly" value="50"/></div>
                  <div className="form-actions"><button className="btn btn-primary" onClick={async () => {
                    const el = (id) => document.getElementById(id);
                    try {
                      await createProvider({ name: el('provName').value, host: el('provHost').value, port: Number(el('provPort').value||587), username: el('provUser').value, password: el('provPass').value, encryption: el('provEnc').value, senderName: el('provSenderName').value, senderEmail: el('provSenderEmail').value, isDefault: el('provDefault').checked, isEnabled: el('provEnabled').checked, dailyLimit: Number(el('provDaily').value||500), hourlyLimit: Number(el('provHourly').value||50) });
                      await loadProviders(); setToast('Provider saved.'); el('provName').value=''; el('provHost').value=''; el('provPort').value='587'; el('provUser').value=''; el('provPass').value=''; el('provSenderName').value=''; el('provSenderEmail').value=''; el('provDefault').checked=false; el('provEnabled').checked=true; el('provDaily').value='500'; el('provHourly').value='50';
                    } catch (error) { setToast(error.message); }
                  }}><i className="bi bi-save me-1"/>Save provider</button></div></div></div>
                <div className="provider-list"><div className="card-title"><div><h2><i className="bi bi-list-ul"/> Configured Providers</h2><p>Test and manage your SMTP providers.</p></div></div>
                  {providers.length ? providers.map(provider => <div key={provider._id} className="provider-row"><div><b>{provider.name}</b><span> ({provider.senderEmail})</span><br/><small>{provider.host}:{provider.port} · {provider.encryption}</small><br/><span className={provider.connectionStatus=== 'connected' ? 'text-success' : 'text-muted'}><i className={`bi ${provider.connectionStatus=== 'connected' ? 'bi-circle-fill' : 'bi-circle'}`}/> {provider.connectionStatus}</span></div><div className="provider-actions"><button className="btn btn-outline-secondary btn-sm" onClick={async () => { try { const r = await testProvider(provider._id); await loadProviders(); setToast(r.success ? 'Provider connected.' : 'Connection failed: ' + (r.error||'')); } catch(e) { setToast(e.message); } }}><i className="bi bi-check-circle me-1"/>Test</button><button className="btn btn-outline-secondary btn-sm" onClick={async () => { try { await toggleProvider(provider._id, !provider.isEnabled); await loadProviders(); setToast(`Provider ${provider.isEnabled ? 'disabled' : 'enabled'}.`); } catch(e) { setToast(e.message); } }}><i className={`bi ${provider.isEnabled ? 'bi-pause' : 'bi-play'} me-1`}>{provider.isEnabled ? 'Disable' : 'Enable'}</i></button><button className="btn btn-outline-danger btn-sm" onClick={async () => { if(confirm('Delete this provider?')) { try { await deleteProvider(provider._id); await loadProviders(); setToast('Provider deleted.'); } catch(e) { setToast(e.message); } } }}><i className="bi bi-trash me-1"/>Delete</button></div></div>) : <div className="empty-list"><i className="bi bi-server"/><b>No providers configured</b><span>Add an SMTP provider to enable live sending.</span></div>}</div>
              </section>
            </>
          ) : view === 'license' ? (
            <>
              <div className="title-line"><div><div className="overline">SETTINGS</div><h1>License</h1><p>Activate a license or start a trial for live sending.</p></div><button className="btn btn-outline-secondary btn-sm" onClick={loadLicense}><i className="bi bi-arrow-clockwise me-1"/>Refresh</button></div>
              <section className="main-card">
                <div className="license-status">
                  <div className="card-title"><div><h2><i className="bi bi-key"/> License Status</h2><p>Manage your sending license and trial quota.</p></div></div>
                  <div className="license-grid"><div className="license-card"><div className="license-value">{licenseStatus}</div><div className="license-label">Status</div></div><div className="license-card"><div className="license-value">{licenseSent}/{licenseLimit}</div><div className="license-label">Trial emails sent</div></div><div className="license-card"><div className="license-value">{licenseRemaining}</div><div className="license-label">Remaining</div></div></div>
                  <div className="license-actions"><div className="d-flex gap-2"><button className="btn btn-primary" onClick={startTrial} disabled={licenseStatus === 'trial'}><i className="bi bi-play me-1"/>Start 30-day trial</button><div className="flex-grow-1"><div className="input-group"><input className="form-control" id="licenseKeyInput" placeholder="Enter license key"/><button className="btn btn-outline-secondary" onClick={async () => { try { await activateLicense(document.getElementById('licenseKeyInput').value); } catch(e) { setToast(e.message); } }}><i className="bi bi-key me-1"/>Activate</button></div></div></div><button className="btn btn-outline-secondary btn-sm" onClick={validateLicense}><i className="bi bi-check-circle me-1"/>Validate</button></div>
                  <div className="license-tip"><i className="bi bi-info-circle"/><span>Trial allows up to {licenseLimit} emails. Activate a paid license for unlimited sending.</span></div>
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="title-line"><div><div className="overline">CAMPAIGN WORKSPACE</div><h1>New campaign</h1><p>Prepare a message for contacts who opted in.</p></div><span className="draft-pill"><i className="bi bi-circle-fill"/> DRAFT</span></div>
              <div className="safe-banner"><i className="bi bi-shield-check-fill"/><span><b>Consent protected.</b> Only contacts marked opted-in are eligible. {licenseStatus === 'active' || licenseStatus === 'trial' ? 'Live sending enabled.' : 'Preview mode; no email is sent.'}</span></div>
              {toast && <div className="mail-toast"><i className="bi bi-info-circle"/>{toast}<button onClick={() => setToast('')}><i className="bi bi-x"/></button></div>}
              <div className="mail-tabs">{tabs.map((item,index) => <button key={item} className={tab===item?'selected':''} onClick={() => setTab(item)}><span>{index+1}</span>{item}</button>)}</div>
              <div className="mail-body">
                <section className="main-card">
                  {tab==='Import' && <>
                    <div className="card-title"><div><h2><i className="bi bi-person-lines-fill"/> Import contacts</h2><p>Load a CSV list and keep consent information with every address.</p></div><button className="btn btn-light btn-sm" onClick={loadSample}><i className="bi bi-stars me-1"/>Sample data</button></div>
                    <div className="csv-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); importFile(event.dataTransfer.files[0]); }} onClick={() => inputRef.current?.click()}><div className="csv-icon"><i className="bi bi-filetype-csv"/></div><b>Choose a CSV file</b><span>or drop it here · map email, name, opt-in, and consent source</span><input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={event => importFile(event.target.files[0])}/></div>
                    {importDraft && <div className="column-mapper"><div className="mapper-heading"><b><i className="bi bi-layout-three-columns me-2"/>Map your CSV columns</b><span>{importDraft.rows.length} rows detected</span></div><div className="mapper-grid">{[['email','Email address *'],['name','Contact name'],['optedIn','Opt-in consent'],['consentSource','Consent source']].map(([field,label])=><div key={field}><label className="form-label">{label}</label><select className="form-select" value={columnMap[field]} onChange={event => setColumnMap(current => ({...current,[field]:event.target.value}))}><option value="">{field==='email'?'Select column':'Not provided'}</option>{importDraft.headers.map(header=><option key={header} value={header}>{header}</option>)}</select></div>)}</div><div className="mapper-actions"><span>Missing consent values are treated as not opted in.</span><button className="btn btn-primary btn-sm" onClick={applyImportMapping} disabled={!columnMap.email}>Import mapped contacts</button></div></div>}
                    <div className="import-tip"><i className="bi bi-info-circle"/><span>Rows without <code>opted_in=true</code> are kept in the list but excluded from campaigns.</span></div>
                    <div className="list-toolbar"><div><b>Recipient list</b><span>{contacts.length} contacts · {eligible.length} opted in · {excluded} excluded</span></div><button className="btn btn-outline-secondary btn-sm" disabled={!contacts.length} onClick={downloadCsv}><i className="bi bi-download me-1"/>Export list</button></div>
                    <div className="contact-list"><div className="contact-head"><span>CONTACT</span><span>CONSENT</span><span>SOURCE</span><span/></div>{contacts.length ? contacts.map(person => <div className="contact-row" key={person.id}><span className="person-cell"><i className="bi bi-person-circle"/><span><b>{person.name || 'Unnamed contact'}</b><small>{person.email}</small></span></span><span className={person.optedIn?'consent-yes':'consent-no'}><i className={`bi ${person.optedIn?'bi-check-circle-fill':'bi-dash-circle-fill'}`}/>{person.optedIn?'Opted in':'Excluded'}</span><span className="source-cell">{person.consentSource || 'Not provided'}</span><span><button className="remove-btn" title="Remove contact" onClick={() => setContacts(rows => rows.filter(row => row.id !== person.id))}><i className="bi bi-x-lg"/></button></span></div>) : <div className="empty-list"><i className="bi bi-inbox"/><b>No contacts imported</b><span>Import a consent-aware CSV or load sample data.</span></div>}</div>
                  </>}
                  {tab==='Message' && <>
                    <div className="card-title"><div><h2><i className="bi bi-chat-left-text"/> Compose message</h2><p>Write your email and preview recipient personalization.</p></div></div>
                    <label className="form-label">Subject line</label><input className="form-control" value={subject} onChange={event => setSubject(event.target.value)} placeholder="Your email subject"/>
                    <div className="message-options"><div><label className="form-label">Email format</label><select className="form-select" value={emailFormat} onChange={event => setEmailFormat(event.target.value)}><option>Plain Text</option><option>HTML</option><option>AMP</option></select></div><div><label className="form-label">Cc <span>(optional)</span></label><input className="form-control" value={cc} onChange={event => setCc(event.target.value)} placeholder="cc@example.com"/></div><div><label className="form-label">Bcc <span>(optional)</span></label><input className="form-control" value={bcc} onChange={event => setBcc(event.target.value)} placeholder="bcc@example.com"/></div></div>
                    <div className="compose-label"><label className="form-label">Message body</label><span>Fields: <code>{'{{name}}'}</code>, <code>%FNAME%</code>, <code>%EMAIL%</code>, <code>{'{{unsubscribe_link}}'}</code></span></div>
                    {emailFormat === 'Plain Text' && <textarea className="form-control message-area" value={messagePlain} onChange={event => setMessagePlain(event.target.value)} placeholder="Write your message…"/>}
                    {emailFormat === 'HTML' && <textarea className="form-control message-area" value={messageHtml} onChange={event => setMessageHtml(event.target.value)} placeholder="Write your HTML message…"/>}
                    {emailFormat === 'AMP' && <textarea className="form-control message-area" value={messageAmp} onChange={event => setMessageAmp(event.target.value)} placeholder="Write your AMP message…"/>}
                    <div className="message-guidelines"><i className="bi bi-check2-circle"/><span>Include why the recipient is receiving this message and keep the unsubscribe placeholder in place.</span></div>
                    <div className="preview-card"><div className="preview-top"><span>{emailFormat.toUpperCase()} MESSAGE PREVIEW</span><span>To: {eligible[0]?.email || 'select an opted-in contact'}</span></div><b>{subject || '(No subject)'}</b><p>{renderMessage(emailFormat === 'Plain Text' ? messagePlain : emailFormat === 'HTML' ? messageHtml : messageAmp, eligible[0] || {})}</p></div>
                  </>}
                  {tab==='Configure' && <>
                    <div className="card-title"><div><h2><i className="bi bi-sliders"/> Campaign settings</h2><p>Set the sender details and review the safety checks.</p></div></div>
                    <div className="settings-form"><div><label className="form-label">Sender name</label><input className="form-control" value={senderName} onChange={event => setSenderName(event.target.value)}/></div><div><label className="form-label">Sender email</label><input className="form-control" type="email" value={senderEmail} onChange={event => setSenderEmail(event.target.value)}/></div><div><label className="form-label">Reply-to <span>(optional)</span></label><input className="form-control" type="email" placeholder="replies@example.com" value={replyTo} onChange={event => setReplyTo(event.target.value)}/></div><div><label className="form-label">Email provider</label><select className="form-select" value={selectedProviderId || ''} onChange={event => setSelectedProviderId(event.target.value || null)}><option value="">Select a provider (required for live sending)</option>{providers.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select></div><div><label className="form-label">Daily safety cap</label><select className="form-select" value={dailyLimit} onChange={event => setDailyLimit(Number(event.target.value))}><option value="25">25 recipients</option><option value="50">50 recipients</option><option value="100">100 recipients</option><option value="250">250 recipients</option></select></div><div><label className="form-label">Batch size</label><input className="form-control" type="number" value={batchSize} onChange={event => setBatchSize(Number(event.target.value))} placeholder="50"/></div><div><label className="form-label">Delay between sends (ms)</label><input className="form-control" type="number" value={requestDelayMs} onChange={event => setRequestDelayMs(Number(event.target.value))} placeholder="1000"/></div><div><label className="form-label">Max retries</label><input className="form-control" type="number" value={maxRetries} onChange={event => setMaxRetries(Number(event.target.value))} placeholder="3"/></div><div className="d-flex gap-2"><label className="form-check"><input className="form-check-input" type="checkbox" checked={testMode} onChange={event => setTestMode(event.target.checked)}/> Test mode (no actual delivery)</label></div></div>
                    <div className="mode-setting"><div className="mode-symbol"><i className={licenseStatus === 'active' || licenseStatus === 'trial' ? 'bi bi-check-circle-fill text-success' : 'bi bi-eye'}/></div><div><b>{licenseStatus === 'active' || licenseStatus === 'trial' ? 'Live sending' : 'Preview only'}</b><span>{licenseStatus === 'active' || licenseStatus === 'trial' ? 'Emails will be sent via the selected SMTP provider.' : 'Review rendered messages and recipient counts. Does not connect to an email provider.'}</span></div><span className={`preview-tag ${licenseStatus === 'active' || licenseStatus === 'trial' ? 'live' : ''}`}>{licenseStatus === 'active' || licenseStatus === 'trial' ? 'LIVE' : 'ACTIVE'}</span></div>
                    <div className="checks"><div><i className="bi bi-check-circle-fill"/><span>Unopted contacts excluded</span><b>{excluded}</b></div><div><i className="bi bi-check-circle-fill"/><span>Eligible opted-in recipients</span><b>{eligible.length}</b></div><div><i className="bi bi-check-circle-fill"/><span>Daily cap</span><b>{dailyLimit}</b></div><div><i className="bi bi-exclamation-circle-fill"/><span>Live sending</span><b>{licenseStatus === 'active' || licenseStatus === 'trial' ? 'Enabled' : 'Disabled'}</b></div></div>
                  </>}
                  <div className="card-footer-actions"><span><i className="bi bi-cloud-check"/> All changes saved locally</span><div>{tab!=='Import'&&<button className="btn btn-light btn-sm" onClick={() => setTab(tabs[tabs.indexOf(tab)-1])}>Back</button>}{tab!=='Configure'?<button className="btn btn-dark btn-sm" onClick={() => setTab(tabs[tabs.indexOf(tab)+1])}>Continue <i className="bi bi-arrow-right ms-2"/></button>:<div className="d-flex gap-2"><button className="btn btn-outline-secondary btn-sm" onClick={stopCampaign} disabled={!campaign || (campaign.status !== 'running' && campaign.status !== 'paused') }><i className="bi bi-stop-fill me-1"/>Stop</button>{licenseStatus === 'active' || licenseStatus === 'trial' ? <><button className="btn btn-outline-secondary btn-sm" onClick={async () => { if(campaign && campaign.status === 'paused') { try { await resumeCampaignApi(campaign._id || campaign.id); setStatus('Running'); } catch(e) { setToast(e.message); } } }} disabled={campaign.status !== 'paused'}><i className="bi bi-play-fill me-1"/>Resume</button><button className="btn btn-outline-secondary btn-sm" onClick={async () => { if(campaign && campaign.status === 'running') { try { await pauseCampaignApi(campaign._id || campaign.id); setStatus('Paused'); } catch(e) { setToast(e.message); } } }} disabled={campaign.status !== 'running'}><i className="bi bi-pause-fill me-1"/>Pause</button></> : <button className="btn btn-primary btn-sm" onClick={startCampaign} disabled={!eligible.length}><i className="bi bi-play-fill me-1"/>{licenseStatus === 'active' || licenseStatus === 'trial' ? 'Start campaign' : 'Start preview'}</button>}</div>}</div></div>
                </section>
                <aside className="task-card"><div className="task-top"><h3>Task details</h3><span className={`task-status ${status==='Preview complete'||status==='Completed'?'complete':''}`}><i className="bi bi-circle-fill"/>{status}</span></div><div className="task-summary"><span>Current run</span><b>{status==='Ready'?'—':campaign ? (campaign.status || 'Run') : 'Preview run'}</b></div><div className="stats-grid"><div><span>Total emails</span><b>{counts.total}</b></div><div><span>Success</span><b className="stat-green">{counts.success}</b></div><div><span>Pending</span><b className="stat-amber">{counts.pending}</b></div><div><span>Failure</span><b className="stat-red">{counts.failure}</b></div></div><div className="chart-title">DELIVERY OVERVIEW <span>THIS RUN</span></div><div className="chart-area"><div className="chart-y"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div><div className="chart-plot"><div className="chart-gridline"/><div className="chart-gridline"/><div className="chart-gridline"/><div className="chart-gridline"/><div className="chart-bars"><div><i className="bar-green" style={{height:counts.total?`${Math.max(counts.success/counts.total*100,2)}%`:2+'%'}}/><small>Success</small></div><div><i className="bar-amber" style={{height:counts.total?`${Math.max(counts.pending/counts.total*100,2)}%`:2+'%'}}/><small>Pending</small></div><div><i className="bar-red" style={{height:counts.total?`${Math.max(counts.failure/counts.total*100,2)}%`:2+'%'}}/><small>Failure</small></div></div></div></div><div className="task-foot">{licenseStatus === 'active' || licenseStatus === 'trial' ? 'Live sending via SMTP provider' : 'Preview-only mode is on'}</div></aside>
              </div>
            </>
          )}
        </main>
      </div>
      <footer className="mail-footer">MAZZI MAIL <span>·</span> V1.0.0 <span className="footer-right">LIVE WORKSPACE</span></footer>
    </div>
  );
}

function App() {
  const [showLogin, setShowLogin] = useState(true);
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;