require("dotenv").config();
const mongoose = require("mongoose");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    app.listen(process.env.PORT, () => {
      console.log(`Server running on port`, process.env.PORT);
      console.log("Connected to MongoDB ^_^");
    });
  })
  .catch((error) => {
    console.log("Connection to MongoDB failed !", error);
  });

app.use(
  cors({
    origin: process.env.CLIENT_DOMAIN,
    methods: "GET,POST,PUT,DELETE",
    credentials: true,
  })
);
app.get("/", (req, res) => {
  res.json("Connected");
});

require("./utils/scheduler");
app.use("/api/auth", require("./routes/AuthRoute"));
app.use("/api/whatsApp", require("./routes/WhatsAppRoute"));
app.use("/api/email", require("./routes/EmailRoute"));
app.use("/api/message", require("./routes/MessageRoute"));
app.use("/api/ordonnance", require("./routes/OrdonnanceRoute"));
app.use("/api/note", require("./routes/NoteRoute"));
app.use("/api/user", require("./routes/UserRoute"));
app.use("/api/rapport", require("./routes/RapportRoute"));
