const { getAllPartners } = require('../models/partnerModel');
const { getLedgerEntriesBeforeDate } = require('../models/ledgerModel');

async function calculateBalances(asOfDate) {
  const partners = await getAllPartners();
  const ledgerEntries = await getLedgerEntriesBeforeDate(asOfDate);

  const partnerIds = partners.map((partner) => partner.id);
  const balances = Object.fromEntries(partnerIds.map((id) => [id, 0]));
  const names = Object.fromEntries(partners.map((partner) => [partner.id, partner.name]));

  for (const entry of ledgerEntries) {
    const { entry_type, amount, partner_id } = entry;

    if (entry_type === 'deposit' || entry_type === 'withdrawal') {
      if (!partnerIds.includes(partner_id)) continue;

      if (entry_type === 'deposit') {
        balances[partner_id] += amount;
      } else {
        balances[partner_id] -= amount;
      }
    } else if (entry_type === 'pnl') {
      const totalBalance = partnerIds.reduce((sum, id) => sum + balances[id], 0);

      if (totalBalance === 0) {
        console.warn('Skipping PnL split: total partner balance is zero');
        continue;
      }

      for (const id of partnerIds) {
        const ratio = balances[id] / totalBalance;
        balances[id] += amount * ratio;
      }
    }
  }

  const totalBalance = partnerIds.reduce((sum, id) => sum + balances[id], 0);

  return partnerIds.map((id) => {
    const balance = balances[id];
    const ratio = totalBalance === 0 ? 0 : Number((balance / totalBalance).toFixed(4));

    return {
      partner_id: id,
      name: names[id],
      balance,
      ratio,
    };
  });
}

module.exports = {
  calculateBalances,
};
