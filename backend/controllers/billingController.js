const Billing = require('../models/Billing');

const MONTHS = [
  'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
];

/* helper — fetch doc or auto-create a blank one */
const getOrCreate = async (residentId, year) => {
  let doc = await Billing.findOne({ residentId, year });
  if (!doc) doc = await Billing.create({ residentId, year });
  return doc;
};

/* ── GET /api/billing/:residentId/:year ─────────────────────────
   Returns full billing document for a resident + year.
   Auto-creates a blank document if none exists yet.             */
const getBilling = async (req, res) => {
  try {
    const { residentId, year } = req.params;
    const doc = await getOrCreate(residentId, parseInt(year));
    res.json(doc);
  } catch (err) {
    console.error('getBilling error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ── PATCH /api/billing/:residentId/:year/:month ────────────────
   Update a single month record.
   Body can include: paid, orNumber, datePaid, remarks           */
const updateMonth = async (req, res) => {
  try {
    const { residentId, year, month } = req.params;
    const upperMonth = month.toUpperCase();

    if (!MONTHS.includes(upperMonth)) {
      return res.status(400).json({ message: `Invalid month: ${month}` });
    }

    const { paid, orNumber, datePaid, remarks } = req.body;

    const update = {};
    if (paid      !== undefined) update[`months.${upperMonth}.paid`]      = paid;
    if (orNumber  !== undefined) update[`months.${upperMonth}.orNumber`]  = orNumber;
    if (datePaid  !== undefined) update[`months.${upperMonth}.datePaid`]  = datePaid;
    if (remarks   !== undefined) update[`months.${upperMonth}.remarks`]   = remarks;

    const doc = await Billing.findOneAndUpdate(
      { residentId, year: parseInt(year) },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json(doc);
  } catch (err) {
    console.error('updateMonth error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ── GET /api/billing/summary/:year ────────────────────────────
   Returns paid-month counts for ALL residents for a given year.
   Used by the list view progress bars.                          */
const getSummary = async (req, res) => {
  try {
    const { year } = req.params;
    const docs = await Billing.find({ year: parseInt(year) })
      .select('residentId months')
      .lean();

    const summary = docs.map(doc => {
      const paidCount = MONTHS.filter(m => doc.months?.[m]?.paid).length;
      return { residentId: doc.residentId, paidCount };
    });

    res.json(summary);
  } catch (err) {
    console.error('getSummary error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getBilling, updateMonth, getSummary };