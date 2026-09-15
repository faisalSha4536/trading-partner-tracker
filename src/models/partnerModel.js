const { supabase } = require('../config/supabaseClient');
const { supabaseAdmin } = require('../config/supabaseAdminClient');

async function getAllPartners() {
  const { data, error } = await supabase
    .from('partners')
    .select('*');

  if (error) throw error;
  return data;
}

async function createPartner(name, email, password) {
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) throw authError;

  const userId = authData.user.id;

  const { error: roleError } = await supabase
    .from('user_roles')
    .insert({ user_id: userId, role: 'partner' });

  if (roleError) throw roleError;

  const { data, error } = await supabase
    .from('partners')
    .insert({ name, user_id: userId })
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

async function deletePartner(id) {
  const { error } = await supabase
    .from('partners')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

module.exports = {
  getAllPartners,
  createPartner,
  getPartnerById,
  deletePartner,
};
