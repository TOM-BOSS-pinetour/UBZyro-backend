const express = require("express");

const healthRoutes = require("./routes/health");
const dbRoutes = require("./routes/db");
const profileRoutes = require("./routes/profiles");
const adminRoutes = require("./routes/admin");
const userRoutes = require("./routes/users");
const workerRoutes = require("./routes/workers");

const app = express();
app.use(express.json());

app.use(healthRoutes);
app.use(dbRoutes);
app.use("/profiles", profileRoutes);
app.use("/admin", adminRoutes);
app.use("/users", userRoutes);
app.use("/workers", workerRoutes);

module.exports = app;
