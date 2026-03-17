const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath) {
  throw new Error("Р—Р°РґР°Р№С‚Рµ GOOGLE_APPLICATION_CREDENTIALS СЃ РїСѓС‚С‘Рј Рє JSON СЃРµСЂРІРёСЃРЅРѕРіРѕ Р°РєРєР°СѓРЅС‚Р°.");
}

const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(serviceAccountPath), "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const { FieldValue } = admin.firestore;

const COLLECTIONS = {
  users: "users",
  listings: "listings",
  listingCards: "listing_cards",
  amenities: "amenities",
  regions: "regions",
  districts: "districts",
  propertyTypes: "property_types",
  favorites: "favorites",
  messages: "messages",
  bookings: "bookings",
  availability: "availability",
  activeActions: "active_actions",
  actionHistory: "action_history"
};

const chunkArray = (items, size) => {
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
};

const deleteDocs = async (docs) => {
  if (!docs.length) return;
  const batches = chunkArray(docs, 450);
  for (const batchDocs of batches) {
    const batch = db.batch();
    batchDocs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
  }
};

const deleteSubcollection = async (parentRef, subcollection) => {
  const snap = await parentRef.collection(subcollection).get();
  await deleteDocs(snap.docs);
};

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

const buildListingCardData = (listing = {}) => ({
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
  status: listing.status || "Р°РєС‚РёРІРЅРѕ",
  rating: Number(listing.rating || 0),
  ratingCount: Number(listing.ratingCount || 0),
  ratingSum: Number(listing.ratingSum || 0),
  views: Number(listing.views || 0),
  amenities: Array.isArray(listing.amenities) ? listing.amenities : [],
  coverUrl: listing.coverUrl || "",
  searchTokens: Array.isArray(listing.searchTokens)
    ? listing.searchTokens
    : buildSearchIndex(listing.title, listing.description),
  createdAt: listing.createdAt || FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp()
});

const resetDemoData = async () => {
  const demoListingTitles = [
    "Modern studio with skyline view",
    "Cozy apartment near Old Town",
    "Family house with garden",
    "Harbor loft",
    "Quiet villa retreat",
    "РЎРѕРІСЂРµРјРµРЅРЅР°СЏ СЃС‚СѓРґРёСЏ СЃ РІРёРґРѕРј РЅР° РіРѕСЂРѕРґ",
    "РЈСЋС‚РЅС‹Рµ Р°РїР°СЂС‚Р°РјРµРЅС‚С‹ СЂСЏРґРѕРј СЃРѕ РЎС‚Р°СЂС‹Рј РіРѕСЂРѕРґРѕРј",
    "РЎРµРјРµР№РЅС‹Р№ РґРѕРј СЃ СЃР°РґРѕРј",
    "Р›РѕС„С‚ Сѓ РїРѕСЂС‚Р°",
    "РўРёС…Р°СЏ РІРёР»Р»Р° РґР»СЏ РѕС‚РґС‹С…Р°",
    "РЎС‚СѓРґРёСЏ Сѓ РґРµР»РѕРІРѕРіРѕ С†РµРЅС‚СЂР°",
    "РђРїР°СЂС‚Р°РјРµРЅС‚С‹ СЃ Р±Р°Р»РєРѕРЅРѕРј РІ РґРµР»РѕРІРѕРј С†РµРЅС‚СЂРµ",
    "РЈСЋС‚РЅР°СЏ СЃС‚СѓРґРёСЏ Сѓ РїР°СЂРєР°",
    "Р”РѕРј РІ СЃРѕСЃРЅРѕРІРѕРј Р±РѕСЂСѓ",
    "Р›РѕС„С‚ СЃ РїР°РЅРѕСЂР°РјРѕР№ РјРѕСЂСЏ",
    "Р’РёР»Р»Р° Сѓ РїРѕР±РµСЂРµР¶СЊСЏ",
    "РђРїР°СЂС‚Р°РјРµРЅС‚С‹ РґР»СЏ РєРѕРјР°РЅРґРёСЂРѕРІРѕРє",
    "РђРїР°СЂС‚Р°РјРµРЅС‚С‹ СЃ РІРёРґРѕРј РЅР° РїР»РѕС‰Р°РґСЊ"
  ];

  const demoUserEmails = ["ava@easyrent.test", "liam@easyrent.test", "admin@easyrent.test"];

  const listingsRef = db.collection(COLLECTIONS.listings);
  const [demoSnap, titleSnap] = await Promise.all([
    listingsRef.where("isDemo", "==", true).get(),
    listingsRef.where("title", "in", demoListingTitles).get()
  ]);

  const listingDocs = new Map();
  demoSnap.docs.forEach((docSnap) => listingDocs.set(docSnap.id, docSnap));
  titleSnap.docs.forEach((docSnap) => listingDocs.set(docSnap.id, docSnap));

  const listingIds = [];
  for (const docSnap of listingDocs.values()) {
    const listingRef = listingsRef.doc(docSnap.id);
    await Promise.all([
      deleteSubcollection(listingRef, "images"),
      deleteSubcollection(listingRef, "reviews"),
      db.collection(COLLECTIONS.listingCards).doc(docSnap.id).delete()
    ]);
    await listingRef.delete();
    listingIds.push(docSnap.id);
  }

  const cleanupByListingId = async (collectionName) => {
    if (!listingIds.length) return 0;
    let removed = 0;
    for (const chunk of chunkArray(listingIds, 10)) {
      const snap = await db
        .collection(collectionName)
        .where("listingId", "in", chunk)
        .get();
      removed += snap.docs.length;
      await deleteDocs(snap.docs);
    }
    return removed;
  };

  await Promise.all([
    cleanupByListingId(COLLECTIONS.favorites),
    cleanupByListingId(COLLECTIONS.messages),
    cleanupByListingId(COLLECTIONS.bookings),
    cleanupByListingId(COLLECTIONS.availability),
    cleanupByListingId(COLLECTIONS.activeActions),
    cleanupByListingId(COLLECTIONS.actionHistory)
  ]);

  const usersRef = db.collection(COLLECTIONS.users);
  const [demoUsersSnap, emailSnap] = await Promise.all([
    usersRef.where("isDemo", "==", true).get(),
    usersRef.where("email", "in", demoUserEmails).get()
  ]);

  const userDocs = new Map();
  demoUsersSnap.docs.forEach((docSnap) => userDocs.set(docSnap.id, docSnap));
  emailSnap.docs.forEach((docSnap) => userDocs.set(docSnap.id, docSnap));
  await deleteDocs(Array.from(userDocs.values()));

  const removeByName = async (collectionName, names) => {
    if (!names.length) return;
    for (const chunk of chunkArray(names, 10)) {
      const snap = await db.collection(collectionName).where("name", "in", chunk).get();
      await deleteDocs(snap.docs);
    }
  };

  const removeByDemoFlag = async (collectionName) => {
    const snap = await db.collection(collectionName).where("isDemo", "==", true).get();
    await deleteDocs(snap.docs);
  };

  await Promise.all([
    removeByDemoFlag(COLLECTIONS.amenities),
    removeByDemoFlag(COLLECTIONS.regions),
    removeByDemoFlag(COLLECTIONS.districts),
    removeByDemoFlag(COLLECTIONS.propertyTypes),
    removeByName(COLLECTIONS.amenities, ["WiFi", "Parking", "Air conditioning", "Kitchen", "Pets allowed"]),
    removeByName(COLLECTIONS.regions, ["Central", "North", "South"]),
    removeByName(COLLECTIONS.districts, ["Riverside", "Old Town", "Green Park", "Harbor"]),
    removeByName(COLLECTIONS.propertyTypes, ["Apartment", "Studio", "House", "Loft", "Villa"])
  ]);

  return { listings: listingIds.length, users: userDocs.size };
};

const seedDemoData = async () => {
  const amenities = [
    { name: "WiFi", icon: "wifi" },
    { name: "РџР°СЂРєРѕРІРєР°", icon: "parking" },
    { name: "РљРѕРЅРґРёС†РёРѕРЅРµСЂ", icon: "ac" },
    { name: "РљСѓС…РЅСЏ", icon: "kitchen" },
    { name: "РњРѕР¶РЅРѕ СЃ РїРёС‚РѕРјС†Р°РјРё", icon: "pets" }
  ];

  const regions = ["Р¦РµРЅС‚СЂ", "РЎРµРІРµСЂ", "Р®Рі"];
  const districts = [
    { name: "РќР°Р±РµСЂРµР¶РЅР°СЏ", region: "Р¦РµРЅС‚СЂ" },
    { name: "РЎС‚Р°СЂС‹Р№ РіРѕСЂРѕРґ", region: "Р¦РµРЅС‚СЂ" },
    { name: "Р”РµР»РѕРІРѕР№ С†РµРЅС‚СЂ", region: "Р¦РµРЅС‚СЂ" },
    { name: "Р—РµР»С‘РЅС‹Р№ РїР°СЂРє", region: "РЎРµРІРµСЂ" },
    { name: "РЎРѕСЃРЅРѕРІС‹Р№ Р±РѕСЂ", region: "РЎРµРІРµСЂ" },
    { name: "РџРѕСЂС‚", region: "Р®Рі" },
    { name: "РџСЂРёРјРѕСЂСЊРµ", region: "Р®Рі" }
  ];

  const propertyTypes = ["РђРїР°СЂС‚Р°РјРµРЅС‚С‹", "РЎС‚СѓРґРёСЏ", "Р”РѕРј", "Р›РѕС„С‚", "Р’РёР»Р»Р°"];

  await Promise.all(
    amenities.map((item) =>
      db.collection(COLLECTIONS.amenities).doc(slugify(item.name)).set({
        ...item,
        isDemo: true,
        createdAt: FieldValue.serverTimestamp()
      })
    )
  );

  await Promise.all(
    regions.map((name) =>
      db.collection(COLLECTIONS.regions).doc(slugify(name)).set({
        name,
        isDemo: true,
        createdAt: FieldValue.serverTimestamp()
      })
    )
  );

  await Promise.all(
    districts.map((item) =>
      db.collection(COLLECTIONS.districts).doc(slugify(`${item.region}-${item.name}`)).set({
        name: item.name,
        regionId: slugify(item.region),
        region: item.region,
        isDemo: true,
        createdAt: FieldValue.serverTimestamp()
      })
    )
  );

  await Promise.all(
    propertyTypes.map((name) =>
      db.collection(COLLECTIONS.propertyTypes).doc(slugify(name)).set({
        name,
        isDemo: true,
        createdAt: FieldValue.serverTimestamp()
      })
    )
  );

  const demoUsers = [
    {
      name: "РђР»РёРЅР° Р РѕРјР°РЅРѕРІР°",
      email: "ava@easyrent.test",
      phone: "+1 555-0101",
      role: "user",
    },
    {
      name: "РР»СЊСЏ РџР°Рє",
      email: "liam@easyrent.test",
      phone: "+1 555-0102",
      role: "user",
    },
    {
      name: "РђРґРјРёРЅ РҐРѕСЃС‚",
      email: "admin@easyrent.test",
      phone: "+1 555-0103",
      role: "admin",
    }
  ];

  await Promise.all(
    demoUsers.map((user) =>
      db.collection(COLLECTIONS.users).doc().set({
        ...user,
        isDemo: true,
        createdAt: FieldValue.serverTimestamp()
      })
    )
  );

  const listingsSeed = [
    {
      title: "РЎРѕРІСЂРµРјРµРЅРЅР°СЏ СЃС‚СѓРґРёСЏ СЃ РІРёРґРѕРј РЅР° РіРѕСЂРѕРґ",
      description: "РЎРІРµС‚Р»Р°СЏ СЃС‚СѓРґРёСЏ СЃ Р±С‹СЃС‚СЂС‹Рј WiFi, РєСѓС…РЅРµР№ Рё Р±Р°Р»РєРѕРЅРѕРј.",
      price: 85,
      propertyType: "РЎС‚СѓРґРёСЏ",
      region: "Р¦РµРЅС‚СЂ",
      district: "РќР°Р±РµСЂРµР¶РЅР°СЏ",
      address: "СѓР». Р РµС‡РЅР°СЏ, 21",
      rooms: 1,
      area: 32,
      status: "Р°РєС‚РёРІРЅРѕ",
      rating: 4.8,
      ratingCount: 12,
      views: 0,
      amenities: ["WiFi", "РљСѓС…РЅСЏ", "РљРѕРЅРґРёС†РёРѕРЅРµСЂ"],
      createdAt: FieldValue.serverTimestamp()
    },
    {
      title: "РЈСЋС‚РЅС‹Рµ Р°РїР°СЂС‚Р°РјРµРЅС‚С‹ СЂСЏРґРѕРј СЃРѕ РЎС‚Р°СЂС‹Рј РіРѕСЂРѕРґРѕРј",
      description: "РџРµС€Р°СЏ РґРѕСЃС‚СѓРїРЅРѕСЃС‚СЊ, СѓСЋС‚ Рё РёРґРµР°Р»СЊРЅС‹Р№ РІР°СЂРёР°РЅС‚ РЅР° РІС‹С…РѕРґРЅС‹Рµ.",
      price: 120,
      propertyType: "РђРїР°СЂС‚Р°РјРµРЅС‚С‹",
      region: "Р¦РµРЅС‚СЂ",
      district: "РЎС‚Р°СЂС‹Р№ РіРѕСЂРѕРґ",
      address: "СѓР». РќР°СЃР»РµРґРёСЏ, 14",
      rooms: 2,
      area: 55,
      status: "Р°РєС‚РёРІРЅРѕ",
      rating: 4.6,
      ratingCount: 8,
      views: 0,
      amenities: ["WiFi", "РљСѓС…РЅСЏ"],
      createdAt: FieldValue.serverTimestamp()
    },
    {
      title: "РЎРµРјРµР№РЅС‹Р№ РґРѕРј СЃ СЃР°РґРѕРј",
      description: "РџСЂРѕСЃС‚РѕСЂРЅС‹Р№ РґРѕРј СЃ Р·РµР»С‘РЅС‹Рј РґРІРѕСЂРѕРј.",
      price: 180,
      propertyType: "Р”РѕРј",
      region: "РЎРµРІРµСЂ",
      district: "Р—РµР»С‘РЅС‹Р№ РїР°СЂРє",
      address: "РїСЂ-С‚ РџР°СЂРєРѕРІС‹Р№, 9",
      rooms: 4,
      area: 140,
      status: "Р°РєС‚РёРІРЅРѕ",
      rating: 4.9,
      ratingCount: 16,
      views: 0,
      amenities: ["РџР°СЂРєРѕРІРєР°", "РњРѕР¶РЅРѕ СЃ РїРёС‚РѕРјС†Р°РјРё", "РљСѓС…РЅСЏ"],
      createdAt: FieldValue.serverTimestamp()
    },
    {
      title: "Р›РѕС„С‚ Сѓ РїРѕСЂС‚Р°",
      description: "РРЅРґСѓСЃС‚СЂРёР°Р»СЊРЅС‹Р№ Р»РѕС„С‚ СЃ РІРёРґРѕРј РЅР° РїРѕСЂС‚ Рё РїР°СЂРєРѕРІРєРѕР№.",
      price: 210,
      propertyType: "Р›РѕС„С‚",
      region: "Р®Рі",
      district: "РџРѕСЂС‚",
      address: "РЅР°Р±. Р”РѕРєСЃР°Р№Рґ, 6",
      rooms: 2,
      area: 78,
      status: "Р°РєС‚РёРІРЅРѕ",
      rating: 4.7,
      ratingCount: 10,
      views: 0,
      amenities: ["РџР°СЂРєРѕРІРєР°", "РљРѕРЅРґРёС†РёРѕРЅРµСЂ"],
      createdAt: FieldValue.serverTimestamp()
    },
    {
      title: "РўРёС…Р°СЏ РІРёР»Р»Р° РґР»СЏ РѕС‚РґС‹С…Р°",
      description: "РџСЂРёРІР°С‚РЅР°СЏ РІРёР»Р»Р° СЃ РґРѕСЃС‚СѓРїРѕРј Рє Р±Р°СЃСЃРµР№РЅСѓ Рё РІРёРґРѕРј РЅР° РіРѕСЂС‹.",
      price: 320,
      propertyType: "Р’РёР»Р»Р°",
      region: "Р®Рі",
      district: "РџРѕСЂС‚",
      address: "СѓР». Р’РёСЃС‚Р°, 98",
      rooms: 5,
      area: 210,
      status: "Р°РєС‚РёРІРЅРѕ",
      rating: 5.0,
      ratingCount: 6,
      views: 0,
      amenities: ["РџР°СЂРєРѕРІРєР°", "РњРѕР¶РЅРѕ СЃ РїРёС‚РѕРјС†Р°РјРё", "РљРѕРЅРґРёС†РёРѕРЅРµСЂ"],
      createdAt: FieldValue.serverTimestamp()
    },
    {
      title: "РЎС‚СѓРґРёСЏ Сѓ РґРµР»РѕРІРѕРіРѕ С†РµРЅС‚СЂР°",
      description: "РљРѕРјРїР°РєС‚РЅР°СЏ СЃС‚СѓРґРёСЏ РґР»СЏ РґРµР»РѕРІС‹С… РїРѕРµР·РґРѕРє, Р±С‹СЃС‚СЂС‹Р№ WiFi Рё СЂР°Р±РѕС‡РµРµ РјРµСЃС‚Рѕ.",
      price: 95,
      propertyType: "РЎС‚СѓРґРёСЏ",
      region: "Р¦РµРЅС‚СЂ",
      district: "Р”РµР»РѕРІРѕР№ С†РµРЅС‚СЂ",
      address: "СѓР». Р‘РёР·РЅРµСЃР°, 7",
      rooms: 1,
      area: 28,
      status: "Р°РєС‚РёРІРЅРѕ",
      rating: 4.5,
      ratingCount: 14,
      views: 0,
      amenities: ["WiFi", "РљРѕРЅРґРёС†РёРѕРЅРµСЂ"],
      createdAt: FieldValue.serverTimestamp()
    },
    {
      title: "РђРїР°СЂС‚Р°РјРµРЅС‚С‹ СЃ Р±Р°Р»РєРѕРЅРѕРј РІ РґРµР»РѕРІРѕРј С†РµРЅС‚СЂРµ",
      description: "РЎРІРµС‚Р»С‹Рµ Р°РїР°СЂС‚Р°РјРµРЅС‚С‹ СЃ РєСѓС…РЅРµР№ Рё Р±Р°Р»РєРѕРЅРѕРј, СЂСЏРґРѕРј РјРµС‚СЂРѕ.",
      price: 150,
      propertyType: "РђРїР°СЂС‚Р°РјРµРЅС‚С‹",
      region: "Р¦РµРЅС‚СЂ",
      district: "Р”РµР»РѕРІРѕР№ С†РµРЅС‚СЂ",
      address: "РїСЂ-С‚ Р¦РµРЅС‚СЂР°Р»СЊРЅС‹Р№, 45",
      rooms: 2,
      area: 64,
      status: "Р°РєС‚РёРІРЅРѕ",
      rating: 4.7,
      ratingCount: 11,
      views: 0,
      amenities: ["WiFi", "РљСѓС…РЅСЏ", "РџР°СЂРєРѕРІРєР°"],
      createdAt: FieldValue.serverTimestamp()
    },
    {
      title: "РЈСЋС‚РЅР°СЏ СЃС‚СѓРґРёСЏ Сѓ РїР°СЂРєР°",
      description: "РўРёС…РёР№ РєРІР°СЂС‚Р°Р», РїСЂРѕРіСѓР»РєРё РїРѕ РїР°СЂРєСѓ Рё СѓРґРѕР±РЅР°СЏ С‚СЂР°РЅСЃРїРѕСЂС‚РЅР°СЏ СЂР°Р·РІСЏР·РєР°.",
      price: 75,
      propertyType: "РЎС‚СѓРґРёСЏ",
      region: "РЎРµРІРµСЂ",
      district: "Р—РµР»С‘РЅС‹Р№ РїР°СЂРє",
      address: "СѓР». Р›РµСЃРЅР°СЏ, 12",
      rooms: 1,
      area: 26,
      status: "Р°РєС‚РёРІРЅРѕ",
      rating: 4.4,
      ratingCount: 9,
      views: 0,
      amenities: ["WiFi", "РљСѓС…РЅСЏ"],
      createdAt: FieldValue.serverTimestamp()
    },
    {
      title: "Р”РѕРј РІ СЃРѕСЃРЅРѕРІРѕРј Р±РѕСЂСѓ",
      description: "РЎРІРµР¶РёР№ РІРѕР·РґСѓС…, РїСЂРѕСЃС‚РѕСЂРЅР°СЏ РєСѓС…РЅСЏ Рё РїР°СЂРєРѕРІРєР° РЅР° С‚РµСЂСЂРёС‚РѕСЂРёРё.",
      price: 200,
      propertyType: "Р”РѕРј",
      region: "РЎРµРІРµСЂ",
      district: "РЎРѕСЃРЅРѕРІС‹Р№ Р±РѕСЂ",
      address: "СѓР». РҐРІРѕР№РЅР°СЏ, 3",
      rooms: 4,
      area: 165,
      status: "Р°РєС‚РёРІРЅРѕ",
      rating: 4.8,
      ratingCount: 7,
      views: 0,
      amenities: ["РџР°СЂРєРѕРІРєР°", "РњРѕР¶РЅРѕ СЃ РїРёС‚РѕРјС†Р°РјРё", "РљСѓС…РЅСЏ"],
      createdAt: FieldValue.serverTimestamp()
    },
    {
      title: "Р›РѕС„С‚ СЃ РїР°РЅРѕСЂР°РјРѕР№ РјРѕСЂСЏ",
      description: "РџСЂРѕСЃС‚РѕСЂРЅС‹Р№ Р»РѕС„С‚ РІ С€Р°РіРµ РѕС‚ РЅР°Р±РµСЂРµР¶РЅРѕР№, РїР°РЅРѕСЂР°РјРЅС‹Рµ РѕРєРЅР°.",
      price: 230,
      propertyType: "Р›РѕС„С‚",
      region: "Р®Рі",
      district: "РџСЂРёРјРѕСЂСЊРµ",
      address: "РЅР°Р±. РњРѕСЂСЃРєР°СЏ, 20",
      rooms: 2,
      area: 82,
      status: "Р°РєС‚РёРІРЅРѕ",
      rating: 4.9,
      ratingCount: 5,
      views: 0,
      amenities: ["РљРѕРЅРґРёС†РёРѕРЅРµСЂ", "РџР°СЂРєРѕРІРєР°"],
      createdAt: FieldValue.serverTimestamp()
    },
    {
      title: "Р’РёР»Р»Р° Сѓ РїРѕР±РµСЂРµР¶СЊСЏ",
      description: "Р’РёРґ РЅР° РјРѕСЂРµ, Р·Р°РєСЂС‹С‚Р°СЏ С‚РµСЂСЂРёС‚РѕСЂРёСЏ Рё РїСЂРёРІР°С‚РЅР°СЏ Р·РѕРЅР° РѕС‚РґС‹С…Р°.",
      price: 380,
      propertyType: "Р’РёР»Р»Р°",
      region: "Р®Рі",
      district: "РџСЂРёРјРѕСЂСЊРµ",
      address: "СѓР». Р‘РµСЂРµРіРѕРІР°СЏ, 1",
      rooms: 6,
      area: 260,
      status: "Р°РєС‚РёРІРЅРѕ",
      rating: 5.0,
      ratingCount: 4,
      views: 0,
      amenities: ["РџР°СЂРєРѕРІРєР°", "РњРѕР¶РЅРѕ СЃ РїРёС‚РѕРјС†Р°РјРё", "РљРѕРЅРґРёС†РёРѕРЅРµСЂ"],
      createdAt: FieldValue.serverTimestamp()
    },
    {
      title: "РђРїР°СЂС‚Р°РјРµРЅС‚С‹ РґР»СЏ РєРѕРјР°РЅРґРёСЂРѕРІРѕРє",
      description: "РЈРґРѕР±РЅС‹Р№ Р·Р°РµР·Рґ, СЂР°Р±РѕС‡РµРµ РјРµСЃС‚Рѕ Рё Р±С‹СЃС‚СЂС‹Р№ РёРЅС‚РµСЂРЅРµС‚.",
      price: 110,
      propertyType: "РђРїР°СЂС‚Р°РјРµРЅС‚С‹",
      region: "Р¦РµРЅС‚СЂ",
      district: "РќР°Р±РµСЂРµР¶РЅР°СЏ",
      address: "СѓР». Р РµС‡РЅР°СЏ, 30",
      rooms: 1,
      area: 38,
      status: "Р°РєС‚РёРІРЅРѕ",
      rating: 4.3,
      ratingCount: 10,
      views: 0,
      amenities: ["WiFi", "РљСѓС…РЅСЏ"],
      createdAt: FieldValue.serverTimestamp()
    },
    {
      title: "РђРїР°СЂС‚Р°РјРµРЅС‚С‹ СЃ РІРёРґРѕРј РЅР° РїР»РѕС‰Р°РґСЊ",
      description: "РўРёС…РёРµ Р°РїР°СЂС‚Р°РјРµРЅС‚С‹ РІ СЃРµСЂРґС†Рµ РіРѕСЂРѕРґР°, РєРѕС„РµР№РЅРё СЂСЏРґРѕРј.",
      price: 135,
      propertyType: "РђРїР°СЂС‚Р°РјРµРЅС‚С‹",
      region: "Р¦РµРЅС‚СЂ",
      district: "РЎС‚Р°СЂС‹Р№ РіРѕСЂРѕРґ",
      address: "РїР». Р“РѕСЂРѕРґСЃРєР°СЏ, 8",
      rooms: 2,
      area: 57,
      status: "Р°РєС‚РёРІРЅРѕ",
      rating: 4.5,
      ratingCount: 12,
      views: 0,
      amenities: ["WiFi", "РљСѓС…РЅСЏ"],
      createdAt: FieldValue.serverTimestamp()
    }
  ].map((item) => ({
    ...item,
    ratingSum: (item.rating || 0) * (item.ratingCount || 0),
    coverUrl: "https://images.unsplash.com/photo-1505691938895-1758d7feb511"
  }));

  for (const listing of listingsSeed) {
    const listingPayload = {
      ...listing,
      isDemo: true,
      ownerId: "demo-owner",
      searchTokens: buildSearchIndex(listing.title, listing.description)
    };
    const listingRef = await db.collection(COLLECTIONS.listings).add(listingPayload);
    await db
      .collection(COLLECTIONS.listingCards)
      .doc(listingRef.id)
      .set({
        ...buildListingCardData(listingPayload),
        isDemo: true
      }, { merge: true });

    const images = [
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511",
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?crop=entropy&fit=crop&w=1200&q=80"
    ];

    await Promise.all(
      images.map((url, index) =>
        listingRef.collection("images").add({
          url,
          order: index + 1,
          isDemo: true
        })
      )
    );
  }
};

const localizeStatuses = async () => {
  const listingMap = { active: "Р°РєС‚РёРІРЅРѕ", draft: "С‡РµСЂРЅРѕРІРёРє", archived: "Р°СЂС…РёРІ" };
  const bookingMap = {
    pending: "РІ РѕР¶РёРґР°РЅРёРё",
    confirmed: "РїРѕРґС‚РІРµСЂР¶РґРµРЅРѕ",
    cancelled: "РѕС‚РјРµРЅРµРЅРѕ",
    completed: "Р·Р°РІРµСЂС€РµРЅРѕ"
  };

  const listingSnap = await db
    .collection(COLLECTIONS.listings)
    .where("status", "in", Object.keys(listingMap))
    .get();
  for (const docSnap of listingSnap.docs) {
    const nextStatus = listingMap[docSnap.data().status];
    if (nextStatus) {
      await docSnap.ref.update({ status: nextStatus });
      await db.collection(COLLECTIONS.listingCards).doc(docSnap.id).set({
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
  }

  const bookingSnap = await db
    .collection(COLLECTIONS.bookings)
    .where("status", "in", Object.keys(bookingMap))
    .get();
  for (const docSnap of bookingSnap.docs) {
    const nextStatus = bookingMap[docSnap.data().status];
    if (nextStatus) await docSnap.ref.update({ status: nextStatus });
  }
};

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

const run = async () => {
  console.log("РџРµСЂРµСЃРѕР·РґР°С‘Рј РґРµРјРѕ-РґР°РЅРЅС‹Рµ...");
  await resetDemoData();
  console.log("Р—Р°РїРѕР»РЅСЏРµРј РґРµРјРѕ-РґР°РЅРЅС‹Рµ (RU)...");
  await seedDemoData();
  console.log("Р›РѕРєР°Р»РёР·СѓРµРј СЃС‚Р°С‚СѓСЃС‹...");
  await localizeStatuses();
  console.log("Р“РѕС‚РѕРІРѕ.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
