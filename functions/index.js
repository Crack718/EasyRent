const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { FieldPath, Timestamp } = require("firebase-admin/firestore");

admin.initializeApp();

const db = admin.firestore();
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 20;
const ALLOWED_SORT_FIELDS = new Set(["createdAt", "price", "rating"]);
const PROJECTED_FIELDS = [
  "title",
  "description",
  "price",
  "propertyType",
  "region",
  "district",
  "address",
  "rooms",
  "area",
  "ownerId",
  "status",
  "rating",
  "views",
  "amenities",
  "coverUrl",
  "searchTokens",
  "createdAt"
];

const toSafeString = (value) => String(value || "").trim();

const parseNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeSort = (sortBy) => {
  const [field, direction] = toSafeString(sortBy || "createdAt:desc").split(":");
  const safeField = ALLOWED_SORT_FIELDS.has(field) ? field : "createdAt";
  const safeDirection = direction === "asc" ? "asc" : "desc";
  return [safeField, safeDirection];
};

const normalizeTokens = (tokens) =>
  Array.from(
    new Set(
      (Array.isArray(tokens) ? tokens : [])
        .map((token) => toSafeString(token).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 10);

const sanitizeFilters = (filters = {}) => {
  const queryTokens = normalizeTokens(filters.queryTokens);
  const priceMin = parseNumberOrNull(filters.priceMin);
  const priceMax = parseNumberOrNull(filters.priceMax);

  return {
    status: toSafeString(filters.status),
    propertyType: toSafeString(filters.propertyType),
    region: toSafeString(filters.region),
    district: toSafeString(filters.district),
    amenity: toSafeString(filters.amenity),
    queryTokens,
    priceMin,
    priceMax,
    sortBy: toSafeString(filters.sortBy || "createdAt:desc")
  };
};

const pickServerFilter = (filters, sortField) => {
  const serverFilter = {};
  if (filters.queryTokens.length) serverFilter.queryTokens = filters.queryTokens;
  if (sortField !== "createdAt") return serverFilter;
  if (filters.amenity) serverFilter.amenity = filters.amenity;
  else if (filters.district) serverFilter.district = filters.district;
  else if (filters.region) serverFilter.region = filters.region;
  else if (filters.propertyType) serverFilter.propertyType = filters.propertyType;
  return serverFilter;
};

const toTimestampCursor = (value) => {
  const millis = parseNumberOrNull(value);
  if (millis === null) return null;
  return Timestamp.fromMillis(millis);
};

const mapListing = (docSnap) => {
  const data = docSnap.data() || {};
  const createdAt = data.createdAt;
  return {
    id: docSnap.id,
    title: data.title || "",
    description: data.description || "",
    price: Number(data.price || 0),
    propertyType: data.propertyType || "",
    region: data.region || "",
    district: data.district || "",
    address: data.address || "",
    rooms: Number(data.rooms || 0),
    area: Number(data.area || 0),
    ownerId: data.ownerId || "",
    status: data.status || "",
    rating: Number(data.rating || 0),
    views: Number(data.views || 0),
    amenities: Array.isArray(data.amenities) ? data.amenities : [],
    coverUrl: data.coverUrl || "",
    createdAt: typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : null
  };
};

exports.catalogQuery = onRequest({ region: "us-central1", cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, code: "method-not-allowed", error: "Use POST" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const filters = sanitizeFilters(body.filters || {});
    const cursor = body.cursor || null;
    const pageSizeRaw = parseInt(body.pageSize, 10);
    const pageSize = Number.isFinite(pageSizeRaw)
      ? Math.max(1, Math.min(pageSizeRaw, MAX_PAGE_SIZE))
      : DEFAULT_PAGE_SIZE;
    const [sortField, sortDirection] = normalizeSort(filters.sortBy);
    const serverFilter = filters.status ? pickServerFilter(filters, sortField) : {};

    let queryRef = db.collection("listings");

    if (filters.status) {
      queryRef = queryRef.where("status", "==", filters.status);
    }

    if (serverFilter.propertyType) queryRef = queryRef.where("propertyType", "==", serverFilter.propertyType);
    if (serverFilter.region) queryRef = queryRef.where("region", "==", serverFilter.region);
    if (serverFilter.district) queryRef = queryRef.where("district", "==", serverFilter.district);
    if (serverFilter.amenity) queryRef = queryRef.where("amenities", "array-contains", serverFilter.amenity);
    if (serverFilter.queryTokens?.length) {
      queryRef = queryRef.where("searchTokens", "array-contains-any", serverFilter.queryTokens);
    }

    if (sortField === "price") {
      if (filters.priceMin !== null) queryRef = queryRef.where("price", ">=", filters.priceMin);
      if (filters.priceMax !== null) queryRef = queryRef.where("price", "<=", filters.priceMax);
    }

    queryRef = queryRef
      .orderBy(sortField, sortDirection)
      .orderBy(FieldPath.documentId(), sortDirection)
      .select(...PROJECTED_FIELDS)
      .limit(pageSize + 1);

    if (cursor?.id) {
      const cursorSortField = toSafeString(cursor.sortField) || sortField;
      const cursorSortValue =
        cursorSortField === "createdAt"
          ? toTimestampCursor(cursor.sortValue)
          : parseNumberOrNull(cursor.sortValue);
      if (cursorSortValue !== null) {
        queryRef = queryRef.startAfter(cursorSortValue, String(cursor.id));
      }
    }

    const snapshot = await queryRef.get();
    const docs = snapshot.docs.slice(0, pageSize).map(mapListing);
    const hasMore = snapshot.docs.length > pageSize;
    res.status(200).json({ ok: true, docs, hasMore });
  } catch (error) {
    logger.error("catalogQuery failed", error);
    res.status(500).json({
      ok: false,
      code: "catalog-query-error",
      error: error?.message || "Catalog query failed"
    });
  }
});
