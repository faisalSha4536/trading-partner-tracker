const express = require('express');
const { getAllPartners, createPartner } = require('../models/partnerModel');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const partners = await getAllPartners();
    res.json(partners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    const partner = await createPartner(name);
    res.json(partner);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
