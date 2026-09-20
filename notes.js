/* SWATLOVE notes: small cards, tap one to open it full size.
   You can add text notes and photos. They are saved in this browser (IndexedDB).
   Uses dbRun() from script.js. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const row = $("notesRow");
  const dialog = $("noteDialog");
  const view = $("noteView");

  const modal = $("noteModal");
  const segText = $("segText");
  const segPhoto = $("segPhoto");
  const titleInput = $("noteTitle");
  const textField = $("noteTextField");
  const photoField = $("notePhotoField");
  const textInput = $("noteText");
  const photoInput = $("notePhotoFile");
  const photoName = $("notePhotoName");
  const errorEl = $("noteError");
  const saveButton = $("saveNote");

  // The handwritten letter that ships with the site. It can't be deleted from the app.
  const LETTER = {
    id: "letter",
    builtin: true,
    type: "photo",
    title: "The letter",
    url: "assets/note.jpg"
  };

  const COLORS = [
    ["#4a44ff", "#8a5cff"],
    ["#ff7a6b", "#ff4f8b"],
    ["#0fa3b1", "#4a44ff"],
    ["#e08a3c", "#ff5f6d"]
  ];

  let userNotes = [];
  let mode = "text";
  let saving = false;

  /* ---------- storage ---------- */

  async function loadNotes() {
    try {
      const records = await dbRun("notes", "readonly", (store) => store.getAll());
      userNotes.forEach((note) => note.url && URL.revokeObjectURL(note.url));
      userNotes = records
        .sort((a, b) => b.created - a.created)
        .map((record) => ({
          ...record,
          url: record.image ? URL.createObjectURL(record.image) : null
        }));
    } catch (error) {
      console.error("Notes storage is unavailable", error);
      userNotes = [];
    }
    render();
  }

  /* ---------- small cards ---------- */

  function makeCard(note, index) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `note-card ${note.type === "text" ? "text" : "photo"}`;
    card.setAttribute("aria-label", `Open ${note.title || "note"}`);

    if (note.type === "text") {
      const [c1, c2] = COLORS[index % COLORS.length];
      card.style.setProperty("--c1", c1);
      card.style.setProperty("--c2", c2);

      const title = document.createElement("strong");
      title.textContent = note.title || "Note";
      const snippet = document.createElement("span");
      snippet.textContent = note.text;
      card.append(title, snippet);
    } else {
      const image = document.createElement("img");
      image.src = note.url;
      image.alt = "";
      image.loading = "lazy";
      card.appendChild(image);

      if (note.title) {
        const tag = document.createElement("span");
        tag.className = "note-tag";
        tag.textContent = note.title;
        card.appendChild(tag);
      }
    }

    card.addEventListener("click", () => openNote(note));
    return card;
  }

  function render() {
    row.replaceChildren(makeCard(LETTER, 0), ...userNotes.map((note, i) => makeCard(note, i)));
  }

  /* ---------- one note open at a time ---------- */

  function openNote(note) {
    view.replaceChildren();

    const scroll = document.createElement("div");
    scroll.className = "note-scroll";

    if (note.type === "text") {
      const body = document.createElement("div");
      body.className = "note-body";

      const heading = document.createElement("h2");
      heading.textContent = note.title || "Note";
      const paragraph = document.createElement("p");
      paragraph.textContent = note.text;
      body.append(heading, paragraph);

      if (note.created) {
        const date = document.createElement("span");
        date.className = "note-date";
        date.textContent = new Date(note.created).toLocaleDateString([], {
          day: "numeric",
          month: "long",
          year: "numeric"
        });
        body.appendChild(date);
      }
      scroll.appendChild(body);
    } else {
      const image = document.createElement("img");
      image.src = note.url;
      image.alt = note.title || "Photo";
      scroll.appendChild(image);

      if (note.title && !note.builtin) {
        const caption = document.createElement("p");
        caption.className = "note-caption";
        caption.textContent = note.title;
        scroll.appendChild(caption);
      }
    }

    const actions = document.createElement("div");
    actions.className = "note-actions";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "ghost-button";
    close.textContent = "Close";
    close.addEventListener("click", () => dialog.close());
    actions.appendChild(close);

    if (!note.builtin) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ghost-button danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteNote(note));
      actions.appendChild(remove);
    }

    view.append(scroll, actions);

    if (typeof dialog.showModal === "function") dialog.showModal();
    else window.open(note.url || "assets/note.jpg", "_blank");
  }

  async function deleteNote(note) {
    if (!window.confirm("Delete this from your notes?")) return;

    try {
      await dbRun("notes", "readwrite", (store) => store.delete(note.id));
    } catch (error) {
      console.error(error);
      return;
    }
    dialog.close();
    await loadNotes();
  }

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  /* ---------- add note or photo ---------- */

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function setMode(next) {
    mode = next;
    segText.classList.toggle("on", mode === "text");
    segPhoto.classList.toggle("on", mode === "photo");
    textField.style.display = mode === "text" ? "" : "none";
    photoField.style.display = mode === "photo" ? "" : "none";
    titleInput.placeholder = mode === "text" ? "Title (optional)" : "Caption (optional)";
    showError("");
  }

  function openModal() {
    setMode("text");
    modal.classList.add("open");
  }

  function closeModal() {
    modal.classList.remove("open");
  }

  function resetForm() {
    titleInput.value = "";
    textInput.value = "";
    photoInput.value = "";
    photoName.textContent = "JPG, PNG, HEIC";
    showError("");
  }

  $("openNoteAdd").addEventListener("click", openModal);
  $("closeNoteAdd").addEventListener("click", closeModal);
  segText.addEventListener("click", () => setMode("text"));
  segPhoto.addEventListener("click", () => setMode("photo"));

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  photoInput.addEventListener("change", () => {
    if (photoInput.files[0]) photoName.textContent = photoInput.files[0].name;
  });

  saveButton.addEventListener("click", async () => {
    if (saving) return;

    const title = titleInput.value.trim();
    const record = { title, created: Date.now() };

    if (mode === "text") {
      const text = textInput.value.trim();
      if (!text) {
        showError("Write something first.");
        return;
      }
      record.type = "text";
      record.text = text;
    } else {
      const file = photoInput.files[0];
      if (!file) {
        showError("Choose a photo first.");
        return;
      }
      record.type = "photo";
      record.image = file;
    }

    saving = true;
    try {
      await dbRun("notes", "readwrite", (store) => store.put(record));
    } catch (error) {
      console.error(error);
      showError("Couldn't save in this browser. Check that storage isn't blocked or full.");
      saving = false;
      return;
    }
    saving = false;

    resetForm();
    closeModal();
    await loadNotes();
    row.scrollTo({ left: 0, behavior: "smooth" });
  });

  /* ---------- start-up ---------- */

  render();
  loadNotes();
})();
