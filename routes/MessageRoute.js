const {
  getMessage,
  deleteMessage,
  acceptMessage,
} = require("../controllers/MessageController");
const validateId = require("../middelwares/validateId");
const { verifyTokenAndAdminAndCollab } = require("../middelwares/verifyToken");
const router = require("express").Router();

router.get("/", verifyTokenAndAdminAndCollab, getMessage);
router
  .route("/:id")
  .delete(validateId, verifyTokenAndAdminAndCollab, deleteMessage);
router
  .route("/acceptMessage/:id")
  .post(validateId, verifyTokenAndAdminAndCollab, acceptMessage);
module.exports = router;
