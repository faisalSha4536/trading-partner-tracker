const express = require('express');
const { supabase } = require('../config/supabaseClient');
const { calculateBalances } = require('../services/balanceService');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const { getPartnerByUserId } = require('../models/partnerModel');
const { getPnlEntries, getDepositWithdrawalEntries, deleteLedgerEntry } = require('../models/ledgerModel');
const { getSpotFills } = require('../services/bitgetService');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const asOfDate = req.query.asOfDate || new Date().toISOString().split('T')[0];

    let ownerId;
    if (req.userRole === 'admin') {
      ownerId = req.user.id;
    } else {
      const myPartnerRow = await getPartnerByUserId(req.user.id);
      if (!myPartnerRow) return res.status(403).json({ error: "No partner record linked to this account" });
      ownerId = myPartnerRow.owner_id;
    }

    const balances = await calculateBalances(asOfDate, ownerId, req.userRole, req.user.id);
    res.json(balances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pnl-history', requireAuth, async (req, res) => {
  try {
    let ownerId;
    if (req.userRole === 'admin') {
      ownerId = req.user.id;
    } else {
      const myPartnerRow = await getPartnerByUserId(req.user.id);
      if (!myPartnerRow) return res.status(403).json({ error: "No partner record linked to this account" });
      ownerId = myPartnerRow.owner_id;
    }
    const entries = await getPnlEntries(ownerId);
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/transaction-log', requireAuth, requireAdmin, async (req, res) => {
  try {
    const entries = await getDepositWithdrawalEntries(req.user.id);
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/pnl-history/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await deleteLedgerEntry(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/pnl-history/acknowledge', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { entry_date } = req.body;
    const { error } = await supabase
      .from('ledger')
      .update({ warning_acknowledged: true })
      .eq('owner_id', req.user.id)
      .eq('entry_date', entry_date);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/bitget-test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const fills = await getSpotFills();
    res.json(fills);
  } catch (error) {
    res.status(500).json({ error: error.message, details: error.response ? error.response.data : null });
  }
});

module.exports = router;