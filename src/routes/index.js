const express = require('express');
const apiRouter = require('./api');

const router = express.Router();

router.use('/api', apiRouter);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
