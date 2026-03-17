const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath) {
  throw new Error("Укажите GOOGLE_APPLICATION_CREDENTIALS с путем к JSON сервисного аккаунта.");
}

const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(serviceAccountPath), "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const BATCH_LIMIT = 450;

const buildSearchTokens = (text) => {
  if (!text) return [];
  const tokens = new Set();
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .forEach((word) => {
      tokens.add(word);
      for (let i = 2; i <= Math.min(word.length, 8); i += 1) {
        tokens.add(word.slice(0, i));
      }
    });
  return Array.from(tokens);
};

const buildSearchIndex = (title, description) =>
  buildSearchTokens(`${title || ""} ${description || ""}`);

const toCardData = (listing = {}) => ({
  title: listing.title || "",
  description: listing.description || "",
  price: Number(listing.price || 0),
  propertyType: listing.propertyType || "",
  region: listing.region || "",
  district: listing.district || "",
  address: listing.address || "",
  rooms: Number(listing.rooms || 0),
  area: Number(listing.area || 0),
  ownerId: listing.ownerId || "",
  status: listing.status || "активно",
  rating: Number(listing.rating || 0),
  ratingCount: Number(listing.ratingCount || 0),
  ratingSum: Number(listing.ratingSum || 0),
  views: Number(listing.views || 0),
  amenities: Array.isArray(listing.amenities) ? listing.amenities : [],
  coverUrl: listing.coverUrl || "",
  searchTokens: Array.isArray(listing.searchTokens)
    ? listing.searchTokens
    : buildSearchIndex(listing.title, listing.description),
  createdAt: listing.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp()
});

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

const commitBatches = async (ops) => {
  const chunks = chunkArray(ops, BATCH_LIMIT);
  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach((op) => op(batch));
    await batch.commit();
  }
};

const run = async () => {
  const [listingSnap, cardsSnap] = await Promise.all([
    db.collection("listings").get(),
    db.collection("listing_cards").get()
  ]);

  const listingIds = new Set();
  const upsertOps = [];
  listingSnap.docs.forEach((docSnap) => {
    const listingData = docSnap.data() || {};
    listingIds.add(docSnap.id);
    const cardRef = db.collection("listing_cards").doc(docSnap.id);
    const payload = toCardData(listingData);
    upsertOps.push((batch) => batch.set(cardRef, payload, { merge: true }));
  });

  const deleteOps = [];
  cardsSnap.docs.forEach((docSnap) => {
    if (!listingIds.has(docSnap.id)) {
      deleteOps.push((batch) => batch.delete(docSnap.ref));
    }
  });

  await commitBatches(upsertOps);
  await commitBatches(deleteOps);

  console.log(
    JSON.stringify(
      {
        listings: listingSnap.size,
        cardsBefore: cardsSnap.size,
        cardsUpserted: upsertOps.length,
        cardsDeleted: deleteOps.length
      },
      null,
      2
    )
  );
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
