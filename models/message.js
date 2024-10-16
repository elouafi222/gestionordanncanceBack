const mongoose = require("mongoose");
const joi = require("joi");
const messageSchema = new mongoose.Schema({
  sender: String,
  type: String,
  url: String,
  timestamp: { type: Date, default: Date.now },
});
function validateSaveMessage(obj) {
  const schema = joi.object({
    sender: joi.string().trim().required(),
    url: joi.string().trim().required(),
    type: joi.string().trim(),
  });
  return schema.validate(obj);
}

const message = mongoose.model("message", messageSchema);

module.exports = {
  message,
  validateSaveMessage,
};
