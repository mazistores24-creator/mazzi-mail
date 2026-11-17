import { useEffect, useMemo, useRef, useState } from 'react';

const sampleCsv = 'email,name,opted_in,consent_source\nhello@example.com,Alex Morgan,true,Website signup\nsam@example.com,Sam Lee,true,Newsletter form\nold@example.com,Old Contact,false,Unknown';
const starterMessage = `Hi {{name}},\n\nWe have an update we thought you might find useful.\n\nYou’re receiving this because you opted in to hear from us.\n\nBest,\nMazzi Team\n\n{{unsubscribe_link}}`;
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

function App() {
  const [tab, setTab] = useState('Import');
  const [contacts, setContacts] = useState([]);
  const [importDraft, setImportDraft] = useState(null);
  const [columnMap, setColumnMap] = useState({ email: '', name: '', optedIn: '', consentSource: '' });
  const [emailFormat, setEmailFormat] = useState('Plain Text');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [view, setView] = useState('campaign');
  const [campaignHistory, setCampaignHistory] = useState([]);
  const [subject, setSubject] = useState('A quick update from Mazzi');
  const [message, setMessage] = useState(starterMessage);
  const [senderName, setSenderName] = useState('Mazzi Team');
  const [senderEmail, setSenderEmail] = useState('hello@example.com');
  const [replyTo, setReplyTo] = useState('');
  const [dailyLimit, setDailyLimit] = useState(100);
  const [campaign, setCampaign] = useState(null);
  const [status, setStatus] = useState('Ready');
  const [toast, setToast] = useState('');
  const inputRef = useRef(null);
  const eligible = useMemo(() => contacts.filter(row => row.optedIn && row.email && !row.unsubscribed), [contacts]);
  const excluded = contacts.length - eligible.length;
  const counts = campaign || { total: eligible.length, success: 0, pending: eligible.length, failure: 0 };

  useEffect(() => {
    fetch(apiUrl('/api/contacts')).then(response => response.ok ? response.json() : []).then(rows => {
      if (Array.isArray(rows) && rows.length) setContacts(rows.map(row => ({ ...row, id: row._id || row.id || row.email, optedIn: row.optedIn === true })));
    }).catch(() => {});
  }, []);

  async function loadCampaignHistory() {
    try { const response = await fetch(apiUrl('/api/campaigns')); if (response.ok) setCampaignHistory(await response.json()); }
    catch { setCampaignHistory([]); }
  }

  async function persistContacts(rows) {
    try {
      const response = await fetch(apiUrl('/api/contacts/import'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contacts: rows }) });
      if (!response.ok) { const data = await response.json(); setToast(data.message || 'Contacts are loaded locally but could not be saved.'); }
    } catch { /* Local UI remains usable when the optional API is not running. */ }
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
    if (!eligible.length) { setToast('Import contacts with opted_in=true before starting a preview.'); setTab('Import'); return; }
    if (!subject.trim() || !message.trim()) { setToast('Add a subject and message first.'); setTab('Message'); return; }
    setStatus('Running preview'); setTab('Configure'); setToast('Preparing local preview…');
    try {
      const response = await fetch(apiUrl('/api/campaigns/preview'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, message, contacts: eligible, senderName, senderEmail, replyTo, cc, bcc, emailFormat, dailyLimit }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Preview failed.');
      setCampaign(data); setStatus('Preview complete'); setToast('Preview complete. No email was sent.');
    } catch (error) {
      if (error.message === 'Failed to fetch') {
        const preview = eligible.map(person => ({ email: person.email, name: person.name, subject, message: renderMessage(message, person) }));
        setCampaign({ total: eligible.length, success: 0, pending: eligible.length, failure: 0, preview }); setStatus('Local preview'); setToast('API unavailable; showing a local preview. No email was sent.');
      } else { setStatus('Error'); setToast(error.message); }
    }
  }

  function stopCampaign() { setStatus('Stopped'); setToast('Preview stopped. No email was sent.'); }

  function downloadCsv() {
    const rows = [['email','name','opted_in','consent_source'], ...contacts.map(({email,name,optedIn,consentSource}) => [email,name,optedIn,consentSource])];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"','""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'mazzi-mail-contacts.csv'; link.click(); URL.revokeObjectURL(link.href);
  }

  const tabs = ['Import','Message','Configure'];
  return <div className="mail-app">
    <header className="mail-top"><a className="mail-brand" href="#"><span className="mail-logo"><i className="bi bi-envelope-paper-fill"/></span><span><b>Mazzi</b><small>MAIL</small></span></a><div className="top-center"><span className="live-dot"/> LOCAL WORKSPACE</div><div className="top-right"><button className="round-help" title="Help"><i className="bi bi-question-lg"/></button><div className="mail-avatar">M</div></div></header>
    <div className="mail-layout"><aside className="mail-rail"><div className="rail-title">CAMPAIGN</div><button className={`rail-item ${view==='campaign'?'active':''}`} onClick={() => setView('campaign')}><i className="bi bi-send"/>New campaign</button><button className="rail-item" onClick={() => { setView('campaign'); setTab('Import'); }}><i className="bi bi-people"/>Contacts <span>{contacts.length}</span></button><button className={`rail-item ${view==='history'?'active':''}`} onClick={() => { setView('history'); loadCampaignHistory(); }}><i className="bi bi-clock-history"/>Campaign history <span>{campaignHistory.length}</span></button><div className="rail-bottom"><i className="bi bi-shield-check"/><span>Preview mode is on.<br/>No messages are sent.</span></div></aside>
    <main className="mail-main">{view==='history' ? <>
      <div className="title-line"><div><div className="overline">WORKSPACE</div><h1>Campaign history</h1><p>Saved preview runs; these are not email deliveries.</p></div><button className="btn btn-outline-secondary btn-sm" onClick={loadCampaignHistory}><i className="bi bi-arrow-clockwise me-1"/>Refresh</button></div>
      <section className="main-card history-card">{campaignHistory.length ? <div className="table-responsive"><table className="table campaign-history-table"><thead><tr><th>Subject</th><th>Status</th><th>Total</th><th>Success</th><th>Pending</th><th>Failure</th><th>Created</th></tr></thead><tbody>{campaignHistory.map(item => <tr key={item._id}><td>{item.subject}</td><td><span className="preview-tag">PREVIEW</span></td><td>{item.counts?.total ?? 0}</td><td>{item.counts?.success ?? 0}</td><td>{item.counts?.pending ?? 0}</td><td>{item.counts?.failure ?? 0}</td><td>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}</td></tr>)}</tbody></table></div> : <div className="empty-list"><i className="bi bi-clock-history"/><b>No campaign previews yet</b><span>Preview runs will appear here when the API is available.</span></div>}</section>
    </> : <>
      <div className="title-line"><div><div className="overline">CAMPAIGN WORKSPACE</div><h1>New campaign</h1><p>Prepare a message for contacts who opted in.</p></div><span className="draft-pill"><i className="bi bi-circle-fill"/> DRAFT</span></div>
      <div className="safe-banner"><i className="bi bi-shield-check-fill"/><span><b>Consent protected.</b> Only contacts marked opted-in are eligible. Current mode is preview only; no email is sent.</span></div>
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
            <div className="compose-label"><label className="form-label">Message body</label><span>Fields: <code>{'{{name}}'}</code>, <code>%FNAME%</code>, <code>%EMAIL%</code>, <code>{'{{unsubscribe_link}}'}</code></span></div><textarea className="form-control message-area" value={message} onChange={event => setMessage(event.target.value)} placeholder="Write your message…"/>
            <div className="message-guidelines"><i className="bi bi-check2-circle"/><span>Include why the recipient is receiving this message and keep the unsubscribe placeholder in place. HTML/AMP remain source text here; they aren’t rendered or validated.</span></div>
            <div className="preview-card"><div className="preview-top"><span>{emailFormat.toUpperCase()} MESSAGE PREVIEW</span><span>To: {eligible[0]?.email || 'select an opted-in contact'}</span></div><b>{subject || '(No subject)'}</b><p>{renderMessage(message, eligible[0] || {})}</p></div>
          </>}
          {tab==='Configure' && <>
            <div className="card-title"><div><h2><i className="bi bi-sliders"/> Campaign settings</h2><p>Set the sender details and review the safety checks.</p></div></div>
            <div className="settings-form"><div><label className="form-label">Sender name</label><input className="form-control" value={senderName} onChange={event => setSenderName(event.target.value)}/></div><div><label className="form-label">Sender email</label><input className="form-control" type="email" value={senderEmail} onChange={event => setSenderEmail(event.target.value)}/></div><div><label className="form-label">Reply-to <span>(optional)</span></label><input className="form-control" type="email" placeholder="replies@example.com" value={replyTo} onChange={event => setReplyTo(event.target.value)}/></div><div><label className="form-label">Daily safety cap</label><select className="form-select" value={dailyLimit} onChange={event => setDailyLimit(Number(event.target.value))}><option value="25">25 recipients</option><option value="50">50 recipients</option><option value="100">100 recipients</option><option value="250">250 recipients</option></select></div></div>
            <div className="mode-setting"><div className="mode-symbol"><i className="bi bi-eye"/></div><div><b>Preview only</b><span>Review rendered messages and recipient counts. Does not connect to an email provider.</span></div><span className="preview-tag">ACTIVE</span></div>
            <div className="checks"><div><i className="bi bi-check-circle-fill"/><span>Unopted contacts excluded</span><b>{excluded}</b></div><div><i className="bi bi-check-circle-fill"/><span>Eligible opted-in recipients</span><b>{eligible.length}</b></div><div><i className="bi bi-check-circle-fill"/><span>Daily cap</span><b>{dailyLimit}</b></div><div><i className="bi bi-exclamation-circle-fill"/><span>Live sending</span><b>Disabled</b></div></div>
          </>}
          <div className="card-footer-actions"><span><i className="bi bi-cloud-check"/> All changes saved locally</span><div>{tab!=='Import'&&<button className="btn btn-light btn-sm" onClick={() => setTab(tabs[tabs.indexOf(tab)-1])}>Back</button>}{tab!=='Configure'?<button className="btn btn-dark btn-sm" onClick={() => setTab(tabs[tabs.indexOf(tab)+1])}>Continue <i className="bi bi-arrow-right ms-2"/></button>:<div className="d-flex gap-2"><button className="btn btn-outline-secondary btn-sm" onClick={stopCampaign}><i className="bi bi-stop-fill me-1"/>Stop</button><button className="btn btn-primary btn-sm" onClick={startCampaign} disabled={!eligible.length}><i className="bi bi-play-fill me-1"/>Start preview</button></div>}</div></div>
        </section>
        <aside className="task-card"><div className="task-top"><h3>Task details</h3><span className={`task-status ${status==='Preview complete'?'complete':''}`}><i className="bi bi-circle-fill"/>{status}</span></div><div className="task-summary"><span>Current run</span><b>{status==='Ready'?'—':'Preview run'}</b></div><div className="stats-grid"><div><span>Total emails</span><b>{counts.total}</b></div><div><span>Success</span><b className="stat-green">{counts.success}</b></div><div><span>Pending</span><b className="stat-amber">{counts.pending}</b></div><div><span>Failure</span><b className="stat-red">{counts.failure}</b></div></div><div className="chart-title">DELIVERY OVERVIEW <span>THIS RUN</span></div><div className="chart-area"><div className="chart-y"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div><div className="chart-plot"><div className="chart-gridline"/><div className="chart-gridline"/><div className="chart-gridline"/><div className="chart-gridline"/><div className="chart-bars"><div><i className="bar-green" style={{height:counts.total?`${Math.max(counts.success/counts.total*100,2)}%`:2+'%'}}/><small>Success</small></div><div><i className="bar-amber" style={{height:counts.total?`${Math.max(counts.pending/counts.total*100,2)}%`:2+'%'}}/><small>Pending</small></div><div><i className="bar-red" style={{height:counts.total?`${Math.max(counts.failure/counts.total*100,2)}%`:2+'%'}}/><small>Failure</small></div></div></div></div><div className="task-foot"><i className="bi bi-shield-lock"/> Preview-only mode is on</div></aside>
      </div>
    </>}
    <footer className="mail-footer">MAZZI MAIL <span>·</span> V1.0.0 <span className="footer-right">LOCAL PREVIEW WORKSPACE</span></footer>
    </main></div>
  </div>;
}

export default App;
