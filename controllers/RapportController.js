const asyncHandler = require("express-async-handler");
const { ordonnance } = require("../models/ordonnance");
const { user } = require("../models/user");

module.exports.getOrdonnanceStatistics = asyncHandler(async (req, res) => {
  const { dateStart, dateFin } = req.body;
  if (!dateStart || !dateFin) {
    return res.status(400).json({ message: "Les deux dates sont requises" });
  }

  const startDate = new Date(dateStart);
  const endDate = new Date(dateFin);

  const statusMap = {
    1: "en attente",
    2: "en cours",
    3: "terminéE",
    4: "en retard",
  };

  const statisticsByStatus = await ordonnance.aggregate([
    {
      $match: {
        dateReception: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        details: {
          $push: {
            numero: "$numero",
            type: "$type",
            nom: "$nom",
            prenom: "$prenom",
            phone: "$phone",
            email: "$email",
            dateReception: "$dateReception",
          },
        },
      },
    },
    {
      $addFields: {
        statusName: {
          $switch: {
            branches: [
              { case: { $eq: ["$_id", 1] }, then: "en attente" },
              { case: { $eq: ["$_id", 2] }, then: "en cours" },
              { case: { $eq: ["$_id", 3] }, then: "terminée" },
              { case: { $eq: ["$_id", 4] }, then: "en retard" },
            ],
            default: "inconnu",
          },
        },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);
  const statisticsByUser = await ordonnance.aggregate([
    {
      $match: {
        dateReception: { $gte: startDate, $lte: endDate },
        collabId: { $ne: null },
      },
    },
    {
      $group: {
        _id: "$collabId",
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  const populatedResults = await user.populate(statisticsByUser, {
    path: "_id",
    select: "nom prenom username",
  });
  res.status(200).json({
    totalOrdonnances: statisticsByStatus.reduce(
      (sum, item) => sum + item.count,
      0
    ),
    statsByStatus: statisticsByStatus.map((item) => ({
      ...item,
      statusName: statusMap[item._id] || "inconnu",
    })),
    statsByUser: populatedResults,
  });
});
