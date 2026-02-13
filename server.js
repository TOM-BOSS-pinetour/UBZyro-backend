const app = require("./src/app");
const { PORT } = require("./src/config/env");
const checkDatabaseConnection = require("./src/startup/checkDatabaseConnection");

// ---------- Start ----------
checkDatabaseConnection();

const port = PORT || 3000;
app.listen(port, () =>
  console.log(`🚀 API running on http://localhost:${port}`),
);
