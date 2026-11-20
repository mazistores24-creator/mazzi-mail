import mongoose from 'mongoose';
const trialUsageSchema = new mongoose.Schema({
  date: { type: Date, required: true, index: true },
  emailsSent: { type: Number, default: 0 },
  limit: { type: Number, default: 30 },
}, { timestamps: false });

trialUsageSchema.index({ date: 1 }, { unique: true });

export default mongoose.model('TrialUsage', trialUsageSchema);
