const { supabase } = require('../config/supabaseClient');

async function getAllLedgerEntries() {
  const { data, error } = await supabase
    .from('ledger')
    .select('*')
    .order('entry_date', { ascending: true });

  if (error) throw error;
  return data;
}

async function addLedgerEntry({ entry_type, amount, partner_id, entry_date }) {
  const { data, error } = await supabase
    .from('ledger')
    .insert({ entry_type, amount, partner_id, entry_date })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getLedgerEntriesBeforeDate(date) {
  const { data, error } = await supabase
    .from('ledger')
    .select('*')
    .order('entry_date', { ascending: true });

  if (error) throw error;

  return data.filter((entry) => {
    const entryDate = new Date(entry.entry_date).toISOString().split('T')[0];
    return entryDate <= date;
  });
}

module.exports = {
  getAllLedgerEntries,
  addLedgerEntry,
  getLedgerEntriesBeforeDate,
};
