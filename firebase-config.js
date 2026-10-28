/* Online rooms ("Play with friends") use Firebase Firestore.
 * 1. Create a Firebase project → add a Web app → copy its config below.
 * 2. Enable Firestore (production mode) and paste the rules from README.md.
 * Leave apiKey empty and the game falls back to a LOCAL test mode that only
 * connects tabs of the same browser. Everything else works without Firebase. */
 export const firebaseConfig = {
  apiKey: "AIzaSyAhH_GDUzL3o0kf8arJG4AwEVXIrHI8wn8",
  authDomain: "oakwood-chess.firebaseapp.com",
  projectId: "oakwood-chess",
  storageBucket: "oakwood-chess.firebasestorage.app",
  messagingSenderId: "1066438635780",
  appId: "1:1066438635780:web:0e82d1ad91f396b9582051",
};
export const firebaseEnabled = true;
