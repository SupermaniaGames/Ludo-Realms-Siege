/* Online rooms ("Play with friends") use Firebase Firestore.
 * 1. Create a Firebase project → add a Web app → copy its config below.
 * 2. Enable Firestore (production mode) and paste the rules from README.md.
 * Leave apiKey empty and the game falls back to a LOCAL test mode that only
 * connects tabs of the same browser. Everything else works without Firebase. */
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
export const firebaseEnabled = true;
