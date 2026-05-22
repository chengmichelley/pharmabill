const express = require("express");
const router = express.Router();
const Patient = require("../models/patient");
const Insurance = require("../models/insurance");
const authRequired = require("../middleware/authRequired");
const { recommend } = require("../logic/recommendation");
const insuranceRouter = require("./insurances");

router.use(authRequired);

// =======================
// SEARCH
// =======================
router.get("/search", async (req, res) => {
  try {
    const { firstName, lastName, dob } = req.query;
    let results = [];

    const hasSearchTerms = Object.keys(req.query).length > 0;

    if (hasSearchTerms) {
      const hasBothNames = firstName && lastName;
      const hasDob = !!dob;

      if (!hasBothNames && !dob) {
        throw new Error(
          "Please provide both First & Last name, or a Date of Birth.",
        );
      }

      const query = {};
      if (firstName) query.firstName = new RegExp(firstName, "i");
      if (lastName) query.lastName = new RegExp(lastName, "i");

      if (dob) {
        let digits = dob.replace(/\D/g, "");
        if (digits.length === 8) {
          query.dob = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
        } else {
          query.dob = dob;
        }
      }

      results = await Patient.find(query);

      if (results.length === 1) {
        return res.redirect(`/patients/${results[0]._id}`);
      }
    }

    return res.render("patients/search.ejs", {
      results: results,
      firstName: firstName || "",
      lastName: lastName || "",
      dob: dob || "",
      message: req.query.message || null,
      err: req.query.error || null,
    });
  } catch (error) {
    return res.status(400).render("patients/search.ejs", {
      results: [],
      err: error.message,
      firstName: req.query.firstName || "",
      lastName: req.query.lastName || "",
      dob: req.query.dob || "",
      message: null,
    });
  }
});

// =======================
// NEW
// =======================
router.get("/new", async (req, res) => {
  res.render("patients/new.ejs");
});

// =======================
// CREATE
// =======================
router.post("/", async (req, res) => {
  try {
    if (req.body.dob) {
      let digits = req.body.dob.replace(/\D/g, "");
      if (digits.length === 8) {
        req.body.dob = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
      }
    }
    const newPatient = await Patient.create(req.body);
    res.redirect(`/patients/${newPatient._id}`);
  } catch (error) {
    res.status(400).render("error.ejs", { err: error.message });
  }
});

// =======================
// SELECT
// =======================
router.get("/select/:id", async (req, res) => {
  try {
    req.session.selectedPatientId = req.params.id;
    res.redirect(`/patients/${req.params.id}/billing/new`);
  } catch (error) {
    res.status(400).render("error.ejs", { err: error.message });
  }
});

// =======================
// CLEAR SELECTION
// =======================
router.get("/clear-selection", async (req, res) => {
  try {
    req.session.selectedPatientId = null;
    res.redirect(`/patients/search`);
  } catch (error) {
    res.status(400).render("error.ejs", { err: error.message });
  }
});

// =======================
// EDIT
// =======================
router.get("/:id/edit", async (req, res) => {
  try {
    const foundPatient = await Patient.findById(req.params.id);
    if (!foundPatient) throw new Error("Patient not found");
    res.render("patients/edit.ejs", { patient: foundPatient });
  } catch (error) {
    res.status(400).render("error.ejs", { err: error.message });
  }
});

// =======================
// UPDATE
// =======================
router.put("/:id", async (req, res) => {
  try {
    req.body.isInactivated = req.body.isInactivated === "true";
    if (req.body.dob) {
      let digits = req.body.dob.replace(/\D/g, "");
      if (digits.length === 8) {
        req.body.dob = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
      }
    }
    await Patient.findByIdAndUpdate(req.params.id, req.body);
    res.redirect(`/patients/${req.params.id}`);
  } catch (error) {
    res.status(400).render("error.ejs", { err: error.message });
  }
});

// =======================
// SOFT DELETE / TOGGLE ACTIVE STATUS
// =======================
router.put("/:id/inactivate", async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) throw new Error("Patient not found");

    patient.isInactivated = !patient.isInactivated;
    await patient.save();

    res.redirect(`/patients/${req.params.id}`);
  } catch (error) {
    res.status(400).render("error.ejs", { err: error.message });
  }
});

// =======================
// INSURANCE ROUTER SUB-HANDOFF
// =======================
router.use("/:id/billing", insuranceRouter);

// =======================
// SHOW
// =======================
router.get("/:id", async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) throw new Error("Patient not found");

    req.session.selectedPatientId = patient._id;

    const insurancePlans = await Insurance.find({ patient: patient._id });

    const ranked = await recommend(patient._id);
    const primaryInsurance = ranked.length > 0 ? ranked[0] : null;

    res.render("patients/show.ejs", {
      patient,
      insurancePlans, 
      primaryInsurance,
    });
  } catch (error) {
    res.status(400).render("error.ejs", { err: error.message });
  }
});

module.exports = router;
