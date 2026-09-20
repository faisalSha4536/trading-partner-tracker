const { supabase } = require('../config/supabaseClient');
const { supabaseAdmin } = require('../config/supabaseAdminClient');

async function getAllPartners(ownerId, requestingUserRole, requestingUserId) {
  let query = supabase
    .from('partners')
    .select('*');

  if (ownerId) {
    query = query.eq('owner_id', ownerId);
  }

  const { data, error } = await query;

  if (error) throw error;

  if (requestingUserRole === 'partner') {
    return data.filter(
      (partner) => partner.is_visible_to_others === true || partner.user_id === requestingUserId
    );
  }

  return data;
}

async function createPartner(name, email, password, ownerId) {
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
    .insert({ name, user_id: userId, owner_id: ownerId })
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
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getPartnerByUserId(userId) {
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

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

async function updatePartnerVisibility(partnerId, isVisible) {
  const { data, error } = await supabase
    .from('partners')
    .update({ is_visible_to_others: isVisible })
    .eq('id', partnerId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  getAllPartners,
  createPartner,
  getPartnerById,
  getPartnerByUserId,
  deletePartner,
  updatePartnerVisibility,
};
