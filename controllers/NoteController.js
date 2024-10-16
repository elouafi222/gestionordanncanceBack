const asyncHandler = require("express-async-handler");
const {
  validateAddNote,
  note: Note,
  validateUpdateNote,
} = require("../models/note");
const { ordonnance } = require("../models/ordonnance");
const { user } = require("../models/user");
const { cycle: Cycle } = require("../models/cycle");
// module.exports.addNote = asyncHandler(async (req, res) => {
//   const { error } = validateAddNote(req.body);
//   if (error) {
//     return res.status(400).json({ message: error.message });
//   }
//   const ordo = await ordonnance.findById(req.body.ordoId);
//   if (!ordo) {
//     return res.status(404).json({ message: "Ordonnance not found." });
//   }

//   if (!ordo.collabId) {
//     return res.status(403).json({
//       message: "Pour avoir accès, tu dois assumer la responsabilité.",
//     });
//   }
//   let renewalIndex = null;
//   if (ordo.isRenouvellement) {
//     renewalIndex = ordo.times ? ordo.times + 1 : 1;
//   }
//   const existingNote = await Note.findOne({
//     ordoId: req.body.ordoId,
//     renewalTime: renewalIndex,
//   });

//   if (ordo.isRenouvellement && existingNote) {
//     return res.status(400).json({
//       message: `Une note pour le renouvellement nombre ${renewalIndex} existe déjà. Une seule note est autorisée par renouvellement.`,
//     });
//   }
//   let collabName = "Aucune responsable";
//   if (ordo.collabId) {
//     const collab = await user.findById(ordo.collabId);
//     if (collab) {
//       collabName = `${collab.prenom} ${collab.nom}`;
//     }
//   }

//   const note = await Note.create({
//     text: req.body.text,
//     ordoId: req.body.ordoId,
//     renewalTime: ordo.isRenouvellement ? 1 : null,
//     collabName: collabName,
//   });

//   res.status(200).json(note);
// });

module.exports.updateNote = asyncHandler(async (req, res) => {
  const { error } = validateUpdateNote(req.body);
  if (error) {
    return res.status(400).json({ message: error.message });
  }
  const noteId = req.params.id;

  const note = await Note.findById(noteId);
  if (!note) {
    return res.status(404).json({ message: "Note not found" });
  }
  const ordo = await ordonnance.findById(note.ordonnanceId);
  if (ordo.collabId === null) {
    return res.status(404).json({
      message: "Pour avoir accès, tu dois assumer la responsabilité.",
    });
  }
  ordo.dateTreatement = new Date();
  ordo.status = "2";
  await ordo.save();
  const updatedNote = await Note.findByIdAndUpdate(
    noteId,
    { text: req.body.text },
    { new: true }
  );
  if (ordo.type === "renouveller") {
    const cycle = await Cycle.findById(note.cycleId);
    cycle.dateTreatement = new Date();
    cycle.save();
  }
  res.status(200).json(updatedNote);
});
module.exports.getNotesByOrdId = asyncHandler(async (req, res) => {

});
