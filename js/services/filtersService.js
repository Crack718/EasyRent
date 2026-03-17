import { db, COLLECTIONS, collection, getDocs, query, orderBy } from "../core/firebase.js";

const getFilterData = async () => {
  const [typesSnap, regionsSnap, districtsSnap, amenitiesSnap] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.propertyTypes), orderBy("name"))),
    getDocs(query(collection(db, COLLECTIONS.regions), orderBy("name"))),
    getDocs(query(collection(db, COLLECTIONS.districts), orderBy("name"))),
    getDocs(query(collection(db, COLLECTIONS.amenities), orderBy("name")))
  ]);

  return {
    types: typesSnap.docs.map((docSnap) => docSnap.data().name),
    regions: regionsSnap.docs.map((docSnap) => docSnap.data().name),
    districts: districtsSnap.docs.map((docSnap) => docSnap.data()),
    amenities: amenitiesSnap.docs.map((docSnap) => docSnap.data().name)
  };
};

export { getFilterData };
