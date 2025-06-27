const asyncHandler = require("express-async-handler");
const { ordonnance } = require("../models/ordonnance");
const { user } = require("../models/user");
const { cycle: Cycle } = require("../models/cycle");

module.exports.getOrdonnanceStatistics = asyncHandler(async (req, res) => {
  const { dateStart, dateFin } = req.body;
  if (!dateStart || !dateFin) {
    return res.status(400).json({ message: "Les deux dates sont requises" });
  }

  const startDate = new Date(dateStart);
  const endDate = new Date(dateFin);
  endDate.setHours(23, 59, 59, 999);

  // 1. Compter les prescriptions
  const [totalInitiales, renouvellementsTraites] = await Promise.all([
    ordonnance.countDocuments({
      dateReception: { $gte: startDate, $lte: endDate }
    }),
    Cycle.countDocuments({
      status: "2",
      dateTreatement: { $gte: startDate, $lte: endDate }
    })
  ]);

  const totalPrescriptions = totalInitiales + renouvellementsTraites;

  // 2. Statistiques par statut
  const statsByStatus = await ordonnance.aggregate([
    { $match: { dateReception: { $gte: startDate, $lte: endDate } } },
    {
      $lookup: {
        from: "cycles",
        localField: "_id",
        foreignField: "ordonnanceId",
        as: "cycles"
      }
    },
    { $unwind: { path: "$cycles", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        renouvellements: {
          $sum: {
            $cond: [
              { 
                $and: [
                  { $eq: ["$type", "renouveller"] },
                  { $eq: ["$cycles.status", "2"] },
                  { $gte: ["$cycles.dateTreatement", startDate] },
                  { $lte: ["$cycles.dateTreatement", endDate] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // 3. Statistiques par utilisateur
  const [userOrdonnances, userCycles] = await Promise.all([
    // Ordonnances initiales par utilisateur
    ordonnance.aggregate([
      { 
        $match: { 
          dateReception: { $gte: startDate, $lte: endDate },
          collabId: { $ne: null }
        } 
      },
      {
        $group: {
          _id: "$collabId",
          count: { $sum: 1 }
        }
      }
    ]),
    
    // Renouvellements par utilisateur
    Cycle.aggregate([
      { 
        $match: { 
          status: "2",
          dateTreatement: { $gte: startDate, $lte: endDate },
          collabId: { $ne: null }
        } 
      },
      {
        $group: {
          _id: "$collabId",
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  // Fusionner les résultats
  const userStatsMap = new Map();
  
  // Ajouter les ordonnances initiales
  userOrdonnances.forEach(item => {
    userStatsMap.set(item._id.toString(), {
      _id: item._id,
      ordonnancesInitiales: item.count,
      renouvellementsTraites: 0
    });
  });
  
  // Ajouter les renouvellements
  userCycles.forEach(item => {
    const userId = item._id.toString();
    if (userStatsMap.has(userId)) {
      userStatsMap.get(userId).renouvellementsTraites += item.count;
    } else {
      userStatsMap.set(userId, {
        _id: item._id,
        ordonnancesInitiales: 0,
        renouvellementsTraites: item.count
      });
    }
  });

  // Convertir en array et ajouter les détails utilisateur
  let statsByUser = Array.from(userStatsMap.values());
  
  // Ajouter les détails utilisateur
  statsByUser = await Promise.all(statsByUser.map(async (item) => {
    const userInfo = await user.findById(item._id);
    return {
      ...item,
      userDetails: userInfo ? {
        nom: userInfo.nom,
        prenom: userInfo.prenom,
        username: userInfo.username
      } : null,
      total: item.ordonnancesInitiales + item.renouvellementsTraites
    };
  }));

  // Trier par total décroissant
  statsByUser.sort((a, b) => b.total - a.total);

  // 4. Détails des prescriptions
  const [ordonnancesInitiales, renouvellements] = await Promise.all([
    // Ordonnances initiales
    ordonnance.find({
      dateReception: { $gte: startDate, $lte: endDate }
    })
    .populate({
      path: "collabId",
      select: "nom prenom username"
    })
    .lean(),
    
    // Renouvellements (cycles terminés)
    Cycle.find({
      status: "2",
      dateTreatement: { $gte: startDate, $lte: endDate }
    })
    .populate({
      path: "ordonnanceId",
      select: "nom prenom numero"
    })
    .populate({
      path: "collabId",
      select: "nom prenom username"
    })
    .lean()
  ]);

  // 5. Ordonnances supérieures à 500€
  const [totalSup500, ordonnancesSup500] = await Promise.all([
    ordonnance.countDocuments({
      isMore500: true,
      dateReception: { $gte: startDate, $lte: endDate }
    }),
    ordonnance.find({
      isMore500: true,
      dateReception: { $gte: startDate, $lte: endDate }
    })
    .populate({
      path: "collabId",
      select: "nom prenom username"
    })
    .lean()
  ]);

  // 6. Mapping des statuts
  const statusMap = {
    1: "en attente",
    2: "en cours",
    3: "terminée",
    4: "en retard"
  };

  // 7. Formatage de la réponse
  res.status(200).json({
    totalPrescriptions,
    totalInitiales,
    renouvellementsTraites,
    totalSup500,
    statsByStatus: statsByStatus.map(item => ({
      ...item,
      statusName: statusMap[item._id] || "inconnu",
      total: item.count + item.renouvellements
    })),
    statsByUser,
    ordonnancesInitiales: ordonnancesInitiales.map(ord => ({
      ...ord,
      statusName: statusMap[ord.status] || "inconnu",
      collaborator: ord.collabId
    })),
    renouvellements: renouvellements.map(cycle => ({
      ...cycle,
      ordonnanceNumero: cycle.ordonnanceId?.numero,
      nom: cycle.ordonnanceId?.nom,
      prenom: cycle.ordonnanceId?.prenom,
      collaborator: cycle.collabId
    })),
    ordonnancesSup500: ordonnancesSup500.map(ord => ({
      ...ord,
      statusName: statusMap[ord.status] || "inconnu",
      collaborator: ord.collabId
    }))
  });
});