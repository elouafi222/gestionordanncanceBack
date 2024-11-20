const multer = require("multer");
const {
  getOrdonnances,
  updateOrdnnance,
  deleteOrdonnance,
  changeStatusOrdnnance,
  addOrdonnanceCollab,
  addOrdonnace,
  getCounts,
  changeStatusCycle,
  getTodayOrdonnances,
  getEnRetardOrdonnances,
  getEnRetardCycles,
  cleanDuplicateCycles,
} = require("../controllers/OrdonnanceController");
const validateId = require("../middelwares/validateId");
const { verifyTokenAndAdminAndCollab } = require("../middelwares/verifyToken");
const router = require("express").Router();
const upload = multer({ storage: multer.memoryStorage() });
router
  .route("/")
  .post(verifyTokenAndAdminAndCollab, upload.single("file"), addOrdonnace)
  .get(verifyTokenAndAdminAndCollab, getOrdonnances);
router.route("/today").get(verifyTokenAndAdminAndCollab, getTodayOrdonnances);
router
  .route("/enRetard")
  .get(verifyTokenAndAdminAndCollab, getEnRetardOrdonnances);
router
  .route("/enRetardCycles")
  .get(verifyTokenAndAdminAndCollab, getEnRetardCycles);
router
  .route("/:id")
  .put(validateId, verifyTokenAndAdminAndCollab, updateOrdnnance)
  .delete(validateId, verifyTokenAndAdminAndCollab, deleteOrdonnance);
router
  .route("/changeStatusOrdnnance/:id")
  .put(validateId, verifyTokenAndAdminAndCollab, changeStatusOrdnnance);
router
  .route("/changeStatusCycle/:id")
  .put(validateId, verifyTokenAndAdminAndCollab, changeStatusCycle);
router
  .route("/addOrdonnanceCollab/:id")
  .put(validateId, verifyTokenAndAdminAndCollab, addOrdonnanceCollab);
router.route("/getCount").get(verifyTokenAndAdminAndCollab, getCounts);
// router.route("/cleanDuplicateCycles").get(cleanDuplicateCycles);
module.exports = router;
