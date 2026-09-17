const express = require('express');
const { supabase } = require('../config/supabaseClient');

const router = express.Router();

router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) throw error;

    const user = data.user;
    console.log('[signup] Auth user created:', user);
    if (user) {
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({ user_id: user.id, role: 'admin' });


      if (roleError) {
        console.error('[signup] user_roles insert error:', roleError);
        throw roleError;
      }

      const partnerName = name || email.split('@')[0] || 'Admin';
      console.log('[signup] Inserting partner with name:', partnerName, 'user_id:', user.id);

      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .insert({ name: partnerName, user_id: user.id, owner_id: user.id })
        .select()
        .single();

      console.log('[signup] partners insert result:', { partner, partnerError });

      if (partnerError) throw partnerError;

      res.json({ user, session: data.session, partner });
    } else {
      res.json({ user, session: data.session });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) throw error;

    const user = data.user;
    let role = null;
    if (user) {
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (roleError) throw roleError;
      role = roleData.role;
    }

    res.json({ session: data.session, role, user: { id: user.id, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(401).json({ error: 'Refresh token is required' });
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    if (!data || !data.session) {
      return res.status(401).json({ error: 'Failed to refresh session' });
    }

    res.json(data.session);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

module.exports = router;
