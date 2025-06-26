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
  endDate.setHours(23, 59, 59, 999); // fin de journée incluse

  /* ---------- 1.  Statistiques par statut ---------- */
  const statsByStatus = await ordonnance.aggregate([
    { $match: { dateReception: { $gte: startDate, $lte: endDate } } },
    // jointure user ↔ collabId
  {
    $lookup: {
      from: "users",
      localField: "collabId",
      foreignField: "_id",
      as: "collaborator",
    },
  },
  { $unwind: { path: "$collaborator", preserveNullAndEmptyArrays: true } },

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
          // 👇 ajoute le collaborateur complet
          collaborator: {
            nom: "$collaborator.nom",
            prenom: "$collaborator.prenom",
            username: "$collaborator.username",
          },
          // 👇 ajoute la date de dernière mise à jour
          updatedAt: "$updatedAt",
        },
      },
    },
  },
  { $sort: { _id: 1 } },
]);

  /* ---------- 2.  Statistiques par utilisateur ---------- */
  const statsByUser = await ordonnance.aggregate([
    { $match: { dateReception: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: "$collabId", // null si personne n’a encore traité
        count: { $sum: 1 },
      },
    },
    /* jointure avec la collection users */
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "userInfo",
      },
    },
    { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
    /* projection finale : on garde seulement les infos utiles */
    {
      $project: {
        _id: 1,
        count: 1,
        userDetails: {
          $cond: [
            { $ifNull: ["$userInfo", false] },
            {
              nom: "$userInfo.nom",
              prenom: "$userInfo.prenom",
              username: "$userInfo.username",
            },
            null,
          ],
        },
      },
    },
    { $sort: { count: -1 } },
  ]);

  /* ---------- 3.  Mapping des statuts + total ---------- */
  const statusMap = {
    1: "en attente",
    2: "en cours",
    3: "terminée",
    4: "en retard",
  };

  const totalOrdonnances = statsByStatus.reduce(
    (sum, item) => sum + item.count,
    0
  );

  /* ---------- 4.  Réponse ---------- */
  res.status(200).json({
    totalOrdonnances,
    statsByStatus: statsByStatus.map((item) => ({
      ...item,
      statusName: statusMap[item._id] || "inconnu",
    })),
    statsByUser: statsByUser.map((u) => ({
      ...u,
      // pour le front : string « inconnu » si aucun collabId
      collabId: u._id ? u._id : "inconnu",
    })),
  });
});
