function generateBitgetSignature(timestamp, method, requestPath, queryString, secretKey) {
  const crypto = require('crypto');
  const message = timestamp + method.toUpperCase() + requestPath + (queryString || '');
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

module.exports = { generateBitgetSignature };
