import mongoose from 'mongoose';
const suppressionListSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, unique: true, index: true },
  reason: { type: String, enum: ['unsubscribe', 'bounce', 'spam_complaint', 'manual'], default: 'unsubscribe' },
  sourceCampaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  sourceWebsite: { type: String },
  unsubscribedAt: { type: Date, default: Date.now },
  note: { type: String },
}, { timestamps: true });

export default mongoose.model('SuppressionList', suppressionListSchema);
