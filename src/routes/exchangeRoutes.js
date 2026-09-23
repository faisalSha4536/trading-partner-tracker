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

    const upsertPayload = {
      owner_id: req.user.id,
      exchange: 'bitget',
      api_key: encryptedKey,
      secret_key: encryptedSecret,
      passphrase: encryptedPassphrase,
      is_valid: true,
    };

    let data, error;
    try {
      const res1 = await supabase
        .from('exchange_credentials')
        .upsert(upsertPayload, { onConflict: 'owner_id,exchange' })
        .select()
        .single();
      data = res1.data;
      error = res1.error;
    } catch (e) {
      error = e;
    }

    if (error && error.message && error.message.includes('is_valid')) {
      delete upsertPayload.is_valid;
      const res2 = await supabase
        .from('exchange_credentials')
        .upsert(upsertPayload, { onConflict: 'owner_id,exchange' })
        .select()
        .single();
      data = res2.data;
      error = res2.error;
    }

    if (error) throw error;
    res.json({ success: true, connected: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/bitget/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    let data, error;
    try {
      const res1 = await supabase
        .from('exchange_credentials')
        .select('id, created_at, is_valid')
        .eq('owner_id', req.user.id)
        .eq('exchange', 'bitget')
        .maybeSingle();
      data = res1.data;
      error = res1.error;
    } catch (e) {
      error = e;
    }

    if (error && error.message && error.message.includes('is_valid')) {
      const res2 = await supabase
        .from('exchange_credentials')
        .select('id, created_at')
        .eq('owner_id', req.user.id)
        .eq('exchange', 'bitget')
        .maybeSingle();
      data = res2.data;
      error = res2.error;
    }

    if (error) throw error;
    console.log('Bitget status response:', { connected: !!data, is_valid: data ? data.is_valid : null });
    res.json({
      connected: !!data,
      is_valid: data ? (data.is_valid !== undefined ? data.is_valid : true) : null,
      connectedAt: data ? data.created_at : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/bitget/disconnect', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase
      .from('exchange_credentials')
      .delete()
      .eq('owner_id', req.user.id)
      .eq('exchange', 'bitget');
    if (error) throw error;
    res.json({ success: true });
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

    try {
      await supabase
        .from('exchange_credentials')
        .update({ is_valid: true })
        .eq('owner_id', req.user.id)
        .eq('exchange', 'bitget');
    } catch (updateErr) {
      // ignore if column doesn't exist yet
    }

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
