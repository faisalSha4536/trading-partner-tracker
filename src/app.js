const express = require('express');
const cors = require('cors');
const partnerRoutes = require('./routes/partnerRoutes');
const ledgerRoutes = require('./routes/ledgerRoutes');
const balanceRoutes = require('./routes/balanceRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/partners', partnerRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/balances', balanceRoutes);

module.exports = app;
