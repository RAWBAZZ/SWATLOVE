/* SWATLOVE site lock.
   Shows a passcode screen first. The app scripts (music, notes, chat) are only
   loaded after the right passcode is entered. The passcode itself is not stored
   in this file, only a fingerprint of it. This is a light lock: it keeps casual
   visitors out, but it is not bank-grade security. */
(() => {
  "use strict";

  const GATE_HASH = "d2e84d32714e802608e6508605da50b0b7c0937f93d30b1a53c5d8b5633e839c";
  const FLAG = "swatlove-gate"; // remembers this device is unlocked
  const UNLOCK_KEY = "swatlove-unlock"; // chat room, used by chat.js
  const APP_SCRIPTS = ["script.js", "notes.js", "chat-config.js", "chat.js"];
  const MAX_TRIES = 5;
  const LOCK_SECONDS = 30;

  const normalise = (code) => code.trim().toLowerCase();

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function isUnlocked() {
    try {
      return localStorage.getItem(FLAG) === GATE_HASH;
    } catch (error) {
      return false;
    }
  }

  function rememberUnlock(roomHash) {
    try {
      localStorage.setItem(FLAG, GATE_HASH);
      localStorage.setItem(UNLOCK_KEY, roomHash);
    } catch (error) {
      /* private mode: the passcode will be asked again next visit */
    }
  }

  function loadScripts(list, done) {
    const src = list.shift();
    if (!src) {
      if (done) done();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => loadScripts(list, done);
    script.onerror = () => loadScripts(list, done);
    document.body.appendChild(script);
  }

  function startApp() {
    document.documentElement.classList.remove("swat-locked");
    loadScripts([...APP_SCRIPTS]);
  }

  /* ---------- hide the page until it is unlocked ---------- */

  const locked = !isUnlocked();

  if (locked) {
    document.documentElement.classList.add("swat-locked");

    const style = document.createElement("style");
    style.textContent = `
      html.swat-locked body > *:not(#swatGate) { display: none !important; }
      #swatGate { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center;
        justify-content: center; padding: 24px; color: #fff; font-family: "Manrope", system-ui, sans-serif;
        background: radial-gradient(circle at 0% 0%, #1c1a66 0, transparent 45%),
                    radial-gradient(circle at 100% 100%, #5a2320 0, transparent 42%), #06070d; }
      #swatGate .gate-box { width: min(100%, 380px); text-align: center; }
      #swatGate .gate-logo { display: grid; width: 56px; height: 56px; margin: 0 auto 18px; place-items: center;
        border-radius: 18px; font-size: 28px; background: linear-gradient(135deg, #4a44ff, #ff7a6b); }
      #swatGate h1 { margin: 0; font-family: "Anton", Impact, "Arial Narrow", sans-serif; font-size: 19vw;
        max-width: 100%; font-weight: 400; line-height: 1; letter-spacing: .01em; white-space: nowrap;
        text-transform: uppercase; background: linear-gradient(180deg, #fff 35%, #ffd9c7 100%);
        -webkit-background-clip: text; background-clip: text; color: transparent;
        -webkit-text-fill-color: transparent; }
      @media (min-width: 420px) { #swatGate h1 { font-size: 88px; } }
      #swatGate p { margin: 14px 0 22px; color: #a3a7bd; font-size: 14px; line-height: 1.5; }
      #swatGate input { width: 100%; padding: 15px; border: 1px solid rgba(255,255,255,.18); border-radius: 14px;
        outline: 0; background: rgba(255,255,255,.06); color: #fff; font: inherit; font-size: 17px; text-align: center;
        letter-spacing: 3px; }
      #swatGate input:focus-visible { outline: 2px solid #b8f2ff; outline-offset: 3px; }
      #swatGate button { width: 100%; margin-top: 12px; padding: 15px; border: 0; border-radius: 999px; color: #fff;
        cursor: pointer; font: inherit; font-weight: 800; background: linear-gradient(100deg, #4a44ff, #ff7a6b); }
      #swatGate button:disabled { opacity: .5; cursor: default; }
      #swatGate .gate-error { min-height: 20px; margin: 12px 0 0; color: #ff8fa3; font-size: 13px; }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!locked) {
      startApp();
      return;
    }

    const gate = document.createElement("div");
    gate.id = "swatGate";
    gate.innerHTML = `
      <form class="gate-box" autocomplete="off">
        <div class="gate-logo" aria-hidden="true">♡</div>
        <h1>SWATLOVE</h1>
        <p>This is a private place. Enter the passcode to continue.</p>
        <input id="gateCode" type="password" placeholder="Passcode" autocomplete="off"
               autocapitalize="off" spellcheck="false" aria-label="Passcode" />
        <button id="gateButton" type="submit">Unlock</button>
        <p class="gate-error" id="gateError" role="alert"></p>
      </form>
    `;
    document.body.appendChild(gate);

    const form = gate.querySelector("form");
    const input = gate.querySelector("#gateCode");
    const button = gate.querySelector("#gateButton");
    const error = gate.querySelector("#gateError");
    let tries = 0;

    input.focus();

    function coolDown() {
      let left = LOCK_SECONDS;
      input.disabled = true;
      button.disabled = true;
      const timer = setInterval(() => {
        left--;
        error.textContent = `Too many tries. Wait ${left}s.`;
        if (left <= 0) {
          clearInterval(timer);
          tries = 0;
          input.disabled = false;
          button.disabled = false;
          error.textContent = "";
          input.focus();
        }
      }, 1000);
      error.textContent = `Too many tries. Wait ${left}s.`;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const code = input.value;
      if (!code.trim()) return;

      if (!(window.crypto && crypto.subtle)) {
        error.textContent = "Open this page with https:// to unlock it.";
        return;
      }

      const fingerprint = await sha256(`swatlove-gate:${normalise(code)}`);

      if (fingerprint !== GATE_HASH) {
        tries++;
        input.value = "";
        if (tries >= MAX_TRIES) coolDown();
        else error.textContent = "Wrong passcode.";
        return;
      }

      rememberUnlock(await sha256(`swatlove:${normalise(code)}`));
      gate.remove();
      startApp();
    });
  });
})();

