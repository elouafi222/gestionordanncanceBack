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
  endDate.setHours(23, 59, 59, 999); // Set to the end of the day

  const statusMap = {
    1: "en attente",
    2: "en cours",
    3: "terminée",
    4: "en retard",
  };

  const statisticsByStatus = await ordonnance.aggregate([
    {
      $match: {
        dateReception: { $gte: startDate, $lte: endDate }, // Include the entire day of dateFin
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
        dateReception: { $gte: startDate, $lte: endDate }, // Include the entire day of dateFin
      },
    },
    {
      $group: {
        _id: { $ifNull: ["$collabId", "inconnu"] }, // Replace null with "inconnu"
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  // Populate user details for non-null collabId
  const populatedResults = await Promise.all(
    statisticsByUser.map(async (item) => {
      if (item._id !== "inconnu") {
        const userDetails = await user.findById(item._id).select("nom prenom username");
        return { ...item, userDetails };
      } else {
        return { ...item, userDetails: null }; // For "inconnu", userDetails is null
      }
    })
  );

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