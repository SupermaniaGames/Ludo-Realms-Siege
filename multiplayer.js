import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,updateProfile,signInAnonymously} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {getFirestore,doc,onSnapshot,updateDoc,runTransaction,collection,addDoc,query,orderBy,limit,serverTimestamp,setDoc,deleteDoc,where} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import * as fc from './firebase-config.js';

const cfg=fc.firebaseConfig||fc.default;
if(!cfg||!cfg.apiKey||!cfg.appId||!cfg.messagingSenderId)throw new Error('Firebase config is missing apiKey, messagingSenderId or appId in firebase-config.js');

const app=initializeApp(cfg),auth=getAuth(app),db=getFirestore(app);
const mail=u=>u.toLowerCase()+'@supermania.games';
const R=c=>doc(db,'ludoRooms',c);

export const me=()=>auth.currentUser&&{uid:auth.currentUser.uid,name:auth.currentUser.displayName||''};
export const onUser=cb=>onAuthStateChanged(auth,cb);
export const signIn=(u,p)=>signInWithEmailAndPassword(auth,mail(u),p);
export const signUp=async(u,p)=>{const c=await createUserWithEmailAndPassword(auth,mail(u),p);await updateProfile(c.user,{displayName:u})};
export const guest=async(name)=>{const c=await signInAnonymously(auth);await updateProfile(c.user,{displayName:name})};
export const logout=()=>signOut(auth);

export async function createRoom(max,av){
  const u=me();
  for(let n=0;n<10;n++){
    const code=String(1000+Math.floor(Math.random()*9000));
    try{
      await runTransaction(db,async tx=>{
        const s=await tx.get(R(code));
        if(s.exists()&&Date.now()-s.data().created<6*36e5)throw 'taken';
        tx.set(R(code),{host:u.uid,max,status:'lobby',created:Date.now(),players:[{uid:u.uid,name:u.name,av:av||'🙂'}]});
      });
      return code;
    }catch(e){if(e!=='taken')throw e}
  }
  throw new Error('Could not find a free code. Try again.');
}

export const joinRoom=(code,av)=>runTransaction(db,async tx=>{
  const u=me(),s=await tx.get(R(code));
  if(!s.exists())throw new Error('No room with that code');
  const d=s.data();
  if(d.players.some(p=>p.uid==u.uid))return;
  if(d.status!='lobby')throw new Error('That game already started');
  if(d.players.length>=d.max)throw new Error('Room is full');
  tx.update(R(code),{players:[...d.players,{uid:u.uid,name:u.name,av:av||'🙂'}]});
});

export const watchRoom=(code,cb)=>onSnapshot(R(code),s=>cb(s.exists()?s.data():null,s.metadata.hasPendingWrites));
export const setRoom=(code,patch)=>updateDoc(R(code),patch);

const CH=code=>collection(db,'ludoRooms',code,'chat');
export const sendChat=(code,text)=>addDoc(CH(code),{uid:me().uid,name:me().name,text,ts:serverTimestamp()});
export const watchChat=(code,cb)=>onSnapshot(query(CH(code),orderBy('ts'),limit(60)),s=>cb(s.docs.map(d=>d.data())));

/* ---------- who is online + invites ---------- */
const PR=collection(db,'ludoPresence');
export const setPresence=(name,av,on)=>{const u=me();return u?setDoc(doc(db,'ludoPresence',u.uid),{name,av:av||'🙂',on:!!on,lastSeen:Date.now()},{merge:true}):Promise.resolve()};
export const watchOnline=cb=>onSnapshot(query(PR,where('lastSeen','>',Date.now()-120000),limit(60)),s=>cb(s.docs.map(d=>({uid:d.id,...d.data()}))),()=>cb([]));
export const sendInvite=(toUid,code,name,av)=>addDoc(collection(db,'ludoInvites',toUid,'items'),{from:me().uid,fromName:name,av:av||'🙂',code,ts:Date.now()});
export const watchInvites=cb=>{const u=me();return onSnapshot(collection(db,'ludoInvites',u.uid,'items'),s=>cb(s.docs.map(d=>({id:d.id,...d.data()}))),()=>{})};
export const delInvite=id=>deleteDoc(doc(db,'ludoInvites',me().uid,'items',id));
