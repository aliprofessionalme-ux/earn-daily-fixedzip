const admin = require("firebase-admin");

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

console.log({
  projectIdLoaded: !!projectId,
  clientEmailLoaded: !!clientEmail,
  privateKeyLoaded: !!privateKey,
  privateKeyBegin: privateKey.includes("BEGIN PRIVATE KEY"),
  privateKeyEnd: privateKey.includes("END PRIVATE KEY"),
});

try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  admin.firestore().collection("settings").doc("app").get()
    .then((snap) => {
      console.log("FIRESTORE OK");
      console.log("settings/app exists:", snap.exists);
      process.exit(0);
    })
    .catch((err) => {
      console.error("FIRESTORE ERROR CODE:", err.code);
      console.error("FIRESTORE ERROR MESSAGE:", err.message);
      process.exit(1);
    });
} catch (err) {
  console.error("INIT ERROR:", err.message);
  process.exit(1);
}
