const $ = (id) => document.getElementById(id);

const audio = $("audio");
const play = $("play");
const startButton = $("startButton");
const previous = $("previous");
const next = $("next");
const shuffle = $("shuffleButton");
const heart = $("heartButton");
const progress = $("progress");
const volume = $("volume");
const currentTime = $("currentTime");
const totalTime = $("totalTime");
const songTitle = $("songTitle");
const artistName = $("artistName");
const coverImage = $("coverImage");
const playlist = $("playlist");
const trackCount = $("trackCount");
const playerCard = $("playerCard");
const background = $("background");

const modal = $("uploadModal");
const openUpload = $("openUpload");
const closeUpload = $("closeUpload");
const addSong = $("addSong");
const formError = $("formError");

const audioFile = $("audioFile");
const coverFile = $("coverFile");
const backgroundFile = $("backgroundFile");
const audioName = $("audioName");
const coverName = $("coverName");
const backgroundName = $("backgroundName");
const titleInput = $("titleInput");
const artistInput = $("artistInput");


const DEFAULT_COVER = "assets/swat.jpg";
const DEFAULT_TITLE = "Nothing playing";
const DEFAULT_ARTIST = "Add a song to begin";

let songs = [];
let currentIndex = -1;

audio.volume = 0.8;

/* ---------- storage (IndexedDB) ----------
   Blob URLs die on refresh, so the files themselves are stored in the
   browser. Everything stays on this device; nothing is uploaded. */

let dbPromise;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("swatlove", 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("songs")) {
          db.createObjectStore("songs", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }
        if (!db.objectStoreNames.contains("notes")) {
          db.createObjectStore("notes", { keyPath: "id", autoIncrement: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function dbRun(storeName, mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

const dbAll = () => dbRun("songs", "readonly", (s) => s.getAll());
const dbPut = (record) => dbRun("songs", "readwrite", (s) => s.put(record));
const dbDelete = (id) => dbRun("songs", "readwrite", (s) => s.delete(id));
const settingGet = (key) => dbRun("settings", "readonly", (s) => s.get(key));
const settingSet = (key, value) =>
  dbRun("settings", "readwrite", (s) => s.put(value, key));

/* ---------- helpers ---------- */

function timeFormat(value) {
  if (!value || Number.isNaN(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function fromLibrary(entry) {
  return {
    id: `library:${entry.file}`,
    title: entry.title || entry.file.replace(/\.[^/.]+$/, ""),
    artist: entry.artist || "SWATLOVE Collection",
    fav: readFav(`library:${entry.file}`),
    record: null,
    builtin: true,
    audioUrl: `songs/${encodeURIComponent(entry.file)}`,
    coverUrl: entry.cover ? `songs/${encodeURIComponent(entry.cover)}` : DEFAULT_COVER
  };
}

const HIDDEN_KEY = "hiddenLibrary";

function getHidden() {
  try {
    const list = JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function setHidden(list) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(list));
  } catch (error) {
    /* ignore */
  }
}

const restoreButton = document.createElement("button");
restoreButton.type = "button";
restoreButton.textContent = "Restore removed songs";
restoreButton.hidden = true;
restoreButton.style.cssText =
  "margin-top:14px;padding:0;background:none;color:var(--blue);font-size:12px;text-decoration:underline;";
playlist.before(restoreButton);

function updateRestore() {
  restoreButton.hidden = getHidden().length === 0;
}

restoreButton.addEventListener("click", () => {
  setHidden([]);
  location.reload();
});

function readFav(key) {
  try {
    return localStorage.getItem(`fav:${key}`) === "1";
  } catch (error) {
    return false;
  }
}

function writeFav(key, on) {
  try {
    localStorage.setItem(`fav:${key}`, on ? "1" : "0");
  } catch (error) {
    /* ignore */
  }
}

function fromRecord(record) {
  return {
    id: record.id,
    title: record.title,
    artist: record.artist,
    fav: Boolean(record.fav),
    record,
    audioUrl: URL.createObjectURL(record.audio),
    coverUrl: record.cover ? URL.createObjectURL(record.cover) : DEFAULT_COVER
  };
}

function setBackground(blob) {
  background.style.backgroundImage = `url("${URL.createObjectURL(blob)}")`;
  background.style.opacity = "1";
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = !message;
}

function resetPlayerView() {
  songTitle.textContent = DEFAULT_TITLE;
  artistName.textContent = DEFAULT_ARTIST;
  coverImage.src = DEFAULT_COVER;
  progress.value = 0;
  currentTime.textContent = "0:00";
  totalTime.textContent = "0:00";
  heart.setAttribute("aria-pressed", "false");
  heart.textContent = "♡";
}

/* ---------- playlist ---------- */

function renderPlaylist() {
  trackCount.textContent = `${songs.length} ${songs.length === 1 ? "track" : "tracks"}`;

  if (!songs.length) {
    playlist.innerHTML = `
      <div class="empty">
        <div>♫</div>
        <p>Your playlist is empty</p>
        <span>Add a song to start your collection.</span>
      </div>`;
    return;
  }

  playlist.innerHTML = songs
    .map(
      (song, index) => `
        <div class="song ${index === currentIndex ? "active" : ""}"
             data-index="${index}" tabindex="0" role="button"
             aria-label="Play ${escapeHTML(song.title)}">
          <img src="${song.coverUrl}" alt="" />
          <div class="song-info">
            <strong>${escapeHTML(song.title)}</strong>
            <span>${escapeHTML(song.artist)}</span>
          </div>
          <button class="delete" data-delete="${index}" type="button"
                  aria-label="Remove ${escapeHTML(song.title)}">×</button>
        </div>`
    )
    .join("");
}

playlist.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete]");
  if (deleteButton) {
    event.stopPropagation();
    removeSong(Number(deleteButton.dataset.delete));
    return;
  }

  const item = event.target.closest(".song");
  if (item) {
    loadSong(Number(item.dataset.index));
    audio.play();
  }
});

playlist.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const item = event.target.closest(".song");
  if (item && event.target === item) {
    event.preventDefault();
    loadSong(Number(item.dataset.index));
    audio.play();
  }
});


/* ---------- shared songs (Supabase) ----------
   Songs added through the app are uploaded so every device that knows the
   passcode sees the same playlist. Without the database set up, songs stay
   on this device only. */

function sharedCfg() {
  const c = window.SWATLOVE_CHAT || {};
  return c.url && c.anonKey && !/YOUR-/.test(`${c.url}${c.anonKey}`) ? c : null;
}

// The room is the fingerprint saved when the passcode was entered.
function sharedRoom() {
  try {
    const unlocked = localStorage.getItem("swatlove-unlock");
    if (unlocked) return unlocked;
    const chat = JSON.parse(localStorage.getItem("swatlove-chat") || "null");
    return (chat && chat.room) || "";
  } catch (error) {
    return "";
  }
}

const sharedReady = () => Boolean(sharedCfg() && sharedRoom());

function sbHeaders(extra) {
  const key = sharedCfg().anonKey;
  const base = { apikey: key };
  if (String(key).startsWith("eyJ")) base.Authorization = `Bearer ${key}`;
  return Object.assign(base, extra || {});
}

async function sbRpc(name, args) {
  const response = await fetch(`${sharedCfg().url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: sbHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(args)
  });
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function sbUpload(path, blob, mime) {
  const response = await fetch(`${sharedCfg().url}/storage/v1/object/library/${path}`, {
    method: "POST",
    headers: sbHeaders({ "Content-Type": mime, "x-upsert": "false" }),
    body: blob
  });
  if (!response.ok) throw new Error(await response.text());
}

const sharedUrl = (path) => `${sharedCfg().url}/storage/v1/object/public/library/${path}`;

const MIME_EXT = {
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a",
  "audio/aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg",
  "audio/flac": "flac", "audio/webm": "webm",
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic"
};

const EXT_MIME = {
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav",
  ogg: "audio/ogg", flac: "audio/flac", webm: "audio/webm",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic"
};

function fileExt(blob, fallback) {
  const fromName = blob && blob.name && (blob.name.match(/\.([A-Za-z0-9]{2,5})$/) || [])[1];
  if (fromName) return fromName.toLowerCase();
  const fromType = blob && blob.type && MIME_EXT[blob.type.split(";")[0]];
  return fromType || fallback;
}

function fileMime(blob, ext, fallback) {
  const type = blob && blob.type && blob.type.split(";")[0];
  return type || EXT_MIME[ext] || fallback;
}

function randomToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromShared(row) {
  const id = `shared:${row.id}`;
  return {
    id,
    dbId: row.id,
    shared: true,
    title: row.title,
    artist: row.artist,
    fav: readFav(id),
    record: null,
    audioUrl: sharedUrl(row.audio_path),
    coverUrl: row.cover_path ? sharedUrl(row.cover_path) : DEFAULT_COVER
  };
}

// Uploads one song and lists it for everyone.
async function uploadSharedSong(audioBlob, coverBlob, title, artist) {
  const room = sharedRoom();

  const audioExt = fileExt(audioBlob, "mp3");
  const audioPath = `${room}/${Date.now()}-${randomToken()}.${audioExt}`;
  await sbUpload(audioPath, audioBlob, fileMime(audioBlob, audioExt, "audio/mpeg"));

  let coverPath = null;
  if (coverBlob) {
    const coverExt = fileExt(coverBlob, "jpg");
    coverPath = `${room}/${Date.now()}-${randomToken()}-cover.${coverExt}`;
    await sbUpload(coverPath, coverBlob, fileMime(coverBlob, coverExt, "image/jpeg"));
  }

  await sbRpc("add_song", {
    p_room: room,
    p_title: title,
    p_artist: artist,
    p_audio_path: audioPath,
    p_cover_path: coverPath
  });
  return audioPath;
}

// Keeps this device's playlist in step with the shared list.
async function syncShared() {
  if (!sharedReady()) return false;

  let rows;
  try {
    rows = await sbRpc("list_songs", { p_room: sharedRoom() });
  } catch (error) {
    return false;
  }
  if (!Array.isArray(rows)) return false;

  const current = songs[currentIndex];
  const currentId = current ? current.id : null;
  const existing = new Map(songs.filter((song) => song.shared).map((song) => [song.id, song]));
  const nextShared = rows.map((row) => existing.get(`shared:${row.id}`) || fromShared(row));

  const before = songs.filter((song) => song.shared).map((song) => song.id).join(",");
  const after = nextShared.map((song) => song.id).join(",");
  if (before === after) return false;

  songs = [
    ...songs.filter((song) => song.builtin),
    ...nextShared,
    ...songs.filter((song) => !song.builtin && !song.shared)
  ];
  currentIndex = currentId ? songs.findIndex((song) => song.id === currentId) : -1;

  if (currentId && currentIndex === -1) {
    // the song playing here was deleted on the other device
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    resetPlayerView();
  }

  renderPlaylist();
  updateShareButton();
  return true;
}

// "Share N songs from this device" moves old on-device songs to the shared list.
const shareButton = document.createElement("button");
shareButton.type = "button";
shareButton.hidden = true;
shareButton.style.cssText =
  "display:block;margin-top:14px;padding:0;background:none;color:var(--blue);font-size:12px;text-decoration:underline;";
playlist.before(shareButton);

let sharing = false;

function localOnlySongs() {
  return songs.filter((song) => !song.builtin && !song.shared);
}

function updateShareButton() {
  if (sharing) return;
  const count = localOnlySongs().length;
  shareButton.hidden = !(sharedReady() && count > 0);
  shareButton.textContent = `Share ${count} ${count === 1 ? "song" : "songs"} from this device`;
}

async function shareLocalSongs() {
  const local = localOnlySongs();
  if (!local.length || sharing) return;

  const many = local.length === 1 ? "this song" : `these ${local.length} songs`;
  if (!window.confirm(`Upload ${many} so the other device can play ${local.length === 1 ? "it" : "them"} too?`)) return;

  sharing = true;
  const playing = songs[currentIndex];
  if (playing && !playing.builtin && !playing.shared) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    currentIndex = -1;
    resetPlayerView();
  }

  try {
    for (let i = 0; i < local.length; i++) {
      shareButton.textContent = `Sharing ${i + 1} of ${local.length}…`;
      const song = local[i];

      await uploadSharedSong(song.record.audio, song.record.cover, song.title, song.artist);
      await dbDelete(song.id);

      const index = songs.indexOf(song);
      if (index !== -1) songs.splice(index, 1);
      URL.revokeObjectURL(song.audioUrl);
      if (song.coverUrl !== DEFAULT_COVER) URL.revokeObjectURL(song.coverUrl);
    }
  } catch (error) {
    console.error(error);
    window.alert("Couldn't share every song. Check your connection and that the database update was run, then try again.");
  }

  sharing = false;
  renderPlaylist();
  await syncShared();
  updateShareButton();
}

shareButton.addEventListener("click", shareLocalSongs);

function waitForConfig() {
  return new Promise((resolve) => {
    let waited = 0;
    (function check() {
      if (window.SWATLOVE_CHAT || waited >= 3000) return resolve();
      waited += 100;
      setTimeout(check, 100);
    })();
  });
}

function resetUploadForm() {
  audioFile.value = "";
  coverFile.value = "";
  backgroundFile.value = "";
  titleInput.value = "";
  artistInput.value = "";
  audioName.textContent = "MP3, WAV, OGG, M4A";
  coverName.textContent = "Image shown while the song plays";
  backgroundName.textContent = "Image shown behind the app";
}

async function addSharedSong(audioData, coverData, backgroundData) {
  const label = addSong.textContent;
  addSong.disabled = true;
  addSong.textContent = "Uploading…";
  showError("");

  try {
    const title = titleInput.value.trim() || audioData.name.replace(/\.[^/.]+$/, "");
    const artist = artistInput.value.trim() || "SWATLOVE Collection";

    const audioPath = await uploadSharedSong(audioData, coverData, title, artist);

    if (backgroundData) {
      await settingSet("background", backgroundData);
      setBackground(backgroundData);
    }

    await syncShared();
    const index = songs.findIndex((song) => song.shared && song.audioUrl.endsWith(audioPath));
    if (index !== -1) loadSong(index);

    closeModal();
    resetUploadForm();
  } catch (error) {
    console.error(error);
    showError("Couldn't upload. Check your connection and that the database update was run. Files must be under 50 MB.");
  } finally {
    addSong.disabled = false;
    addSong.textContent = label;
  }
}

/* ---------- end shared songs ---------- */

async function removeSong(index) {
  const removed = songs[index];
  if (!removed) return;

  const question = removed.shared
    ? `Delete "${removed.title}" for everyone? It disappears on both devices.`
    : `Remove "${removed.title}" from your playlist?`;
  if (!window.confirm(question)) return;

  if (removed.shared) {
    try {
      await sbRpc("delete_song", { p_room: sharedRoom(), p_id: removed.dbId });
    } catch (error) {
      console.error(error);
      window.alert("Couldn't delete this song. Check your connection and try again.");
      return;
    }
  }

  songs.splice(index, 1);

  if (removed.shared) {
    /* nothing stored on this device */
  } else if (removed.builtin) {
    // Songs stored in the GitHub repo can't be deleted from the app,
    // so they are hidden on this device. "Restore removed songs" brings them back.
    setHidden([...new Set([...getHidden(), removed.id])]);
    updateRestore();
  } else {
    URL.revokeObjectURL(removed.audioUrl);
    if (removed.coverUrl !== DEFAULT_COVER) URL.revokeObjectURL(removed.coverUrl);

    try {
      await dbDelete(removed.id);
    } catch (error) {
      console.error("Could not delete song", error);
    }
  }

  if (index === currentIndex) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    currentIndex = -1;
    resetPlayerView();
  } else if (index < currentIndex) {
    currentIndex--;
  }

  renderPlaylist();
}

function loadSong(index) {
  const song = songs[index];
  if (!song) return;

  currentIndex = index;
  audio.src = song.audioUrl;
  songTitle.textContent = song.title;
  artistName.textContent = song.artist;
  coverImage.src = song.coverUrl;
  progress.value = 0;
  currentTime.textContent = "0:00";
  totalTime.textContent = "0:00";
  updateHeart();
  updateMediaSession(song);
  renderPlaylist();
}

function updateHeart() {
  const song = songs[currentIndex];
  const on = Boolean(song && song.fav);
  heart.setAttribute("aria-pressed", String(on));
  heart.textContent = on ? "♥" : "♡";
}

heart.addEventListener("click", async () => {
  const song = songs[currentIndex];
  if (!song) return;

  song.fav = !song.fav;
  updateHeart();

  if (song.builtin || song.shared) {
    writeFav(song.id, song.fav);
    return;
  }

  song.record.fav = song.fav;

  try {
    await dbPut(song.record);
  } catch (error) {
    console.error("Could not save favourite", error);
  }
});

/* ---------- playback ---------- */

function startPlaying() {
  if (!songs.length) {
    openModal();
    return;
  }
  if (currentIndex === -1) loadSong(0);
  audio.play();
}

function togglePlay() {
  if (audio.paused) startPlaying();
  else audio.pause();
}

function nextSong() {
  if (!songs.length) return;
  loadSong(currentIndex >= songs.length - 1 ? 0 : currentIndex + 1);
  audio.play();
}

function previousSong() {
  if (!songs.length) return;
  // Like most players: restart the song first, go back only near the start.
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  loadSong(currentIndex <= 0 ? songs.length - 1 : currentIndex - 1);
  audio.play();
}

function shuffleSong() {
  if (!songs.length) {
    openModal();
    return;
  }
  let index = Math.floor(Math.random() * songs.length);
  if (songs.length > 1 && index === currentIndex) {
    index = (index + 1) % songs.length;
  }
  loadSong(index);
  audio.play();
}

play.addEventListener("click", togglePlay);
startButton.addEventListener("click", togglePlay);
next.addEventListener("click", nextSong);
previous.addEventListener("click", previousSong);
shuffle.addEventListener("click", shuffleSong);

const ICON_PLAY = '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
const ICON_PLAY_SMALL = ICON_PLAY.replace(/28/g, "20");
const ICON_PAUSE_SMALL = ICON_PAUSE.replace(/28/g, "20");

const record = $("record");

// The record always turns slowly and speeds up while music plays.
function setSpin(playing) {
  document.body.classList.toggle("is-playing", playing);
  try {
    record.getAnimations().forEach((animation) => {
      animation.playbackRate = playing ? 3 : 1;
    });
  } catch (error) {
    /* older browsers keep the constant slow spin */
  }
}

audio.addEventListener("play", () => {
  play.innerHTML = ICON_PAUSE;
  startButton.innerHTML = `${ICON_PAUSE_SMALL}<span>Pause</span>`;
  playerCard.classList.add("playing");
  setSpin(true);
});

audio.addEventListener("pause", () => {
  play.innerHTML = ICON_PLAY;
  startButton.innerHTML = `${ICON_PLAY_SMALL}<span>Start listening</span>`;
  playerCard.classList.remove("playing");
  setSpin(false);
});

audio.addEventListener("ended", nextSong);

audio.addEventListener("error", () => {
  if (audio.getAttribute("src")) {
    artistName.textContent = "This file could not be played";
  }
});

audio.addEventListener("loadedmetadata", () => {
  totalTime.textContent = timeFormat(audio.duration);
});

audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;
  progress.value = (audio.currentTime / audio.duration) * 100;
  currentTime.textContent = timeFormat(audio.currentTime);
});

progress.addEventListener("input", () => {
  if (!audio.duration) return;
  audio.currentTime = (progress.value / 100) * audio.duration;
});

volume.addEventListener("input", () => {
  audio.volume = Number(volume.value);
});

/* Lock-screen / headphone controls on phones */
function updateMediaSession(song) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artist,
    artwork: [{ src: song.coverUrl }]
  });
}

if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", () => audio.play());
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  navigator.mediaSession.setActionHandler("previoustrack", previousSong);
  navigator.mediaSession.setActionHandler("nexttrack", nextSong);
}

/* Keyboard: space = play/pause, arrows = skip 5s / change song */
document.addEventListener("keydown", (event) => {
  const tag = event.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
  if (event.target.closest && event.target.closest(".song")) return;
  if (document.querySelector(".modal.open, dialog[open]")) return;

  if (event.code === "Space") {
    event.preventDefault();
    togglePlay();
  } else if (event.code === "ArrowRight" && audio.duration) {
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
  } else if (event.code === "ArrowLeft" && audio.duration) {
    audio.currentTime = Math.max(0, audio.currentTime - 5);
  }
});

/* ---------- upload modal ---------- */

function openModal() {
  showError("");
  modal.classList.add("open");
}

function closeModal() {
  modal.classList.remove("open");
}

openUpload.addEventListener("click", openModal);
closeUpload.addEventListener("click", closeModal);

modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

audioFile.addEventListener("change", () => {
  if (audioFile.files[0]) audioName.textContent = audioFile.files[0].name;
});

coverFile.addEventListener("change", () => {
  if (coverFile.files[0]) coverName.textContent = coverFile.files[0].name;
});

backgroundFile.addEventListener("change", () => {
  if (backgroundFile.files[0]) backgroundName.textContent = backgroundFile.files[0].name;
});

addSong.addEventListener("click", async () => {
  const audioData = audioFile.files[0];
  const coverData = coverFile.files[0];
  const backgroundData = backgroundFile.files[0];

  if (!audioData) {
    showError("Choose an audio file first.");
    return;
  }

  if (sharedReady()) {
    await addSharedSong(audioData, coverData, backgroundData);
    return;
  }

  const record = {
    title: titleInput.value.trim() || audioData.name.replace(/\.[^/.]+$/, ""),
    artist: artistInput.value.trim() || "SWATLOVE Collection",
    audio: audioData,
    cover: coverData || null,
    fav: false
  };

  try {
    record.id = await dbPut(record);
    if (backgroundData) await settingSet("background", backgroundData);
  } catch (error) {
    console.error(error);
    showError("Could not save this song in the browser. Check that storage is not full or blocked.");
    return;
  }

  songs.push(fromRecord(record));
  if (backgroundData) setBackground(backgroundData);

  loadSong(songs.length - 1);
  closeModal();

  audioFile.value = "";
  coverFile.value = "";
  backgroundFile.value = "";
  titleInput.value = "";
  artistInput.value = "";
  audioName.textContent = "MP3, WAV, OGG, M4A";
  coverName.textContent = "Image shown while the song plays";
  backgroundName.textContent = "Image shown behind the app";
});

/* ---------- wordmark ---------- */

function fitWordmark() {
  const box = $("wordmark");
  const text = box && box.firstElementChild;
  if (!text) return;

  box.style.fontSize = "100px";
  const width = text.getBoundingClientRect().width;
  const target = box.clientWidth;
  if (!width || !target) return;

  box.style.fontSize = `${Math.min(Math.floor((100 * target) / width), 260)}px`;
}

fitWordmark();
window.addEventListener("resize", fitWordmark);
window.addEventListener("load", fitWordmark);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitWordmark);

/* ---------- start-up ---------- */

async function loadLibrary() {
  try {
    const response = await fetch("songs/songs.json", { cache: "no-cache" });
    if (!response.ok) return [];
    const list = await response.json();
    const hidden = getHidden();
    return Array.isArray(list)
      ? list
          .filter((item) => item && item.file)
          .map(fromLibrary)
          .filter((song) => !hidden.includes(song.id))
      : [];
  } catch (error) {
    return [];
  }
}

async function init() {
  updateRestore();
  renderPlaylist();
  const library = await loadLibrary();

  try {
    const [records, savedBackground] = await Promise.all([
      dbAll(),
      settingGet("background")
    ]);
    songs = [...library, ...records.map(fromRecord)];
    if (savedBackground) setBackground(savedBackground);
  } catch (error) {
    console.error("Storage is unavailable, songs will not be saved.", error);
    songs = library;
  }

  renderPlaylist();

  await waitForConfig();
  await syncShared();
  updateShareButton();
  setInterval(syncShared, 20000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncShared();
  });
}

init();
