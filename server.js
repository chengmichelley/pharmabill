require("dotenv").config();
require("./db/connection");
const crypto = require("crypto");
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;
const methodOverride = require("method-override");
const morgan = require("morgan");
const helmet = require("helmet");
const session = require("express-session");
const MongoStore = require("connect-mongo");

const patientController = require("./controllers/patients");
const authRoutes = require("./controllers/auth");
const userRoutes = require("./controllers/users");
const billingEngineRouter = require("./controllers/billingEngine");

const authRequired = require("./middleware/authRequired");
const viewData = require("./middleware/viewData");

// =======================
// MIDDLEWARE & SECURITY HEADERS
// =======================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(morgan("dev"));

app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString("base64");
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.nonce}'`,
          "https://unpkg.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  }),
);

app.use(express.static("public"));

// =======================
// VIEW ENGINE CONFIGURATION
// =======================
app.set("view engine", "ejs");
app.set("view cache", true);
app.set("trust proxy", 1);

// =======================
// SESSION CONFIGURATION
// =======================
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

// =======================
// ROUTES & CUSTOM MIDDLEWARE
// =======================
app.use(viewData);
app.use("/auth", authRoutes);
app.use("/api/billing", authRequired, billingEngineRouter);

app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.use("/patients", authRequired, patientController);
app.use("/user", authRequired, userRoutes);

// =======================
// 404 CATCH ALL
// =======================
app.get("/*path", (req, res) => {
  res.status(404).render("error.ejs", { err: "Page Not Found" });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render("error.ejs", { err: "Internal Server Error" });
});

// =======================
// SERVER START
// =======================
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
