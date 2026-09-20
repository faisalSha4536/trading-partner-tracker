function calculateRealizedPnlByDay(fills) {
  // fills: array of Bitget fill objects, each with { symbol, side, priceAvg, size, cTime, feeDetail }
  // Returns: an object like { "2026-09-15": 12.50, "2026-09-16": -4.30 }

  const lotsBySymbol = {}; // { symbol: [ { price, remainingSize } ] }
  const pnlByDay = {};

  const sorted = [...fills].sort((a, b) => Number(a.cTime) - Number(b.cTime));

  for (const fill of sorted) {
    const symbol = fill.symbol;
    const price = parseFloat(fill.priceAvg);
    let size = parseFloat(fill.size);
    const fee = fill.feeDetail && fill.feeDetail.totalFee ? Math.abs(parseFloat(fill.feeDetail.totalFee)) : 0;
    const dateKey = new Date(Number(fill.cTime)).toISOString().split('T')[0];

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
