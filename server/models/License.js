import mongoose from 'mongoose';
const licenseSchema = new mongoose.Schema({
  licenseKey: { type: String, unique: true, sparse: true, index: true },
  status: { type: String, enum: ['inactive', 'trial', 'active', 'expired'], default: 'inactive', index: true },
  purchasedAt: { type: Date },
  activatedAt: { type: Date },
  expiresAt: { type: Date },
  trialEmailsSent: { type: Number, default: 0 },
  trialLimit: { type: Number, default: 30 },
  trialActivatedAt: { type: Date },
  purchaseLink: { type: String },
  provider: { type: String },
  plan: { type: String },
  validationError: { type: String },
  lastValidatedAt: { type: Date },
}, { timestamps: true });

export default mongoose.model('License', licenseSchema);
