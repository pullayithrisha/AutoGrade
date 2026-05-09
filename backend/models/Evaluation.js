const mongoose = require('mongoose');

const EvaluationSchema = new mongoose.Schema({
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty', required: true },
  studentRollNumber: { type: String, required: true },
  subject: { type: String, required: true },
  year: { type: Number, required: true },
  semester: { type: Number, required: true },
  totalMarks: { type: Number, required: true },
  percentage: { type: Number, required: true },
  totalPossible: { type: Number },
  details: [
    {
      question: Number,
      max_marks: Number,
      awarded: Number,
      student_text: String,
      similarity: Number
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('Evaluation', EvaluationSchema);
