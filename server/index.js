import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import Contact from './models/Contact.js';
import Campaign from './models/Campaign.js';
import EmailProvider from './models/EmailProvider.js';
import DeliveryRecord from './models/DeliveryRecord.js';
import License from './models/License.js';
import TrialUsage from './models/TrialUsage.js';
import SuppressionList from './models/SuppressionList.js';
import { testProviderConnection, sendEmail, generateUnsubscribeToken, renderMergeFields, clearTransporterCache } from './mailer.js';

const app = express();
const port = Number(process.env.PORT) || 5001;
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5174').split(',').map(origin => origin.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '2mb' }));
const connected = () => mongoose.connection.readyState === 1;

// In-memory fallback stores
const memoryContacts = new Map();
const memoryCampaigns = [];
const memoryProviders = [];
const memoryDeliveryRecords = new Map();
const memorySuppression = new Map();
const memoryLicense = { status: 'inactive', trialEmailsSent: 0, trialLimit: 30 };

// Background worker state
let workerRunning = false;
let workerInterval = null;
const WORKER_INTERVAL_MS = 2000;
const BATCH_SIZE = 50;

function sanitizeProvider(provider) {
  const obj = provider.toObject ? provider.toObject() : { ...provider };
  delete obj.password;
  return obj;
}

async function ensureDefaultTrial() {
  if (!connected()) return;
  try {
    let license = await License.findOne();
    if (!license) {
      license = new License({ status: 'inactive', trialLimit: 30, trialEmailsSent: 0 });
      await license.save();
    }
  } catch { /* ignore */ }
}

async function resetProviderCountersIfNeeded() {
  if (!connected()) return;
  try {
    const now = new Date();
    await EmailProvider.updateMany(
      { resetSentAt: { $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0) } },
      { $set: { sentToday: 0, sentThisHour: 0, resetSentAt: now } }
    );
  } catch { /* ignore */ }
}

async function getTrialUsage() {
  if (connected()) {
    const license = await License.findOne();
    if (!license) return { sent: 0, limit: 30, remaining: 30, status: 'inactive' };
    const remaining = Math.max(0, license.trialLimit - license.trialEmailsSent);
    return { sent: license.trialEmailsSent, limit: license.trialLimit, remaining, status: license.status };
  }
  return { sent: memoryLicense.trialEmailsSent || 0, limit: memoryLicense.trialLimit, remaining: Math.max(0, memoryLicense.trialLimit - (memoryLicense.trialEmailsSent || 0)), status: memoryLicense.status };
}

async function canSendTrialEmails(count) {
  const usage = await getTrialUsage();
  if (usage.status === 'trial' || usage.status === 'inactive') {
    return usage.remaining >= count;
  }
  return true;
}

async function recordTrialEmails(count) {
  if (connected()) {
    await License.updateOne({}, { $inc: { trialEmailsSent: count } });
  } else {
    memoryLicense.trialEmailsSent = (memoryLicense.trialEmailsSent || 0) + count;
  }
}

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true, database: connected() ? 'connected' : 'memory mode', mode: 'live sending' }));

// ---------- Providers ----------
app.get('/api/providers', async (_req, res) => {
  try {
    let providers;
    if (connected()) {
      providers = await EmailProvider.find().sort({ isDefault: -1, createdAt: -1 }).lean();
    } else {
      providers = memoryProviders.map(p => sanitizeProvider(p));
    }
    return res.json(providers.map(sanitizeProvider));
  } catch (error) { return res.status(500).json({ message: 'Could not load providers.', detail: error.message }); }
});

app.post('/api/providers', async (req, res) => {
  try {
    const { name, host, port, username, password, encryption, senderName, senderEmail, isEnabled, isDefault, dailyLimit, hourlyLimit } = req.body || {};
    if (!name || !host || !port || !username || !password || !senderName || !senderEmail) {
      return res.status(400).json({ message: 'All provider fields are required.' });
    }
    if (isDefault && connected()) {
      await EmailProvider.updateMany({}, { $set: { isDefault: false } });
    } else if (isDefault && !connected()) {
      memoryProviders.forEach(p => { p.isDefault = false; });
    }
    const providerData = { name, host, port: Number(port), username, password, encryption: encryption || 'tls', senderName, senderEmail, isEnabled: isEnabled === true, isDefault: isDefault === true, dailyLimit: Number(dailyLimit) || 500, hourlyLimit: Number(hourlyLimit) || 50, connectionStatus: 'not_tested' };
    let provider;
    if (connected()) {
      provider = new EmailProvider(providerData);
      await provider.save();
    } else {
      provider = { ...providerData, _id: `mem-${Date.now()}`, createdAt: new Date() };
      memoryProviders.push(provider);
    }
    clearTransporterCache();
    return res.status(201).json(sanitizeProvider(provider));
  } catch (error) { return res.status(500).json({ message: 'Could not save provider.', detail: error.message }); }
});

app.get('/api/providers/:id', async (req, res) => {
  try {
    let provider;
    if (connected()) {
      provider = await EmailProvider.findById(req.params.id).lean();
    } else {
      provider = memoryProviders.find(p => p._id === req.params.id);
    }
    if (!provider) return res.status(404).json({ message: 'Provider not found.' });
    return res.json(sanitizeProvider(provider));
  } catch (error) { return res.status(500).json({ message: 'Could not load provider.', detail: error.message }); }
});

app.put('/api/providers/:id', async (req, res) => {
  try {
    const { name, host, port, username, password, encryption, senderName, senderEmail, isEnabled, isDefault, dailyLimit, hourlyLimit } = req.body || {};
    const updates = {};
    if (name) updates.name = name;
    if (host) updates.host = host;
    if (port) updates.port = Number(port);
    if (username) updates.username = username;
    if (password) updates.password = password;
    if (encryption) updates.encryption = encryption;
    if (senderName) updates.senderName = senderName;
    if (senderEmail) updates.senderEmail = senderEmail;
    if (typeof isEnabled === 'boolean') updates.isEnabled = isEnabled;
    if (typeof isDefault === 'boolean') updates.isDefault = isDefault;
    if (dailyLimit) updates.dailyLimit = Number(dailyLimit);
    if (hourlyLimit) updates.hourlyLimit = Number(hourlyLimit);
    if (updates.isDefault && connected()) {
      await EmailProvider.updateMany({}, { $set: { isDefault: false } });
    }
    let provider;
    if (connected()) {
      provider = await EmailProvider.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true }).lean();
    } else {
      const idx = memoryProviders.findIndex(p => p._id === req.params.id);
      if (idx === -1) return res.status(404).json({ message: 'Provider not found.' });
      memoryProviders[idx] = { ...memoryProviders[idx], ...updates };
      provider = memoryProviders[idx];
    }
    clearTransporterCache();
    return res.json(sanitizeProvider(provider));
  } catch (error) { return res.status(500).json({ message: 'Could not update provider.', detail: error.message }); }
});

app.delete('/api/providers/:id', async (req, res) => {
  try {
    if (connected()) {
      await EmailProvider.findByIdAndDelete(req.params.id);
    } else {
      const idx = memoryProviders.findIndex(p => p._id === req.params.id);
      if (idx === -1) return res.status(404).json({ message: 'Provider not found.' });
      memoryProviders.splice(idx, 1);
    }
    clearTransporterCache();
    return res.json({ message: 'Provider deleted.' });
  } catch (error) { return res.status(500).json({ message: 'Could not delete provider.', detail: error.message }); }
});

app.post('/api/providers/:id/test', async (req, res) => {
  try {
    let provider;
    if (connected()) {
      provider = await EmailProvider.findById(req.params.id).lean();
    } else {
      provider = memoryProviders.find(p => p._id === req.params.id);
    }
    if (!provider) return res.status(404).json({ message: 'Provider not found.' });
    const result = await testProviderConnection(provider);
    const status = result.success ? 'connected' : 'failed';
    if (connected()) {
      await EmailProvider.findByIdAndUpdate(req.params.id, { $set: { connectionStatus: status, lastTestedAt: new Date(), lastTestError: result.success ? null : result.error } });
    } else {
      const p = memoryProviders.find(x => x._id === req.params.id);
      if (p) { p.connectionStatus = status; p.lastTestedAt = new Date(); p.lastTestError = result.success ? null : result.error; }
    }
    return res.json({ success: result.success, error: result.error, status });
  } catch (error) { return res.status(500).json({ message: 'Connection test failed.', detail: error.message }); }
});

app.post('/api/providers/:id/toggle', async (req, res) => {
  try {
    const { isEnabled } = req.body || {};
    if (typeof isEnabled !== 'boolean') return res.status(400).json({ message: 'isEnabled is required.' });
    let provider;
    if (connected()) {
      provider = await EmailProvider.findByIdAndUpdate(req.params.id, { $set: { isEnabled } }, { new: true }).lean();
    } else {
      const p = memoryProviders.find(x => x._id === req.params.id);
      if (!p) return res.status(404).json({ message: 'Provider not found.' });
      p.isEnabled = isEnabled;
      provider = p;
    }
    clearTransporterCache();
    return res.json(sanitizeProvider(provider));
  } catch (error) { return res.status(500).json({ message: 'Could not toggle provider.', detail: error.message }); }
});

// ---------- Contacts ----------
app.post('/api/contacts/import', async (req, res) => {
  const { contacts = [], columnMap } = req.body || {};
  if (!Array.isArray(contacts) || contacts.length > 10000) return res.status(400).json({ message: 'Provide up to 10,000 contacts.' });
  const cleaned = contacts.filter(row => row.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email))).map(row => ({
    email: String(row.email).toLowerCase().trim(),
    name: String(row.name || '').slice(0, 120),
    optedIn: row.optedIn === true,
    consentSource: String(row.consentSource || '').slice(0, 200),
    company: String(row.company || '').slice(0, 200),
  }));
  try {
    if (connected()) {
      await Contact.bulkWrite(cleaned.map(contact => ({ updateOne: { filter: { email: contact.email }, update: { $set: { name: contact.name, optedIn: contact.optedIn, consentSource: contact.consentSource, company: contact.company }, $setOnInsert: { unsubscribed: false } }, upsert: true } })), { ordered: false });
      const saved = await Contact.find({ email: { $in: cleaned.map(c => c.email) } }).lean();
      const suppressed = await SuppressionList.find({ email: { $in: saved.map(c => c.email) } }).distinct('email');
      const suppressedSet = new Set(suppressed);
      return res.status(201).json({ count: saved.length, eligible: saved.filter(c => c.optedIn && !c.unsubscribed && !suppressedSet.has(c.email)).length, contacts: saved.map(c => ({ ...c, id: c._id, suppressed: suppressedSet.has(c.email) })) });
    }
    for (const contact of cleaned) memoryContacts.set(contact.email, { ...memoryContacts.get(contact.email), ...contact, unsubscribed: memoryContacts.get(contact.email)?.unsubscribed || false });
    const contactsOut = cleaned.map(row => ({ ...memoryContacts.get(row.email), id: row.email }));
    return res.status(201).json({ count: contactsOut.length, eligible: contactsOut.filter(c => c.optedIn && !c.unsubscribed).length, contacts: contactsOut, persistence: 'memory' });
  } catch (error) { return res.status(500).json({ message: 'Could not save contacts.', detail: error.message }); }
});

app.get('/api/contacts', async (_req, res) => {
  try {
    let contacts;
    if (connected()) {
      contacts = await Contact.find().sort({ createdAt: -1 }).limit(5000).lean();
    } else {
      contacts = [...memoryContacts.values()];
    }
    let suppressed = [];
    if (connected()) suppressed = await SuppressionList.find().distinct('email');
    else suppressed = [...memorySuppression.keys()];
    const suppressedSet = new Set(suppressed);
    return res.json(contacts.map(c => ({ ...c, id: c._id || c.email, optedIn: c.optedIn === true, suppressed: suppressedSet.has(c.email) })));
  } catch (error) { return res.status(500).json({ message: 'Could not load contacts.', detail: error.message }); }
});

app.get('/api/contacts/:id', async (req, res) => {
  try {
    let contact;
    if (connected()) {
      contact = await Contact.findById(req.params.id).lean();
    } else {
      contact = memoryContacts.get(req.params.id);
    }
    if (!contact) return res.status(404).json({ message: 'Contact not found.' });
    return res.json({ ...contact, id: contact._id || contact.email });
  } catch (error) { return res.status(500).json({ message: 'Could not load contact.', detail: error.message }); }
});

app.delete('/api/contacts/:id', async (req, res) => {
  try {
    if (connected()) await Contact.findByIdAndDelete(req.params.id);
    else memoryContacts.delete(req.params.id);
    return res.json({ message: 'Contact deleted.' });
  } catch (error) { return res.status(500).json({ message: 'Could not delete contact.', detail: error.message }); }
});

// ---------- License ----------
app.get('/api/license/status', async (_req, res) => {
  try {
    let license;
    if (connected()) {
      license = await License.findOne();
      if (!license) { license = new License({ status: 'inactive', trialLimit: 30 }); await license.save(); }
    } else {
      license = memoryLicense;
    }
    const usage = await getTrialUsage();
    return res.json({ status: license.status, licenseKey: license.licenseKey, activatedAt: license.activatedAt, expiresAt: license.expiresAt, trialEmailsSent: license.trialEmailsSent || usage.sent, trialLimit: license.trialLimit || usage.limit, remaining: usage.remaining, purchaseLink: license.purchaseLink, plan: license.plan, validationError: license.validationError });
  } catch (error) { return res.status(500).json({ message: 'Could not load license status.', detail: error.message }); }
});

app.post('/api/license/activate', async (req, res) => {
  try {
    const { licenseKey } = req.body || {};
    if (!licenseKey || !licenseKey.trim()) return res.status(400).json({ message: 'License key is required.' });
    let license;
    if (connected()) {
      license = await License.findOne({ licenseKey: licenseKey.trim() });
      if (!license) return res.status(400).json({ message: 'Invalid license key.' });
      if (license.status === 'expired') return res.status(400).json({ message: 'License has expired.' });
      license.status = 'active';
      license.activatedAt = new Date();
      license.validationError = null;
      license.lastValidatedAt = new Date();
      await license.save();
    } else {
      memoryLicense.status = 'active';
      memoryLicense.licenseKey = licenseKey.trim();
      memoryLicense.activatedAt = new Date();
      license = memoryLicense;
    }
    return res.json({ status: license.status, message: 'License activated.' });
  } catch (error) { return res.status(500).json({ message: 'Activation failed.', detail: error.message }); }
});

app.post('/api/license/trial', async (_req, res) => {
  try {
    let license;
    if (connected()) {
      license = await License.findOne();
      if (!license) { license = new License({ status: 'inactive', trialLimit: 30 }); await license.save(); }
      if (license.status === 'trial' && license.trialActivatedAt) {
        const daysDiff = (Date.now() - new Date(license.trialActivatedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff < 30) return res.status(400).json({ message: 'Trial already active.' });
      }
      license.status = 'trial';
      license.trialActivatedAt = new Date();
      license.trialEmailsSent = 0;
      await license.save();
    } else {
      memoryLicense.status = 'trial';
      memoryLicense.trialActivatedAt = new Date();
      memoryLicense.trialEmailsSent = 0;
      license = memoryLicense;
    }
    return res.json({ status: license.status, trialLimit: license.trialLimit, trialEmailsSent: 0, message: 'Trial activated. 30 emails available.' });
  } catch (error) { return res.status(500).json({ message: 'Trial activation failed.', detail: error.message }); }
});

app.post('/api/license/validate', async (_req, res) => {
  try {
    if (connected()) {
      const license = await License.findOne();
      if (!license) return res.json({ valid: false, status: 'inactive' });
      if (license.status === 'active' && license.expiresAt && new Date(license.expiresAt) < new Date()) {
        license.status = 'expired';
        await license.save();
      }
      license.lastValidatedAt = new Date();
      await license.save();
      return res.json({ valid: license.status === 'active', status: license.status, expiresAt: license.expiresAt });
    }
    return res.json({ valid: memoryLicense.status === 'active', status: memoryLicense.status });
  } catch (error) { return res.status(500).json({ message: 'Validation failed.', detail: error.message }); }
});

// ---------- Campaigns ----------
app.post('/api/campaigns', async (req, res) => {
  try {
    const { subject, messagePlain, messageHtml, messageAmp, emailFormat, senderName, senderEmail, replyTo, cc, bcc, providerId, dailyLimit, contacts = [], batchSize, requestDelayMs, maxRetries, testMode } = req.body || {};
    if (!subject || !subject.trim()) return res.status(400).json({ message: 'Subject is required.' });
    if (!senderName || !senderEmail) return res.status(400).json({ message: 'Sender name and email are required.' });
    if (!Array.isArray(contacts) || contacts.length === 0) return res.status(400).json({ message: 'At least one contact is required.' });

    const usage = await getTrialUsage();
    const isTrial = usage.status === 'trial' || usage.status === 'inactive';
    if (isTrial && contacts.length > usage.remaining) {
      return res.status(403).json({ message: `Trial limit reached. Only ${usage.remaining} email(s) remaining. Activate a license or purchase more.` });
    }

    const unsubscribePageUrl = `${process.env.CLIENT_ORIGIN || 'http://localhost:5174'}/unsubscribe`;
    const campaignData = {
      subject: subject.trim(),
      messagePlain: messagePlain || '',
      messageHtml: messageHtml || '',
      messageAmp: messageAmp || '',
      emailFormat: ['Plain Text', 'HTML', 'AMP'].includes(emailFormat) ? emailFormat : 'Plain Text',
      senderName, senderEmail,
      replyTo: replyTo || '',
      cc: Array.isArray(cc) ? cc : (cc ? [cc] : []),
      bcc: Array.isArray(bcc) ? bcc : (bcc ? [bcc] : []),
      providerId: providerId || null,
      dailyLimit: Number(dailyLimit) || 100,
      status: 'pending',
      counts: { total: contacts.length, pending: contacts.length, queued: 0, sending: 0, sent: 0, failed: 0, cancelled: 0, retrying: 0 },
      batchSize: Number(batchSize) || 50,
      requestDelayMs: Number(requestDelayMs) || 1000,
      maxRetries: Number(maxRetries) || 3,
      trialEmailsUsed: 0,
      unsubscribePageUrl,
      testMode: testMode === true,
    };

    let campaign;
    if (connected()) {
      campaign = new Campaign(campaignData);
      await campaign.save();
    } else {
      campaign = { ...campaignData, _id: `mem-${Date.now()}`, createdAt: new Date(), updatedAt: new Date() };
      memoryCampaigns.unshift(campaign);
    }

    const deliveryRecords = contacts.map(contact => {
      const token = generateUnsubscribeToken();
      const unsubscribeUrl = `${unsubscribePageUrl}?token=${token}`;
      return {
        campaignId: campaign._id,
        email: contact.email,
        name: contact.name || '',
        status: 'pending',
        emailFormat: campaignData.emailFormat,
        subject: campaignData.subject,
        cc: campaignData.cc,
        bcc: campaignData.bcc,
        unsubscribeToken: token,
      };
    });

    if (connected()) {
      await DeliveryRecord.insertMany(deliveryRecords, { ordered: false });
    } else {
      deliveryRecords.forEach(dr => { dr._id = `mem-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; memoryDeliveryRecords.set(dr._id, dr); });
    }

    if (isTrial) {
      await recordTrialEmails(contacts.length);
    }

    return res.status(201).json({ ...(campaign.toObject ? campaign.toObject() : campaign), id: campaign._id });
  } catch (error) { return res.status(500).json({ message: 'Could not create campaign.', detail: error.message }); }
});

app.get('/api/campaigns', async (_req, res) => {
  try {
    let campaigns;
    if (connected()) {
      campaigns = await Campaign.find().select('-messagePlain -messageHtml -messageAmp').sort({ createdAt: -1 }).limit(100).lean();
    } else {
      campaigns = memoryCampaigns.map(c => ({ ...c, id: c._id }));
    }
    return res.json(campaigns.map(c => ({ ...c, id: c._id || c.id })));
  } catch (error) { return res.status(500).json({ message: 'Could not load campaigns.', detail: error.message }); }
});

app.get('/api/campaigns/:id', async (req, res) => {
  try {
    let campaign;
    if (connected()) {
      campaign = await Campaign.findById(req.params.id).lean();
    } else {
      campaign = memoryCampaigns.find(c => c._id === req.params.id);
    }
    if (!campaign) return res.status(404).json({ message: 'Campaign not found.' });
    return res.json({ ...campaign, id: campaign._id });
  } catch (error) { return res.status(500).json({ message: 'Could not load campaign.', detail: error.message }); }
});

app.get('/api/campaigns/:id/recipients', async (req, res) => {
  try {
    let records;
    if (connected()) {
      records = await DeliveryRecord.find({ campaignId: req.params.id }).sort({ createdAt: 1 }).limit(5000).lean();
    } else {
      records = [...memoryDeliveryRecords.values()].filter(dr => dr.campaignId === req.params.id);
    }
    return res.json(records.map(r => ({ ...r, id: r._id })));
  } catch (error) { return res.status(500).json({ message: 'Could not load recipients.', detail: error.message }); }
});

app.get('/api/campaigns/:id/stats', async (req, res) => {
  try {
    let campaign;
    if (connected()) campaign = await Campaign.findById(req.params.id).lean();
    else campaign = memoryCampaigns.find(c => c._id === req.params.id);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found.' });
    let stats;
    if (connected()) {
      stats = await DeliveryRecord.aggregate([
        { $match: { campaignId: campaign._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);
    } else {
      const grouped = {};
      [...memoryDeliveryRecords.values()].filter(dr => dr.campaignId === req.params.id).forEach(dr => { grouped[dr.status] = (grouped[dr.status] || 0) + 1; });
      stats = Object.entries(grouped).map(([_id, count]) => ({ _id, count }));
    }
    const counts = { total: 0, pending: 0, queued: 0, sending: 0, sent: 0, failed: 0, cancelled: 0, retrying: 0 };
    stats.forEach(s => { if (counts[s._id] !== undefined) counts[s._id] = s.count; counts.total += s.count; });
    return res.json({ ...campaign.counts, ...counts });
  } catch (error) { return res.status(500).json({ message: 'Could not load stats.', detail: error.message }); }
});

// ---------- Campaign controls ----------
app.post('/api/campaigns/:id/start', async (req, res) => {
  try {
    let campaign;
    if (connected()) campaign = await Campaign.findById(req.params.id);
    else campaign = memoryCampaigns.find(c => c._id === req.params.id);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found.' });
    if (campaign.status === 'running') return res.json({ message: 'Campaign already running.', status: campaign.status });

    const usage = await getTrialUsage();
    const isTrial = usage.status === 'trial' || usage.status === 'inactive';
    if (isTrial && usage.remaining <= 0) {
      return res.status(403).json({ message: 'Trial limit reached. Activate a license to continue sending.' });
    }

    const provider = campaign.providerId ? (connected() ? await EmailProvider.findById(campaign.providerId) : memoryProviders.find(p => p._id === campaign.providerId)) : null;
    if (!provider) return res.status(400).json({ message: 'No email provider configured. Configure a provider first.' });
    if (connected() && (!provider.isEnabled || provider.connectionStatus !== 'connected')) return res.status(400).json({ message: 'Provider is not enabled or connection test failed.' });

    const update = { status: 'running', startedAt: new Date(), pausedAt: null };
    if (connected()) await Campaign.findByIdAndUpdate(req.params.id, { $set: update });
    else { Object.assign(campaign, update); campaign.updatedAt = new Date(); }

    if (!workerRunning) startWorker();
    return res.json({ message: 'Campaign started.', status: 'running' });
  } catch (error) { return res.status(500).json({ message: 'Could not start campaign.', detail: error.message }); }
});

app.post('/api/campaigns/:id/pause', async (req, res) => {
  try {
    if (connected()) {
      await Campaign.findByIdAndUpdate(req.params.id, { $set: { status: 'paused', pausedAt: new Date() } });
    } else {
      const c = memoryCampaigns.find(x => x._id === req.params.id);
      if (c) { c.status = 'paused'; c.pausedAt = new Date(); }
    }
    return res.json({ message: 'Campaign paused.', status: 'paused' });
  } catch (error) { return res.status(500).json({ message: 'Could not pause campaign.', detail: error.message }); }
});

app.post('/api/campaigns/:id/resume', async (req, res) => {
  try {
    if (connected()) {
      await Campaign.findByIdAndUpdate(req.params.id, { $set: { status: 'running', pausedAt: null } });
    } else {
      const c = memoryCampaigns.find(x => x._id === req.params.id);
      if (c) { c.status = 'running'; c.pausedAt = null; }
    }
    if (!workerRunning) startWorker();
    return res.json({ message: 'Campaign resumed.', status: 'running' });
  } catch (error) { return res.status(500).json({ message: 'Could not resume campaign.', detail: error.message }); }
});

app.post('/api/campaigns/:id/stop', async (req, res) => {
  try {
    if (connected()) {
      await Campaign.findByIdAndUpdate(req.params.id, { $set: { status: 'stopped', completedAt: new Date() } });
      await DeliveryRecord.updateMany({ campaignId: req.params.id, status: { $in: ['pending', 'queued', 'sending', 'retrying'] } }, { $set: { status: 'cancelled' } });
    } else {
      const c = memoryCampaigns.find(x => x._id === req.params.id);
      if (c) { c.status = 'stopped'; c.completedAt = new Date(); }
      [...memoryDeliveryRecords.values()].filter(dr => dr.campaignId === req.params.id && ['pending', 'queued', 'sending', 'retrying'].includes(dr.status)).forEach(dr => { dr.status = 'cancelled'; });
    }
    return res.json({ message: 'Campaign stopped.', status: 'stopped' });
  } catch (error) { return res.status(500).json({ message: 'Could not stop campaign.', detail: error.message }); }
});

// ---------- Unsubscribe ----------
app.get('/api/unsubscribe/:token', async (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribe</title></head><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Unsubscribe</h2><p>Click below to confirm unsubscribing from future emails.</p><form method="POST" action="/api/unsubscribe/${req.params.token}"><button style="padding:12px 24px;background:#dc3545;color:#fff;border:none;border-radius:6px;font-size:16px">Unsubscribe</button></form><p id="msg" style="margin-top:16px;color:#666"></p><script>document.querySelector('form').onsubmit=async(e)=>{e.preventDefault();const r=await fetch('/api/unsubscribe/${req.params.token}',{method:'POST'});const d=await r.json();document.getElementById('msg').textContent=d.message||d.detail||'Done';};</script></body></html>`);
});

app.post('/api/unsubscribe/:token', async (req, res) => {
  try {
    let record;
    if (connected()) record = await DeliveryRecord.findOne({ unsubscribeToken: req.params.token });
    else record = [...memoryDeliveryRecords.values()].find(dr => dr.unsubscribeToken === req.params.token);
    if (!record) return res.status(400).json({ message: 'Invalid unsubscribe token.' });

    const email = record.email;
    if (connected()) {
      await Contact.updateOne({ email }, { $set: { unsubscribed: true } });
      await SuppressionList.updateOne({ email }, { $set: { email, reason: 'unsubscribe', sourceCampaignId: record.campaignId, unsubscribedAt: new Date() } }, { upsert: true });
      await DeliveryRecord.updateOne({ _id: record._id }, { $set: { status: 'cancelled' } });
    } else {
      const c = memoryContacts.get(email);
      if (c) { c.unsubscribed = true; memoryContacts.set(email, c); }
      memorySuppression.set(email, { email, reason: 'unsubscribe', sourceCampaignId: record.campaignId, unsubscribedAt: new Date() });
      record.status = 'cancelled';
    }
    return res.json({ message: 'You have been unsubscribed successfully.' });
  } catch (error) { return res.status(500).json({ message: 'Unsubscribe failed.', detail: error.message }); }
});

app.get('/api/suppression', async (_req, res) => {
  try {
    let list;
    if (connected()) list = await SuppressionList.find().sort({ unsubscribedAt: -1 }).limit(1000).lean();
    else list = [...memorySuppression.values()];
    return res.json(list);
  } catch (error) { return res.status(500).json({ message: 'Could not load suppression list.', detail: error.message }); }
});

// ---------- Background worker ----------
async function processBatch() {
  if (!connected()) return;
  try {
    const campaigns = await Campaign.find({ status: 'running' }).lean();
    for (const campaign of campaigns) {
      await processCampaignBatch(campaign);
    }
  } catch (error) { console.error('Worker batch error:', error.message); }
}

async function processCampaignBatch(campaign) {
  const provider = await EmailProvider.findById(campaign.providerId).lean();
  if (!provider || !provider.isEnabled || provider.connectionStatus !== 'connected') return;

  const usage = await getTrialUsage();
  const isTrial = usage.status === 'trial' || usage.status === 'inactive';
  if (isTrial && usage.remaining <= 0) {
    await Campaign.findByIdAndUpdate(campaign._id, { $set: { status: 'stopped', completedAt: new Date() } });
    return;
  }

  const pending = await DeliveryRecord.find({ campaignId: campaign._id, status: 'pending' }).limit(campaign.batchSize).lean();
  if (!pending.length) {
    const remaining = await DeliveryRecord.countDocuments({ campaignId: campaign._id, status: { $in: ['pending', 'queued', 'sending', 'retrying'] } });
    if (remaining === 0) {
      await Campaign.findByIdAndUpdate(campaign._id, { $set: { status: 'completed', completedAt: new Date() } });
    }
    return;
  }

  for (const record of pending) {
    const campaignCurrent = await Campaign.findById(campaign._id).lean();
    if (campaignCurrent.status !== 'running') break;

    const contact = await Contact.findOne({ email: record.email }).lean();
    if (contact && contact.unsubscribed) {
      await DeliveryRecord.updateOne({ _id: record._id }, { $set: { status: 'cancelled' } });
      await Campaign.findByIdAndUpdate(campaign._id, { $inc: { 'counts.pending': -1, 'counts.cancelled': 1 } });
      continue;
    }

    const suppressed = await SuppressionList.findOne({ email: record.email });
    if (suppressed) {
      await DeliveryRecord.updateOne({ _id: record._id }, { $set: { status: 'cancelled' } });
      await Campaign.findByIdAndUpdate(campaign._id, { $inc: { 'counts.pending': -1, 'counts.cancelled': 1 } });
      continue;
    }

    await DeliveryRecord.updateOne({ _id: record._id }, { $set: { status: 'sending', lastAttemptAt: new Date(), attemptCount: record.attemptCount + 1 } });
    await Campaign.findByIdAndUpdate(campaign._id, { $inc: { 'counts.pending': -1, 'counts.sending': 1 } });

    const unsubscribeUrl = `${campaign.unsubscribePageUrl}?token=${record.unsubscribeToken}`;
    let content;
    if (campaign.emailFormat === 'HTML') content = { html: renderMergeFields(campaign.messageHtml, { ...contact, email: record.email }, unsubscribeUrl), text: renderMergeFields(campaign.messagePlain, { ...contact, email: record.email }, unsubscribeUrl) };
    else if (campaign.emailFormat === 'AMP') content = { amp: renderMergeFields(campaign.messageAmp, { ...contact, email: record.email }, unsubscribeUrl), html: renderMergeFields(campaign.messageHtml, { ...contact, email: record.email }, unsubscribeUrl), text: renderMergeFields(campaign.messagePlain, { ...contact, email: record.email }, unsubscribeUrl) };
    else content = { text: renderMergeFields(campaign.messagePlain, { ...contact, email: record.email }, unsubscribeUrl) };

    try {
      const result = await sendEmail(provider, {
        to: record.email, subject: renderMergeFields(campaign.subject, { ...contact, email: record.email }, unsubscribeUrl),
        ...content,
        cc: campaign.cc, bcc: campaign.bcc,
        senderName: campaign.senderName, senderEmail: campaign.senderEmail,
        replyTo: campaign.replyTo, unsubscribeUrl,
      });
      await DeliveryRecord.updateOne({ _id: record._id }, { $set: { status: 'sent', sentAt: new Date(), providerMessageId: result.messageId } });
      await Campaign.findByIdAndUpdate(campaign._id, { $inc: { 'counts.sending': -1, 'counts.sent': 1 } });
      if (isTrial) await recordTrialEmails(1);
    } catch (error) {
      const attempt = record.attemptCount + 1;
      if (attempt < campaign.maxRetries) {
        await DeliveryRecord.updateOne({ _id: record._id }, { $set: { status: 'retrying', errorReason: error.message, attemptCount: attempt } });
        await Campaign.findByIdAndUpdate(campaign._id, { $inc: { 'counts.sending': -1, 'counts.retrying': 1 } });
      } else {
        await DeliveryRecord.updateOne({ _id: record._id }, { $set: { status: 'failed', errorReason: error.message, attemptCount: attempt } });
        await Campaign.findByIdAndUpdate(campaign._id, { $inc: { 'counts.sending': -1, 'counts.failed': 1 } });
      }
    }

    if (campaign.requestDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, campaign.requestDelayMs));
    }
  }
}

function startWorker() {
  if (workerRunning || workerInterval) return;
  workerRunning = true;
  workerInterval = setInterval(processBatch, WORKER_INTERVAL_MS);
  processBatch();
}

function stopWorker() {
  if (workerInterval) { clearInterval(workerInterval); workerInterval = null; }
  workerRunning = false;
}

app.use((_req, res) => res.status(404).json({ message: 'Route not found.' }));

let serverInstance;
async function init() {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI).then(() => console.log('MongoDB connected.')).catch(error => console.error(`MongoDB unavailable; using memory mode. ${error.message}`));
  } else {
    console.log('MONGODB_URI is not set; using in-memory mode.');
  }
  await ensureDefaultTrial();
  await resetProviderCountersIfNeeded();
  serverInstance = app.listen(port, () => console.log(`Mazzi Mail API listening at http://localhost:${port}`));
  startWorker();
}
init().catch(error => console.error('Init error:', error.message));

export default app;
