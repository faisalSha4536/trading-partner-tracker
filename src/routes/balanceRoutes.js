const express = require('express');
const { calculateBalances } = require('../services/balanceService');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const asOfDate = req.query.asOfDate || new Date().toISOString().split('T')[0];
    const balances = await calculateBalances(asOfDate);
    res.json(balances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
