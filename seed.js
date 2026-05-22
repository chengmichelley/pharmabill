require("dotenv").config();
require("./db/connection");
const mongoose = require("mongoose");
const Patient = require("./models/patient");
const Insurance = require("./models/insurance");
const User = require("./models/user");
const bcrypt = require("bcryptjs");

const patientsMock = [
  {
    firstName: "John",
    lastName: "Doe",
    dob: "05/14/1984",
    isInactivated: false,
  },
  {
    firstName: "Jane",
    lastName: "Smith",
    dob: "11/23/1991",
    isInactivated: false,
  },
  {
    firstName: "Robert",
    lastName: "Johnson",
    dob: "08/03/1965",
    isInactivated: false,
  },
  {
    firstName: "Maria",
    lastName: "Garcia",
    dob: "02/19/1978",
    isInactivated: false,
  },
  {
    firstName: "William",
    lastName: "Davis",
    dob: "12/05/2001",
    isInactivated: true,
  },
];

const seedDatabase = async () => {
  try {
    console.log("🔄 Starting database initialization wipe...");
    await Patient.deleteMany({});
    await Insurance.deleteMany({});
    await User.deleteMany({});
    console.log("✅ Collections cleared cleanly.");

    console.log("👤 Creating user authentication profiles...");
    const adminPassword = await bcrypt.hash("password123", 10);
    const staffPassword = await bcrypt.hash("password123", 10);

    await User.create({
      username: "admin_demo",
      hashedPassword: adminPassword,
      role: "admin",
    });

    await User.create({
      username: "staff_demo",
      hashedPassword: staffPassword,
      role: "staff",
    });

    console.log(
      "🔑 Generated admin_demo (Admin) and staff_demo (Staff) with password123.",
    );

    console.log("🧬 Generating mock patients...");
    const createdPatients = await Patient.create(patientsMock);
    console.log(
      `✅ Successfully stored ${createdPatients.length} patient profiles.`,
    );

    console.log("💳 Compiling coordinated insurance tracks...");

    const john = createdPatients.find((p) => p.firstName === "John");
    const jane = createdPatients.find((p) => p.firstName === "Jane");
    const robert = createdPatients.find((p) => p.firstName === "Robert");
    const maria = createdPatients.find((p) => p.firstName === "Maria");

    await Insurance.create([
      {
        providerName: "CVS Caremark",
        bin: "004336",
        pcn: "ADV",
        group: "RX2026",
        coverageType: "commercial",
        type: "commercial",
        relationship: "self",
        priority: 0,
        status: "active",
        memberId: "PB83749201",
        patient: john._id,
      },
      {
        providerName: "Pfizer Mfg Copay Card",
        bin: "015995",
        pcn: "PCNMFG",
        group: "PFZ2026",
        coverageType: "coupon",
        type: "coupon",
        relationship: "self",
        priority: 0,
        status: "active",
        memberId: "PB11029384",
        patient: john._id,
      },
    ]);

    await Insurance.create([
      {
        providerName: "Medicare Part D",
        bin: "610502",
        pcn: "MEDDADV",
        group: "MCD2026",
        coverageType: "medicare",
        type: "medicare",
        relationship: "self",
        priority: 0,
        status: "active",
        memberId: "PB55483920",
        patient: jane._id,
      },
      {
        providerName: "Humana Copay Savings Card",
        bin: "015995",
        pcn: "HUMMFG",
        group: "HUM99",
        coverageType: "coupon",
        type: "coupon",
        relationship: "self",
        priority: 0,
        status: "active",
        memberId: "PB22938401",
        patient: jane._id,
      },
    ]);

    await Insurance.create([
      {
        providerName: "Express Scripts",
        bin: "003858",
        pcn: "A4",
        group: "ESI2025",
        coverageType: "commercial",
        type: "commercial",
        relationship: "dependent",
        priority: 0,
        status: "active",
        memberId: "PB99203948",
        patient: robert._id,
      },
      {
        providerName: "GoodRx Discount",
        bin: "015995",
        pcn: "GDRX",
        group: "GRX99",
        coverageType: "coupon",
        type: "coupon",
        relationship: "self",
        priority: 0,
        status: "active",
        memberId: "PB77302941",
        patient: robert._id,
      },
    ]);

    await Insurance.create([
      {
        providerName: "State Medicaid",
        bin: "610014",
        pcn: "MCAID",
        group: "STATEFL",
        coverageType: "medicaid",
        type: "medicaid",
        relationship: "self",
        priority: 0,
        status: "active",
        memberId: "PB44102938",
        patient: maria._id,
      },
    ]);

    const totalInsurances = await Insurance.countDocuments({});
    console.log(
      `✅ Successfully stored ${totalInsurances} billing insurance coverages.`,
    );
    console.log("🚀 Database seeding operation completed flawlessly!");
    process.exit(0);
  } catch (error) {
    console.error(
      "❌ Critical fault caught running initialization script:",
      error.stack || error.message,
    );
    process.exit(1);
  }
};

mongoose.connection.on("connected", () => {
  seedDatabase();
});
