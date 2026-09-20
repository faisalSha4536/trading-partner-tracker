const express = require('express');
const { supabase } = require('../config/supabaseClient');
const { encrypt, decrypt } = require('../utils/encryption');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const axios = require('axios');
const { generateBitgetSignature } = require('../utils/bitgetSign');
const { syncBitgetPnl } = require('../services/bitgetSyncService');

const router = express.Router();

router.post('/bitget/connect', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { api_key, secret_key, passphrase } = req.body;
    if (!api_key || !secret_key || !passphrase) {
      return res.status(400).json({ error: "All three fields are required" });
    }

    const encryptedKey = encrypt(api_key);
    const encryptedSecret = encrypt(secret_key);
    const encryptedPassphrase = encrypt(passphrase);

    const { data, error } = await supabase
      .from('exchange_credentials')
      .upsert({
        owner_id: req.user.id,
        exchange: 'bitget',
        api_key: encryptedKey,
        secret_key: encryptedSecret,
        passphrase: encryptedPassphrase,
      }, { onConflict: 'owner_id,exchange' })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, connected: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/bitget/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('exchange_credentials')
      .select('id, created_at')
      .eq('owner_id', req.user.id)
      .eq('exchange', 'bitget')
      .maybeSingle();

    if (error) throw error;
    res.json({ connected: !!data, connectedAt: data ? data.created_at : null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/bitget/test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data: credRow, error } = await supabase
      .from('exchange_credentials')
      .select('*')
      .eq('owner_id', req.user.id)
      .eq('exchange', 'bitget')
      .maybeSingle();

    if (error) throw error;
    if (!credRow) return res.status(404).json({ error: "No Bitget credentials saved yet" });

    const apiKey = decrypt(credRow.api_key);
    const secretKey = decrypt(credRow.secret_key);
    const passphrase = decrypt(credRow.passphrase);

    const baseUrl = process.env.BITGET_API_URL || 'https://api.bitget.com';
    const timeRes = await axios.get(baseUrl + '/api/v2/public/time');
    const timestamp = timeRes.data.data.serverTime;

    const requestPath = '/api/v2/spot/account/assets';
    const signature = generateBitgetSignature(timestamp, 'GET', requestPath, '', secretKey);

    const response = await axios.get(baseUrl + requestPath, {
      headers: {
        'ACCESS-KEY': apiKey,
        'ACCESS-SIGN': signature,
        'ACCESS-PASSPHRASE': passphrase,
        'ACCESS-TIMESTAMP': timestamp,
        'locale': 'en-US',
        'Content-Type': 'application/json',
      },
    });

    res.json({ success: true, message: "Connection successful", data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, details: error.response ? error.response.data : null });
  }
});

router.post('/bitget/sync-toggle', requireAuth, requireAdmin, async (req, res) => {
  try {
    console.log('[sync-toggle] req.user:', req.user);
    const { enabled } = req.body;
    const updateData = { sync_enabled: enabled };
    if (enabled) {
      updateData.sync_start_time = req.user.created_at;
    }

    const { data, error } = await supabase
      .from('exchange_credentials')
      .update(updateData)
      .eq('owner_id', req.user.id)
      .eq('exchange', 'bitget')
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/bitget/sync-now', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { customStartDate } = req.body;
    const result = await syncBitgetPnl(req.user.id, customStartDate);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message, details: error.response ? error.response.data : null });
  }
});

module.exports = router;
