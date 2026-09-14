const { supabase } = require('../config/supabase');

async function getUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*');

  if (error) throw error;
  return data;
}

async function getUserById(id) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  getUsers,
  getUserById,
};
