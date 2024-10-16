const mongoose = require("mongoose");
const joi = require("joi");
const noteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    type: { type: String, enum: ["cycle", "global"], required: true },
    ordonnanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ordonnance",
    },
    cycleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "cycle",
    },
  },
  { timestamps: true }
);
function validateAddNote(obj) {
  const schema = joi.object({
    text: joi.string().required(),
    ordoId: joi.string(),
  });
  return schema.validate(obj);
}
function validateUpdateNote(obj) {
  const schema = joi.object({
    text: joi.string().trim(),
  });
  return schema.validate(obj);
}
const note = mongoose.model("note", noteSchema);

module.exports = {
  note,
  validateAddNote,
  validateUpdateNote,
};
