const {
  sendMessage,
  receiveMessage,
  verifyWebhook,
} = require("../controllers/WhatsAppController");

const router = require("express").Router();

router.post("/sendMessage", sendMessage);
router.get("/webhook", verifyWebhook);
router.post("/webhook", receiveMessage);

module.exports = router;
