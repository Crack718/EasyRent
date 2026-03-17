import {
  db,
  COLLECTIONS,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  serverTimestamp
} from "../core/firebase.js";

const toggleFavorite = async (userId, listingId) => {
  const favoritesRef = collection(db, COLLECTIONS.favorites);
  const snapshot = await getDocs(
    query(favoritesRef, where("userId", "==", userId), where("listingId", "==", listingId))
  );

  if (!snapshot.empty) {
    await Promise.all(snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref)));
    return false;
  }

  await addDoc(favoritesRef, { userId, listingId, createdAt: serverTimestamp() });
  return true;
};

const getFavoritesByUser = async (userId) => {
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.favorites), where("userId", "==", userId))
  );
  return snapshot.docs.map((docSnap) => docSnap.data());
};

export { toggleFavorite, getFavoritesByUser };
