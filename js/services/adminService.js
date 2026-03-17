import {
  db,
  COLLECTIONS,
  collection,
  collectionGroup,
  doc,
  getDocs,
  query,
  orderBy,
  limit,
  deleteDoc
} from "../core/firebase.js";

const getStats = async () => {
  const [listingSnap, userSnap, bookingSnap, activeSnap, historySnap] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.listings)),
    getDocs(collection(db, COLLECTIONS.users)),
    getDocs(collection(db, COLLECTIONS.bookings)),
    getDocs(collection(db, COLLECTIONS.activeActions)),
    getDocs(collection(db, COLLECTIONS.actionHistory))
  ]);

  return {
    listings: listingSnap.size,
    users: userSnap.size,
    bookings: bookingSnap.size,
    activeActions: activeSnap.size,
    historyActions: historySnap.size
  };
};

const listListings = async () => {
  const snapshot = await getDocs(query(collection(db, COLLECTIONS.listings), orderBy("createdAt", "desc")));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

const listUsers = async () => {
  const snapshot = await getDocs(query(collection(db, COLLECTIONS.users), orderBy("createdAt", "desc")));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

const listMessages = async (max = 10) => {
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.messages), orderBy("createdAt", "desc"), limit(max))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

const listBookings = async (max = 25) => {
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.bookings), orderBy("createdAt", "desc"), limit(max))
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

const listReviewsForModeration = async (max = 20) => {
  const snapshot = await getDocs(
    query(collectionGroup(db, "reviews"), limit(max))
  );
  const items = snapshot.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    const listingId = data.listingId || docSnap.ref?.parent?.parent?.id || "";
    const createdAt =
      typeof data.createdAt?.toMillis === "function" ? data.createdAt.toMillis() : 0;
    return {
      id: docSnap.id,
      listingId,
      text: data.text || "",
      rating: data.rating || 0,
      userId: data.userId || "",
      _createdAt: createdAt
    };
  });
  return items.sort((a, b) => b._createdAt - a._createdAt);
};

const deleteReviewModeration = async ({ listingId, reviewId }) => {
  if (!listingId || !reviewId) return;
  await deleteDoc(doc(db, COLLECTIONS.listings, listingId, "reviews", reviewId));
};

export {
  getStats,
  listListings,
  listUsers,
  listMessages,
  listBookings,
  listReviewsForModeration,
  deleteReviewModeration
};
