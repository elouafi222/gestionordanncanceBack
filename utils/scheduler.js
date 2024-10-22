const cron = require("node-cron");
const { receiveEmail } = require("../controllers/EmailController");
const {
  processRenewals,
  updateEnAttent,
  updateCylces,
} = require("../controllers/OrdonnanceController");

cron.schedule("* * * * *", () => {
  console.log("Running scheduled task to receive emails...");
  receiveEmail();
});

cron.schedule("0 0 * * *", async () => {
  console.log("Running scheduled task to chech renwal...");
  processRenewals();
});
cron.schedule("0 * * * *", async () => {
  console.log("Running scheduled task to updated EN ATTENTE(ordonnances) ...");
  updateEnAttent();
});
cron.schedule("0 * * * *", async () => {
  console.log("Running scheduled task to updated EN ATTENTE(cycles) ...");
  updateCylces();
});
