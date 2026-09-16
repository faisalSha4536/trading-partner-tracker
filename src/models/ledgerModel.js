const { supabase } = require('../config/supabaseClient');

async function getAllLedgerEntries(ownerId) {
  let query = supabase
    .from('ledger')
    .select('*')
    .order('entry_date', { ascending: true });

  if (ownerId) {
    query = query.eq('owner_id', ownerId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

async function addLedgerEntry({ entry_type, amount, partner_id, entry_date, owner_id }) {
  const { data, error } = await supabase
    .from('ledger')
    .insert({ entry_type, amount, partner_id, entry_date, owner_id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getLedgerEntriesBeforeDate(date, ownerId) {
  let query = supabase
    .from('ledger')
    .select('*')
    .order('entry_date', { ascending: true });

  if (ownerId) {
    query = query.eq('owner_id', ownerId);
  }

  const { data, error } = await query;

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