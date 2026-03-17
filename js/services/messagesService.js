import {
  db,
  COLLECTIONS,
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "../core/firebase.js";

const subscribeMessages = (listingId, userId, callback, onError) => {
  if (!userId) return () => {};
  const q = query(
    collection(db, COLLECTIONS.messages),
    where("listingId", "==", listingId),
    where("participants", "array-contains", userId),
    orderBy("createdAt", "desc"),
    limit(20)
  );
  return onSnapshot(q, callback, onError);
};

const sendMessage = async ({ listingId, senderId, receiverId, text }) =>
  addDoc(collection(db, COLLECTIONS.messages), {
    listingId,
    senderId,
    receiverId,
    participants: [senderId, receiverId],
    text,
    createdAt: serverTimestamp(),
    read: false
  });

const listMessagesByUser = async (userId, max = 30) => {
  const snapshot = await getDocs(
    query(
      collection(db, COLLECTIONS.messages),
      where("participants", "array-contains", userId),
      orderBy("createdAt", "desc"),
      limit(max)
    )
  );
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

const updateMessageText = async (messageId, text) =>
  updateDoc(doc(db, COLLECTIONS.messages, messageId), {
    text,
    updatedAt: serverTimestamp()
  });

const markMessageRead = async (messageId, read = true) =>
  updateDoc(doc(db, COLLECTIONS.messages, messageId), {
    read,
    updatedAt: serverTimestamp()
  });

const deleteMessage = async (messageId) => deleteDoc(doc(db, COLLECTIONS.messages, messageId));

export {
  subscribeMessages,
  sendMessage,
  listMessagesByUser,
  updateMessageText,
  markMessageRead,
  deleteMessage
};
