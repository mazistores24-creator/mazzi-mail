import mongoose from 'mongoose';
const deliveryRecordSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', index: true },
  email: { type: String, required: true, lowercase: true, index: true },
  name: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'queued', 'sending', 'sent', 'failed', 'cancelled', 'retrying'], default: 'pending', index: true },
  attemptCount: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  lastAttemptAt: { type: Date },
  sentAt: { type: Date },
  errorReason: { type: String },
  providerMessageId: { type: String },
  emailFormat: { type: String, enum: ['Plain Text', 'HTML', 'AMP'], default: 'Plain Text' },
  subject: { type: String },
  cc: [{ type: String }],
  bcc: [{ type: String }],
  unsubscribeToken: { type: String, unique: true, sparse: true, index: true },
}, { timestamps: true });

deliveryRecordSchema.index({ campaignId: 1, status: 1 });
deliveryRecordSchema.index({ email: 1, campaignId: 1 }, { unique: true });

export default mongoose.model('DeliveryRecord', deliveryRecordSchema);
