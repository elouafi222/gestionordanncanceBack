const asyncHandler = require("express-async-handler");
const {
  validateAddNote,
  note: Note,
  validateUpdateNote,
} = require("../models/note");
const { ordonnance } = require("../models/ordonnance");
const { user } = require("../models/user");
const { cycle: Cycle } = require("../models/cycle");
const mongoose = require("mongoose");
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
  const { ordoId } = req.params; // Get ordonnance ID from route params

  try {
    const result = await ordonnance.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(ordoId) } },
      {
        $lookup: {
          from: "cycles",
          localField: "_id",
          foreignField: "ordonnanceId",
          as: "cycles",
        },
      },
      {
        $lookup: {
          from: "notes",
          localField: "_id",
          foreignField: "ordonnanceId",
          as: "notes",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "cycles.collabId",
          foreignField: "_id",
          as: "collaborators",
        },
      },
      {
        $project: {
          _id: 1,
          type: 1,
          uniqueNotes: {
            $cond: {
              if: { $eq: ["$type", "unique"] },
              then: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: { $ifNull: ["$notes", []] },
                      as: "note",
                      cond: {
                        $and: [
                          { $eq: ["$$note.type", "global"] },
                          { $eq: ["$$note.ordonnanceId", "$_id"] },
                        ],
                      },
                    },
                  },
                  0,
                ],
              },
              else: {
                $filter: {
                  input: { $ifNull: ["$notes", []] },
                  as: "note",
                  cond: {
                    $and: [
                      { $eq: ["$$note.type", "global"] },
                      { $eq: ["$$note.ordonnanceId", "$_id"] },
                    ],
                  },
                },
              },
            },
          },
          cycles: {
            $cond: {
              if: { $eq: ["$type", "renouveller"] },
              then: {
                $map: {
                  input: {
                    $filter: {
                      input: { $ifNull: ["$cycles", []] },
                      as: "cycle",
                      cond: { $ne: ["$$cycle.status", "null"] },
                    },
                  },
                  as: "cycle",
                  in: {
                    cycleId: "$$cycle._id",
                    dateTreatement: "$$cycle.dateTreatement",
                    createdAt: "$$cycle.createdAt",
                    cycleNumber: "$$cycle.cycleNumber",
                    cycleStatus: "$$cycle.status",
                    cycleNotes: {
                      $filter: {
                        input: { $ifNull: ["$notes", []] },
                        as: "note",
                        cond: {
                          $and: [
                            { $eq: ["$$note.cycleId", "$$cycle._id"] },
                            { $eq: ["$$note.type", "cycle"] },
                          ],
                        },
                      },
                    },
                    fullName: {
                      $concat: [
                        {
                          $arrayElemAt: [
                            "$collaborators.prenom",
                            {
                              $indexOfArray: [
                                "$collaborators._id",
                                "$$cycle.collabId",
                              ],
                            },
                          ],
                        },
                        " ",
                        {
                          $arrayElemAt: [
                            "$collaborators.nom",
                            {
                              $indexOfArray: [
                                "$collaborators._id",
                                "$$cycle.collabId",
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
              else: [],
            },
          },
        },
      },
      {
        $addFields: {
          // Filter out duplicate cycles by keeping only the latest one with the same cycleNumber
          cycles: {
            $reduce: {
              input: {
                $sortArray: { input: "$cycles", sortBy: { createdAt: -1 } },
              },
              initialValue: [],
              in: {
                $concatArrays: [
                  "$$value",
                  {
                    $cond: [
                      {
                        $not: {
                          $in: [
                            "$$this.cycleNumber",
                            {
                              $map: {
                                input: "$$value",
                                as: "v",
                                in: "$$v.cycleNumber",
                              },
                            },
                          ],
                        },
                      },
                      ["$$this"],
                      [],
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    ]);

    res.status(200).json(result[0]);
  } catch (error) {
    console.error("Error fetching ordonnance with cycles and notes:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
