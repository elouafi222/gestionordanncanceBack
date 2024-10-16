const {
  getAllUsers,
  addUser,
  updateUser,
  deleteAccount,
  changeAccountActivity,
} = require("../controllers/UserController");
const validateId = require("../middelwares/validateId");
const { verifyTokenAndAdmin } = require("../middelwares/verifyToken");
const router = require("express").Router();
router
  .route("/")
  .get(verifyTokenAndAdmin, getAllUsers)
  .post(verifyTokenAndAdmin, addUser);
router
  .route("/:id")
  .put(validateId, verifyTokenAndAdmin, updateUser)
  .delete(validateId, verifyTokenAndAdmin, deleteAccount);
router
  .route("/accountActivity/:id")
  .put(validateId, verifyTokenAndAdmin, changeAccountActivity);
module.exports = router;
