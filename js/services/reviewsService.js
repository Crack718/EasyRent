import {
  db,
  COLLECTIONS,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "../core/firebase.js";

const subscribeReviews = (listingId, callback) => {
  const reviewsRef = collection(doc(db, COLLECTIONS.listings, listingId), "reviews");
  const q = query(reviewsRef, orderBy("createdAt", "desc"), limit(10));
  return onSnapshot(q, callback);
};

const createReview = async ({ listingId, userId, rating, text }) => {
  const reviewsRef = collection(doc(db, COLLECTIONS.listings, listingId), "reviews");
  await addDoc(reviewsRef, {
    rating,
    text,
    userId,
    listingId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  const listingRef = doc(db, COLLECTIONS.listings, listingId);
  const listingSnap = await getDoc(listingRef);
  const listing = listingSnap.data() || {};
  const ratingCount = listing.ratingCount || 0;
  const ratingSum = listing.ratingSum || (listing.rating || 0) * ratingCount;
  const nextCount = ratingCount + 1;
  const nextSum = ratingSum + rating;
  await updateDoc(listingRef, {
    ratingCount: nextCount,
    ratingSum: nextSum,
    rating: nextCount ? nextSum / nextCount : 0
  });
  await setDoc(
    doc(db, COLLECTIONS.listingCards, listingId),
    {
      ratingCount: nextCount,
      ratingSum: nextSum,
      rating: nextCount ? nextSum / nextCount : 0,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
};

const getReviewsByUser = async (userId) => {
  const snapshot = await getDocs(query(collectionGroup(db, "reviews"), where("userId", "==", userId)));
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    const listingId = data.listingId || docSnap.ref?.parent?.parent?.id || "";
    return { id: docSnap.id, listingId, ...data };
  });
};

const updateReview = async ({ listingId, reviewId, rating, text }) => {
  if (!listingId || !reviewId) return;
  const reviewRef = doc(db, COLLECTIONS.listings, listingId, "reviews", reviewId);
  const reviewSnap = await getDoc(reviewRef);
  if (!reviewSnap.exists()) return;
  const prev = reviewSnap.data() || {};
  await updateDoc(reviewRef, {
    rating,
    text,
    updatedAt: serverTimestamp()
  });

  const listingRef = doc(db, COLLECTIONS.listings, listingId);
  const listingSnap = await getDoc(listingRef);
  const listing = listingSnap.data() || {};
  const ratingCount = listing.ratingCount || 0;
  const ratingSum = listing.ratingSum || (listing.rating || 0) * ratingCount;
  const nextSum = ratingSum + (Number(rating) - (Number(prev.rating) || 0));
  const nextRating = ratingCount ? nextSum / ratingCount : 0;
  await updateDoc(listingRef, {
    ratingSum: nextSum,
    rating: nextRating,
    updatedAt: serverTimestamp()
  });
  await setDoc(
    doc(db, COLLECTIONS.listingCards, listingId),
    {
      ratingSum: nextSum,
      rating: nextRating,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
};

const deleteReview = async ({ listingId, reviewId }) => {
  if (!listingId || !reviewId) return;
  const reviewRef = doc(db, COLLECTIONS.listings, listingId, "reviews", reviewId);
  const reviewSnap = await getDoc(reviewRef);
  if (!reviewSnap.exists()) return;
  const prev = reviewSnap.data() || {};
  await deleteDoc(reviewRef);

  const listingRef = doc(db, COLLECTIONS.listings, listingId);
  const listingSnap = await getDoc(listingRef);
  const listing = listingSnap.data() || {};
  const ratingCount = listing.ratingCount || 0;
  const ratingSum = listing.ratingSum || (listing.rating || 0) * ratingCount;
  const nextCount = Math.max(0, ratingCount - 1);
  const nextSum = ratingSum - (Number(prev.rating) || 0);
  const nextRating = nextCount ? nextSum / nextCount : 0;
  await updateDoc(listingRef, {
    ratingCount: nextCount,
    ratingSum: nextSum,
    rating: nextRating,
    updatedAt: serverTimestamp()
  });
  await setDoc(
    doc(db, COLLECTIONS.listingCards, listingId),
    {
      ratingCount: nextCount,
      ratingSum: nextSum,
      rating: nextRating,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
};

export { subscribeReviews, createReview, getReviewsByUser, updateReview, deleteReview };
