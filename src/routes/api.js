const express = require('express');
const { getUsers, getUserById } = require('../models/userModel');

const router = express.Router();

router.get('/users', async (req, res, next) => {
  try {
    const users = await getUsers();
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await getUserById(req.params.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
