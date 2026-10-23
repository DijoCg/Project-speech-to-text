const $ = (id) => document.getElementById(id);
const transcript = $("transcript");
const language = $("language");
const recordBtn = $("recordBtn");
const recognitionAvailable =
  "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
let recognition = null,
  isRecording = false,
  finalTranscript = "",
  editingId = null,
  sessions = [];

function setMessage(text, isError = false) {
  const el = $("message");
  el.textContent = text;
  el.classList.toggle("error", isError);
}
function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function prettyDate(value) {
  try {
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function makeRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const r = new SpeechRecognition();
  r.continuous = true;
  r.interimResults = true;
  r.lang = language.value;
  r.onstart = () => {
    isRecording = true;
    $("liveBadge").textContent = "Listening";
    $("liveBadge").classList.add("recording");
    $("micHalo").classList.add("active");
    $("recordHint").textContent = "Listening… speak naturally";
    recordBtn.setAttribute("aria-label", "Stop recording");
    recordBtn.innerHTML =
      '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"></rect></svg>';
    setMessage("");
  };
  r.onresult = (event) => {
    let interim = "";
    finalTranscript = "";
    for (let i = 0; i < event.results.length; i++) {
      const part = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += part + " ";
      else interim += part;
    }
    transcript.value =
      (transcript.dataset.base || "") + finalTranscript + interim;
  };
  r.onerror = (event) => {
    const messages = {
      "not-allowed":
        "Microphone permission was denied. Allow microphone access in your browser settings.",
      "no-speech": "No speech detected. Try speaking closer to the microphone.",
      "audio-capture": "No microphone was found.",
    };
    setMessage(
      messages[event.error] || `Speech recognition error: ${event.error}`,
      true,
    );
  };
  r.onend = () => {
    isRecording = false;
    $("liveBadge").textContent = "Ready";
    $("liveBadge").classList.remove("recording");
    $("micHalo").classList.remove("active");
    $("recordHint").textContent = "Tap the microphone to start";
    recordBtn.setAttribute("aria-label", "Start recording");
    recordBtn.innerHTML =
      '<svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="13" rx="3"></rect><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"></path></svg>';
    transcript.dataset.base = transcript.value;
  };
  return r;
}

recordBtn.addEventListener("click", () => {
  if (!recognitionAvailable) {
    setMessage(
      "Speech recognition is not supported in this browser. Try the latest Chrome or Edge over HTTPS.",
      true,
    );
    return;
  }
  if (isRecording) {
    recognition.stop();
    return;
  }
  transcript.dataset.base = transcript.value
    ? transcript.value.trimEnd() + " "
    : "";
  recognition = makeRecognition();
  if (!recognition) return;
  try {
    recognition.start();
  } catch (e) {
    setMessage("Could not start recognition. Please try again.", true);
  }
});

language.addEventListener("change", () => {
  if (isRecording) {
    recognition.stop();
    setTimeout(() => {
      recognition = makeRecognition();
      try {
        recognition.start();
      } catch {}
    }, 250);
  }
});

$("clearBtn").addEventListener("click", () => {
  transcript.value = "";
  transcript.dataset.base = "";
  setMessage("Text cleared.");
});

$("saveBtn").addEventListener("click", async () => {
  const text = transcript.value.trim();
  if (!text) {
    setMessage("Speak or enter some text before saving.", true);
    return;
  }

  $("saveBtn").disabled = true;
  try {
    const res = await fetch("/api/transcriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: $("titleInput").value.trim() || "Untitled transcription",
        text,
        language: language.value,
      }),
    });
    if (!res.ok) throw new Error(await responseError(res));
    const item = await res.json();
    setMessage("Transcription saved successfully.");
    await loadHistory();
    selectSession(item.id);
  } catch (e) {
    setMessage(`Could not save: ${e.message}`, true);
  } finally {
    $("saveBtn").disabled = false;
  }
});
async function responseError(res) {
  try {
    const d = await res.json();
    return d.detail || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
async function loadHistory() {
  try {
    const q = $("searchInput").value.trim();
    const res = await fetch(
      "/api/transcriptions" + (q ? "?q=" + encodeURIComponent(q) : ""),
    );
    if (!res.ok) throw new Error("API request failed");
    sessions = await res.json();
    renderHistory();
  } catch {
    $("history").innerHTML =
      '<div class="empty"><span>!</span><b>Could not load sessions</b><p>Check that the API server is running.</p></div>';
  }
}
function renderHistory() {
  $("count").textContent = sessions.length;
  if (!sessions.length) {
    $("history").innerHTML =
      '<div class="empty"><span>◷</span><b>No sessions found</b><p>Save a transcription to see it here.</p></div>';
    return;
  }
  $("history").innerHTML = sessions
    .map(
      (s) =>
        `<article class="history-item" data-id="${s.id}"><div class="history-item-head"><div><h3>${escapeHtml(s.title)}</h3><div class="history-meta">${escapeHtml(s.language)} · ${escapeHtml(prettyDate(s.created_at))}</div></div></div><p class="history-preview">${escapeHtml(s.text)}</p><div class="item-actions"><button data-action="load" data-id="${s.id}">Open</button><button data-action="edit" data-id="${s.id}">Edit</button><button data-action="delete" data-id="${s.id}" class="delete">Delete</button></div></article>`,
    )
    .join("");
}
function selectSession(id) {
  const item = sessions.find((s) => s.id === id);
  if (!item) return;
  document
    .querySelectorAll(".history-item")
    .forEach((el) =>
      el.classList.toggle("selected", Number(el.dataset.id) === id),
    );
}
$("history").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = Number(btn.dataset.id),
    action = btn.dataset.action,
    item = sessions.find((s) => s.id === id);
  if (!item) return;
  if (action === "load") {
    $("titleInput").value = item.title;
    transcript.value = item.text;
    language.value = item.language;
    transcript.dataset.base = item.text;
    selectSession(id);
    setMessage("Session loaded into the editor.");
  }
  if (action === "edit") {
    editingId = id;
    $("editId").value = id;
    $("editTitle").value = item.title;
    $("editText").value = item.text;
    $("editDialog").showModal();
  }
  if (action === "delete") {
    if (!confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/transcriptions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await responseError(res));
      await loadHistory();
      setMessage("Transcription deleted.");
    } catch (err) {
      setMessage(`Delete failed: ${err.message}`, true);
    }
  }
});
$("editForm").addEventListener("submit", async (e) => {
  if (e.submitter && e.submitter.value === "cancel") return;
  e.preventDefault();
  const id = Number($("editId").value);
  try {
    const res = await fetch(`/api/transcriptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: $("editTitle").value.trim() || "Untitled transcription",
        text: $("editText").value.trim(),
      }),
    });
    if (!res.ok) throw new Error(await responseError(res));
    $("editDialog").close();
    await loadHistory();
    setMessage("Transcription updated.");
  } catch (err) {
    alert(`Update failed: ${err.message}`);
  }
});
$("refreshBtn").addEventListener("click", loadHistory);
let searchTimer;
$("searchInput").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadHistory, 250);
});
if (!recognitionAvailable) {
  $("recordHint").textContent = "Speech recognition needs a supported browser";
  setMessage(
    "For live microphone transcription, open this app in Chrome or Edge.",
    true,
  );
}
loadHistory();
