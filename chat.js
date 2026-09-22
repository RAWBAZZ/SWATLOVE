/* SWATLOVE chat: text and voice notes between two people.
   Talks to Supabase over plain fetch(). Set your keys in chat-config.js. */
(() => {
  "use strict";

  const cfg = window.SWATLOVE_CHAT || {};
  const configured =
    Boolean(cfg.url && cfg.anonKey) && !/YOUR-/.test(`${cfg.url}${cfg.anonKey}`);

  const STORE = "swatlove-chat";
  const MAX_SECONDS = 120;
  const musicAudio = document.getElementById("audio");

  /* ---------- small helpers ---------- */

  function headers(extra) {
    const base = { apikey: cfg.anonKey };
    // Legacy anon keys are JWTs and also go in Authorization. New publishable keys do not.
    if (String(cfg.anonKey).startsWith("eyJ")) base.Authorization = `Bearer ${cfg.anonKey}`;
    return Object.assign(base, extra || {});
  }

  async function rpc(name, args) {
    const response = await fetch(`${cfg.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(args)
    });
    if (!response.ok) throw new Error(await response.text());
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  // The passcode is never stored in this file, only a fingerprint of it.
  const GATE_HASH = "d2e84d32714e802608e6508605da50b0b7c0937f93d30b1a53c5d8b5633e839c";

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const normalise = (code) => code.trim().toLowerCase();
  const gateHash = (code) => sha256(`swatlove-gate:${normalise(code)}`);
  const hashRoom = (code) => sha256(`swatlove:${normalise(code)}`);

  function randomId() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function clock(seconds) {
    const m = Math.floor(seconds / 60);
    const s = String(Math.floor(seconds % 60)).padStart(2, "0");
    return `${m}:${s}`;
  }

  // The site lock (gate.js) saves the room here after the passcode is entered.
  function unlockedRoom() {
    try {
      return localStorage.getItem("swatlove-unlock") || "";
    } catch (error) {
      return "";
    }
  }

  function loadProfile() {
    try {
      return JSON.parse(localStorage.getItem(STORE)) || null;
    } catch (error) {
      return null;
    }
  }

  function saveProfile() {
    try {
      if (profile) localStorage.setItem(STORE, JSON.stringify(profile));
      else localStorage.removeItem(STORE);
    } catch (error) {
      /* ignore */
    }
  }

  /* ---------- state ---------- */

  let profile = loadProfile(); // { name, room, seen, gate }
  if (profile && !profile.gate) profile = null; // joined before the passcode existed
  let lastId = 0;
  let unread = 0;
  let isOpen = false;
  let polling = false;
  let sending = false;
  let pollTimer = null;
  const shown = new Set();

  let selecting = false;
  let deleting = false;
  let ignoreClickUntil = 0;
  const selected = new Set();

  let recorder = null;
  let recStart = 0;
  let recTick = null;
  let recCancelled = false;

  /* ---------- markup + styles ---------- */

  const style = document.createElement("style");
  style.textContent = `
    .chat-fab { position: fixed; right: 18px; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); z-index: 7;
      width: 56px; height: 56px; border-radius: 50%; font-size: 24px;
      background: linear-gradient(135deg, var(--purple), var(--pink)); box-shadow: 0 10px 28px #c16bff66; }
    .chat-badge { position: absolute; top: -4px; right: -4px; min-width: 20px; padding: 2px 6px; border-radius: 10px;
      background: var(--blue); color: #08222a; font-size: 12px; font-weight: 700; }
    .chat-badge[hidden], .chat-fab[hidden] { display: none; }
    .chat-panel { position: fixed; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); z-index: 8;
      display: none; flex-direction: column; width: min(400px, calc(100vw - 24px));
      height: min(600px, calc(100dvh - 24px)); border: 1px solid var(--border); border-radius: 22px;
      background: #1b1d2a; box-shadow: 0 30px 80px #000a; overflow: hidden; }
    .chat-panel.open { display: flex; }
    .chat-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px;
      border-bottom: 1px solid var(--border); }
    .chat-head strong { display: block; font-family: var(--display, Impact, sans-serif); font-size: 26px; font-weight: 400; letter-spacing: .08em; line-height: 1.1; }
    .chat-head small { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; }
    .chat-head small.error { color: #ff8fa3; }
    .chat-head button { background: transparent; color: var(--muted); font-size: 22px; padding: 6px 8px; }
    .chat-setup { display: flex; flex: 1; flex-direction: column; gap: 10px; padding: 18px; overflow-y: auto; }
    .chat-setup p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
    .chat-setup input, .chat-input input { width: 100%; padding: 13px; border: 1px solid var(--border);
      border-radius: 12px; outline: 0; background: #ffffff0f; color: white; font: inherit; font-size: 16px; }
    .chat-msgs { display: flex; flex: 1; flex-direction: column; gap: 10px; padding: 14px; overflow-y: auto; }
    .chat-empty { margin: auto; color: var(--muted); font-size: 13px; text-align: center; }
    .chat-msg { display: flex; flex-direction: column; max-width: 82%; }
    .chat-msg.mine { align-self: flex-end; align-items: flex-end; }
    .chat-msg.theirs { align-self: flex-start; align-items: flex-start; }
    .chat-who { margin: 0 6px 3px; color: var(--muted); font-size: 11px; }
    .chat-bubble { padding: 9px 13px; border-radius: 16px; font-size: 15px; line-height: 1.4;
      white-space: pre-wrap; overflow-wrap: anywhere; }
    .chat-msg.mine .chat-bubble { background: linear-gradient(100deg, var(--purple), var(--pink)); border-bottom-right-radius: 5px; }
    .chat-msg.theirs .chat-bubble { background: #ffffff14; border-bottom-left-radius: 5px; }
    .chat-bubble audio { display: block; width: 230px; max-width: 100%; height: 36px; }
    .chat-time { margin: 3px 6px 0; color: var(--muted); font-size: 10px; }
    .chat-input { display: flex; align-items: center; gap: 8px; padding: 10px 12px;
      border-top: 1px solid var(--border); }
    .chat-input button, .chat-rec button { flex: none; width: 44px; height: 44px; border-radius: 50%; font-size: 18px;
      background: #ffffff14; }
    .chat-input .chat-send { background: linear-gradient(135deg, var(--purple), var(--pink)); }
    .chat-rec { display: none; align-items: center; gap: 10px; padding: 10px 12px; border-top: 1px solid var(--border); }
    .chat-rec.on { display: flex; }
    .chat-rec .dot { width: 12px; height: 12px; border-radius: 50%; background: #ff4d6d; animation: chatPulse 1s infinite; }
    .chat-rec span { flex: 1; font-size: 15px; }
    .chat-rec .chat-send { background: linear-gradient(135deg, var(--purple), var(--pink)); }
    .chat-head .chat-leave { font-size: 12px; text-decoration: underline; }
    .chat-msg { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
    .chat-msgs.selecting .chat-msg { cursor: pointer; }
    .chat-msgs.selecting audio { pointer-events: none; }
    .chat-msg.selected .chat-bubble { outline: 2px solid var(--blue); outline-offset: 2px; }
    .chat-msg.selected .chat-who::before { content: "✓ "; color: var(--blue); }
    .chat-select-bar { display: none; align-items: center; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--border); }
    .chat-select-bar.on { display: flex; }
    .chat-select-bar button { padding: 11px 15px; border-radius: 999px; background: #ffffff14; font-size: 14px; font-weight: 700; }
    .chat-select-bar .spacer { flex: 1; }
    .chat-select-bar .danger { background: #e5384f; }
    .chat-select-bar .danger:disabled { opacity: .4; cursor: default; }
    @keyframes chatPulse { 50% { opacity: .3; } }
    @media (max-width: 500px) {
      .chat-panel { right: 0; bottom: 0; width: 100vw; height: min(88dvh, 640px); border-radius: 22px 22px 0 0; }
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.innerHTML = `
    <button class="chat-fab" id="chatFab" type="button" aria-label="Open chat">💬<span class="chat-badge" id="chatBadge" hidden>0</span></button>
    <section class="chat-panel" id="chatPanel" role="dialog" aria-label="SATTU chat">
      <div class="chat-head">
        <div><strong>SATTU</strong><small id="chatStatus"></small></div>
        <div>
          <button class="chat-leave" id="chatSelect" type="button" style="display:none">Select</button>
          <button class="chat-leave" id="chatLeave" type="button" style="display:none">Leave</button>
          <button id="chatClose" type="button" aria-label="Close chat">×</button>
        </div>
      </div>

      <div class="chat-setup" id="chatSetup">
        <p id="chatSetupText">Enter your name and the passcode to join. You only need to do this once on this device.</p>
        <input id="chatName" placeholder="Your name" maxlength="20" autocomplete="off" />
        <input id="chatCode" type="password" placeholder="Passcode" autocomplete="off" autocapitalize="off" spellcheck="false" />
        <button class="primary-button" id="chatJoin" type="button">Join chat</button>
      </div>

      <div class="chat-msgs" id="chatMsgs" aria-live="polite" style="display:none"></div>

      <div class="chat-rec" id="chatRec">
        <button id="recCancel" type="button" aria-label="Cancel recording">✕</button>
        <div class="dot"></div><span id="recTime">0:00</span>
        <button class="chat-send" id="recSend" type="button" aria-label="Send voice note">➤</button>
      </div>

      <div class="chat-select-bar" id="chatSelectBar">
        <button id="selCancel" type="button">Cancel</button>
        <button id="selAll" type="button">Select all</button>
        <span class="spacer"></span>
        <button class="danger" id="selDelete" type="button" disabled>Delete (0)</button>
      </div>

      <div class="chat-input" id="chatInputRow" style="display:none">
        <input id="chatText" placeholder="Message" autocomplete="off" maxlength="2000" />
        <button id="chatMic" type="button" aria-label="Record a voice note">🎤</button>
        <button class="chat-send" id="chatSend" type="button" aria-label="Send message">➤</button>
      </div>
    </section>
  `;
  document.body.appendChild(root);

  const $ = (id) => document.getElementById(id);
  const fab = $("chatFab");
  const badge = $("chatBadge");
  const panel = $("chatPanel");
  const statusEl = $("chatStatus");
  const setupEl = $("chatSetup");
  const nameInput = $("chatName");
  const codeInput = $("chatCode");
  const joinButton = $("chatJoin");
  const msgsEl = $("chatMsgs");
  const inputRow = $("chatInputRow");
  const textInput = $("chatText");
  const recBar = $("chatRec");
  const recTime = $("recTime");
  const selectBar = $("chatSelectBar");
  const selAll = $("selAll");
  const selDelete = $("selDelete");

  function setStatus(text, isError) {
    statusEl.textContent = text || "";
    statusEl.classList.toggle("error", Boolean(isError));
  }

  function updateBadge() {
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.hidden = unread === 0;
  }

  /* ---------- views ---------- */

  function showSetup() {
    setupEl.style.display = "flex";
    msgsEl.style.display = "none";
    inputRow.style.display = "none";
    setStatus("");
    $("chatLeave").style.display = "none";
    $("chatSelect").style.display = "none";

    const unlocked = Boolean(unlockedRoom());
    codeInput.style.display = unlocked ? "none" : "";
    $("chatSetupText").textContent = unlocked
      ? "Enter your name to join. You only need to do this once on this device."
      : "Enter your name and the passcode to join. You only need to do this once on this device.";

    if (!configured) {
      $("chatSetupText").textContent =
        "Chat isn't connected yet. Add your Supabase URL and key in chat-config.js, then reload.";
      nameInput.style.display = "none";
      codeInput.style.display = "none";
      joinButton.style.display = "none";
    }
  }

  function showChat() {
    setupEl.style.display = "none";
    msgsEl.style.display = "flex";
    inputRow.style.display = "flex";
    setStatus(`You are ${profile.name}`);
    $("chatLeave").style.display = "";
    if (!selecting) $("chatSelect").style.display = "";
  }

  function openPanel() {
    isOpen = true;
    panel.classList.add("open");
    fab.hidden = true;

    if (profile) {
      showChat();
      unread = 0;
      profile.seen = lastId;
      saveProfile();
      updateBadge();
      scrollDown(true);
      poll();
      textInput.focus({ preventScroll: true });
    } else {
      showSetup();
    }
    schedule();
  }

  function closePanel() {
    if (recorder) stopRecording(false);
    exitSelect();
    isOpen = false;
    panel.classList.remove("open");
    fab.hidden = false;
    schedule();
  }

  function leaveChat() {
    if (!window.confirm("Leave this chat on this device? Old messages stay in the room.")) return;
    exitSelect();
    profile = null;
    saveProfile();
    lastId = 0;
    unread = 0;
    shown.clear();
    msgsEl.innerHTML = "";
    updateBadge();
    showSetup();
  }

  $("chatLeave").addEventListener("click", leaveChat);
  fab.addEventListener("click", openPanel);
  $("chatClose").addEventListener("click", closePanel);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen) {
      if (selecting) exitSelect();
      else closePanel();
    }
  });

  joinButton.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const code = codeInput.value.trim();

    if (!name) {
      setStatus("Enter your name.", true);
      return;
    }
    let room = unlockedRoom();

    if (!room) {
      if (!code) {
        setStatus("Enter the passcode.", true);
        return;
      }
      if ((await gateHash(code)) !== GATE_HASH) {
        setStatus("Wrong passcode.", true);
        codeInput.value = "";
        return;
      }
      room = await hashRoom(code);
    }

    profile = { name, room, seen: 0, gate: true };
    saveProfile();
    lastId = 0;
    unread = 0;
    shown.clear();
    msgsEl.innerHTML = "";
    codeInput.value = "";
    showChat();
    await poll();
    textInput.focus({ preventScroll: true });
  });

  /* ---------- messages ---------- */

  function nearBottom() {
    return msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 80;
  }

  function scrollDown(force) {
    if (force || nearBottom()) msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function isMine(message) {
    return profile && message.sender.toLowerCase() === profile.name.toLowerCase();
  }

  function addMessage(message) {
    if (shown.has(message.id)) return;
    shown.add(message.id);

    const mine = isMine(message);
    const row = document.createElement("div");
    row.className = `chat-msg ${mine ? "mine" : "theirs"}`;
    row.dataset.id = String(message.id);

    const who = document.createElement("span");
    who.className = "chat-who";
    who.textContent = mine ? "You" : message.sender;

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";

    if (message.kind === "voice") {
      const player = document.createElement("audio");
      player.controls = true;
      player.preload = "none";
      player.src = `${cfg.url}/storage/v1/object/public/voice/${message.audio_path}`;
      // Pause the jukebox while a voice note plays
      player.addEventListener("play", () => musicAudio && musicAudio.pause());
      bubble.appendChild(player);
    } else {
      bubble.textContent = message.body;
    }

    const time = document.createElement("span");
    time.className = "chat-time";
    const when = new Date(message.created_at);
    time.textContent = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (message.kind === "voice" && Number(message.body)) {
      time.textContent += `  ·  ${clock(Number(message.body))}`;
    }

    row.append(who, bubble, time);
    msgsEl.appendChild(row);
  }

  async function poll() {
    if (!configured || !profile || polling || document.hidden) return;
    polling = true;

    try {
      const rows = (await rpc("get_messages", { p_room: profile.room, p_after: lastId })) || [];
      const stick = nearBottom() || shown.size === 0;

      for (const message of rows) {
        addMessage(message);
        lastId = Math.max(lastId, message.id);

        if (!isOpen && !isMine(message) && message.id > (profile.seen || 0)) unread++;
      }

      if (isOpen) {
        await reconcile();
        profile.seen = lastId;
        saveProfile();
        unread = 0;
        if (rows.length) scrollDown(stick);
        setStatus(`You are ${profile.name}`);
        if (!shown.size && !msgsEl.querySelector(".chat-empty")) showEmptyHint();
        if (shown.size) hideEmptyHint();
      }
      updateBadge();
    } catch (error) {
      console.error(error);
      if (isOpen) setStatus("Can't reach the chat. Retrying…", true);
    } finally {
      polling = false;
    }
  }

  function removeMessage(id) {
    shown.delete(id);
    selected.delete(id);
    const row = msgsEl.querySelector(`[data-id="${id}"]`);
    if (row) row.remove();
    if (!shown.size && !msgsEl.querySelector(".chat-empty")) showEmptyHint();
  }

  // Removes messages the other person deleted. Silently skipped if the
  // list_message_ids function has not been added to the database yet.
  async function reconcile() {
    if (!shown.size) return;
    try {
      const ids = await rpc("list_message_ids", { p_room: profile.room });
      if (!Array.isArray(ids)) return;

      const live = new Set(ids.map(Number));
      const oldestLive = ids.length ? Math.min(...live) : Infinity;
      const complete = ids.length < 200;

      for (const id of [...shown]) {
        if (!live.has(id) && (complete || id >= oldestLive)) removeMessage(id);
      }
      if (selecting) refreshSelection();
    } catch (error) {
      /* database not updated yet: deletions just won't sync live */
    }
  }

  /* ---------- select and delete ---------- */

  function refreshSelection() {
    msgsEl.querySelectorAll(".chat-msg").forEach((row) => {
      row.classList.toggle("selected", selected.has(Number(row.dataset.id)));
    });
    selDelete.textContent = `Delete (${selected.size})`;
    selDelete.disabled = selected.size === 0 || deleting;
    selAll.textContent = selected.size && selected.size === shown.size ? "Clear" : "Select all";
    if (selecting) setStatus(`${selected.size} selected`);
  }

  function enterSelect(firstId) {
    if (!profile || selecting) return;
    if (recorder) stopRecording(false);

    selecting = true;
    selected.clear();
    if (firstId) selected.add(firstId);

    msgsEl.classList.add("selecting");
    inputRow.style.display = "none";
    selectBar.classList.add("on");
    $("chatSelect").style.display = "none";
    refreshSelection();
  }

  function exitSelect() {
    if (!selecting) return;
    selecting = false;
    selected.clear();

    msgsEl.classList.remove("selecting");
    selectBar.classList.remove("on");
    if (profile) {
      inputRow.style.display = "flex";
      $("chatSelect").style.display = "";
      setStatus(`You are ${profile.name}`);
    }
    refreshSelection();
  }

  function toggleSelected(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    refreshSelection();
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (!ids.length || deleting || !profile) return;

    const many = ids.length > 1 ? "messages" : "message";
    if (!window.confirm(`Delete ${ids.length} ${many} for everyone? This can't be undone.`)) return;

    deleting = true;
    refreshSelection();
    setStatus("Deleting…");

    try {
      await rpc("delete_messages", { p_room: profile.room, p_ids: ids });
      ids.forEach(removeMessage);
      deleting = false;
      exitSelect();
    } catch (error) {
      console.error(error);
      deleting = false;
      refreshSelection();
      setStatus("Couldn't delete. Add the new database function first.", true);
    }
  }

  $("chatSelect").addEventListener("click", () => enterSelect());
  $("selCancel").addEventListener("click", exitSelect);
  selDelete.addEventListener("click", deleteSelected);
  selAll.addEventListener("click", () => {
    const rows = [...msgsEl.querySelectorAll(".chat-msg")].map((row) => Number(row.dataset.id));
    if (selected.size === rows.length) selected.clear();
    else rows.forEach((id) => selected.add(id));
    refreshSelection();
  });

  // Tap a message to tick it while selecting.
  msgsEl.addEventListener("click", (event) => {
    if (!selecting || Date.now() < ignoreClickUntil) return;
    const row = event.target.closest(".chat-msg");
    if (!row) return;
    event.preventDefault();
    toggleSelected(Number(row.dataset.id));
  });

  // Press and hold a message to start selecting.
  let pressTimer = null;
  let pressX = 0;
  let pressY = 0;

  msgsEl.addEventListener("pointerdown", (event) => {
    if (selecting || event.target.closest("audio")) return;
    const row = event.target.closest(".chat-msg");
    if (!row) return;

    pressX = event.clientX;
    pressY = event.clientY;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      ignoreClickUntil = Date.now() + 600;
      enterSelect(Number(row.dataset.id));
      if (navigator.vibrate) navigator.vibrate(15);
    }, 500);
  });

  msgsEl.addEventListener("pointermove", (event) => {
    if (pressTimer && Math.hypot(event.clientX - pressX, event.clientY - pressY) > 10) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
    msgsEl.addEventListener(type, () => {
      clearTimeout(pressTimer);
      pressTimer = null;
    });
  });

  function showEmptyHint() {
    const hint = document.createElement("div");
    hint.className = "chat-empty";
    hint.textContent = "No messages yet. Say hello, or hold on and record a voice note.";
    msgsEl.appendChild(hint);
  }

  function hideEmptyHint() {
    const hint = msgsEl.querySelector(".chat-empty");
    if (hint) hint.remove();
  }

  function schedule() {
    clearTimeout(pollTimer);
    if (!configured || !profile) return;
    pollTimer = setTimeout(async () => {
      await poll();
      schedule();
    }, isOpen ? 2500 : 10000);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) poll();
  });

  /* ---------- sending text ---------- */

  async function sendText() {
    const text = textInput.value.trim();
    if (!text || sending || !profile) return;
    sending = true;

    try {
      await rpc("send_message", {
        p_room: profile.room,
        p_sender: profile.name,
        p_kind: "text",
        p_body: text,
        p_audio_path: null
      });
      textInput.value = "";
      await poll();
      scrollDown(true);
    } catch (error) {
      console.error(error);
      setStatus("Couldn't send. Check your connection and try again.", true);
    } finally {
      sending = false;
    }
  }

  $("chatSend").addEventListener("click", sendText);
  textInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendText();
    }
  });

  /* ---------- voice notes ---------- */

  const TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

  async function startRecording() {
    if (recorder || !profile) return;

    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder)) {
      setStatus("This browser can't record voice notes.", true);
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setStatus("Allow microphone access to record.", true);
      return;
    }

    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || "";
    const chunks = [];
    recCancelled = false;

    recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
    const activeRecorder = recorder;

    activeRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    };

    activeRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      clearInterval(recTick);
      recBar.classList.remove("on");
      inputRow.style.display = "flex";

      const seconds = Math.round((Date.now() - recStart) / 1000);
      const mime = (activeRecorder.mimeType || type || "audio/webm").split(";")[0];
      recorder = null;

      if (recCancelled || seconds < 1 || !chunks.length) return;
      await sendVoice(new Blob(chunks, { type: mime }), mime, seconds);
    };

    activeRecorder.start();
    recStart = Date.now();
    recTime.textContent = "0:00";
    inputRow.style.display = "none";
    recBar.classList.add("on");

    recTick = setInterval(() => {
      const elapsed = (Date.now() - recStart) / 1000;
      recTime.textContent = clock(elapsed);
      if (elapsed >= MAX_SECONDS) stopRecording(true);
    }, 250);
  }

  function stopRecording(send) {
    if (!recorder) return;
    recCancelled = !send;
    if (recorder.state !== "inactive") recorder.stop();
  }

  async function sendVoice(blob, mime, seconds) {
    if (!profile) return;
    sending = true;
    setStatus("Sending voice note…");

    const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    const path = `${profile.room}/${Date.now()}-${randomId()}.${ext}`;

    try {
      const upload = await fetch(`${cfg.url}/storage/v1/object/voice/${path}`, {
        method: "POST",
        headers: headers({ "Content-Type": mime, "x-upsert": "false" }),
        body: blob
      });
      if (!upload.ok) throw new Error(await upload.text());

      await rpc("send_message", {
        p_room: profile.room,
        p_sender: profile.name,
        p_kind: "voice",
        p_body: String(seconds),
        p_audio_path: path
      });

      setStatus(`You are ${profile.name}`);
      await poll();
      scrollDown(true);
    } catch (error) {
      console.error(error);
      setStatus("Couldn't send the voice note. Try again.", true);
    } finally {
      sending = false;
    }
  }

  $("chatMic").addEventListener("click", startRecording);
  $("recCancel").addEventListener("click", () => stopRecording(false));
  $("recSend").addEventListener("click", () => stopRecording(true));

  /* ---------- start-up ---------- */

  if (profile && configured) {
    poll().then(schedule);
  }
})();
