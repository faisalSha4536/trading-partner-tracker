const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const partnerRoutes = require('./routes/partnerRoutes');
const ledgerRoutes = require('./routes/ledgerRoutes');
const balanceRoutes = require('./routes/balanceRoutes');

const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, '../public')));
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/balances', balanceRoutes);

module.exports = app;
