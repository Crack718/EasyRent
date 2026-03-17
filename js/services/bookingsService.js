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
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "../core/firebase.js";

const ACTIVE_STATUSES = ["в ожидании", "подтверждено"];
const HISTORY_STATUSES = ["отменено", "завершено"];

const normalizeDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const hasDateRangeOverlap = (fromA, toA, fromB, toB) => {
  const startA = normalizeDate(fromA);
  const endA = normalizeDate(toA);
  const startB = normalizeDate(fromB);
  const endB = normalizeDate(toB);
  if (!startA || !endA || !startB || !endB) return false;
  return startA <= endB && startB <= endA;
};

const syncBookingMirrors = async (bookingId, bookingData) => {
  const activeRef = doc(db, COLLECTIONS.activeActions, bookingId);
  const historyRef = doc(db, COLLECTIONS.actionHistory, bookingId);
  const availabilityRef = doc(db, COLLECTIONS.availability, bookingId);
  const payload = {
    ...bookingData,
    updatedAt: serverTimestamp()
  };

  if (ACTIVE_STATUSES.includes(bookingData.status)) {
    await Promise.all([
      setDoc(activeRef, payload, { merge: true }),
      setDoc(
        availabilityRef,
        {
          bookingId,
          listingId: bookingData.listingId || "",
          userId: bookingData.userId || "",
          status: bookingData.status,
          dateFrom: bookingData.dateFrom || "",
          dateTo: bookingData.dateTo || "",
          createdAt: bookingData.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      ),
      deleteDoc(historyRef)
    ]);
    return;
  }

  if (HISTORY_STATUSES.includes(bookingData.status)) {
    await Promise.all([
      setDoc(historyRef, payload, { merge: true }),
      deleteDoc(activeRef),
      deleteDoc(availabilityRef)
    ]);
    return;
  }

  await Promise.all([deleteDoc(activeRef), deleteDoc(historyRef), deleteDoc(availabilityRef)]);
};

const listActiveBookingsByListing = async (listingId) => {
  const snapshot = await getDocs(
    query(
      collection(db, COLLECTIONS.availability),
      where("listingId", "==", listingId),
      orderBy("dateFrom", "asc")
    )
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

const checkBookingConflict = async ({ listingId, dateFrom, dateTo, ignoreBookingId = "" }) => {
  if (!dateFrom || !dateTo) return false;
  const activeBookings = await listActiveBookingsByListing(listingId);
  return activeBookings.some((booking) => {
    if (ignoreBookingId && booking.id === ignoreBookingId) return false;
    return hasDateRangeOverlap(booking.dateFrom, booking.dateTo, dateFrom, dateTo);
  });
};

const createBooking = async ({ listingId, userId, ownerId, dateFrom, dateTo, priceSnapshot }) => {
  const conflict = await checkBookingConflict({ listingId, dateFrom, dateTo });
  if (conflict) throw new Error("BOOKING_DATE_CONFLICT");

  const payload = {
    listingId,
    userId,
    ownerId: ownerId || "",
    status: "в ожидании",
    dateFrom: dateFrom || "",
    dateTo: dateTo || "",
    priceSnapshot: priceSnapshot || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const bookingRef = await addDoc(collection(db, COLLECTIONS.bookings), payload);
  await syncBookingMirrors(bookingRef.id, { ...payload, id: bookingRef.id });
  return bookingRef;
};

const subscribeBookingsByUser = (userId, callback, onError) => {
  const q = query(
    collection(db, COLLECTIONS.bookings),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, callback, onError);
};

const subscribeActiveActionsByUser = (userId, callback, onError) => {
  const q = query(
    collection(db, COLLECTIONS.activeActions),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, callback, onError);
};

const subscribeHistoryActionsByUser = (userId, callback, onError) => {
  const q = query(
    collection(db, COLLECTIONS.actionHistory),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, callback, onError);
};

const subscribeActiveBookingsByListing = (listingId, callback, onError) => {
  const q = query(
    collection(db, COLLECTIONS.availability),
    where("listingId", "==", listingId),
    orderBy("dateFrom", "asc")
  );
  return onSnapshot(q, callback, onError);
};

const updateBookingStatus = async (bookingId, status) => {
  const bookingRef = doc(db, COLLECTIONS.bookings, bookingId);
  const snapshot = await getDoc(bookingRef);
  if (!snapshot.exists()) return;
  const prev = snapshot.data() || {};
  await updateDoc(bookingRef, {
    status,
    updatedAt: serverTimestamp()
  });
  await syncBookingMirrors(bookingId, { ...prev, status, id: bookingId });
};

const updateBookingDates = async (bookingId, dateFrom, dateTo) => {
  const bookingRef = doc(db, COLLECTIONS.bookings, bookingId);
  const snapshot = await getDoc(bookingRef);
  if (!snapshot.exists()) return;
  const prev = snapshot.data() || {};
  const nextFrom = dateFrom || "";
  const nextTo = dateTo || "";

  const conflict = await checkBookingConflict({
    listingId: prev.listingId,
    dateFrom: nextFrom,
    dateTo: nextTo,
    ignoreBookingId: bookingId
  });
  if (conflict) throw new Error("BOOKING_DATE_CONFLICT");

  await updateDoc(bookingRef, {
    dateFrom: nextFrom,
    dateTo: nextTo,
    updatedAt: serverTimestamp()
  });
  await syncBookingMirrors(bookingId, {
    ...prev,
    dateFrom: nextFrom,
    dateTo: nextTo,
    id: bookingId
  });
};

const removeBooking = async (bookingId) =>
  Promise.all([
    deleteDoc(doc(db, COLLECTIONS.bookings, bookingId)),
    deleteDoc(doc(db, COLLECTIONS.availability, bookingId)),
    deleteDoc(doc(db, COLLECTIONS.activeActions, bookingId)),
    deleteDoc(doc(db, COLLECTIONS.actionHistory, bookingId))
  ]);

const listBookingsByUser = async (userId) => {
  const snapshot = await getDocs(
    query(
      collection(db, COLLECTIONS.bookings),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    )
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

const syncBookingMirrorsByUser = async (userId) => {
  const bookings = await listBookingsByUser(userId);
  await Promise.all(
    bookings.map((booking) => syncBookingMirrors(booking.id, booking))
  );
};

export {
  createBooking,
  subscribeBookingsByUser,
  subscribeActiveActionsByUser,
  subscribeHistoryActionsByUser,
  subscribeActiveBookingsByListing,
  updateBookingStatus,
  updateBookingDates,
  removeBooking,
  listBookingsByUser,
  listActiveBookingsByListing,
  checkBookingConflict,
  syncBookingMirrorsByUser
};
