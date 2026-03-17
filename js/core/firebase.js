import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  getFirestore,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const fallbackConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const firebaseConfig = window.EASYRENT_CONFIG || fallbackConfig;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

const isConfigured = () => firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

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
  createdAt: listing.createdAt || serverTimestamp(),
  updatedAt: serverTimestamp()
});

const seedTestData = async (currentUser) => {
  if (!currentUser) throw new Error("Войдите, чтобы загрузить демо-данные.");

  const amenities = [
    { name: "WiFi", icon: "wifi" },
    { name: "Парковка", icon: "parking" },
    { name: "Кондиционер", icon: "ac" },
    { name: "Кухня", icon: "kitchen" },
    { name: "Можно с питомцами", icon: "pets" }
  ];

  const regions = ["Центр", "Север", "Юг"];
  const districts = [
    { name: "Набережная", region: "Центр" },
    { name: "Старый город", region: "Центр" },
    { name: "Деловой центр", region: "Центр" },
    { name: "Зелёный парк", region: "Север" },
    { name: "Сосновый бор", region: "Север" },
    { name: "Порт", region: "Юг" },
    { name: "Приморье", region: "Юг" }
  ];

  const propertyTypes = ["Апартаменты", "Студия", "Дом", "Лофт", "Вилла"];

  await Promise.all(
    amenities.map((item) =>
      setDoc(doc(db, COLLECTIONS.amenities, slugify(item.name)), {
        ...item,
        isDemo: true,
        createdAt: serverTimestamp()
      })
    )
  );

  await Promise.all(
    regions.map((name) =>
      setDoc(doc(db, COLLECTIONS.regions, slugify(name)), {
        name,
        isDemo: true,
        createdAt: serverTimestamp()
      })
    )
  );

  await Promise.all(
    districts.map((item) =>
      setDoc(doc(db, COLLECTIONS.districts, slugify(`${item.region}-${item.name}`)), {
        name: item.name,
        regionId: slugify(item.region),
        region: item.region,
        isDemo: true,
        createdAt: serverTimestamp()
      })
    )
  );

  await Promise.all(
    propertyTypes.map((name) =>
      setDoc(doc(db, COLLECTIONS.propertyTypes, slugify(name)), {
        name,
        isDemo: true,
        createdAt: serverTimestamp()
      })
    )
  );

  const demoUsers = [
    {
      name: "Алина Романова",
      email: "ava@easyrent.test",
      phone: "+1 555-0101",
      role: "user"
    },
    {
      name: "Илья Пак",
      email: "liam@easyrent.test",
      phone: "+1 555-0102",
      role: "user"
    },
    {
      name: "Админ Хост",
      email: "admin@easyrent.test",
      phone: "+1 555-0103",
      role: "admin"
    }
  ];

  await Promise.all(
    demoUsers.map((user) =>
      setDoc(doc(collection(db, COLLECTIONS.users)), {
        ...user,
        isDemo: true,
        createdAt: serverTimestamp()
      })
    )
  );

  const listingsSeed = [
    {
      title: "Современная студия с видом на город",
      description: "Светлая студия с быстрым WiFi, кухней и балконом.",
      price: 85,
      propertyType: "Студия",
      region: "Центр",
      district: "Набережная",
      address: "ул. Речная, 21",
      rooms: 1,
      area: 32,
      status: "активно",
      rating: 4.8,
      ratingCount: 12,
      views: 0,
      amenities: ["WiFi", "Кухня", "Кондиционер"],
      createdAt: serverTimestamp()
    },
    {
      title: "Уютные апартаменты рядом со Старым городом",
      description: "Пешая доступность, уют и идеальный вариант на выходные.",
      price: 120,
      propertyType: "Апартаменты",
      region: "Центр",
      district: "Старый город",
      address: "ул. Наследия, 14",
      rooms: 2,
      area: 55,
      status: "активно",
      rating: 4.6,
      ratingCount: 8,
      views: 0,
      amenities: ["WiFi", "Кухня"],
      createdAt: serverTimestamp()
    },
    {
      title: "Семейный дом с садом",
      description: "Просторный дом с зелёным двором.",
      price: 180,
      propertyType: "Дом",
      region: "Север",
      district: "Зелёный парк",
      address: "пр-т Парковый, 9",
      rooms: 4,
      area: 140,
      status: "активно",
      rating: 4.9,
      ratingCount: 16,
      views: 0,
      amenities: ["Парковка", "Можно с питомцами", "Кухня"],
      createdAt: serverTimestamp()
    },
    {
      title: "Лофт у порта",
      description: "Индустриальный лофт с видом на порт и парковкой.",
      price: 210,
      propertyType: "Лофт",
      region: "Юг",
      district: "Порт",
      address: "наб. Доксайд, 6",
      rooms: 2,
      area: 78,
      status: "активно",
      rating: 4.7,
      ratingCount: 10,
      views: 0,
      amenities: ["Парковка", "Кондиционер"],
      createdAt: serverTimestamp()
    },
    {
      title: "Тихая вилла для отдыха",
      description: "Приватная вилла с доступом к бассейну и видом на горы.",
      price: 320,
      propertyType: "Вилла",
      region: "Юг",
      district: "Порт",
      address: "ул. Виста, 98",
      rooms: 5,
      area: 210,
      status: "активно",
      rating: 5.0,
      ratingCount: 6,
      views: 0,
      amenities: ["Парковка", "Можно с питомцами", "Кондиционер"],
      createdAt: serverTimestamp()
    },
    {
      title: "Студия у делового центра",
      description: "Компактная студия для деловых поездок, быстрый WiFi и рабочее место.",
      price: 95,
      propertyType: "Студия",
      region: "Центр",
      district: "Деловой центр",
      address: "ул. Бизнеса, 7",
      rooms: 1,
      area: 28,
      status: "активно",
      rating: 4.5,
      ratingCount: 14,
      views: 0,
      amenities: ["WiFi", "Кондиционер"],
      createdAt: serverTimestamp()
    },
    {
      title: "Апартаменты с балконом в деловом центре",
      description: "Светлые апартаменты с кухней и балконом, рядом метро.",
      price: 150,
      propertyType: "Апартаменты",
      region: "Центр",
      district: "Деловой центр",
      address: "пр-т Центральный, 45",
      rooms: 2,
      area: 64,
      status: "активно",
      rating: 4.7,
      ratingCount: 11,
      views: 0,
      amenities: ["WiFi", "Кухня", "Парковка"],
      createdAt: serverTimestamp()
    },
    {
      title: "Уютная студия у парка",
      description: "Тихий квартал, прогулки по парку и удобная транспортная развязка.",
      price: 75,
      propertyType: "Студия",
      region: "Север",
      district: "Зелёный парк",
      address: "ул. Лесная, 12",
      rooms: 1,
      area: 26,
      status: "активно",
      rating: 4.4,
      ratingCount: 9,
      views: 0,
      amenities: ["WiFi", "Кухня"],
      createdAt: serverTimestamp()
    },
    {
      title: "Дом в сосновом бору",
      description: "Свежий воздух, просторная кухня и парковка на территории.",
      price: 200,
      propertyType: "Дом",
      region: "Север",
      district: "Сосновый бор",
      address: "ул. Хвойная, 3",
      rooms: 4,
      area: 165,
      status: "активно",
      rating: 4.8,
      ratingCount: 7,
      views: 0,
      amenities: ["Парковка", "Можно с питомцами", "Кухня"],
      createdAt: serverTimestamp()
    },
    {
      title: "Лофт с панорамой моря",
      description: "Просторный лофт в шаге от набережной, панорамные окна.",
      price: 230,
      propertyType: "Лофт",
      region: "Юг",
      district: "Приморье",
      address: "наб. Морская, 20",
      rooms: 2,
      area: 82,
      status: "активно",
      rating: 4.9,
      ratingCount: 5,
      views: 0,
      amenities: ["Кондиционер", "Парковка"],
      createdAt: serverTimestamp()
    },
    {
      title: "Вилла у побережья",
      description: "Вид на море, закрытая территория и приватная зона отдыха.",
      price: 380,
      propertyType: "Вилла",
      region: "Юг",
      district: "Приморье",
      address: "ул. Береговая, 1",
      rooms: 6,
      area: 260,
      status: "активно",
      rating: 5.0,
      ratingCount: 4,
      views: 0,
      amenities: ["Парковка", "Можно с питомцами", "Кондиционер"],
      createdAt: serverTimestamp()
    },
    {
      title: "Апартаменты для командировок",
      description: "Удобный заезд, рабочее место и быстрый интернет.",
      price: 110,
      propertyType: "Апартаменты",
      region: "Центр",
      district: "Набережная",
      address: "ул. Речная, 30",
      rooms: 1,
      area: 38,
      status: "активно",
      rating: 4.3,
      ratingCount: 10,
      views: 0,
      amenities: ["WiFi", "Кухня"],
      createdAt: serverTimestamp()
    },
    {
      title: "Апартаменты с видом на площадь",
      description: "Тихие апартаменты в сердце города, кофейни рядом.",
      price: 135,
      propertyType: "Апартаменты",
      region: "Центр",
      district: "Старый город",
      address: "пл. Городская, 8",
      rooms: 2,
      area: 57,
      status: "активно",
      rating: 4.5,
      ratingCount: 12,
      views: 0,
      amenities: ["WiFi", "Кухня"],
      createdAt: serverTimestamp()
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
      ownerId: currentUser.uid,
      searchTokens: buildSearchIndex(listing.title, listing.description)
    };
    const listingRef = await addDoc(collection(db, COLLECTIONS.listings), listingPayload);

    await setDoc(
      doc(db, COLLECTIONS.listingCards, listingRef.id),
      {
        ...buildListingCardData(listingPayload),
        isDemo: true
      },
      { merge: true }
    );

    await Promise.all(
      [
        "https://images.unsplash.com/photo-1505691938895-1758d7feb511",
        "https://images.unsplash.com/photo-1505691938895-1758d7feb511?crop=entropy&fit=crop&w=1200&q=80"
      ].map((url, index) =>
        setDoc(doc(collection(listingRef, "images")), {
          url,
          order: index + 1,
          isDemo: true
        })
      )
    );
  }

  return true;
};

const chunkArray = (items, size) => {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const deleteDocs = async (docs) => {
  if (!docs.length) return;
  await Promise.all(docs.map((docSnap) => deleteDoc(docSnap.ref)));
};

const deleteSubcollection = async (parentRef, subcollection) => {
  const snap = await getDocs(collection(parentRef, subcollection));
  await deleteDocs(snap.docs);
};

const resetDemoData = async () => {
  const demoListingTitles = [
    "Modern studio with skyline view",
    "Cozy apartment near Old Town",
    "Family house with garden",
    "Harbor loft",
    "Quiet villa retreat",
    "Современная студия с видом на город",
    "Уютные апартаменты рядом со Старым городом",
    "Семейный дом с садом",
    "Лофт у порта",
    "Тихая вилла для отдыха",
    "Студия у делового центра",
    "Апартаменты с балконом в деловом центре",
    "Уютная студия у парка",
    "Дом в сосновом бору",
    "Лофт с панорамой моря",
    "Вилла у побережья",
    "Апартаменты для командировок",
    "Апартаменты с видом на площадь"
  ];

  const demoUserEmails = ["ava@easyrent.test", "liam@easyrent.test", "admin@easyrent.test"];

  const listingsRef = collection(db, COLLECTIONS.listings);
  const listingSnaps = await Promise.all([
    getDocs(query(listingsRef, where("isDemo", "==", true))),
    getDocs(query(listingsRef, where("title", "in", demoListingTitles)))
  ]);

  const listingDocs = new Map();
  listingSnaps.forEach((snap) => {
    snap.docs.forEach((docSnap) => listingDocs.set(docSnap.id, docSnap));
  });

  const listingIds = [];
  for (const docSnap of listingDocs.values()) {
    const listingRef = doc(db, COLLECTIONS.listings, docSnap.id);
    await Promise.all([
      deleteSubcollection(listingRef, "images"),
      deleteSubcollection(listingRef, "reviews"),
      deleteDoc(doc(db, COLLECTIONS.listingCards, docSnap.id))
    ]);
    await deleteDoc(listingRef);
    listingIds.push(docSnap.id);
  }

  const cleanupByListingId = async (collectionName) => {
    if (!listingIds.length) return 0;
    let removed = 0;
    for (const chunk of chunkArray(listingIds, 10)) {
      const snap = await getDocs(
        query(collection(db, collectionName), where("listingId", "in", chunk))
      );
      removed += snap.docs.length;
      await deleteDocs(snap.docs);
    }
    return removed;
  };

  const [favoritesRemoved, messagesRemoved, bookingsRemoved, availabilityRemoved, activeRemoved, historyRemoved] =
    await Promise.all([
    cleanupByListingId(COLLECTIONS.favorites),
    cleanupByListingId(COLLECTIONS.messages),
    cleanupByListingId(COLLECTIONS.bookings),
    cleanupByListingId(COLLECTIONS.availability),
    cleanupByListingId(COLLECTIONS.activeActions),
    cleanupByListingId(COLLECTIONS.actionHistory)
  ]);

  const usersRef = collection(db, COLLECTIONS.users);
  const userSnaps = await Promise.all([
    getDocs(query(usersRef, where("isDemo", "==", true))),
    getDocs(query(usersRef, where("email", "in", demoUserEmails)))
  ]);
  const userDocs = new Map();
  userSnaps.forEach((snap) => {
    snap.docs.forEach((docSnap) => userDocs.set(docSnap.id, docSnap));
  });
  await deleteDocs(Array.from(userDocs.values()));

  const removeByName = async (collectionName, names) => {
    if (!names.length) return 0;
    let removed = 0;
    for (const chunk of chunkArray(names, 10)) {
      const snap = await getDocs(query(collection(db, collectionName), where("name", "in", chunk)));
      removed += snap.docs.length;
      await deleteDocs(snap.docs);
    }
    return removed;
  };

  const removeByDemoFlag = async (collectionName) => {
    const snap = await getDocs(query(collection(db, collectionName), where("isDemo", "==", true)));
    await deleteDocs(snap.docs);
    return snap.docs.length;
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

  return {
    listings: listingIds.length,
    users: userDocs.size,
    favorites: favoritesRemoved,
    messages: messagesRemoved,
    bookings: bookingsRemoved,
    availability: availabilityRemoved,
    activeActions: activeRemoved,
    actionHistory: historyRemoved
  };
};

const localizeStatuses = async () => {
  const listingMap = {
    active: "активно",
    draft: "черновик",
    archived: "архив"
  };
  const bookingMap = {
    pending: "в ожидании",
    confirmed: "подтверждено",
    cancelled: "отменено",
    completed: "завершено"
  };

  let listingUpdated = 0;
  let bookingUpdated = 0;

  const listingSnap = await getDocs(
    query(collection(db, COLLECTIONS.listings), where("status", "in", Object.keys(listingMap)))
  );
  for (const docSnap of listingSnap.docs) {
    const nextStatus = listingMap[docSnap.data().status];
    if (nextStatus) {
      await updateDoc(docSnap.ref, { status: nextStatus });
      await updateDoc(doc(db, COLLECTIONS.listingCards, docSnap.id), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      }).catch(() => {});
      listingUpdated += 1;
    }
  }

  const bookingSnap = await getDocs(
    query(collection(db, COLLECTIONS.bookings), where("status", "in", Object.keys(bookingMap)))
  );
  for (const docSnap of bookingSnap.docs) {
    const nextStatus = bookingMap[docSnap.data().status];
    if (nextStatus) {
      await updateDoc(docSnap.ref, { status: nextStatus });
      bookingUpdated += 1;
    }
  }

  return { listings: listingUpdated, bookings: bookingUpdated };
};

export {
  app,
  auth,
  db,
  COLLECTIONS,
  isConfigured,
  slugify,
  buildSearchTokens,
  buildSearchIndex,
  buildListingCardData,
  seedTestData,
  resetDemoData,
  localizeStatuses,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment
};
