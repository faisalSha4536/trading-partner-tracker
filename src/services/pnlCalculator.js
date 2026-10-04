function calculateRealizedPnlByDay(fills) {
  const TIMEZONE_OFFSET_MS = 5 * 60 * 60 * 1000; // Pakistan Standard Time, UTC+5, no DST

  const lotsBySymbol = {};
  const pnlByDay = {};

  const sorted = [...fills].sort((a, b) => Number(a.cTime) - Number(b.cTime));

  for (const fill of sorted) {
    const symbol = fill.symbol;
    const price = parseFloat(fill.priceAvg);
    let size = parseFloat(fill.size);
    const fee = fill.feeDetail && fill.feeDetail.totalFee ? Math.abs(parseFloat(fill.feeDetail.totalFee)) : 0;
    const localTime = new Date(Number(fill.cTime) + TIMEZONE_OFFSET_MS);
    const dateKey = localTime.toISOString().split('T')[0];

    if (!lotsBySymbol[symbol]) lotsBySymbol[symbol] = [];

    if (fill.side === 'buy') {
      lotsBySymbol[symbol].push({ price, remainingSize: size });
    } else if (fill.side === 'sell') {
      let realizedPnl = 0;
      while (size > 0 && lotsBySymbol[symbol].length > 0) {
        const lot = lotsBySymbol[symbol][0];
        const matchedSize = Math.min(size, lot.remainingSize);
        realizedPnl += (price - lot.price) * matchedSize;
        lot.remainingSize -= matchedSize;
        size -= matchedSize;
        if (lot.remainingSize <= 0) lotsBySymbol[symbol].shift();
      }
      realizedPnl -= fee;
      pnlByDay[dateKey] = (pnlByDay[dateKey] || 0) + realizedPnl;
    }
  }

  return pnlByDay;
}

module.exports = { calculateRealizedPnlByDay };