const express = require('express');
const { supabase } = require('../config/supabaseClient');
const { requireAuth } = require('../middleware/authMiddleware');

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

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: process.env.APP_URL + '/reset-password.html',
    });
    if (error) throw error;
    res.json({ success: true, message: "If that email exists, a reset link has been sent." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { access_token, new_password } = req.body;
    if (!access_token || !new_password) {
      return res.status(400).json({ error: "Access token and new password are required" });
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(access_token);
    if (userError || !userData.user) {
      return res.status(401).json({ error: "Invalid or expired reset link" });
    }

    const { supabaseAdmin } = require('../config/supabaseAdminClient');
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userData.user.id,
      { password: new_password }
    );

    if (updateError) throw updateError;
    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: "Current and new password are required" });
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: req.user.email,
      password: current_password,
    });
    if (verifyError) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const { supabaseAdmin } = require('../config/supabaseAdminClient');
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      req.user.id,
      { password: new_password }
    );
    if (updateError) throw updateError;

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
