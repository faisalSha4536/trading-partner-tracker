const express = require('express');
const {
  getAllPartners,
  createPartner,
  getPartnerById,
  getPartnerByUserId,
  deletePartner,
  updatePartnerVisibility,
} = require('../models/partnerModel');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const { supabase } = require('../config/supabase');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    let ownerId;
    if (req.userRole === 'admin') {
      ownerId = req.user.id;
    } else {
      // partner: look up their own partners row to find which admin owns them
      const myPartnerRow = await getPartnerByUserId(req.user.id);
      if (!myPartnerRow) return res.status(403).json({ error: "No partner record linked to this account" });
      ownerId = myPartnerRow.owner_id;
    }
    const partners = await getAllPartners(ownerId, req.userRole, req.user.id);
    res.json(partners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, margin_percentage } = req.body;
    const partner = await createPartner(name, email, password, req.user.id, margin_percentage);
    res.json(partner);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const partner = await getPartnerById(req.params.id);
    if (!partner || partner.owner_id !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to delete this partner" });
    }
    await deletePartner(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/me/visibility', requireAuth, async (req, res) => {
  try {
    const { is_visible_to_others } = req.body;
    const myPartnerRow = await getPartnerByUserId(req.user.id);
    if (!myPartnerRow) return res.status(404).json({ error: "No partner record found for this account" });

    const updated = await updatePartnerVisibility(myPartnerRow.id, is_visible_to_others);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    const myPartnerRow = await getPartnerByUserId(req.user.id);
    if (!myPartnerRow) return res.status(404).json({ error: "No partner record found" });

    const { data, error } = await supabase
      .from('partners')
      .update({ name: name.trim() })
      .eq('id', myPartnerRow.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/margin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { margin_percentage } = req.body;
    if (margin_percentage === undefined || margin_percentage < 0 || margin_percentage > 100) {
      return res.status(400).json({ error: "Margin percentage must be between 0 and 100" });
    }

    const partner = await getPartnerById(req.params.id);
    if (!partner || partner.owner_id !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to edit this partner" });
    }

    const { data, error } = await supabase
      .from('partners')
      .update({ margin_percentage })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
