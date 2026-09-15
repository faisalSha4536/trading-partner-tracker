const express = require('express');
const { addLedgerEntry } = require('../models/ledgerModel');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/deposit', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { partner_id, amount, entry_date } = req.body;
    const entry = await addLedgerEntry({
      entry_type: 'deposit',
      amount,
      partner_id,
      entry_date,
    });
    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/withdrawal', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { partner_id, amount, entry_date } = req.body;
    const entry = await addLedgerEntry({
      entry_type: 'withdrawal',
      amount,
      partner_id,
      entry_date,
    });
    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/pnl', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { amount, entry_date } = req.body;
    const entry = await addLedgerEntry({
      entry_type: 'pnl',
      amount,
      partner_id: null,
      entry_date,
    });
    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
