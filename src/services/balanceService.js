const { getAllPartners } = require('../models/partnerModel');
const { getLedgerEntriesBeforeDate } = require('../models/ledgerModel');

async function calculateBalances(asOfDate) {
  const partners = await getAllPartners();
  const ledgerEntries = await getLedgerEntriesBeforeDate(asOfDate);

  console.log('[calculateBalances] Raw ledger entries:', JSON.stringify(ledgerEntries, null, 2));

  const partnerIds = partners.map((partner) => String(partner.id));
  const balances = Object.fromEntries(partnerIds.map((id) => [id, 0]));
  const totalDeposited = Object.fromEntries(partnerIds.map((id) => [id, 0]));
  const names = Object.fromEntries(partners.map((partner) => [String(partner.id), partner.name]));
  const userIds = Object.fromEntries(partners.map((partner) => [String(partner.id), partner.user_id]));

  for (const entry of ledgerEntries) {
    const entryType = String(entry.entry_type ?? '').toLowerCase();
    const amount = Number(entry.amount ?? 0);
    const partnerId = String(entry.partner_id ?? '');

    console.log('[calculateBalances] Processing entry:', { entryType, amount, partnerId, partnerIds });

    if (entryType === 'deposit' || entryType === 'withdrawal') {
      if (!partnerIds.includes(partnerId)) {
        console.log('[calculateBalances] Skipping entry: partner_id not in partner list');
        continue;
      }

      if (entryType === 'deposit') {
        balances[partnerId] += amount;
        totalDeposited[partnerId] += amount;
      } else {
        balances[partnerId] -= amount;
        totalDeposited[partnerId] -= amount;
      }
    } else if (entryType === 'pnl') {
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

  const result = partnerIds.map((id) => {
    const currentBalance = balances[id];
    const ratio = totalBalance === 0 ? 0 : Number((currentBalance / totalBalance).toFixed(4));

    return {
      partner_id: id,
      user_id: userIds[id],
      name: names[id],
      total_deposited: totalDeposited[id],
      current_balance: currentBalance,
      ratio,
    };
  });

  console.log('[calculateBalances] Final result:', JSON.stringify(result, null, 2));
  return result;
}

module.exports = {
  calculateBalances,
};
