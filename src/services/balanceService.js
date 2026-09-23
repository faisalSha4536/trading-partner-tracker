const { getAllPartners } = require('../models/partnerModel');
const { getLedgerEntriesBeforeDate } = require('../models/ledgerModel');

async function calculateBalances(asOfDate, owner_id, requestingUserRole, requestingUserId) {
  const partners = await getAllPartners(owner_id);
  const ledgerEntries = await getLedgerEntriesBeforeDate(asOfDate, owner_id);

  console.log('[calculateBalances] Raw ledger entries:', JSON.stringify(ledgerEntries, null, 2));

  const partnerIds = partners.map((partner) => String(partner.id));
  const balances = Object.fromEntries(partnerIds.map((id) => [id, 0]));
  const totalDeposited = Object.fromEntries(partnerIds.map((id) => [id, 0]));
  const names = Object.fromEntries(partners.map((partner) => [String(partner.id), partner.name]));
  const userIds = Object.fromEntries(partners.map((partner) => [String(partner.id), partner.user_id]));
  const isVisibleMap = Object.fromEntries(partners.map((partner) => [String(partner.id), Boolean(partner.is_visible_to_others)]));
  const marginPercentages = Object.fromEntries(partners.map((partner) => [String(partner.id), Number(partner.margin_percentage ?? 0)]));
  const adminPartner = partners.find((partner) => String(partner.user_id) === String(owner_id));
  const adminPartnerId = adminPartner ? String(adminPartner.id) : null;

  const netProfitByPartner = Object.fromEntries(partnerIds.map((id) => [id, 0]));

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
        const share = amount * ratio;
        netProfitByPartner[id] += share;
        balances[id] += share;
      }
    }
  }

  const totalBalance = partnerIds.reduce((sum, id) => sum + balances[id], 0);

  const result = partnerIds.map((id) => {
    const currentBalance = balances[id];
    const ratio = totalBalance === 0 ? 0 : Number((currentBalance / totalBalance).toFixed(4));
    const isOwnAdmin = id === adminPartnerId || String(userIds[id]) === String(owner_id);
    const marginPct = marginPercentages[id] || 0;
    const netTradingProfit = netProfitByPartner[id] || 0;
    const marginBase = Math.max(netTradingProfit, 0);
    const marginAmount = isOwnAdmin ? null : marginBase * (marginPct / 100);

    return {
      partner_id: id,
      user_id: userIds[id],
      name: names[id],
      total_deposited: totalDeposited[id],
      current_balance: currentBalance,
      ratio,
      margin_percentage: marginPct,
      margin_amount: isOwnAdmin ? null : marginAmount,
    };
  });

  if (requestingUserRole === 'partner') {
    const filteredResult = result.filter(
      (item) => isVisibleMap[item.partner_id] === true || String(item.user_id) === String(requestingUserId)
    );
    console.log('[calculateBalances] Filtered result for partner:', JSON.stringify(filteredResult, null, 2));
    return filteredResult;
  }

  console.log('[calculateBalances] Final result:', JSON.stringify(result, null, 2));
  return result;
}

module.exports = {
  calculateBalances,
};
