const mongoose = require("mongoose");
const joi = require("joi");
const { counter: Counter } = require("./counter");
const ordonnanceSchema = new mongoose.Schema(
  {
    numero: { type: Number, unique: true },
    nom: { type: String },
    prenom: { type: String },
    phone: { type: String },
    email: { type: String },
    url: { type: String, required: true },
    dateReception: { type: Date, default: Date.now },
    dateTreatement: { type: Date, default: null },
    from: { type: String, required: true },

    isMore500: { type: Boolean, default: false },
    livraison: { type: Boolean, default: false },
    adresse: { type: String, default: null },

    status: { type: String, required: true, default: "1" },
    type: { type: String, enum: ["unique", "renouveller"], required: true },

    dateRenouvellement: { type: Date, default: null },
    periodeRenouvellement: { type: Number, default: null },
    debutTime: { type: Number, default: null },
    times: { type: Number, default: null },

    collabId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);
ordonnanceSchema.virtual("notes", {
  ref: "note",
  foreignField: "ordoId",
  localField: "_id",
});
ordonnanceSchema.pre("save", async function (next) {
  const doc = this;
  if (doc.isNew) {
    console.log("New ordonnance, generating numero...");
    try {
      const counter = await Counter.findByIdAndUpdate(
        { _id: "ordonnance" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      doc.numero = counter.seq;
      console.log("Generated numero:", doc.numero);
      next();
    } catch (error) {
      console.error("Error generating numero:", error);
      next(error);
    }
  } else {
    next();
  }
});

const ordonnance = mongoose.model("ordonnance", ordonnanceSchema);

function validateAddOrdonnance(obj) {
  const schema = joi.object({
    nom: joi.string().trim(),
    prenom: joi.string().trim(),
    phone: joi.string().trim(),
    email: joi.string().trim(),
    url: joi.string().trim(),
    dateReception: joi.date().iso(),
    type: joi.string(),
    isMore500: joi.boolean(),
    livraison: joi.boolean(),
    adresse: joi.string().trim(),
    periodeRenouvellement: joi.number(),
    times: joi.number(),

    collabId: joi.string().trim(),
  });
  return schema.validate(obj);
}

function validateUpdateOrdonnance(obj) {
  const schema = joi.object({
    type: joi.string().required(),
    nom: joi.string().trim(),
    prenom: joi.string().trim(),
    phone: joi.string().trim(),
    email: joi.string().trim(),
    status: joi.string().trim(),
    dateTreatement: joi.date().iso(),
  });
  return schema.validate(obj);
}

module.exports = {
  ordonnance,
  validateAddOrdonnance,
  validateUpdateOrdonnance,
};
