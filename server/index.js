import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import Contact from './models/Contact.js';
import Campaign from './models/Campaign.js';

const app = express();
const port = Number(process.env.PORT) || 5001;
const memoryContacts = new Map();
const memoryCampaigns = [];
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5174').split(',').map(origin => origin.trim());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '2mb' }));
const connected = () => mongoose.connection.readyState === 1;

app.get('/api/health', (_req,res) => res.json({ ok: true, database: connected() ? 'connected' : 'memory mode', mode: 'preview only' }));

app.post('/api/contacts/import', async (req,res) => {
  const rows = req.body?.contacts;
  if (!Array.isArray(rows) || rows.length > 10000) return res.status(400).json({ message: 'Provide up to 10,000 contacts.' });
  const cleaned = rows.filter(row => typeof row.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)).map(row => ({ email: row.email.toLowerCase().trim(), name: String(row.name || '').slice(0,120), optedIn: row.optedIn === true, consentSource: String(row.consentSource || '').slice(0,200) }));
  try {
    if (connected()) {
      await Contact.bulkWrite(cleaned.map(contact => ({ updateOne: { filter: { email: contact.email }, update: { $set: { name: contact.name, optedIn: contact.optedIn, consentSource: contact.consentSource }, $setOnInsert: { unsubscribed: false } }, upsert: true } })), { ordered: false });
      const contacts = await Contact.find({ email: { $in: cleaned.map(row => row.email) } }).lean();
      return res.status(201).json({ count: contacts.length, eligible: contacts.filter(row => row.optedIn && !row.unsubscribed).length, contacts });
    }
    for (const contact of cleaned) memoryContacts.set(contact.email, { ...memoryContacts.get(contact.email), ...contact, unsubscribed: memoryContacts.get(contact.email)?.unsubscribed || false });
    const contacts = cleaned.map(row => memoryContacts.get(row.email));
    return res.status(201).json({ count: contacts.length, eligible: contacts.filter(row => row.optedIn && !row.unsubscribed).length, contacts, persistence: 'memory' });
  } catch (error) { return res.status(500).json({ message: 'Could not save the contact list.', detail: error.message }); }
});

app.get('/api/contacts', async (_req,res) => {
  try { return res.json(connected() ? await Contact.find().sort({ createdAt: -1 }).limit(1000).lean() : [...memoryContacts.values()]); }
  catch (error) { return res.status(500).json({ message: 'Could not load contacts.', detail: error.message }); }
});

app.post('/api/campaigns/preview', async (req,res) => {
  const { subject, message, contacts = [], senderName, senderEmail, replyTo, cc, bcc, emailFormat, dailyLimit = 100 } = req.body || {};
  if (typeof subject !== 'string' || !subject.trim() || typeof message !== 'string' || !message.trim()) return res.status(400).json({ message: 'A subject and message are required.' });
  if (!Array.isArray(contacts) || contacts.length > 10000) return res.status(400).json({ message: 'Invalid recipient list.' });
  const limit = Math.min(250, Math.max(1, Number(dailyLimit) || 100));
  const safeContacts = contacts.filter(row => row.optedIn === true && row.unsubscribed !== true && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email || '')).slice(0, limit);
  const preview = safeContacts.map(person => ({ email: person.email, name: person.name || '', subject: subject.trim(), message: message.replaceAll('{{name}}', person.name || 'there').replaceAll('%FNAME%', (person.name || 'there').split(/\s+/)[0]).replaceAll('%EMAIL%', person.email || '').replaceAll('{{email}}', person.email || '').replaceAll('{{unsubscribe_link}}', '[unsubscribe link — no live links are generated in preview mode]') }));
  const counts = { total: safeContacts.length, success: 0, pending: safeContacts.length, failure: 0 };
  try {
    const record = { subject: subject.trim(), emailFormat: ['Plain Text','HTML','AMP'].includes(emailFormat) ? emailFormat : 'Plain Text', senderName, senderEmail, replyTo, cc, bcc, dailyLimit: limit, status: 'preview', counts, preview };
    if (connected()) await Campaign.create(record); else memoryCampaigns.unshift({ ...record, _id: `preview-${Date.now()}`, createdAt: new Date() });
    return res.json({ ...counts, preview, mode: 'preview only' });
  } catch (error) { return res.status(500).json({ message: 'Could not save the preview.', detail: error.message }); }
});

app.get('/api/campaigns', async (_req,res) => {
  try { return res.json(connected() ? await Campaign.find().select('-preview').sort({ createdAt: -1 }).limit(50).lean() : memoryCampaigns.slice(0,50).map(({ preview, ...row }) => row)); }
  catch (error) { return res.status(500).json({ message: 'Could not load campaign history.', detail: error.message }); }
});

app.use((_req,res) => res.status(404).json({ message: 'Route not found.' }));
app.listen(port, () => console.log(`Mazzi Mail API listening at http://localhost:${port}`));
if (process.env.MONGODB_URI) mongoose.connect(process.env.MONGODB_URI).then(() => console.log('MongoDB connected.')).catch(error => console.error(`MongoDB unavailable; using memory mode. ${error.message}`));
else console.log('MONGODB_URI is not set; using in-memory contacts and campaign history.');
