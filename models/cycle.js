const mongoose = require("mongoose");
const joi = require("joi");
const cycleSchema = new mongoose.Schema(
  {
    ordonnanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ordonnance",
      required: true,
    },
    cycleNumber: { type: Number, required: true },
    status: {
      type: String,
      enum: ["1", "2", "4", "3", "null"],
      default: "1",
    },
    collabId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    dateTreatement: { type: Date, default: null },
  },
  { timestamps: true }
);
function validateAddcycle(obj) {
  const schema = joi.object({
    text: joi.string().trim().required(),
    ordoId: joi.string(),
  });
  return schema.validate(obj);
}
function validateUpdatecycle(obj) {
  const schema = joi.object({
    text: joi.string().trim(),
  });
  return schema.validate(obj);
}
const cycle = mongoose.model("cycle", cycleSchema);

module.exports = {
  cycle,
  validateAddcycle,
  validateUpdatecycle,
};
