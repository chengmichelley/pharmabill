const request = require("supertest");
const express = require("express");
const session = require("express-session");
const billingEngineRouter = require("../controllers/billingEngine");
const authRequired = require("../middleware/authRequired");

const app = express();
app.use(express.json());

app.use(
  session({
    secret: "test_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }),
);

app.post("/test-login", (req, res) => {
  req.session.user = { _id: "user_test_123", username: "test_admin" };
  res.status(200).send("Logged in successfully");
});

app.use("/api/billing", authRequired, billingEngineRouter);

describe("POST /api/billing/recommend — Billing Engine Test Suite", () => {
  let authCookie;

  beforeAll(async () => {
    const loginResponse = await request(app).post("/test-login").send({});
    authCookie = loginResponse.headers["set-cookie"];
  });

  it("should reject requests with a 302 redirect if no session cookie is present", async () => {
    const response = await request(app)
      .post("/api/billing/recommend")
      .send({ insurancePlans: [] });

    expect(response.status).toBe(302);
  });

  it("should accept requests and return a ranked sequence when a valid session cookie is provided", async () => {
    const inputPayload = {
      insurancePlans: [
        { id: "plan_01", type: "medicaid", status: "active" },
        {
          id: "plan_02",
          type: "commercial",
          relationship: "self",
          status: "active",
        },
      ],
      userNotes: "Verify sequence.",
    };

    const response = await request(app)
      .post("/api/billing/recommend")
      .set("Cookie", authCookie)
      .send(inputPayload);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("recommendedSequence");
    expect(response.body).toHaveProperty("comparisons");
    expect(response.body.recommendedSequence[0].type).toBe("commercial");
  });

  it("should return a 400 error for a missing plans array even when logged in", async () => {
    const corruptedPayload = { userNotes: "Missing data." };

    const response = await request(app)
      .post("/api/billing/recommend")
      .set("Cookie", authCookie)
      .send(corruptedPayload);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Invalid or missing");
  });

  it("should block a manufacturer copay card when paired with a public government insurance program", async () => {
    const inputPayload = {
      insurancePlans: [
        { id: "plan_gov", type: "medicare", status: "active" },
        {
          id: "plan_mfg",
          type: "coupon",
          providerName: "CoPay Card",
          status: "active",
        },
      ],
      userNotes: "Processing prescription claim.",
    };

    const response = await request(app)
      .post("/api/billing/recommend")
      .set("Cookie", authCookie)
      .send(inputPayload);

    expect(response.status).toBe(200);
    expect(response.body.complianceAlert).toContain("Anti-Kickback Statutes");
  });

  it("should activate split-billing data parameters for a manufacturer copay card alongside a commercial primary plan", async () => {
    const inputPayload = {
      insurancePlans: [
        {
          id: "plan_comm",
          type: "commercial",
          relationship: "self",
          status: "active",
        },
        {
          id: "plan_mfg",
          type: "coupon",
          providerName: "CoPay Card",
          status: "active",
        },
      ],
      userNotes: "Run dual filing rules.",
    };

    const response = await request(app)
      .post("/api/billing/recommend")
      .set("Cookie", authCookie)
      .send(inputPayload);

    expect(response.status).toBe(200);
    expect(response.body.coordinationStrategy).toContain(
      "Split-Billing Active",
    );
    expect(response.body.finalCoordinatedCost).toBe(5.0);
  });

  it("should trigger preferred cash pricing calculations when user request patterns are specified", async () => {
    const inputPayload = {
      insurancePlans: [
        {
          id: "plan_comm",
          type: "commercial",
          relationship: "self",
          status: "active",
        },
      ],
      userNotes: "Requesting cash price option check",
    };

    const response = await request(app)
      .post("/api/billing/recommend")
      .set("Cookie", authCookie)
      .send(inputPayload);

    expect(response.status).toBe(200);
    expect(response.body.comparisons[0].cost).toBe(45.0);
    expect(response.body.comparisons[0].notes).toContain("Cash Option Active");
  });

  it("should automatically recognize corporate network names based on branding keywords and BIN inputs", async () => {
    const inputPayload = {
      insurancePlans: [
        {
          id: "plan_caremark",
          type: "commercial",
          providerName: "CVS Caremark Plan",
          bin: "004336",
          pcn: "ADV",
          status: "active",
        },
      ],
    };

    const response = await request(app)
      .post("/api/billing/recommend")
      .set("Cookie", authCookie)
      .send(inputPayload);

    expect(response.status).toBe(200);
    expect(response.body.comparisons[0].routingWarning).toContain(
      "CVS Caremark processing rails",
    );
  });

  it("should flag severe multi-page duplication risks when identical BIN and PCN paths cross-reference on file", async () => {
    const inputPayload = {
      insurancePlans: [
        {
          id: "plan_primary",
          type: "commercial",
          providerName: "Primary Express Scripts",
          bin: "003858",
          pcn: "A4",
          status: "active",
        },
        {
          id: "plan_secondary",
          type: "commercial",
          providerName: "Spousal Express Scripts",
          bin: "003858",
          pcn: "A4",
          status: "active",
        },
      ],
    };

    const response = await request(app)
      .post("/api/billing/recommend")
      .set("Cookie", authCookie)
      .send(inputPayload);

    expect(response.status).toBe(200);
    expect(response.body.comparisons[0].routingWarning).toContain(
      "Multi-Page Selection Risk",
    );
  });
});
