const {
  getMessage,
  deleteMessage,
  acceptMessage,
  deleteManyMessages,
} = require("../controllers/MessageController");
const validateId = require("../middelwares/validateId");
const { verifyTokenAndAdminAndCollab } = require("../middelwares/verifyToken");
const router = require("express").Router();

router.get("/", verifyTokenAndAdminAndCollab, getMessage);
router
  .route("/delete/:id")
  .delete(validateId, verifyTokenAndAdminAndCollab, deleteMessage);
router
  .route("/acceptMessage/:id")
  .post(validateId, verifyTokenAndAdminAndCollab, acceptMessage);
router
  .route("/deleteMany")
  .delete(verifyTokenAndAdminAndCollab, deleteManyMessages);

module.exports = router;
