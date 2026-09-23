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

  data.sort((a, b) => {
    const dateCompare = new Date(a.entry_date) - new Date(b.entry_date);
    if (dateCompare !== 0) return dateCompare;
    const typeOrder = (type) => (type === 'deposit' || type === 'withdrawal') ? 0 : 1;
    return typeOrder(a.entry_type) - typeOrder(b.entry_type);
  });

  return data;
}

async function addLedgerEntry({ entry_type, amount, partner_id, entry_date, owner_id, source = 'manual' }) {
  const { data, error } = await supabase
    .from('ledger')
    .insert({ entry_type, amount, partner_id, entry_date, owner_id, source })
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

  const filtered = data.filter((entry) => {
    const entryDate = new Date(entry.entry_date).toISOString().split('T')[0];
    return entryDate <= date;
  });

  filtered.sort((a, b) => {
    const dateCompare = new Date(a.entry_date) - new Date(b.entry_date);
    if (dateCompare !== 0) return dateCompare;
    const typeOrder = (type) => (type === 'deposit' || type === 'withdrawal') ? 0 : 1;
    return typeOrder(a.entry_type) - typeOrder(b.entry_type);
  });

  return filtered;
}

async function getPnlEntries(ownerId) {
  const { data, error } = await supabase
    .from('ledger')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('entry_type', 'pnl')
    .order('entry_date', { ascending: false });

  if (error) throw error;
  return data;
}

async function getDepositWithdrawalEntries(ownerId) {
  const { data, error } = await supabase
    .from('ledger')
    .select('*, partners(name)')
    .eq('owner_id', ownerId)
    .in('entry_type', ['deposit', 'withdrawal'])
    .order('entry_date', { ascending: false });
  if (error) throw error;
  return data;
}

async function deleteLedgerEntry(id) {
  const { error } = await supabase.from('ledger').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}

module.exports = {
  getAllLedgerEntries,
  addLedgerEntry,
  getLedgerEntriesBeforeDate,
  getPnlEntries,
  getDepositWithdrawalEntries,
  deleteLedgerEntry,
};