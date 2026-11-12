// Gym clock camera: live WebRTC video from the phone (bb-clockcam.html) straight to the overlay.
// Firebase (doc basketball/clockcam) is used only to connect: ~4 saves per connection, none while playing.
//   overlay -> want      (asks the phone for a fresh offer)
//   phone   -> offer     (offerTs)
//   overlay -> answer    (answerTs = offerTs, written in a transaction so only one overlay wins)
//   overlay -> status    (at most once a minute)
import { doc, setDoc, onSnapshot, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from './bb-store.js';

export const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
export const camRef = db ? doc(db, 'basketball', 'clockcam' + (new URLSearchParams(location.search).get('ch') || '')) : null;

export function subscribeCam(cb) {
  if (!camRef) return () => {};
  return onSnapshot(camRef, s => cb(s.exists() ? s.data() : {}), () => {});
}

export function gathered(p) {
  return new Promise(res => {
    if (p.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 3000);
    p.addEventListener('icegatheringstatechange', () => { if (p.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}

const MAX_RETRIES = 8;
const STATUS_EVERY_MS = 60000;

export function createReceiver(video) {
  const myId = Math.random().toString(36).slice(2, 10);
  let on = false, unsub = null, pc = null, wantTs = 0, handled = 0, retries = 0, retryTimer = null, watch = null;
  let lastFrames = 0, lastFrameAt = 0, answeredAt = 0, playingSince = 0;
  let statusSent = '', statusPending = '', statusLastAt = 0, statusTimer = null;

  function setStatus(s) {
    statusPending = s;
    if (statusTimer) return;
    if (s === statusSent) return;
    statusTimer = setTimeout(() => {
      statusTimer = null;
      if (!on || statusPending === statusSent) return;
      statusSent = statusPending; statusLastAt = Date.now();
      setDoc(camRef, { status: statusSent, statusAt: statusLastAt }, { merge: true }).catch(() => {});
    }, Math.max(0, statusLastAt + STATUS_EVERY_MS - Date.now()));
  }

  function closePc() {
    clearInterval(watch); watch = null;
    if (pc) { pc.onconnectionstatechange = null; pc.ontrack = null; pc.close(); }
    pc = null; video.srcObject = null; lastFrameAt = 0;
  }

  function requestOffer() {
    wantTs = Date.now();
    setDoc(camRef, { want: wantTs }, { merge: true }).catch(() => {});
  }

  function scheduleRetry() {
    closePc();
    clearTimeout(retryTimer);
    if (retries >= MAX_RETRIES) { setStatus('phone not answering – manual clock showing'); return; }
    const delay = Math.min(60000, 5000 * Math.pow(2, retries));
    retries++;
    retryTimer = setTimeout(() => { if (on) requestOffer(); }, delay);
  }

  async function check(p) {
    if (p !== pc) return;
    let frames = 0;
    try {
      (await p.getStats()).forEach(r => {
        if (r.type === 'inbound-rtp' && (r.kind === 'video' || r.mediaType === 'video')) frames = r.framesDecoded || 0;
      });
    } catch (e) {}
    if (p !== pc) return;
    const now = Date.now();
    if (frames > lastFrames && video.videoWidth > 0) {
      lastFrames = frames; lastFrameAt = now;
      if (!playingSince) playingSince = now;
      if (now - playingSince > 10000) retries = 0;
      setStatus('playing');
    } else if (lastFrameAt ? now - lastFrameAt > 8000 : now - answeredAt > 15000) {
      setStatus('no video – manual clock showing');
      scheduleRetry();
    }
  }

  async function answer(sdp, ts) {
    closePc(); clearTimeout(retryTimer);
    const p = pc = new RTCPeerConnection({ iceServers: ICE });
    p.ontrack = e => {
      const ms = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
      if (video.srcObject === ms) return;
      video.srcObject = ms;
      const pr = video.play(); if (pr && pr.catch) pr.catch(() => {});
    };
    p.onconnectionstatechange = () => { if (p === pc && p.connectionState === 'failed') scheduleRetry(); };
    try {
      await p.setRemoteDescription({ type: 'offer', sdp });
      await p.setLocalDescription(await p.createAnswer());
      await gathered(p);
      if (p !== pc) return;
      const won = await runTransaction(db, async tx => {
        const s = await tx.get(camRef); const x = s.exists() ? s.data() : {};
        if (x.offerTs !== ts || x.answerTs === ts) return false;
        tx.set(camRef, { answer: p.localDescription.sdp, answerTs: ts, answerBy: myId }, { merge: true });
        return true;
      });
      if (!won) { if (p === pc) closePc(); return; }   // another overlay took this offer
    } catch (e) { if (p === pc) scheduleRetry(); return; }
    if (p !== pc) return;
    answeredAt = Date.now(); lastFrames = 0; playingSince = 0;
    watch = setInterval(() => check(p), 1000);
  }

  return {
    start() {
      if (on || !camRef || !window.RTCPeerConnection) return;
      on = true; retries = 0;
      let first = true;
      unsub = onSnapshot(camRef, s => {
        const x = s.exists() ? s.data() : {};
        if (first) { first = false; handled = x.offerTs || 0; requestOffer(); return; }
        if (x.offer && x.offerTs && x.offerTs !== handled) { handled = x.offerTs; answer(x.offer, x.offerTs); }
      }, () => {});
    },
    stop() {
      if (!on) return;
      on = false;
      if (unsub) unsub(); unsub = null;
      clearTimeout(retryTimer); clearTimeout(statusTimer); statusTimer = null;
      closePc();
    },
    isPlaying() { return on && !!lastFrameAt && Date.now() - lastFrameAt < 3000; }
  };
}
