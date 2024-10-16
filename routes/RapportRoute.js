const { getOrdonnanceStatistics } = require("../controllers/RapportController");
const { verifyTokenAndAdminAndCollab } = require("../middelwares/verifyToken");

const router = require("express").Router();

router.post("/", verifyTokenAndAdminAndCollab, getOrdonnanceStatistics);

module.exports = router;
