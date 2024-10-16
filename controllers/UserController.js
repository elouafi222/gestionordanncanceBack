const asyncHandler = require("express-async-handler");
const {
  validateLoginUser,
  user: User,
  validateAddUser,
  validateUpdateUser,
} = require("../models/user");
const { per_page } = require("../utils/constant");

module.exports.login = asyncHandler(async (req, res) => {
  const { error } = validateLoginUser(req.body);
  if (error) {
    return res.status(400).json({ message: error.message });
  }
  const user = await User.findOne({ username: req.body.username });
  if (!user) {
    return res
      .status(400)
      .json({ message: "Le nom d'utilisateur n'existe pas." });
  }

  if (req.body.password !== user.password) {
    return res.status(400).json({ message: "Le mot de passe est incorrect." });
  }

  if (!user.isAccountActive) {
    return res
      .status(400)
      .json({ message: "Votre compte est désactivé par l'administrateur." });
  }

  const token = user.generateAuthToken();
  await user.save();
  res.status(201).json({
    _id: user._id,
    username: user.username,
    role: user.role,
    token,
  });
});
module.exports.getAllUsers = asyncHandler(async (req, res) => {
  const { search, isAccountActive, role, page } = req.query;

  let matchQuery = {};

  if (search) {
    matchQuery.$or = [
      { nom: { $regex: search, $options: "i" } },
      { prenom: { $regex: search, $options: "i" } },
    ];
  }

  if (role) {
    matchQuery.role = role;
  }
  if (isAccountActive) {
    matchQuery.isAccountActive = isAccountActive === "true";
  }
  const users = await User.aggregate([
    { $match: matchQuery },
    { $sort: { createdAt: -1 } },
    { $skip: (page - 1) * per_page },
    { $limit: per_page },
    {
      $lookup: {
        from: "ordonnances",
        localField: "_id",
        foreignField: "collabId",
        as: "ordonnances",
      },
    },
    {
      $addFields: {
        ordonnanceCount: { $size: "$ordonnances" },
      },
    },
    {
      $project: {
        ordonnances: 0,
      },
    },
  ]);
  const totalCount = await User.countDocuments(matchQuery);
  res.status(200).json({
    totalCount,
    users,
  });
});

module.exports.addUser = asyncHandler(async (req, res) => {
  const { error } = validateAddUser(req.body);
  if (error) {
    return res.status(400).json({ message: error.message });
  }
  let verifyUser = await User.findOne({ username: req.body.username });
  if (verifyUser)
    return res.status(400).json({
      message:
        "Le nom d'utilisateur que vous avez choisi est déjà utilisé. Veuillez en essayer un autre ou ajouter des chiffres ou des caractères pour le rendre unique.",
    });

  const user = await User.create({
    nom: req.body.nom,
    prenom: req.body.prenom,
    username: req.body.username,
    password: req.body.password,
    role: req.body.role,
  });

  res.status(200).json(user);
});

module.exports.updateUser = asyncHandler(async (req, res) => {
  const { error } = validateUpdateUser(req.body);
  if (error) {
    return res.status(400).json({ message: error.message });
  }
  const updateUser = await User.findByIdAndUpdate(
    req.params.id,
    {
      nom: req.body.nom,
      prenom: req.body.prenom,
      username: req.body.username,
      password: req.body.password,
      role: req.body.role,
    },
    { new: true }
  );
  res.status(200).json(updateUser);
});

module.exports.changeAccountActivity = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ message: "Le compte n'existe pas." });
  }
  user.isAccountActive = !user.isAccountActive;
  const updateduser = await user.save();

  res.status(200).json(updateduser);
});
module.exports.deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ message: "Le compte n'existe pas." });
  }
  await User.findByIdAndDelete(req.params.id);

  res.status(200).json({ message: "Le compte a été supprimé." });
});
