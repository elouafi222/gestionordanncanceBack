const {
  addNote,
  updateNote,
  getNotesByOrdId,
  getNotesOfRetardCyclesByOrdId,
} = require("../controllers/NoteController");
const validateId = require("../middelwares/validateId");
const { verifyTokenAndAdminAndCollab } = require("../middelwares/verifyToken");
const router = require("express").Router();
// router.route("/").post(verifyTokenAndAdminAndCollab, addNote);
router.route("/:id").put(validateId, verifyTokenAndAdminAndCollab, updateNote);
router.get("/notes/:ordoId", verifyTokenAndAdminAndCollab, getNotesByOrdId);
router.get(
  "/getNotesOfRetardCyclesByOrdId/:ordoId",
  verifyTokenAndAdminAndCollab,
  getNotesOfRetardCyclesByOrdId
);
module.exports = router;
