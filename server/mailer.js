import nodemailer from 'nodemailer';
import crypto from 'crypto';

let transporterCache = new Map();

function getTransporter(provider) {
  const secure = provider.encryption === 'ssl';
  const tls = provider.encryption === 'tls' || provider.encryption === 'ssl';
  const config = {
    host: provider.host,
    port: provider.port,
    secure,
    auth: { user: provider.username, pass: provider.password },
    tls: tls ? { rejectUnauthorized: false } : undefined,
  };
  const key = `${provider.host}:${provider.port}:${provider.username}`;
  if (!transporterCache.has(key)) {
    transporterCache.set(key, nodemailer.createTransport(config));
  }
  return transporterCache.get(key);
}

export async function testProviderConnection(provider) {
  try {
    const transport = getTransporter(provider);
    await transport.verify();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function sendEmail(provider, { to, subject, text, html, amp, cc = [], bcc = [], senderName, senderEmail, replyTo, messageId, unsubscribeUrl }) {
  const transport = getTransporter(provider);
  const from = `${senderName} <${senderEmail}>`;
  const mailOptions = {
    from,
    to,
    subject,
    text: text || '',
    html: html || undefined,
    amp: amp || undefined,
  };
  if (cc && cc.length) mailOptions.cc = cc.join(', ');
  if (bcc && bcc.length) mailOptions.bcc = bcc.join(', ');
  if (replyTo) mailOptions.replyTo = replyTo;
  if (messageId) mailOptions.messageId = messageId;
  if (unsubscribeUrl) {
    mailOptions.headers = mailOptions.headers || {};
    mailOptions.headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
    mailOptions.headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  const info = await transport.sendMail(mailOptions);
  return { messageId: info.messageId, accepted: info.accepted || [], rejected: info.rejected || [] };
}

export function generateUnsubscribeToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function renderMergeFields(template, contact, unsubscribeUrl) {
  const firstName = (contact.name || 'there').split(/\s+/)[0];
  const replacements = {
    '{{name}}': contact.name || 'there',
    '{{first_name}}': firstName,
    '{{last_name}}': (contact.name || '').split(/\s+/).slice(1).join(' ') || '',
    '{{last_name}}': contact.name ? String(contact.name).split(/\s+/).slice(1).join(' ') || '' : '',
    '{{company}}': contact.company || '',
    '{{email}}': contact.email || '',
    '%FNAME%': firstName,
    '%EMAIL%': contact.email || '',
    '%NAME%': contact.name || 'there',
    '{{unsubscribe_link}}': unsubscribeUrl || '[unsubscribe link]',
  };
  let result = String(template || '');
  for (const [pattern, value] of Object.entries(replacements)) {
    result = result.replaceAll(pattern, value);
  }
  return result;
}

export function clearTransporterCache() {
  transporterCache.clear();
}
