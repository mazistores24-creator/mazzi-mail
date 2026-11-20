import mongoose from 'mongoose';
const campaignSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  messagePlain: { type: String, default: '' },
  messageHtml: { type: String, default: '' },
  messageAmp: { type: String, default: '' },
  emailFormat: { type: String, enum: ['Plain Text', 'HTML', 'AMP'], default: 'Plain Text' },
  senderName: { type: String, required: true },
  senderEmail: { type: String, required: true },
  replyTo: String,
  cc: [String],
  bcc: [String],
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailProvider' },
  dailyLimit: { type: Number, default: 100 },
  status: { type: String, enum: ['draft', 'pending', 'running', 'paused', 'completed', 'stopped', 'failed'], default: 'draft', index: true },
  counts: {
    total: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    queued: { type: Number, default: 0 },
    sending: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 },
    retrying: { type: Number, default: 0 },
  },
  preview: [{ email: String, name: String, subject: String, message: String }],
  batchSize: { type: Number, default: 50 },
  requestDelayMs: { type: Number, default: 1000 },
  maxRetries: { type: Number, default: 3 },
  startedAt: { type: Date },
  completedAt: { type: Date },
  pausedAt: { type: Date },
  trialEmailsUsed: { type: Number, default: 0 },
  unsubscribePageUrl: { type: String },
  createdBy: { type: String },
  testMode: { type: Boolean, default: false },
}, { timestamps: true });

campaignSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Campaign', campaignSchema);
