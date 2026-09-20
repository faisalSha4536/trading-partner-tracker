async function getBitgetServerTime() {
  const axios = require('axios');
  const baseUrl = process.env.BITGET_API_URL || 'https://api.bitget.com';
  const response = await axios.get(baseUrl + '/api/v2/public/time');
  return response.data.data.serverTime; // returns a timestamp string in milliseconds
}

async function getSpotFills(startTime, endTime) {
  const axios = require('axios');
  const { generateBitgetSignature } = require('../utils/bitgetSign');

  const apiKey = process.env.BITGET_API_KEY;
  const secretKey = process.env.BITGET_SECRET_KEY;
  const passphrase = process.env.BITGET_PASSPHRASE;
  const baseUrl = process.env.BITGET_API_URL || 'https://api.bitget.com';

  const timestamp = await getBitgetServerTime();
  const requestPath = '/api/v2/spot/trade/fills';
  const queryParams = new URLSearchParams();
  if (startTime) queryParams.append('startTime', startTime);
  if (endTime) queryParams.append('endTime', endTime);
  queryParams.append('limit', '100');
  const queryString = '?' + queryParams.toString();

  const signature = generateBitgetSignature(timestamp, 'GET', requestPath, queryString, secretKey);

  const response = await axios.get(baseUrl + requestPath + queryString, {
    headers: {
      'ACCESS-KEY': apiKey,
      'ACCESS-SIGN': signature,
      'ACCESS-PASSPHRASE': passphrase,
      'ACCESS-TIMESTAMP': timestamp,
      'locale': 'en-US',
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

module.exports = { getSpotFills, getBitgetServerTime };
