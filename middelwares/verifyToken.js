const jwt = require("jsonwebtoken");
require("dotenv").config();
function verifyToken(req, res, next) {
  const authToken = req.headers.authorization;
  if (authToken) {
    const token = authToken.split(" ")[1];
    try {
      const decodedPayload = jwt.verify(token, process.env.SECRET);
      req.user = decodedPayload;
      next();
    } catch (error) {
      return res.status(401).json({ message: "Invalide token, access denied" });
    }
  } else {
    return res.status(401).json({ message: "No token privded, access denied" });
  }
}
function verifyTokenAndAdmin(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.role === "admin") {
      next();
    } else {
      return res.status(403).json({ message: "Not allowed, Only for admin" });
    }
  });
}
function verifyTokenAndAdminAndCollab(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.role === "admin" || req.user.role === "collab") {
      next();
    } else {
      return res
        .status(403)
        .json({ message: "Not allowed, Only for collaborateur" });
    }
  });
}

module.exports = {
  verifyToken,
  verifyTokenAndAdmin,
  verifyTokenAndAdminAndCollab,
};
