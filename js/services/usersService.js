import {
  db,
  COLLECTIONS,
  collection,
  doc,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "../core/firebase.js";

const ensureUserProfile = async (user, fallback = {}) => {
  const userRef = doc(db, COLLECTIONS.users, user.uid);
  const snapshot = await getDoc(userRef);
  if (snapshot.exists()) return snapshot.data();

  const profile = {
    name: fallback.name || user.displayName || "",
    email: user.email || "",
    phone: fallback.phone || "",
    role: "user",
    createdAt: serverTimestamp()
  };

  await setDoc(userRef, profile);
  return profile;
};

const getUserProfile = async (uid) => {
  const snapshot = await getDoc(doc(db, COLLECTIONS.users, uid));
  return snapshot.exists() ? snapshot.data() : null;
};

const updateUserProfile = async (uid, data) => {
  const userRef = doc(db, COLLECTIONS.users, uid);
  await updateDoc(userRef, data);
};

const saveUserProfile = async ({ id, payload }) => {
  if (id) {
    await setDoc(doc(db, COLLECTIONS.users, id), payload, { merge: true });
    return id;
  }
  const ref = await addDoc(collection(db, COLLECTIONS.users), {
    ...payload,
    createdAt: serverTimestamp()
  });
  return ref.id;
};

const deleteUserProfile = async (uid) => deleteDoc(doc(db, COLLECTIONS.users, uid));

const setUserRole = async (uid, role) => {
  await updateDoc(doc(db, COLLECTIONS.users, uid), { role });
};

export {
  ensureUserProfile,
  getUserProfile,
  updateUserProfile,
  saveUserProfile,
  deleteUserProfile,
  setUserRole
};
