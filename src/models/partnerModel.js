const { supabase } = require('../config/supabaseClient');

async function getAllPartners() {
  const { data, error } = await supabase
    .from('partners')
    .select('*');

  if (error) throw error;
  return data;
}

async function createPartner(name) {
  const { data, error } = await supabase
    .from('partners')
    .insert({ name })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getPartnerById(id) {
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  getAllPartners,
  createPartner,
  getPartnerById,
};
