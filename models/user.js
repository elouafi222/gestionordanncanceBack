const mongoose = require("mongoose");
const joi = require("joi");
const passworComplexity = require("joi-password-complexity");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const userSchema = new mongoose.Schema(
  {
    nom: { type: String, required: true },
    prenom: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["admin", "collab"], required: true },
    isAccountActive: { type: Boolean, default: true },
  },

  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

userSchema.methods.generateAuthToken = function () {
  return jwt.sign({ id: this._id, role: this.role }, process.env.SECRET);
};

const user = mongoose.model("user", userSchema);

function validateAddUser(obj) {
  const baseSchema = {
    nom: joi.string().trim().required(),
    prenom: joi.string().trim().required(),
    username: joi.string().trim().required(),
    password: joi.string().trim().required(),
    role: joi.string().valid("admin", "collab").required(),
  };

  return joi.object(baseSchema).validate(obj);
}
function validateUpdateUser(obj) {
  const baseSchema = {
    nom: joi.string().trim(),
    prenom: joi.string().trim(),
    username: joi.string().trim(),
    password: joi.string().trim(),
    role: joi.string().valid("admin", "collab"),
  };
  return joi.object(baseSchema).validate(obj);
}

function validateLoginUser(obj) {
  const schema = joi.object({
    username: joi.string().trim().required(),
    password: joi.string().trim().required(),
  });
  return schema.validate(obj);
}
function validateNewPassword(obj) {
  const schema = joi.object({
    password: joi.required(),
  });
  return schema.validate(obj);
}
module.exports = {
  user,
  validateAddUser,
  validateUpdateUser,
  validateLoginUser,
  validateNewPassword,
};
