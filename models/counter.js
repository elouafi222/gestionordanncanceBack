const mongoose = require("mongoose");
const { Schema } = mongoose;

const counterSchema = new Schema({
  _id: String,
  seq: { type: Number, default: 0 },
});

const counter = mongoose.model("counter", counterSchema);

module.exports = {
  counter,
};
