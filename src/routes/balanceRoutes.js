const express = require('express');
const { calculateBalances } = require('../services/balanceService');
const { requireAuth } = require('../middleware/authMiddleware');
const { getPartnerByUserId } = require('../models/partnerModel');

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

    const balances = await calculateBalances(asOfDate, ownerId);
    res.json(balances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;