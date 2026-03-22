const mongoose = require('mongoose');

const monthRecordSchema = new mongoose.Schema({
  paid:      { type: Boolean, default: false },
  orNumber:  { type: String,  default: '' },
  datePaid:  { type: String,  default: '' },   // stored as 'YYYY-MM-DD' string
  remarks:   { type: String,  default: '' },
}, { _id: false });

const billingSchema = new mongoose.Schema({
  residentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resident',
    required: true,
  },
  year: {
    type: Number,
    required: true,
  },
  monthlyDue: {
    type: Number,
    default: 150,
  },
  months: {
    JANUARY:   { type: monthRecordSchema, default: () => ({}) },
    FEBRUARY:  { type: monthRecordSchema, default: () => ({}) },
    MARCH:     { type: monthRecordSchema, default: () => ({}) },
    APRIL:     { type: monthRecordSchema, default: () => ({}) },
    MAY:       { type: monthRecordSchema, default: () => ({}) },
    JUNE:      { type: monthRecordSchema, default: () => ({}) },
    JULY:      { type: monthRecordSchema, default: () => ({}) },
    AUGUST:    { type: monthRecordSchema, default: () => ({}) },
    SEPTEMBER: { type: monthRecordSchema, default: () => ({}) },
    OCTOBER:   { type: monthRecordSchema, default: () => ({}) },
    NOVEMBER:  { type: monthRecordSchema, default: () => ({}) },
    DECEMBER:  { type: monthRecordSchema, default: () => ({}) },
  },
}, {
  timestamps: true,
});

// One billing document per resident per year
billingSchema.index({ residentId: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Billing', billingSchema);