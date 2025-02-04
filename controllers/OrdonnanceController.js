const asyncHandler = require("express-async-handler");
const { ordonnance } = require("../models/ordonnance");
const { per_page } = require("../utils/constant");
const {
  deleteFromFirebase,
  uploadToFirebaseManually,
} = require("../utils/firebase");
const { message } = require("../models/message");
const moment = require("moment-timezone");
const { note } = require("../models/note");
const sendEmail = require("../utils/sendEmail");
const { cycle: Cycle } = require("../models/cycle");
module.exports.getOrdonnances = asyncHandler(async (req, res) => {
  const {
    page = 1,
    search,
    status,
    date,
    numero,
    type,
    exceptEnrtardAndTerminer,
  } = req.query;

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
  const { page = 1, search, status, date, numero, type } = req.query;

  const today = new Date();
  console.log(today);
  today.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  let matchQuery = {
    status: { $nin: ["3", "4"] },
  };
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

  try {
    const ordonnances = await ordonnance.aggregate(pipeline);
    const countResult = await ordonnance.aggregate([
      ...pipeline.slice(0, -2),
      { $count: "totalCount" },
    ]);
    const totalCount = countResult.length > 0 ? countResult[0].totalCount : 0;

    res.status(200).json({ totalCount, ordonnances });
  } catch (error) {
    console.error("Error fetching ordonnances:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
module.exports.getEnRetardOrdonnances = asyncHandler(async (req, res) => {
  const { page = 1, search, status, date, numero, type } = req.query;
  let matchQuery = {
    status: { $nin: ["3"] },
  };
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
        $or: [{ status: "4" }, { "lastCycle.cycleStatus": "3" }],
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

  const ordonnances = await ordonnance.aggregate(pipeline);
  const countResult = await ordonnance.aggregate([
    ...pipeline.slice(0, -2),
    { $count: "totalCount" },
  ]);
  const totalCount = countResult.length > 0 ? countResult[0].totalCount : 0;

  res.status(200).json({ totalCount, ordonnances });
});
module.exports.getEnRetardCycles = asyncHandler(async (req, res) => {
  const { page = 1, search, status, date, numero, type } = req.query;
  let matchQuery = {
    status: { $nin: ["3", "4"] },
    type: "renouveller",
  };
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
    //
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
    // Match ordonnances that have cycles with status 3
    {
      $match: {
        cycles: {
          $elemMatch: { status: "3" },
        },
      },
    },
    {
      $addFields: {
        // Filter and sort cycles where status is '3' and keep only the latest one per cycleNumber
        cycles: {
          $reduce: {
            input: {
              $sortArray: {
                input: {
                  $filter: {
                    input: "$cycles",
                    as: "cycle",
                    cond: { $eq: ["$$cycle.status", "3"] }, // Filter cycles with status "3"
                  },
                },
                sortBy: { createdAt: -1 }, // Sort filtered cycles by createdAt descending
              },
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
                          "$$this.cycleNumber", // Check if cycleNumber already exists in the accumulated array
                          {
                            $map: {
                              input: "$$value",
                              as: "v",
                              in: "$$v.cycleNumber", // Extract cycleNumber from existing cycles
                            },
                          },
                        ],
                      },
                    },
                    ["$$this"], // If not already in the accumulator, add this cycle
                    [], // Otherwise, skip this cycle
                  ],
                },
              ],
            },
          },
        },
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
            input: "$cycles",
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
      $sort: { numero: -1 },
    },
    {
      $skip: (page - 1) * parseInt(per_page),
    },
    {
      $limit: parseInt(per_page),
    },
  ];

  const ordonnances = await ordonnance.aggregate(pipeline);
  const countResult = await ordonnance.aggregate([
    ...pipeline.slice(0, -2),
    { $count: "totalCount" },
  ]);
  const totalCount = countResult.length > 0 ? countResult[0].totalCount : 0;

  res.status(200).json({ totalCount, ordonnances });
});
// module.exports.getEnRetardCycles = asyncHandler(async (req, res) => {
//   const { page = 1, search, status, date, numero, type } = req.query;
//   let matchQuery = {
//     status: { $nin: ["3", "4"] },
//     type: "renouveller",
//   };
//   if (search) {
//     matchQuery.$or.push(
//       { nom: { $regex: search, $options: "i" } },
//       { prenom: { $regex: search, $options: "i" } },
//       { phone: { $regex: search, $options: "i" } },
//       { email: { $regex: search, $options: "i" } }
//     );
//   }

//   if (status) {
//     matchQuery.status = status;
//   }

//   if (type) {
//     matchQuery.type = type;
//   }

//   if (numero) {
//     matchQuery.numero = parseInt(numero);
//   }

//   if (date) {
//     const startOfDay = new Date(date);
//     startOfDay.setHours(0, 0, 0, 0);
//     const endOfDay = new Date(date);
//     endOfDay.setHours(23, 59, 59, 999);
//     matchQuery.dateReception = { $gte: startOfDay, $lte: endOfDay };
//   }
//   const pipeline = [
//     { $match: matchQuery },
//     {
//       $lookup: {
//         from: "users",
//         localField: "collabId",
//         foreignField: "_id",
//         as: "collaborator",
//       },
//     },
//     {
//       $unwind: {
//         path: "$collaborator",
//         preserveNullAndEmptyArrays: true,
//       },
//     },
//     {
//       $lookup: {
//         from: "notes",
//         localField: "_id",
//         foreignField: "ordonnanceId",
//         as: "notes",
//       },
//     },
//     {
//       $lookup: {
//         from: "cycles",
//         localField: "_id",
//         foreignField: "ordonnanceId",
//         as: "cycles",
//       },
//     },
//     {
//       $unwind: {
//         path: "$cycles",
//       },
//     },
//     {
//       $match: {
//         "cycles.status": "3", // Only keep cycles with status "3"
//       },
//     },
//     {
//       $lookup: {
//         from: "users",
//         localField: "cycles.collabId",
//         foreignField: "_id",
//         as: "cycleCollaborator",
//       },
//     },
//     {
//       $unwind: {
//         path: "$cycleCollaborator",
//         preserveNullAndEmptyArrays: true,
//       },
//     },
//     {
//       $addFields: {
//         cycleId: "$cycles._id",
//         cycleNumber: "$cycles.cycleNumber",
//         cycleStatus: "$cycles.status",
//         cycleCreatedAt: "$cycles.createdAt",
//         cycleNotes: {
//           $filter: {
//             input: "$notes",
//             as: "note",
//             cond: {
//               $and: [
//                 { $eq: ["$$note.cycleId", "$cycles._id"] },
//                 { $eq: ["$$note.type", "cycle"] },
//               ],
//             },
//           },
//         },
//       },
//     },
//     {
//       $sort: { "cycles.createdAt": -1 }, // Sort cycles by createdAt in descending order (most recent first)
//     },
//     {
//       $project: {
//         numero: 1,
//         nom: 1,
//         prenom: 1,
//         phone: 1,
//         url: 1,
//         email: 1,
//         status: 1,
//         dateReception: 1,
//         updatedAt: 1,
//         isMore500: 1,
//         livraison: 1,
//         adresse: 1,
//         from: 1,
//         collabId: 1,
//         type: 1,
//         dateRenouvellement: 1,
//         times: 1,
//         debutTime: 1,
//         periodeRenouvellement: 1,
//         dateTreatement: 1,
//         "collaborator.nom": 1,
//         "collaborator.prenom": 1,
//         cycleId: 1,
//         cycleNumber: 1,
//         cycleStatus: 1,
//         cycleCreatedAt: 1,
//         cycleNotes: 1,
//       },
//     },
//     {
//       $sort: { numero: -1 },
//     },
//     {
//       $skip: (page - 1) * parseInt(per_page),
//     },
//     {
//       $limit: parseInt(per_page),
//     },
//   ];

//   const ordonnances = await ordonnance.aggregate(pipeline);
//   const countResult = await ordonnance.aggregate([
//     ...pipeline.slice(0, -2),
//     { $count: "totalCount" },
//   ]);
//   const totalCount = countResult.length > 0 ? countResult[0].totalCount : 0;

//   res.status(200).json({ totalCount, ordonnances });
// });
module.exports.addOrdonnace = asyncHandler(async (req, res) => {
  try {
    const file = req.file;

    if (!file) return res.status(400).send("File is required");
    let nextRenouvellementDate = null;
    const today = new Date();
    if (req.body.type === "renouveller") {
      nextRenouvellementDate = moment(today)
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
        dateTreatement: new Date(),
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
        dateTreatement: new Date(),
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
  const previousPeriode = ordo.periodeRenouvellement;

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

  if (
    req.body.type === "renouveller" &&
    req.body.periodeRenouvellement &&
    req.body.periodeRenouvellement !== previousPeriode
  ) {
    const nextRenouvellementDate = moment(new Date())
      .add(req.body.periodeRenouvellement, "days")
      .startOf("day")
      .toDate();
    updatedFields.dateRenouvellement = nextRenouvellementDate;
  }

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
      const latestCycle = await Cycle.findOne({ ordonnanceId: updateOrdo._id })
        .sort({ createdAt: -1 })
        .limit(1);

      if (latestCycle) {
        latestCycle.collabId = req.user.id;
        await latestCycle.save();
      }
    }

    res.status(200).json(updateOrdo);
  } catch (error) {
    console.error("Error in addOrdonnanceCollab:", error);
    res.status(500).json({
      message: "Erreur du serveur. Veuillez réessayer plus tard.",
      error: error.message,
    });
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
    const startOfDay = moment().utc().startOf("day").toDate();
    const endOfDay = moment().utc().endOf("day").toDate();
    console.log(`Processing renewals for ${moment(startOfDay)}`);

    const ordonnancesToRenew = await ordonnance.find({
      dateRenouvellement: { $lte: endOfDay, $gte: startOfDay },
      times: { $gt: 0 },
      type: "renouveller",
      status: { $ne: "3" },
    });

    const updatedOrdonnances = [];

    for (const ord of ordonnancesToRenew) {
      const lastCycle = await Cycle.findOne({ ordonnanceId: ord._id })
        .sort({ cycleNumber: -1 })
        .exec();

      const nextCycleNumber = lastCycle ? lastCycle.cycleNumber + 1 : 1;

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
        cycleNumber: nextCycleNumber,
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
      await ord.save();
      updatedOrdonnances.push(ord);
    }

    console.log("Renewals processed successfully.", updatedOrdonnances);
  } catch (error) {
    console.error("Error processing renewals:", error);
  }
});

module.exports.updateEnAttent = asyncHandler(async (req, res) => {
  try {
    const startOfToday = moment().utc().startOf("day").toDate();
    const ordonnancesToUpdate = await ordonnance.find({
      type: "unique",
      status: "1",
      dateReception: { $lt: startOfToday },
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
    const startOfToday = moment().utc().startOf("day").toDate();
    const cyclesToUpdate = await Cycle.find({
      status: "1",
      createdAt: { $lt: startOfToday },
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
  let matchQueryEnRetard = {
    status: { $nin: ["3"] },
  };

  const pipelineEnretard = [
    { $match: matchQueryEnRetard },
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
        $or: [{ status: "4" }, { "lastCycle.cycleStatus": "3" }],
      },
    },
  ];

  const countResultEnretard = await ordonnance.aggregate([
    ...pipelineEnretard,
    { $count: "totalCount" },
  ]);
  const totalCountEnAttent =
    countResultEnretard.length > 0 ? countResultEnretard[0].totalCount : 0;
  const matchQueryCycleEnRetard = {
    status: { $nin: ["3", "4"] },
    type: "renouveller",
  };

  const pipelineCycleEnRetard = [
    { $match: matchQueryCycleEnRetard },
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
    // Additional $match stage to filter ordonnances with at least one cycle of status "3"
    {
      $match: {
        cycles: {
          $elemMatch: { status: "3" },
        },
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
                cond: { $eq: ["$$cycle.status", "3"] },
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
  ];

  const countResultCycleEnRetard = await ordonnance.aggregate([
    ...pipelineCycleEnRetard,
    { $count: "totalCount" },
  ]);
  const totalCountCycleEnRetard =
    countResultCycleEnRetard.length > 0
      ? countResultCycleEnRetard[0].totalCount
      : 0;
  // const totalCountCycleEnRetard = await Cycle.countDocuments({
  //   status: "3",
  // });
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
    cycleEnRetard: totalCountCycleEnRetard,
    enAttent: totalCountEnAttent,
    messages: totalCountMessage,
    enCours: totalCountEnCours,
    terminer: totalCountTerminer,
    renwal: totalCountRenwal,
    dujour: totalCountDujour,
    terminerToday: countOrdonnancesToday,
  });
});
module.exports.cleanDuplicateCycles = asyncHandler(async (req, res) => {
  try {
    const duplicates = await Cycle.aggregate([
      {
        $group: {
          _id: { ordonnanceId: "$ordonnanceId", cycleNumber: "$cycleNumber" },
          cycles: { $push: "$_id" },
          lastCycle: { $max: "$createdAt" }, // Most recent cycle
        },
      },
      {
        $match: {
          "cycles.1": { $exists: true }, // Only groups with duplicates
        },
      },
    ]);

    let totalDeleted = 0; // Track total deleted cycles
    let notesDeleted = 0; // Track total deleted notes

    for (const group of duplicates) {
      const { cycles } = group;

      // Find the most recent cycle's ID
      const lastCycle = await Cycle.findOne({
        _id: { $in: cycles },
      })
        .sort({ createdAt: -1 })
        .select("_id");

      // Get IDs of cycles to delete (exclude the most recent one)
      const cyclesToDelete = cycles.filter(
        (id) => id.toString() !== lastCycle._id.toString()
      );

      if (cyclesToDelete.length > 0) {
        // Delete the duplicate cycles
        const deleteResult = await Cycle.deleteMany({
          _id: { $in: cyclesToDelete },
        });
        totalDeleted += deleteResult.deletedCount;

        // Delete associated notes
        const noteDeleteResult = await note.deleteMany({
          cycleId: { $in: cyclesToDelete },
        });
        notesDeleted += noteDeleteResult.deletedCount;
      }
    }

    res.status(200).json({
      message: "Cleanup completed!",
      cyclesDeleted: totalDeleted,
      notesDeleted: notesDeleted,
    });
  } catch (error) {
    console.error("Error cleaning duplicate cycles:", error);
    res.status(500).json({ error: "An error occurred during cleanup." });
  }
});
