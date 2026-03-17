import {
  db,
  COLLECTIONS,
  collection,
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
  increment,
  buildSearchIndex,
  buildListingCardData
} from "../core/firebase.js";

const DEFAULT_PAGE_SIZE = 12;
const DEFAULT_RELATED_PAGE_SIZE = 6;
const isIndexBuildingError = (error) => {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code.includes("failed-precondition") ||
    message.includes("requires an index") ||
    message.includes("index is currently building")
  );
};

const normalizeSort = (sortBy) => {
  const [field, direction] = (sortBy || "createdAt:desc").split(":");
  const safeField = ["createdAt", "price", "rating"].includes(field) ? field : "createdAt";
  const safeDir = direction === "asc" ? "asc" : "desc";
  return [safeField, safeDir];
};

const pickServerFilter = (filters, sortField) => {
  const serverFilter = {};
  if (filters.queryTokens?.length) serverFilter.queryTokens = filters.queryTokens.slice(0, 10);
  if (sortField !== "createdAt") return serverFilter;
  if (filters.amenity) serverFilter.amenity = filters.amenity;
  else if (filters.district) serverFilter.district = filters.district;
  else if (filters.region) serverFilter.region = filters.region;
  else if (filters.propertyType) serverFilter.propertyType = filters.propertyType;
  return serverFilter;
};

const buildListingsQuery = (
  filters = {},
  cursor = null,
  pageSize = DEFAULT_PAGE_SIZE,
  sourceCollection = COLLECTIONS.listingCards
) => {
  const constraints = [];
  const hasStatus = Object.prototype.hasOwnProperty.call(filters, "status");
  const statusFilter = hasStatus ? filters.status : "активно";
  if (statusFilter) constraints.push(where("status", "==", statusFilter));

  const [sortField, sortDir] = normalizeSort(filters.sortBy);
  const serverFilter = statusFilter ? pickServerFilter(filters, sortField) : {};

  if (serverFilter.propertyType) constraints.push(where("propertyType", "==", serverFilter.propertyType));
  if (serverFilter.region) constraints.push(where("region", "==", serverFilter.region));
  if (serverFilter.district) constraints.push(where("district", "==", serverFilter.district));
  if (serverFilter.amenity) constraints.push(where("amenities", "array-contains", serverFilter.amenity));
  if (serverFilter.queryTokens?.length) {
    constraints.push(where("searchTokens", "array-contains-any", serverFilter.queryTokens));
  }

  if (sortField === "price") {
    if (filters.priceMin) constraints.push(where("price", ">=", Number(filters.priceMin)));
    if (filters.priceMax) constraints.push(where("price", "<=", Number(filters.priceMax)));
  }

  constraints.push(orderBy(sortField, sortDir));
  constraints.push(limit(pageSize));
  if (cursor) constraints.push(startAfter(cursor));

  return query(collection(db, sourceCollection), ...constraints);
};

const subscribeListings = (filters, callback, pageSize = DEFAULT_PAGE_SIZE, onError) => {
  const queryRef = buildListingsQuery(filters, null, pageSize, COLLECTIONS.listingCards);
  let fallbackUnsubscribe = null;

  const unsubscribe = onSnapshot(
    queryRef,
    callback,
    (error) => {
      if (isIndexBuildingError(error)) {
        if (fallbackUnsubscribe) return;
        const fallbackQuery = buildListingsQuery(filters, null, pageSize, COLLECTIONS.listings);
        fallbackUnsubscribe = onSnapshot(fallbackQuery, callback, onError);
        return;
      }
      if (onError) onError(error);
    }
  );

  return () => {
    unsubscribe();
    if (fallbackUnsubscribe) fallbackUnsubscribe();
  };
};

const fetchListings = async (filters, cursor, pageSize = DEFAULT_PAGE_SIZE) => {
  try {
    const queryRef = buildListingsQuery(filters, cursor, pageSize, COLLECTIONS.listingCards);
    return await getDocs(queryRef);
  } catch (error) {
    if (!isIndexBuildingError(error)) throw error;
    const fallbackQuery = buildListingsQuery(filters, cursor, pageSize, COLLECTIONS.listings);
    return getDocs(fallbackQuery);
  }
};

const subscribeListingById = (id, callback, onError) => {
  const listingRef = doc(db, COLLECTIONS.listings, id);
  return onSnapshot(listingRef, callback, onError);
};

const buildRelatedQuery = (
  filters = {},
  cursor = null,
  pageSize = DEFAULT_RELATED_PAGE_SIZE,
  sourceCollection = COLLECTIONS.listingCards
) => {
  const constraints = [where("status", "==", "активно")];
  if (filters.region) constraints.push(where("region", "==", filters.region));
  else if (filters.propertyType) constraints.push(where("propertyType", "==", filters.propertyType));
  constraints.push(orderBy("createdAt", "desc"));
  constraints.push(limit(pageSize));
  if (cursor) constraints.push(startAfter(cursor));
  return query(collection(db, sourceCollection), ...constraints);
};

const fetchRelatedListings = async (filters, cursor, pageSize = DEFAULT_RELATED_PAGE_SIZE) => {
  let snapshot;
  try {
    const queryRef = buildRelatedQuery(filters, cursor, pageSize, COLLECTIONS.listingCards);
    snapshot = await getDocs(queryRef);
  } catch (error) {
    if (!isIndexBuildingError(error)) throw error;
    const fallbackQuery = buildRelatedQuery(filters, cursor, pageSize, COLLECTIONS.listings);
    snapshot = await getDocs(fallbackQuery);
  }
  const docs = snapshot.docs.filter((docSnap) => docSnap.id !== filters.listingId);
  const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
  const hasMore = snapshot.docs.length >= pageSize;
  return { docs, lastDoc, hasMore };
};

const getListingById = async (id) => {
  const listingRef = doc(db, COLLECTIONS.listings, id);
  const snapshot = await getDoc(listingRef);
  return snapshot.exists() ? { id: snapshot.id, data: snapshot.data() } : null;
};

const getListingImages = async (listingId) => {
  const imagesSnap = await getDocs(
    query(collection(doc(db, COLLECTIONS.listings, listingId), "images"), orderBy("order"))
  );
  return imagesSnap.docs.map((docSnap) => docSnap.data());
};

const upsertListingCard = async (listingId, listingData = {}, fallbackData = {}) => {
  const cardPayload = buildListingCardData({ ...fallbackData, ...listingData });
  await setDoc(doc(db, COLLECTIONS.listingCards, listingId), cardPayload, { merge: true });
};

const syncListingCardFromListing = async (listingId) => {
  const listingRef = doc(db, COLLECTIONS.listings, listingId);
  const listingSnap = await getDoc(listingRef);
  const cardRef = doc(db, COLLECTIONS.listingCards, listingId);

  if (!listingSnap.exists()) {
    await deleteDoc(cardRef).catch(() => {});
    return false;
  }

  const listingData = listingSnap.data() || {};
  await upsertListingCard(listingId, listingData, listingData);
  return true;
};

const incrementListingViews = async (listingId) => {
  const listingRef = doc(db, COLLECTIONS.listings, listingId);
  const cardRef = doc(db, COLLECTIONS.listingCards, listingId);
  try {
    await Promise.all([
      updateDoc(listingRef, { views: increment(1) }),
      updateDoc(cardRef, { views: increment(1), updatedAt: serverTimestamp() })
    ]);
  } catch (error) {
    // ignore view update errors for signed-out visitors
  }
};

const saveListing = async ({ id, payload, imageUrls = [], ownerId }) => {
  const data = {
    ...payload,
    amenities: payload.amenities || [],
    searchTokens: buildSearchIndex(payload.title, payload.description),
    updatedAt: serverTimestamp()
  };

  if (imageUrls.length) data.coverUrl = imageUrls[0];

  if (id) {
    const listingRef = doc(db, COLLECTIONS.listings, id);
    const existingSnap = await getDoc(listingRef);
    const existingData = existingSnap.exists() ? existingSnap.data() || {} : {};

    await updateDoc(listingRef, data);
    if (imageUrls.length) {
      const existing = await getDocs(collection(listingRef, "images"));
      await Promise.all(existing.docs.map((docSnap) => deleteDoc(docSnap.ref)));
      await Promise.all(
        imageUrls.map((url, index) =>
          setDoc(doc(collection(listingRef, "images")), { url, order: index + 1 })
        )
      );
    }

    await upsertListingCard(
      id,
      {
        ...existingData,
        ...data,
        ownerId: existingData.ownerId || ownerId || "",
        createdAt: existingData.createdAt || serverTimestamp()
      },
      existingData
    );
    return id;
  }

  const createdPayload = {
    ...data,
    ownerId,
    views: 0,
    rating: 0,
    ratingCount: 0,
    ratingSum: 0,
    createdAt: serverTimestamp()
  };
  const listingRef = await addDoc(collection(db, COLLECTIONS.listings), createdPayload);

  if (imageUrls.length) {
    await Promise.all(
      imageUrls.map((url, index) =>
        setDoc(doc(collection(listingRef, "images")), { url, order: index + 1 })
      )
    );
  }

  await upsertListingCard(listingRef.id, createdPayload, createdPayload);
  return listingRef.id;
};

const deleteListing = async (id) =>
  Promise.all([
    deleteDoc(doc(db, COLLECTIONS.listings, id)),
    deleteDoc(doc(db, COLLECTIONS.listingCards, id))
  ]);

export {
  DEFAULT_PAGE_SIZE,
  buildListingsQuery,
  subscribeListings,
  fetchListings,
  subscribeListingById,
  fetchRelatedListings,
  getListingById,
  getListingImages,
  syncListingCardFromListing,
  incrementListingViews,
  saveListing,
  deleteListing
};
