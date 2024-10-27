const asyncHandler = require("express-async-handler");
const { ordonnance } = require("../models/ordonnance");
const { per_page } = require("../utils/constant");
const {
  deleteFromFirebase,
  uploadToFirebaseManually,
} = require("../utils/firebase");
const { message } = require("../models/message");
const moment = require("moment-timezone");
// const moment = require("moment");
const { note } = require("../models/note");
const { user } = require("../models/user");
const sendEmail = require("../utils/sendEmail");
const { cycle: Cycle } = require("../models/cycle");
module.exports.getOrdonnances = asyncHandler(async (req, res) => {
  const { page, search, status, date, numero, type, exceptEnrtardAndTerminer } =
    req.query;

  let matchQuery = {};

  if (search) {
    matchQuery.$or = [
      { nom: { $regex: search, $options: "i" } },
      { prenom: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }
  if (status) {
    matchQuery.status = status;
  }
  if (exceptEnrtardAndTerminer === "true") {
    matchQuery.status = { $nin: ["1", "3", "4"] };
  }

  if (type) {
    matchQuery.type = type;
  }
  if (numero) {
    matchQuery.numero = parseInt(numero);
  }
  if (date) {
    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    matchQuery.dateReception = { $gte: startOfDay, $lte: endOfDay };
  }
  const pipeline = [
    { $match: matchQuery },
    {
      $lookup: {
        from: "users",
        localField: "collabId",
        foreignField: "_id",
        as: "collaborator",
      },
    },
    {
      $unwind: {
        path: "$collaborator",
        preserveNullAndEmptyArrays: true,
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
        from: "cycles",
        localField: "_id",
        foreignField: "ordonnanceId",
        as: "cycles",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "cycles.collabId",
        foreignField: "_id",
        as: "cycleCollaborator",
      },
    },
    {
      $unwind: {
        path: "$cycleCollaborator",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        numero: 1,
        nom: 1,
        prenom: 1,
        phone: 1,
        url: 1,
        email: 1,
        status: 1,
        dateReception: 1,
        updatedAt: 1,
        isMore500: 1,
        livraison: 1,
        adresse: 1,
        from: 1,
        collabId: 1,
        type: 1,
        dateRenouvellement: 1,
        times: 1,
        debutTime: 1,
        periodeRenouvellement: 1,
        dateTreatement: 1,
        "collaborator.nom": 1,
        "collaborator.prenom": 1,
        uniqueNotes: {
          $cond: {
            if: { $eq: ["$type", "unique"] },
            then: "$notes",
            else: {
              $cond: {
                if: { $eq: ["$type", "renouveller"] },
                then: {
                  globalNotes: {
                    $filter: {
                      input: "$notes",
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
                else: [],
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
                    input: "$cycles",
                    as: "cycle",
                    cond: { $ne: ["$$cycle.status", "null"] },
                  },
                },
                as: "cycle",
                in: {
                  cycleId: "$$cycle._id",
                  cycleNumber: "$$cycle.cycleNumber",
                  cycleStatus: "$$cycle.status",
                  cycleNotes: {
                    $filter: {
                      input: "$notes",
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
                      "$cycleCollaborator.prenom",
                      " ",
                      "$cycleCollaborator.nom",
                    ],
                  },
                },
              },
            },
            else: [], // Return an empty array if type is not "renouveller"
          },
        },
      },
    },
    {
      $sort: { numero: -1 },
    },
    {
      $skip: (page - 1) * per_page,
    },
    {
      $limit: parseInt(per_page),
    },
  ];

  try {
    const ordonnances = await ordonnance.aggregate(pipeline);
    const totalCount = await ordonnance.countDocuments(matchQuery);

    res.status(200).json({ totalCount, ordonnances });
  } catch (error) {
    console.error("Error fetching ordonnances:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
module.exports.getTodayOrdonnances = asyncHandler(async (req, res) => {
  const { page, search, status, date, numero, type } = req.query;

  const today = new Date();
  console.log(today);
  today.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  let matchQuery = {
    status: { $nin: ["3", "4"] },
  };
  if (search) {
    matchQuery.$or.push(
      { nom: { $regex: search, $options: "i" } },
      { prenom: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } }
    );
  }

  if (status) {
    matchQuery.status = status;
  }

  if (type) {
    matchQuery.type = type;
  }

  if (numero) {
    matchQuery.numero = parseInt(numero);
  }

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    matchQuery.dateReception = { $gte: startOfDay, $lte: endOfDay };
  }

  const pipeline = [
    { $match: matchQuery },
    {
      $lookup: {
        from: "users",
        localField: "collabId",
        foreignField: "_id",
        as: "collaborator",
      },
    },
    {
      $unwind: {
        path: "$collaborator",
        preserveNullAndEmptyArrays: true,
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
        from: "cycles",
        localField: "_id",
        foreignField: "ordonnanceId",
        as: "cycles",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "cycles.collabId",
        foreignField: "_id",
        as: "cycleCollaborator",
      },
    },
    {
      $unwind: {
        path: "$cycleCollaborator",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        numero: 1,
        nom: 1,
        prenom: 1,
        phone: 1,
        url: 1,
        email: 1,
        status: 1,
        dateReception: 1,
        updatedAt: 1,
        isMore500: 1,
        livraison: 1,
        adresse: 1,
        from: 1,
        collabId: 1,
        type: 1,
        dateRenouvellement: 1,
        times: 1,
        debutTime: 1,
        periodeRenouvellement: 1,
        dateTreatement: 1,
        "collaborator.nom": 1,
        "collaborator.prenom": 1,
        uniqueNotes: {
          $cond: {
            if: { $eq: ["$type", "unique"] },
            then: "$notes",
            else: {
              $cond: {
                if: { $eq: ["$type", "renouveller"] },
                then: {
                  globalNotes: {
                    $filter: {
                      input: "$notes",
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
                else: [],
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
                    input: "$cycles",
                    as: "cycle",
                    cond: { $ne: ["$$cycle.status", "null"] },
                  },
                },
                as: "cycle",
                in: {
                  cycleId: "$$cycle._id",
                  cycleNumber: "$$cycle.cycleNumber",
                  cycleStatus: "$$cycle.status",
                  cycleCreatedAt: "$$cycle.createdAt",
                  cycleNotes: {
                    $filter: {
                      input: "$notes",
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
                      "$cycleCollaborator.prenom",
                      " ",
                      "$cycleCollaborator.nom",
                    ],
                  },
                  isTodayCycle: {
                    $cond: {
                      if: {
                        $and: [
                          { $gte: ["$$cycle.createdAt", today] },
                          { $lte: ["$$cycle.createdAt", endOfToday] },
                          { $in: ["$$cycle.status", ["1", "4"]] },
                        ],
                      },
                      then: true,
                      else: false,
                    },
                  },
                },
              },
            },
            else: [],
          },
        },

        hasTodayCycle: {
          $cond: {
            if: { $eq: ["$type", "unique"] },
            then: {
              $and: [
                { $gte: ["$dateReception", today] },
                { $lte: ["$dateReception", endOfToday] },
              ],
            },
            else: {
              $anyElementTrue: {
                $map: {
                  input: "$cycles",
                  as: "cycle",
                  in: {
                    $and: [
                      { $gte: ["$$cycle.createdAt", today] },
                      { $lte: ["$$cycle.createdAt", endOfToday] },
                      { $in: ["$$cycle.status", ["1", "4"]] },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      $match: {
        hasTodayCycle: true,
      },
    },
    {
      $sort: { numero: -1 },
    },
    {
      $skip: (page - 1) * parseInt(per_page),
    },
    {
      $limit: parseInt(per_page),
    },
  ];
  const CountPipeline = [
    { $match: matchQuery },
    {
      $lookup: {
        from: "users",
        localField: "collabId",
        foreignField: "_id",
        as: "collaborator",
      },
    },
    {
      $unwind: {
        path: "$collaborator",
        preserveNullAndEmptyArrays: true,
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
        from: "cycles",
        localField: "_id",
        foreignField: "ordonnanceId",
        as: "cycles",
      },
    },
    {
      $project: {
        uniqueNotes: {
          $cond: {
            if: { $eq: ["$type", "unique"] },
            then: "$notes",
            else: {
              $cond: {
                if: { $eq: ["$type", "renouveller"] },
                then: {
                  globalNotes: {
                    $filter: {
                      input: "$notes",
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
                else: [],
              },
            },
          },
        },
        cycles: {
          $map: {
            input: {
              $filter: {
                input: "$cycles",
                as: "cycle",
                cond: { $ne: ["$$cycle.status", "null"] },
              },
            },
            as: "cycle",
            in: {
              cycleId: "$$cycle._id",
              cycleNumber: "$$cycle.cycleNumber",
              cycleStatus: "$$cycle.status",
              cycleCreatedAt: "$$cycle.createdAt",
              cycleNotes: {
                $filter: {
                  input: "$notes",
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
                  "$cycleCollaborator.prenom",
                  " ",
                  "$cycleCollaborator.nom",
                ],
              },
              isTodayCycle: {
                $cond: {
                  if: {
                    $and: [
                      { $gte: ["$$cycle.createdAt", today] },
                      { $lte: ["$$cycle.createdAt", endOfToday] },
                      { $in: ["$$cycle.status", ["1", "4"]] },
                    ],
                  },
                  then: true,
                  else: false,
                },
              },
            },
          },
        },
        hasTodayCycle: {
          $cond: {
            if: { $eq: ["$type", "unique"] },
            then: {
              $and: [
                { $gte: ["$dateReception", today] },
                { $lte: ["$dateReception", endOfToday] },
              ],
            },
            else: {
              $anyElementTrue: {
                $map: {
                  input: "$cycles",
                  as: "cycle",
                  in: {
                    $and: [
                      { $gte: ["$$cycle.createdAt", today] },
                      { $lte: ["$$cycle.createdAt", endOfToday] },
                      { $in: ["$$cycle.status", ["1", "4"]] },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      $match: {
        hasTodayCycle: true,
      },
    },
    {
      $count: "totalCount",
    },
  ];
  try {
    const ordonnances = await ordonnance.aggregate(pipeline);
    const countResult = await ordonnance.aggregate(CountPipeline);
    const totalCount = countResult.length > 0 ? countResult[0].totalCount : 0;

    res.status(200).json({ totalCount, ordonnances });
  } catch (error) {
    console.error("Error fetching ordonnances:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
module.exports.getEnRetardOrdonnances = asyncHandler(async (req, res) => {
  const { page, search, status, date, numero, type } = req.query;
  let matchQuery = {
    status: { $nin: ["3"] },
  };
  if (search) {
    matchQuery.$or.push(
      { nom: { $regex: search, $options: "i" } },
      { prenom: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } }
    );
  }

  if (status) {
    matchQuery.status = status;
  }

  if (type) {
    matchQuery.type = type;
  }

  if (numero) {
    matchQuery.numero = parseInt(numero);
  }

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    matchQuery.dateReception = { $gte: startOfDay, $lte: endOfDay };
  }

  const pipeline = [
    { $match: matchQuery },
    {
      $lookup: {
        from: "users",
        localField: "collabId",
        foreignField: "_id",
        as: "collaborator",
      },
    },
    {
      $unwind: {
        path: "$collaborator",
        preserveNullAndEmptyArrays: true,
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
        from: "cycles",
        localField: "_id",
        foreignField: "ordonnanceId",
        as: "cycles",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "cycles.collabId",
        foreignField: "_id",
        as: "cycleCollaborator",
      },
    },
    {
      $unwind: {
        path: "$cycleCollaborator",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        numero: 1,
        nom: 1,
        prenom: 1,
        phone: 1,
        url: 1,
        email: 1,
        status: 1,
        dateReception: 1,
        updatedAt: 1,
        isMore500: 1,
        livraison: 1,
        adresse: 1,
        from: 1,
        collabId: 1,
        type: 1,
        dateRenouvellement: 1,
        times: 1,
        debutTime: 1,
        periodeRenouvellement: 1,
        dateTreatement: 1,
        "collaborator.nom": 1,
        "collaborator.prenom": 1,
        cycles: {
          $map: {
            input: {
              $filter: {
                input: "$cycles",
                as: "cycle",
                cond: { $ne: ["$$cycle.status", "null"] },
              },
            },
            as: "cycle",
            in: {
              cycleId: "$$cycle._id",
              cycleNumber: "$$cycle.cycleNumber",
              cycleStatus: "$$cycle.status",
              cycleCreatedAt: "$$cycle.createdAt",
              cycleNotes: {
                $filter: {
                  input: "$notes",
                  as: "note",
                  cond: {
                    $and: [
                      { $eq: ["$$note.cycleId", "$$cycle._id"] },
                      { $eq: ["$$note.type", "cycle"] },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      $addFields: {
        lastCycle: { $arrayElemAt: [{ $slice: ["$cycles", -1] }, 0] },
      },
    },
    {
      $match: {
        "lastCycle.cycleStatus": "3",
      },
    },
    {
      $sort: { numero: -1 },
    },
    {
      $skip: (page - 1) * parseInt(per_page),
    },
    {
      $limit: parseInt(per_page),
    },
  ];

  const CountPipeline = [
    { $match: matchQuery },
    {
      $lookup: {
        from: "users",
        localField: "collabId",
        foreignField: "_id",
        as: "collaborator",
      },
    },
    {
      $unwind: {
        path: "$collaborator",
        preserveNullAndEmptyArrays: true,
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
        from: "cycles",
        localField: "_id",
        foreignField: "ordonnanceId",
        as: "cycles",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "cycles.collabId",
        foreignField: "_id",
        as: "cycleCollaborator",
      },
    },
    {
      $unwind: {
        path: "$cycleCollaborator",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        numero: 1,
        nom: 1,
        prenom: 1,
        phone: 1,
        url: 1,
        email: 1,
        status: 1,
        dateReception: 1,
        updatedAt: 1,
        isMore500: 1,
        livraison: 1,
        adresse: 1,
        from: 1,
        collabId: 1,
        type: 1,
        dateRenouvellement: 1,
        times: 1,
        debutTime: 1,
        periodeRenouvellement: 1,
        dateTreatement: 1,
        "collaborator.nom": 1,
        "collaborator.prenom": 1,
        cycles: {
          $map: {
            input: {
              $filter: {
                input: "$cycles",
                as: "cycle",
                cond: { $ne: ["$$cycle.status", "null"] },
              },
            },
            as: "cycle",
            in: {
              cycleId: "$$cycle._id",
              cycleNumber: "$$cycle.cycleNumber",
              cycleStatus: "$$cycle.status",
              cycleCreatedAt: "$$cycle.createdAt",
              cycleNotes: {
                $filter: {
                  input: "$notes",
                  as: "note",
                  cond: {
                    $and: [
                      { $eq: ["$$note.cycleId", "$$cycle._id"] },
                      { $eq: ["$$note.type", "cycle"] },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      $addFields: {
        lastCycle: { $arrayElemAt: [{ $slice: ["$cycles", -1] }, 0] },
      },
    },
    {
      $match: {
        "lastCycle.cycleStatus": "3",
      },
    },
    {
      $sort: { numero: -1 },
    },
    { $count: "totalCount" },
  ];

  try {
    const ordonnances = await ordonnance.aggregate(pipeline);
    const countResult = await ordonnance.aggregate(CountPipeline);
    const totalCount = countResult.length > 0 ? countResult[0].totalCount : 0;

    res.status(200).json({ totalCount, ordonnances });
  } catch (error) {
    console.error("Error fetching ordonnances:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
module.exports.addOrdonnace = asyncHandler(async (req, res) => {
  try {
    const file = req.file;

    if (!file) return res.status(400).send("File is required");
    let nextRenouvellementDate = null;
    const today = new Date();
    if (req.body.type === "renouveller") {
      nextRenouvellementDate = moment(today)
        .tz("America/Guadeloupe")
        .add(req.body.periodeRenouvellement, "days")
        .toDate();
    }
    // console.log("Now : " + today);
    // console.log("Next : " + nextRenouvellementDate);
    const url = await uploadToFirebaseManually(file);
    const newOrdonnance = new ordonnance({
      nom: req.body.nom,
      prenom: req.body.prenom,
      email: req.body.email,
      phone: req.body.phone,

      isMore500: req.body.isMore500,
      livraison: req.body.livraison,
      adresse: req.body.adresse,
      type: req.body.type,
      dateTreatement: today,
      dateRenouvellement: nextRenouvellementDate,
      periodeRenouvellement:
        req.body.type === "renouveller"
          ? parseInt(req.body.periodeRenouvellement, 10)
          : null,
      debutTime:
        req.body.type === "renouveller" ? parseInt(req.body.times, 10) : null,
      times:
        req.body.type === "renouveller"
          ? parseInt(req.body.times - 1, 10)
          : null,
      url,
      collabId: req.body.collabId,
      from: "Email",
      status: req.body.type === "renouveller" ? "2" : "1",
    });

    await newOrdonnance.save();
    if (req.body.type === "renouveller") {
      const cycle = new Cycle({
        ordonnanceId: newOrdonnance._id,
        collabId: req.body.collabId ? req.body.collabId : null,
        dateTreatement: new Date(),
        cycleNumber: 1,
        status: "1",
        dateTreatement: null,
      });
      await cycle.save();
      const globalNote = new note({
        type: "global",
        ordonnanceId: newOrdonnance._id,
        text: " ",
        cycleId: cycle._id,
      });
      await globalNote.save();
      const noteNew = new note({
        type: "cycle",
        text: " ",
        cycleId: cycle._id,
        ordonnanceId: newOrdonnance._id,
      });
      await noteNew.save();
    } else {
      const cycle = new Cycle({
        ordonnanceId: newOrdonnance._id,
        collabId: req.body.collabId ? req.body.collabId : null,
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
    }
    res.status(201).send(newOrdonnance);
  } catch (error) {
    console.error("Erreur lors de l'ajout de l'ordonnance :", error);
    res.status(500).json("Erreur lors de l'ajout de l'ordonnance.");
  }
});
module.exports.updateOrdnnance = asyncHandler(async (req, res) => {
  const ordo = await ordonnance.findById(req.params.id);
  if (!ordo) {
    return res.status(404).json({ message: "Ordonnance n'existe pas." });
  }

  const previousType = ordo.type;

  const updatedFields = {
    nom: req.body.nom,
    prenom: req.body.prenom,
    phone: req.body.phone,
    email: req.body.email,
    dateTreatement: req.body.dateTreatement,
    isMore500: req.body.isMore500,
    livraison: req.body.livraison,
    adresse: req.body.livraison ? req.body.adresse : null,
    type: req.body.type,
    periodeRenouvellement:
      req.body.type === "renouveller" ? req.body.periodeRenouvellement : null,
    dateRenouvellement:
      req.body.type === "renouveller" ? req.body.dateRenouvellement : null,
    debutTime: req.body.times,
    times: req.body.times,
  };

  const updateOrdo = await ordonnance.findByIdAndUpdate(
    req.params.id,
    updatedFields,
    { new: true }
  );
  if (!updateOrdo) {
    return res.status(500).json({ message: "Failed to update ordonnance." });
  }
  if (
    req.body.type === "renouveller" &&
    previousType === "renouveller" &&
    req.body.times !== ordo.times
  ) {
    ordo.times = Math.max(req.body.times - 1, 0);
    await ordo.save();
  }

  if (previousType === "unique" && req.body.type === "renouveller") {
    const nextRenouvellementDate = moment(req.body.dateRenouvellement)
      .add(req.body.periodeRenouvellement, "days")
      .startOf("day")
      .toDate();

    const cycle = new Cycle({
      dateTreatement: new Date(),
      ordonnanceId: ordo._id,
      collabId: null,
      cycleNumber: 1,
      status: "1",
    });

    await cycle.save();

    const noteNew = new note({
      type: "cycle",
      text: " ",
      cycleId: cycle._id,
      ordonnanceId: ordo._id,
    });

    await noteNew.save();
    ordo.dateRenouvellement = nextRenouvellementDate;
    ordo.times = Math.max(req.body.times - 1, 0);

    await ordo.save();
  }

  if (previousType === "renouveller" && req.body.type === "unique") {
    const deletedCycles = await Cycle.deleteMany({
      ordonnanceId: ordo._id,
      status: { $ne: "null" },
    });
    console.log(`${deletedCycles.deletedCount} related cycles deleted.`);

    const deletedNotes = await note.deleteMany({
      ordonnanceId: ordo._id,
      type: "cycle",
    });
    console.log(`${deletedNotes.deletedCount} related notes deleted.`);

    ordo.dateRenouvellement = null;
    ordo.times = null;
    ordo.periodeRenouvellement = null;
    ordo.debutTime = null;

    await ordo.save();
  }

  ordo.status = req.body.type === "renouveller" ? ordo.status : "2";
  await ordo.save();

  if (ordo.email && req.body.enoyerMessage) {
    const ordNumero = ordo.numero;
    const sujet = "Mise à jour de votre ordonnance";
    const message = "Votre ordonnance est en cours de traitement.";

    const context = {
      ordNumero,
      subject: sujet,
      message,
    };

    try {
      await sendEmail(ordo.email, sujet, "response", context);
      console.log("Le message a été envoyé avec succès.");
    } catch (error) {
      console.error("Error sending email:", error);
      return res.status(500).json({ message: "Failed to send email." });
    }
  }

  res.status(200).json(updateOrdo);
});

module.exports.addOrdonnanceCollab = asyncHandler(async (req, res) => {
  try {
    console.log(req.user.id);
    const ordo = await ordonnance.findById(req.params.id);

    if (!ordo) {
      return res.status(404).json({ message: "Ordonnance introuvable" });
    }

    if (ordo.collabId) {
      return res
        .status(400)
        .json({ message: "L'ordonnance a déjà un collaborateur responsable" });
    }

    const updateOrdo = await ordonnance.findByIdAndUpdate(
      req.params.id,
      { collabId: req.user.id },
      { new: true }
    );

    if (updateOrdo && updateOrdo.type === "renouveller") {
      await Cycle.updateMany(
        { ordonnanceId: updateOrdo._id },
        { $set: { collabId: req.user.id } }
      );
    }

    res.status(200).json(updateOrdo);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Erreur du serveur. Veuillez réessayer plus tard." });
  }
});
module.exports.changeStatusOrdnnance = asyncHandler(async (req, res) => {
  const ordo = await ordonnance.findById(req.params.id);

  if (!ordo) {
    return res.status(404).json({ message: "Ordonnance not found." });
  }

  if (!ordo.collabId) {
    return res.status(403).json({
      message: "Pour avoir accès, tu dois assumer la responsabilité.",
    });
  }

  const updateOrdo = await ordonnance.findByIdAndUpdate(
    req.params.id,
    {
      dateTreatement: new Date(),
      status: req.body.status,
    },
    { new: true }
  );
  if (ordo.type === "renouveller" && req.body.status === "3") {
    await Cycle.updateMany(
      { ordonnanceId: ordonnance._id },
      { $set: { status: "2" } }
    );
  }
  res.status(200).json(updateOrdo);
});
module.exports.changeStatusCycle = asyncHandler(async (req, res) => {
  const cycle = await Cycle.findById(req.params.id);

  if (!cycle) {
    return res.status(404).json({ message: "Cycle not found." });
  }
  const ordo = await ordonnance.findById(cycle.ordonnanceId);

  if (!ordo.collabId) {
    return res.status(403).json({
      message: "Pour avoir accès, tu dois assumer la responsabilité.",
    });
  }

  const updatedCylce = await Cycle.findByIdAndUpdate(
    req.params.id,
    {
      collabId: ordo.collabId,
      status: req.body.status,
      dateTreatement: new Date(),
    },
    { new: true }
  );

  res.status(200).json(updatedCylce);
});
module.exports.deleteOrdonnance = asyncHandler(async (req, res) => {
  const ordo = await ordonnance.findById(req.params.id);

  if (!ordo) {
    return res.status(404).json({ message: "L'ordonnance n'existe pas." });
  }
  if (!ordo.collabId) {
    return res.status(404).json({
      message: "Pour avoir accès, tu dois assumer la responsabilité.",
    });
  }
  try {
    await deleteFromFirebase(ordo.url);
  } catch (error) {
    if (error.code === 404) {
      console.warn(`File not found: ${ordo.url}, continuing deletion.`);
    } else {
      console.error("Error deleting file from Firebase:", error);
    }
  }

  await ordonnance.findByIdAndDelete(req.params.id);
  await note.deleteMany({ ordonnanceId: req.params.id });
  await Cycle.deleteMany({ ordonnanceId: req.params.id });

  res.status(200).json({ message: "L'ordonnance a été supprimé." });
});

module.exports.processRenewals = asyncHandler(async (req, res) => {
  try {
    const startOfDay = moment().startOf("day").toDate();
    const endOfDay = moment().endOf("day").toDate();
    console.log(
      `Processing renewals for ${moment(startOfDay)}`
    );

    const ordonnancesToRenew = await ordonnance.find({
      dateRenouvellement: { $lte: endOfDay, $gte: startOfDay },
      times: { $gt: 0 },
      type: "renouveller",
      status: { $ne: "3" },
    });
    const updatedOrdonnances = [];

    for (const ord of ordonnancesToRenew) {
      const lastCycle = await Cycle.findOne({ ordonnanceId: ord._id })
        .sort({ createdAt: -1 })
        .exec();

      if (lastCycle) {
        lastCycle.status = "3";
        await lastCycle.save();
      }
      const nextRenouvellementDate = moment(ord.dateRenouvellement)
        .add(ord.periodeRenouvellement, "days")
        .startOf("day")
        .toDate();

      ord.dateRenouvellement = nextRenouvellementDate;
      ord.times -= 1;
      ord.collabId = null;

      const cycle = new Cycle({
        dateTreatement: new Date(),
        ordonnanceId: ord._id,
        collabId: null,
        cycleNumber: ord.debutTime - ord.times,
        status: "1",
      });
      await cycle.save();

      const noteNew = new note({
        type: "cycle",
        text: " ",
        cycleId: cycle._id,
        ordonnanceId: ord._id,
      });
      await noteNew.save();

      // if (ord.times === 0) {
      //   ord.status = "3";
      // }

      await ord.save();
      updatedOrdonnances.push(ord);
    }

    console.log("Renewals processed successfully.", updatedOrdonnances);
  } catch (error) {
    console.error("Error processing renewals:", error);
  }
});
const checkAndUpdateStatus = async (ordonnance) => {
  if (ordonnance.type === "renouveller") {
    const now = new Date();
    const lastRenewalDate = ordonnance.dateRenouvellement;
    const renewalPeriodDays = ordonnance.periodeRenouvellement;
    const remainingRenewals = ordonnance.times;

    const nextRenewalDate = new Date(lastRenewalDate);
    nextRenewalDate.setDate(lastRenewalDate.getDate() + renewalPeriodDays);
    if (now > nextRenewalDate || remainingRenewals <= 0) {
      ordonnance.status = "3";
      ordonnance.dateRenouvellement = null;
      console.log("Ordonnance is no longer renewable and has been terminated.");
    } else {
      ordonnance.status = "2";
      ordonnance.dateRenouvellement = nextRenewalDate;
      console.log("Ordonnance is still renewable.");
    }
    await ordonnance.save();
  }
};

module.exports.updateEnAttent = asyncHandler(async (req, res) => {
  try {
    const now = moment();
    const ordonnancesToUpdate = await ordonnance.find({
      type: "unique",
      status: "1",
      dateReception: {
        $lte: now.subtract(24, "hours").toDate(),
      },
    });

    if (ordonnancesToUpdate.length === 0) {
      console.log({ message: "No ordonnances to update" });
    }

    await ordonnance.updateMany(
      { _id: { $in: ordonnancesToUpdate.map((ord) => ord._id) } },
      { $set: { status: "4" } }
    );

    console.log({ message: "Ordonnances updated successfully" });
  } catch (error) {
    console.error({ message: "An error occurred", error });
  }
});
module.exports.updateCylces = asyncHandler(async (req, res) => {
  try {
    const now = moment();
    const cyclesToUpdate = await Cycle.find({
      status: "1",
      createdAt: {
        $lte: moment(now).subtract(24, "hours").toDate(),
      },
    });

    if (cyclesToUpdate.length === 0) {
      console.log({ message: "No Cycles to update" });
    }

    await Cycle.updateMany(
      { _id: { $in: cyclesToUpdate.map((ord) => ord._id) } },
      { $set: { status: "3" } }
    );

    console.log({ message: "Cycles updated successfully" });
  } catch (error) {
    console.error({ message: "An error occurred", error });
  }
});
module.exports.getCounts = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);
  const CountDujour = [
    {
      $match: {
        status: { $nin: ["3", "4"] },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "collabId",
        foreignField: "_id",
        as: "collaborator",
      },
    },
    {
      $unwind: {
        path: "$collaborator",
        preserveNullAndEmptyArrays: true,
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
        from: "cycles",
        localField: "_id",
        foreignField: "ordonnanceId",
        as: "cycles",
      },
    },
    {
      $project: {
        uniqueNotes: {
          $cond: {
            if: { $eq: ["$type", "unique"] },
            then: "$notes",
            else: {
              $cond: {
                if: { $eq: ["$type", "renouveller"] },
                then: {
                  globalNotes: {
                    $filter: {
                      input: "$notes",
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
                else: [],
              },
            },
          },
        },
        cycles: {
          $map: {
            input: {
              $filter: {
                input: "$cycles",
                as: "cycle",
                cond: { $ne: ["$$cycle.status", "null"] },
              },
            },
            as: "cycle",
            in: {
              cycleId: "$$cycle._id",
              cycleNumber: "$$cycle.cycleNumber",
              cycleStatus: "$$cycle.status",
              cycleCreatedAt: "$$cycle.createdAt",
              cycleNotes: {
                $filter: {
                  input: "$notes",
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
                  "$cycleCollaborator.prenom",
                  " ",
                  "$cycleCollaborator.nom",
                ],
              },
              isTodayCycle: {
                $cond: {
                  if: {
                    $and: [
                      { $gte: ["$$cycle.createdAt", today] },
                      { $lte: ["$$cycle.createdAt", endOfToday] },
                      { $in: ["$$cycle.status", ["1", "4"]] },
                    ],
                  },
                  then: true,
                  else: false,
                },
              },
            },
          },
        },
        hasTodayCycle: {
          $cond: {
            if: { $eq: ["$type", "unique"] },
            then: {
              $and: [
                { $gte: ["$dateReception", today] },
                { $lte: ["$dateReception", endOfToday] },
              ],
            },
            else: {
              $anyElementTrue: {
                $map: {
                  input: "$cycles",
                  as: "cycle",
                  in: {
                    $and: [
                      { $gte: ["$$cycle.createdAt", today] },
                      { $lte: ["$$cycle.createdAt", endOfToday] },
                      { $in: ["$$cycle.status", ["1", "4"]] },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      $match: {
        hasTodayCycle: true,
      },
    },
    {
      $count: "totalCount",
    },
  ];
  const countDujourResult = await ordonnance.aggregate(CountDujour);
  const totalCountDujour =
    countDujourResult.length > 0 ? countDujourResult[0].totalCount : 0;
  let matchQuery = {
    status: { $nin: ["3"] },
  };
  const CountEnRetard = [
    { $match: matchQuery },
    {
      $lookup: {
        from: "users",
        localField: "collabId",
        foreignField: "_id",
        as: "collaborator",
      },
    },
    {
      $unwind: {
        path: "$collaborator",
        preserveNullAndEmptyArrays: true,
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
        from: "cycles",
        localField: "_id",
        foreignField: "ordonnanceId",
        as: "cycles",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "cycles.collabId",
        foreignField: "_id",
        as: "cycleCollaborator",
      },
    },
    {
      $unwind: {
        path: "$cycleCollaborator",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        numero: 1,
        nom: 1,
        prenom: 1,
        phone: 1,
        url: 1,
        email: 1,
        status: 1,
        dateReception: 1,
        updatedAt: 1,
        isMore500: 1,
        livraison: 1,
        adresse: 1,
        from: 1,
        collabId: 1,
        type: 1,
        dateRenouvellement: 1,
        times: 1,
        debutTime: 1,
        periodeRenouvellement: 1,
        dateTreatement: 1,
        "collaborator.nom": 1,
        "collaborator.prenom": 1,
        cycles: {
          $map: {
            input: {
              $filter: {
                input: "$cycles",
                as: "cycle",
                cond: { $ne: ["$$cycle.status", "null"] },
              },
            },
            as: "cycle",
            in: {
              cycleId: "$$cycle._id",
              cycleNumber: "$$cycle.cycleNumber",
              cycleStatus: "$$cycle.status",
              cycleCreatedAt: "$$cycle.createdAt",
              cycleNotes: {
                $filter: {
                  input: "$notes",
                  as: "note",
                  cond: {
                    $and: [
                      { $eq: ["$$note.cycleId", "$$cycle._id"] },
                      { $eq: ["$$note.type", "cycle"] },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      $addFields: {
        lastCycle: { $arrayElemAt: [{ $slice: ["$cycles", -1] }, 0] },
      },
    },
    {
      $match: {
        "lastCycle.cycleStatus": "3",
      },
    },
    {
      $sort: { numero: -1 },
    },
    { $count: "totalCount" },
  ];

  const countEnretardResult = await ordonnance.aggregate(CountEnRetard);
  const totalCountEnAttent =
    countEnretardResult.length > 0 ? countEnretardResult[0].totalCount : 0;
  const countToday = [
    // {
    //   $match: {
    //     status: { $eq: ["3"] },
    //   },
    // },
    {
      $lookup: {
        from: "users",
        localField: "collabId",
        foreignField: "_id",
        as: "collaborator",
      },
    },
    {
      $unwind: {
        path: "$collaborator",
        preserveNullAndEmptyArrays: true,
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
        from: "cycles",
        localField: "_id",
        foreignField: "ordonnanceId",
        as: "cycles",
      },
    },
    {
      $project: {
        uniqueNotes: {
          $cond: {
            if: { $eq: ["$type", "unique"] },
            then: "$notes",
            else: {
              $cond: {
                if: { $eq: ["$type", "renouveller"] },
                then: {
                  globalNotes: {
                    $filter: {
                      input: "$notes",
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
                else: [],
              },
            },
          },
        },
        cycles: {
          $map: {
            input: {
              $filter: {
                input: "$cycles",
                as: "cycle",
                cond: { $ne: ["$$cycle.status", "null"] },
              },
            },
            as: "cycle",
            in: {
              cycleId: "$$cycle._id",
              cycleNumber: "$$cycle.cycleNumber",
              cycleStatus: "$$cycle.status",
              cycleCreatedAt: "$$cycle.createdAt",
              cycleNotes: {
                $filter: {
                  input: "$notes",
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
                  "$cycleCollaborator.prenom",
                  " ",
                  "$cycleCollaborator.nom",
                ],
              },
              isTodayCycle: {
                $cond: {
                  if: {
                    $and: [
                      { $gte: ["$$cycle.createdAt", today] },
                      { $lte: ["$$cycle.createdAt", endOfToday] },
                      { $in: ["$$cycle.status", ["1", "4"]] },
                    ],
                  },
                  then: true,
                  else: false,
                },
              },
            },
          },
        },
        hasTodayCycle: {
          $cond: {
            if: { $eq: ["$type", "unique"] },
            then: {
              $and: [
                { $eq: ["$status", "3"] },
                { $gte: ["$dateTreatement", today] },
                { $lte: ["$dateTreatement", endOfToday] },
              ],
            },
            else: {
              $anyElementTrue: {
                $map: {
                  input: "$cycles",
                  as: "cycle",
                  in: {
                    $and: [
                      { $gte: ["$$cycle.dateTreatement", today] },
                      { $lte: ["$$cycle.dateTreatement", endOfToday] },
                      { $eq: ["$$cycle.status", "2"] },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      $match: {
        hasTodayCycle: true,
      },
    },
    {
      $count: "totalCount",
    },
  ];
  const countOrdonnancesTodayResult = await ordonnance.aggregate(countToday);
  const countOrdonnancesToday =
    countOrdonnancesTodayResult.length > 0
      ? countOrdonnancesTodayResult[0].totalCount
      : 0;
  const totalCountEnCours = await ordonnance.countDocuments({ status: "2" });
  const totalCountTerminer = await ordonnance.countDocuments({ status: "3" });
  const totalCountRenwal = await ordonnance.countDocuments({
    type: "renouveller",
  });

  const totalCountMessage = await message.countDocuments();

  res.status(200).json({
    enAttent: totalCountEnAttent,
    messages: totalCountMessage,
    enCours: totalCountEnCours,
    terminer: totalCountTerminer,
    renwal: totalCountRenwal,
    dujour: totalCountDujour,
    terminerToday: countOrdonnancesToday,
  });
});
