async function syncBitgetPnl(ownerId, customStartTime) {
  const { supabase } = require('../config/supabaseClient');
  const { decrypt } = require('../utils/encryption');
  const { calculateRealizedPnlByDay } = require('./pnlCalculator');
  const axios = require('axios');
  const { generateBitgetSignature } = require('../utils/bitgetSign');
  const { notifyPartnersOfPnl } = require('./pushService');

  // 1. Get this owner's saved credentials and sync settings
  const { data: credRow, error: credError } = await supabase
    .from('exchange_credentials')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('exchange', 'bitget')
    .maybeSingle();

  if (credError) throw credError;
  if (!credRow || !credRow.sync_enabled) {
    return { synced: false, reason: 'Sync not enabled or no credentials found' };
  }

  const apiKey = decrypt(credRow.api_key);
  const secretKey = decrypt(credRow.secret_key);
  const passphrase = decrypt(credRow.passphrase);

  const startTime = customStartTime
    ? new Date(customStartTime).getTime()
    : (credRow.last_synced_time
        ? new Date(credRow.last_synced_time).getTime()
        : new Date(credRow.sync_start_time).getTime());
  const endTime = Date.now();

  // 2. Fetch fills from Bitget since last sync
  const baseUrl = process.env.BITGET_API_URL || 'https://api.bitget.com';
  const timeRes = await axios.get(baseUrl + '/api/v2/public/time');
  const timestamp = timeRes.data.data.serverTime;

  const requestPath = '/api/v2/spot/trade/fills';
  const queryParams = new URLSearchParams();
  queryParams.append('startTime', startTime.toString());
  queryParams.append('endTime', endTime.toString());
  queryParams.append('limit', '100');
  const queryString = '?' + queryParams.toString();

  const signature = generateBitgetSignature(timestamp, 'GET', requestPath, queryString, secretKey);

  const fillsResponse = await axios.get(baseUrl + requestPath + queryString, {
    headers: {
      'ACCESS-KEY': apiKey,
      'ACCESS-SIGN': signature,
      'ACCESS-PASSPHRASE': passphrase,
      'ACCESS-TIMESTAMP': timestamp,
      'locale': 'en-US',
      'Content-Type': 'application/json',
    },
  });

  const fills = fillsResponse.data.data || [];

  if (fills.length === 0) {
    return { synced: true, entriesCreated: 0 };
  }

  // 3. Calculate P&L per day
  const pnlByDay = calculateRealizedPnlByDay(fills);

  // 4. Upsert one ledger entry per day
  let entriesCreated = 0;
  for (const [dateKey, amount] of Object.entries(pnlByDay)) {
    const { data: existing, error: findError } = await supabase
      .from('ledger')
      .select('id')
      .eq('owner_id', ownerId)
      .eq('entry_date', dateKey)
      .eq('source', 'bitget_sync')
      .maybeSingle();

    if (findError) throw findError;

    if (existing) {
      const { error: updateError } = await supabase
        .from('ledger')
        .update({ amount })
        .eq('id', existing.id);
      if (updateError) throw updateError;
      try {
        await notifyPartnersOfPnl(ownerId, amount, dateKey);
      } catch (pushErr) {
        console.error('Push notification error:', pushErr);
      }
    } else {
      const { error: insertError } = await supabase
        .from('ledger')
        .insert({
          entry_type: 'pnl',
          amount,
          partner_id: null,
          entry_date: dateKey,
          owner_id: ownerId,
          source: 'bitget_sync',
        });
      if (insertError) throw insertError;
      try {
        await notifyPartnersOfPnl(ownerId, amount, dateKey);
      } catch (pushErr) {
        console.error('Push notification error:', pushErr);
      }
    }
    entriesCreated++;
  }

  // 5. Update last_synced_time
  await supabase
    .from('exchange_credentials')
    .update({ last_synced_time: new Date(endTime).toISOString() })
    .eq('owner_id', ownerId)
    .eq('exchange', 'bitget');

  return { synced: true, entriesCreated };
}

module.exports = { syncBitgetPnl };
