import mongoose from 'mongoose';
const campaignSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  emailFormat: { type: String, enum: ['Plain Text','HTML','AMP'], default: 'Plain Text' },
  senderName: String,
  senderEmail: String,
  replyTo: String,
  cc: String,
  bcc: String,
  dailyLimit: Number,
  status: { type: String, default: 'preview' },
  counts: { total: Number, success: Number, pending: Number, failure: Number },
  preview: [{ email: String, name: String, subject: String, message: String }]
}, { timestamps: true });
export default mongoose.model('Campaign', campaignSchema);
