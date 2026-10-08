async function syncBitgetPnl(ownerId, customStartTime) {
  const { supabase } = require('../config/supabaseClient');
  const { decrypt } = require('../utils/encryption');
  const { calculateRealizedPnlByDay } = require('./pnlCalculator');
  const axios = require('axios');
  const { generateBitgetSignature } = require('../utils/bitgetSign');

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
    : new Date(credRow.sync_start_time).getTime();
  const endTime = Date.now();

  const baseUrl = process.env.BITGET_API_URL || 'https://api.bitget.com';
  const requestPath = '/api/v2/spot/trade/fills';

  const fetchFillsPage = async (idLessThan) => {
    const queryParams = new URLSearchParams();
    queryParams.append('startTime', startTime.toString());
    queryParams.append('endTime', endTime.toString());
    queryParams.append('limit', '100');
    if (idLessThan) queryParams.append('idLessThan', idLessThan);
    const queryString = '?' + queryParams.toString();

    const pageTimestamp = (await axios.get(baseUrl + '/api/v2/public/time')).data.data.serverTime;
    const signature = generateBitgetSignature(pageTimestamp, 'GET', requestPath, queryString, secretKey);

    const fillsResponse = await axios.get(baseUrl + requestPath + queryString, {
      headers: {
        'ACCESS-KEY': apiKey,
        'ACCESS-SIGN': signature,
        'ACCESS-PASSPHRASE': passphrase,
        'ACCESS-TIMESTAMP': pageTimestamp,
        'locale': 'en-US',
        'Content-Type': 'application/json',
      },
    });

    return fillsResponse.data.data || [];
  };

  const fills = [];
  let idLessThan;
  while (true) {
    const page = await fetchFillsPage(idLessThan);
    fills.push(...page);
    if (page.length < 100) break;
    idLessThan = page[page.length - 1].tradeId;
  }

  console.log(`Bitget sync: total fills fetched: ${fills.length}`);

  if (fills.length === 0) {
    return { synced: true, entriesCreated: 0 };
  }

  const pnlByDay = calculateRealizedPnlByDay(fills);

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
    }
    entriesCreated++;
  }

  await supabase
    .from('exchange_credentials')
    .update({ last_synced_time: new Date(endTime).toISOString() })
    .eq('owner_id', ownerId)
    .eq('exchange', 'bitget');

  try {
    const { notifyPartnersOfPnl } = require('./pushService');
    for (const [dateKey, amount] of Object.entries(pnlByDay)) {
      await notifyPartnersOfPnl(ownerId, amount, dateKey).catch((e) => console.error('Push notify failed:', e.message));
    }
  } catch (e) {
    console.error('Push notification step failed:', e.message);
  }

  return { synced: true, entriesCreated };
}

module.exports = { syncBitgetPnl };