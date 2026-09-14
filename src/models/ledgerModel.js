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
    .lt('entry_date', date)
    .order('entry_date', { ascending: true });

  if (error) throw error;
  return data;
}

module.exports = {
  getAllLedgerEntries,
  addLedgerEntry,
  getLedgerEntriesBeforeDate,
};
