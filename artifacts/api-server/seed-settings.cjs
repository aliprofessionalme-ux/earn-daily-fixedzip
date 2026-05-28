const admin = require("firebase-admin");

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey,
  }),
});

const settings = {
  coinRateCoins: 1000,
  coinRatePKR: 20,
  minimumWithdrawalPKR: 500,

  checkInEnergy: 1,
  spinEnergyReward: 1,
  scratchEnergyReward: 1,

  checkInCoins: 0,
  spinCoins: 0,
  scratchCoins: 0,

  spinDailyLimit: 5,
  scratchDailyLimit: 5,

  freeTaskSlots: 3,
  energyPerExtraSlot: 5,
  maxExtraSlots: 3,

  normalHoldDays: 7,
  newUserHoldDays: 14,
  largeRewardManualReviewUSD: 5,

  maintenanceMode: false,
  withdrawalDayText: "Withdrawals are reviewed manually before payout.",

  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
};

admin.firestore().collection("settings").doc("app").set(settings, { merge: true })
  .then(() => {
    console.log("settings/app created or updated successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed to seed settings:", err);
    process.exit(1);
  });
