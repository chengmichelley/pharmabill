const express = require("express");
const router = express.Router();

function analyzeRoutingOverlaps(plans) {
  if (!plans || plans.length < 2) return [];

  const analysis = [];
  const binMap = {};

  plans.forEach((plan) => {
    if (!plan.bin) return;
    if (!binMap[plan.bin]) binMap[plan.bin] = [];
    binMap[plan.bin].push(plan);
  });

  Object.keys(binMap).forEach((bin) => {
    const tiedPlans = binMap[bin];
    if (tiedPlans.length > 1) {
      const pcnSet = new Set(tiedPlans.map((p) => (p.pcn || "").toUpperCase()));

      tiedPlans.forEach((plan) => {
        analysis.push({
          id: plan._id || plan.id,
          hasSharedBin: true,
          hasSharedPcn: pcnSet.size < tiedPlans.length,
          totalBinConflicts: tiedPlans.length,
        });
      });
    }
  });

  return analysis;
}

function calculateMockPrice(type, providerName, relationship, notesLower) {
  let basePrice = 120.0;

  if (notesLower.includes("cash option") || notesLower.includes("cash price")) {
    return {
      finalPrice: 45.0,
      message: "Pharmabill Preferred Cash Option Active",
    };
  }

  const nameLower = (providerName || "").toLowerCase();

  if (type === "coupon") {
    if (
      nameLower.includes("goodrx") ||
      nameLower.includes("discount") ||
      nameLower.includes("singlecare")
    ) {
      return {
        finalPrice: 35.0,
        message: "Third-Party Discount Card (Standalone Cash Price)",
      };
    }
    return {
      finalPrice: 15.0,
      message: "Manufacturer Copay Card (Requires Commercial Primary)",
    };
  }

  switch (type) {
    case "commercial":
      basePrice = relationship === "self" ? 20.0 : 35.0;
      break;
    case "medicare":
      basePrice = 10.0;
      break;
    case "medicaid":
      basePrice = 3.0;
      break;
    default:
      basePrice = 120.0;
  }
  return { finalPrice: basePrice, message: "Standard Plan Copay Tier" };
}

router.post("/recommend", async (req, res, next) => {
  try {
    const { insurancePlans, userNotes } = req.body;

    if (!insurancePlans || !Array.isArray(insurancePlans)) {
      return res
        .status(400)
        .json({ error: "Invalid or missing insurance plans payload." });
    }

    const notesLower = (userNotes || "").toLowerCase();
    const activePlans = insurancePlans.filter(
      (p) => p && p.status !== "inactive",
    );

    const overlaps = analyzeRoutingOverlaps(activePlans);

    const comparisons = activePlans.map((plan) => {
      const priceMeta = calculateMockPrice(
        plan.type || plan.coverageType,
        plan.providerName,
        plan.relationship,
        notesLower,
      );
      const overlapMeta = overlaps.find(
        (o) => o.id === (plan._id || plan.id),
      ) || { hasSharedBin: false };

      const nameLower = (plan.providerName || "").toLowerCase();
      let networkMatchText = "";

      if (nameLower.includes("caremark") || plan.bin === "004336") {
        networkMatchText =
          "🎯 Payer Network Verified: Verified CVS Caremark processing rails.";
      } else if (
        nameLower.includes("express") ||
        nameLower.includes("esi") ||
        plan.bin === "003858"
      ) {
        networkMatchText =
          "🎯 Payer Network Verified: Verified Express Scripts processing rails.";
      } else if (
        nameLower.includes("optum") ||
        nameLower.includes("uhc") ||
        plan.bin === "610014"
      ) {
        networkMatchText =
          "🎯 Payer Network Verified: Verified OptumRx processing rails.";
      } else {
        networkMatchText =
          "🔍 Unverified Payer Sub-Network: Verify Group ID manually to avoid multi-page trial rejections.";
      }

      let routingWarning = "Unique Network Path Detected.";
      if (overlapMeta.hasSharedBin) {
        routingWarning = overlapMeta.hasSharedPcn
          ? `⚠️ Multi-Page Selection Risk: Duplicate BIN/PCN conflict on file. ${networkMatchText}`
          : `💡 Shared Routing Node: Shared BIN (${plan.bin}) resolved via unique PCN context. ${networkMatchText}`;
      } else {
        routingWarning = networkMatchText;
      }

      return {
        id: plan._id || plan.id,
        providerName: plan.providerName,
        type: plan.type || plan.coverageType,
        relationship: plan.relationship || "self",
        cost: priceMeta.finalPrice,
        notes: priceMeta.message,
        bin: plan.bin || "N/A",
        pcn: plan.pcn || "N/A",
        routingWarning: routingWarning,
      };
    });

    let complianceAlert = null;
    let coordinationStrategy = "Standard Billing Strategy Active.";
    let finalCoordinatedCost = null;

    const hasCommercial = comparisons.some((c) => c.type === "commercial");
    const hasMedicare = comparisons.some((c) => c.type === "medicare");
    const hasMedicaid = comparisons.some((c) => c.type === "medicaid");

    const couponPlans = comparisons.filter((c) => c.type === "coupon");
    const hasGoodRx = couponPlans.some(
      (c) =>
        c.providerName.toLowerCase().includes("goodrx") ||
        c.providerName.toLowerCase().includes("discount"),
    );
    const hasMfgCoupon = couponPlans.some(
      (c) =>
        !c.providerName.toLowerCase().includes("goodrx") &&
        !c.providerName.toLowerCase().includes("discount"),
    );

    if (hasMfgCoupon && (hasMedicare || hasMedicaid)) {
      complianceAlert =
        "⚠️ Compliance Guard: Federal Anti-Kickback Statutes strictly prohibit combining Manufacturer Copay Cards with government insurance (Medicare/Medicaid/TRICARE). Card rejected.";
    } else if (hasMfgCoupon && hasCommercial) {
      const commPlan = comparisons.find((c) => c.type === "commercial");
      finalCoordinatedCost = Math.max(0, commPlan.cost - 15.0);
      coordinationStrategy =
        "🔄 Split-Billing Active: Primary Commercial Insurance successfully processed first. Secondary Manufacturer Copay Card applied to remaining balance.";
    }

    if (hasGoodRx && hasCommercial) {
      coordinationStrategy =
        "💡 Coordination Hint: Third-Party Discount Cards (GoodRx) cannot be combined with your insurance copay. Biller must choose either the standalone GoodRx rate or the Insured Copay.";
    }

    if (hasCommercial && hasMedicare) {
      coordinationStrategy =
        "MSP Rule Active: Employer Group Health Plan (EGHP) acts as Primary. Medicare Part D coordinates as Secondary.";
    }

    const primaryStack = [...comparisons].sort((a, b) => {
      const weights = { commercial: 1, medicare: 2, medicaid: 3, coupon: 4 };
      return (weights[a.type] || 99) - (weights[b.type] || 99);
    });

    res.json({
      recommendedSequence: primaryStack,
      comparisons: comparisons,
      complianceAlert: complianceAlert,
      coordinationStrategy: coordinationStrategy,
      finalCoordinatedCost: finalCoordinatedCost,
    });
  } catch (error) {
    console.error("Advanced Billing Engine Fault:", error);
    res.status(500).json({ error: "Internal processing engine fault." });
  }
});

module.exports = router;
