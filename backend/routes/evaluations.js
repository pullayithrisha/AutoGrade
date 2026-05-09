const express = require('express');
const Evaluation = require('../models/Evaluation');
const jwt = require('jsonwebtoken');

const router = express.Router();

const auth = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    res.status(400).json({ message: 'Token is not valid' });
  }
};

router.post('/save', auth, async (req, res) => {
  try {
    const { studentRollNumber, subject, year, semester, totalMarks, percentage, totalPossible, details } = req.body;
    
    const evaluation = new Evaluation({
      facultyId: req.user.id,
      studentRollNumber,
      subject,
      year,
      semester,
      totalMarks,
      percentage,
      totalPossible,
      details
    });

    await evaluation.save();
    res.status(201).json({ message: 'Evaluation saved successfully', evaluation });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while saving evaluation' });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const evaluations = await Evaluation.find({ facultyId: req.user.id }).sort({ createdAt: -1 });
    res.json(evaluations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while fetching evaluations' });
  }
});

module.exports = router;
