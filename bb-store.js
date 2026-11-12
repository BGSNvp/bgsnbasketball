// Shared Firestore access for the basketball overlay and controller.
// Everything lives in one document: basketball/live
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const configured = !!firebaseConfig.projectId && !String(firebaseConfig.apiKey).startsWith('PASTE');
export const db = configured ? getFirestore(initializeApp(firebaseConfig)) : null;
const ref = db ? doc(db, 'basketball', 'live') : null;

export function subscribe(onData, onError) {
  if (!ref) { if (onError) onError(new Error('Firebase not set up')); return () => {}; }
  return onSnapshot(ref, s => onData(s.exists() ? s.data() : {}), e => onError && onError(e));
}

export function save(partial) {
  if (!ref) return Promise.reject(new Error('Firebase not set up'));
  return setDoc(ref, partial, { merge: true });
}
