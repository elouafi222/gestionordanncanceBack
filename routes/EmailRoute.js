const { receiveEmail, sendEmail } = require("../controllers/EmailController");

const router = require("express").Router();

router.get("/receiveMails", receiveEmail);
router.post("/sendEmail", sendEmail);
module.exports = router;
