const { login } = require("../controllers/UserController");

const router = require("express").Router();
router.post("/login", login);
module.exports = router;
