const asyncHandler = require("express-async-handler");
const { message } = require("../models/message");
const { per_page } = require("../utils/constant");
const { deleteFromFirebase } = require("../utils/firebase");
const { ordonnance, validateAddOrdonnance } = require("../models/ordonnance");
const { note } = require("../models/note");
const { cycle: Cycle } = require("../models/cycle");

module.exports.getMessage = asyncHandler(async (req, res) => {
  const { page, sender, type } = req.query;

  let matchQuery = {};
  if (sender) {
    matchQuery.sender = { $regex: sender, $options: "i" };
  }
  if (type) {
    matchQuery.type = { $regex: type, $options: "i" };
  }

  const messages = await message
    .find(matchQuery)
    .sort({ timestamp: -1 })
    .skip((page - 1) * per_page)
    .limit(per_page);

  const totalCount = await message.countDocuments(matchQuery);

  res.status(200).json({ totalCount, messages });
});

module.exports.deleteMessage = asyncHandler(async (req, res) => {
  const msg = await message.findById(req.params.id);
  if (!msg) {
    return res.status(404).json({ message: "Le message n'existe pas." });
  }
  try {
    try {
      await deleteFromFirebase(msg.url);
    } catch (error) {
      if (error.code === 404) {
        console.warn(`File not found: ${msg.url}, continuing deletion.`);
      } else {
        console.error("Error deleting file from Firebase:", error);
      }
    }
    await message.findByIdAndDelete(req.params.id);

    res
      .status(200)
      .json({ message: "Le message et son fichier ont été supprimés." });
  } catch (error) {
    console.error("Error deleting message or file:", error);
    res.status(500).json({
      message: "Erreur lors de la suppression du message ou du fichier.",
    });
  }
});
module.exports.acceptMessage = asyncHandler(async (req, res) => {
  const msg = await message.findById(req.params.id);
  if (!msg) {
    return res.status(404).json({ message: "Le message n'existe pas." });
  }

  try {
    const { error } = validateAddOrdonnance({
      url: msg.url,
      dateReception: msg.timestamp,
    });
    if (error) {
      console.error("Validation error:", error.details[0].message);
      return null;
    }
    const ordonnanceData = {
      from: msg.type,
      dateReception: msg.timestamp,
      url: msg.url,
      type: "unique",
      status: "1",
      collabId: null,
    };

    if (msg.type === "Email") {
      ordonnanceData.email = msg.sender;
    } else if (msg.type === "WhatsApp") {
      ordonnanceData.phone = msg.sender;
    }

    const newOrdonnance = new ordonnance(ordonnanceData);

    const cycle = new Cycle({
      ordonnanceId: newOrdonnance._id,
      collabId: null,
      cycleNumber: 1,
      status: "null",
      dateTreatement: null,
    });
    await cycle.save();

    const noteNew = new note({
      type: "global",
      ordonnanceId: newOrdonnance._id,
      text: " ",
      cycleId: cycle._id,
    });
    await noteNew.save();
    await newOrdonnance.save();
    await message.findByIdAndDelete(req.params.id);

    res.status(200).json({
      message: "Ordonnance créée avec succès et le message a été supprimé.",
    });
  } catch (error) {
    console.error("Error creating ordonnance or deleting message:", error);
    res.status(500).json({
      message:
        "Erreur lors de la création de l'ordonnance ou de la suppression du message.",
    });
  }
});
