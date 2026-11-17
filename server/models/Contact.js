import mongoose from 'mongoose';
const contactSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, default: '' },
  optedIn: { type: Boolean, default: false },
  consentSource: { type: String, default: '' },
  unsubscribed: { type: Boolean, default: false }
}, { timestamps: true });
export default mongoose.model('Contact', contactSchema);
