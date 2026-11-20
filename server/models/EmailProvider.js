import mongoose from 'mongoose';
const emailProviderSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  host: { type: String, required: true, trim: true },
  port: { type: Number, required: true },
  username: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  encryption: { type: String, enum: ['tls', 'ssl', 'none'], default: 'tls' },
  senderName: { type: String, required: true, trim: true },
  senderEmail: { type: String, required: true, trim: true },
  isEnabled: { type: Boolean, default: false },
  isDefault: { type: Boolean, default: false },
  connectionStatus: { type: String, enum: ['unknown', 'connected', 'failed', 'not_tested'], default: 'not_tested' },
  lastTestedAt: { type: Date },
  lastTestError: { type: String },
  dailyLimit: { type: Number, default: 500 },
  hourlyLimit: { type: Number, default: 50 },
  sentToday: { type: Number, default: 0 },
  sentThisHour: { type: Number, default: 0 },
  resetSentAt: { type: Date, default: Date.now },
}, { timestamps: true });

emailProviderSchema.index({ isDefault: 1 });
emailProviderSchema.index({ isEnabled: 1 });

export default mongoose.model('EmailProvider', emailProviderSchema);
