# Ludo Realms: Siege

A standalone 4-kingdom chess-style siege game with software-3D pieces (no libraries). Installable PWA with its own id (`ludo-realms-siege`), network-first updates.

## Modes
- **Play with friends** – create a room, share the 5-letter code or link (`?room=CODE`), host starts.
- **Play vs computer** – 1–3 AI kingdoms.
- **Pass & play** – one device (optional auto-turn of the board).

## Rules
- Tap the **dice** to roll. 1–4 move a piece: Queen/Rook/Bishop slide up to the roll; **Knight always makes one classic L-jump** (cannot cross walls); Pawns go 1–2 forward, capture diagonally, promote on the 3 crowned squares beside an enemy palace.
- **5 💣 Breaker** only hits what is *next to your piece*: a wall beside you, an enemy piece in a Haven, or an enemy palace when you stand on its corner squares (you take the whole kingdom).
- **6 🛡️ Haven** shields one of your pieces until it moves.
- **Diplomacy** (before rolling, once per turn): tap an enemy palace → propose alliance or demand surrender. Allies win together.
- Selecting a piece shows a green ring, path lines, arrows and pips (dashed = knight leap, red = capture).

## Deploy on GitHub Pages
Push all files to a repo → Settings → Pages → deploy from branch root. Needs HTTPS (Pages gives it).

## Online rooms (Firebase)
1. Create a Firebase project, add a Web app, paste its config into `firebase-config.js`.
2. Enable Firestore and use these rules (rooms are public by code; tighten if you wish):
```
rules_version = '2';
service cloud.firestore { match /databases/{db}/documents {
  match /realmsRooms/{room} { allow read, write: if true; }
} }
```
Without a config the game uses a local test mode (tabs of one browser only). Everything else works offline of Firebase.

## Updates
`sw.js` is network-first; bump nothing – new deploys load on next visit. Change `manifest.json` `id` only if you fork it into another game.
