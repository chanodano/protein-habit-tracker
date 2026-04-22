// ============================================================
// PROTEIN TRACKER BOT — Google Apps Script (Polling Version)
// Stack: Telegram Bot API + Google Sheets + Gemini API (fallback)
// Timezone: Asia/Singapore | Single user
// ============================================================

// ============================================================
// SECTION 1: CONFIGURATION — use Script Properties
// In Apps Script: Project Settings > Script Properties
// Required keys:
// - TELEGRAM_TOKEN
// - TELEGRAM_CHAT_ID
// - GEMINI_API_KEY
// - SPREADSHEET_ID
// ============================================================
const CONFIG = {
  TELEGRAM_TOKEN: PropertiesService.getScriptProperties().getProperty("TELEGRAM_TOKEN"),
  TELEGRAM_CHAT_ID: PropertiesService.getScriptProperties().getProperty("TELEGRAM_CHAT_ID"),
  GEMINI_API_KEY: PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY"),
  SPREADSHEET_ID: PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"),
  DAILY_GOAL: 150,
  TIMEZONE: "Asia/Singapore",
};

// ============================================================
// SECTION 2: FOOD REFERENCE TABLE (static lookup)
// Extend this list as needed, or use /addfood via Telegram.
// ============================================================
const FOOD_TABLE = {
  "egg": 6, "eggs": 6, "boiled egg": 6, "fried egg": 6,
  "milk": 8, "full cream milk": 8, "skim milk": 8,
  "greek yogurt": 17, "yogurt": 5, "cottage cheese": 14,
  "cheese": 7, "cheddar": 7,

  "chicken breast": 31, "chicken": 25, "chicken thigh": 20,
  "chicken wing": 18, "roast chicken": 25,
  "beef": 26, "steak": 26, "ground beef": 20,
  "pork": 22, "pork chop": 22, "bacon": 12,
  "lamb": 25, "turkey": 29,

  "salmon": 25, "tuna": 26, "tuna can": 26,
  "fish": 22, "cod": 20, "tilapia": 21,
  "shrimp": 20, "prawns": 20, "crab": 16, "squid": 15,

  "tofu": 8, "firm tofu": 10, "silken tofu": 5,
  "tempeh": 19, "edamame": 11,
  "lentils": 9, "chickpeas": 9, "black beans": 8, "kidney beans": 8,
  "peanut butter": 8, "peanuts": 7, "almonds": 6,

  "whey protein": 25, "protein shake": 25, "protein powder": 25,
  "whey shake": 25, "protein bar": 20, "quest bar": 21,
  "barebells": 20, "optimum whey": 24,

  "chicken rice": 30, "roast chicken rice": 30,
  "nasi lemak": 15, "nasi lemak with chicken": 25,
  "char kway teow": 12, "fried rice": 10, "egg fried rice": 15,
  "wonton noodle": 18, "bak kut teh": 28, "fish soup": 22,
  "laksa": 18, "prawn noodle": 20, "mee goreng": 12,
  "economy rice": 20, "mixed rice": 20,
  "yong tau foo": 18, "satay": 15,
  "roti prata": 6, "thosai": 5,
  "ban mian": 20, "minced meat noodle": 22,
  "cai png": 18, "duck rice": 25,

  "rice": 3, "noodles": 5, "bread": 4,
  "coffee": 1, "pokka coffee": 5,
};

// ============================================================
// SECTION 3: SHEET HELPERS
// ============================================================
function getSheet(name) {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(name);
}

function getSetting(key) {
  const data = getSheet("Settings").getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

function setSetting(key, value) {
  const sheet = getSheet("Settings");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function getTodayString() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
}

function getGoal() {
  const saved = getSetting("daily_goal");
  return saved ? Number(saved) : CONFIG.DAILY_GOAL;
}

function normaliseSheetDate(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, CONFIG.TIMEZONE, "yyyy-MM-dd");
  }
  return String(value).slice(0, 10);
}

// ============================================================
// SECTION 4: LOGGING TO SHEETS
// ============================================================
function logEntry(rawInput, parsedItem, proteinGrams, sourceType, mealTag) {
  const sheet = getSheet("Logs");
  const now = new Date();
  const date = Utilities.formatDate(now, CONFIG.TIMEZONE, "yyyy-MM-dd");
  const timestamp = Utilities.formatDate(now, CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
  sheet.appendRow([date, timestamp, rawInput, parsedItem, proteinGrams, sourceType, mealTag]);
  SpreadsheetApp.flush();
}

function getTodayEntries() {
  const sheet = getSheet("Logs");
  const data = sheet.getDataRange().getValues();
  const today = getTodayString();
  const entries = [];
  for (let i = 1; i < data.length; i++) {
    const rowDate = normaliseSheetDate(data[i][0]);
    if (rowDate === today) {
      entries.push({
        row: i + 1,
        date: rowDate,
        timestamp: data[i][1],
        rawInput: data[i][2],
        parsedItem: data[i][3],
        protein: Number(data[i][4]) || 0,
        sourceType: data[i][5],
        mealTag: data[i][6],
      });
    }
  }
  return entries;
}

function getTodayTotal() {
  return getTodayEntries().reduce((sum, e) => sum + (Number(e.protein) || 0), 0);
}

function undoLastEntry() {
  const sheet = getSheet("Logs");
  const data = sheet.getDataRange().getValues();
  const today = getTodayString();
  for (let i = data.length - 1; i >= 1; i--) {
    const rowDate = normaliseSheetDate(data[i][0]);
    if (rowDate === today) {
      const deleted = data[i];
      sheet.deleteRow(i + 1);
      SpreadsheetApp.flush();
      return deleted;
    }
  }
  return null;
}

// ============================================================
// SECTION 5: FOOD REFERENCE + PARSER
// ============================================================
function getFoodReferenceMap() {
  const sheet = getSheet("Food Reference");
  const data = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][0] || "").toLowerCase().trim();
    const grams = Number(data[i][1]) || 0;
    if (name && grams > 0) map[name] = grams;
  }
  return map;
}

function detectMealTag() {
  const hour = Number(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "H"));
  if (hour >= 6 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 20) return "dinner";
  return "snack";
}

function extractExplicitGrams(text) {
  const match = text.match(/(\d+(\.\d+)?)\s*(g|grams?)\b/i);
  return match ? parseFloat(match[1]) : null;
}

function staticLookup(text) {
  const lower = text.toLowerCase().trim();
  const combinedTable = { ...FOOD_TABLE, ...getFoodReferenceMap() };

  // Exact match first
  if (combinedTable[lower] !== undefined) {
    return { item: lower, protein: combinedTable[lower], confidence: "high" };
  }

  // Partial match with word boundaries only
  let bestKey = null;
  let bestLen = 0;

  for (const key of Object.keys(combinedTable)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|\\b)${escapedKey}(\\b|$)`, "i");

    if (pattern.test(lower) && key.length > bestLen) {
      bestKey = key;
      bestLen = key.length;
    }
  }

  if (bestKey) {
    const qtyMatch = lower.match(/^(\d+(\.\d+)?)/);
    const qty = qtyMatch ? parseFloat(qtyMatch[1]) : 1;

    return {
      item: bestKey,
      protein: Math.round(combinedTable[bestKey] * qty),
      confidence: qty > 1 ? "medium" : "high",
    };
  }

  return null;
}

function geminiEstimate(text) {
  try {
    if (!CONFIG.GEMINI_API_KEY) return null;

    const prompt = `You are a nutrition assistant. Estimate the total protein content in grams for this food entry: "${text}".
Reply ONLY with a JSON object in this exact format, no extra text:
{"item": "food name", "protein_grams": 20, "confidence": "high|medium|low"}
If you truly cannot estimate, return: {"item": "unknown", "protein_grams": 0, "confidence": "low"}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    const response = UrlFetchApp.fetch(url, {
      method: "POST",
      contentType: "application/json",
      payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      muteHttpExceptions: true,
    });

    const json = JSON.parse(response.getContentText());
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    Logger.log("Gemini error: " + e);
    return null;
  }
}

function parseEntry(text) {
  const trimmed = text.trim();

  const onlyNumber = trimmed.match(/^(\d+(\.\d+)?)$/);
  if (onlyNumber) {
    return { item: "direct entry", protein: parseFloat(onlyNumber[1]), sourceType: "explicit", needsConfirmation: false };
  }

  const explicitGrams = extractExplicitGrams(trimmed);
  if (explicitGrams !== null) {
    const foodPart = trimmed.replace(/(\d+(\.\d+)?)\s*(g|grams?)\b/i, "").trim();
    return { item: foodPart || "food item", protein: explicitGrams, sourceType: "explicit", needsConfirmation: false };
  }

  const staticResult = staticLookup(trimmed);
  if (staticResult && staticResult.confidence === "high") {
    return { item: staticResult.item, protein: staticResult.protein, sourceType: "estimated", needsConfirmation: false };
  }
  if (staticResult && staticResult.confidence === "medium") {
    return { item: staticResult.item, protein: staticResult.protein, sourceType: "estimated", needsConfirmation: true, suggestedGrams: staticResult.protein };
  }

  const geminiResult = geminiEstimate(trimmed);
  if (geminiResult && geminiResult.confidence !== "low" && Number(geminiResult.protein_grams) > 0) {
    return {
      item: geminiResult.item,
      protein: Number(geminiResult.protein_grams),
      sourceType: "estimated",
      needsConfirmation: geminiResult.confidence === "medium",
      suggestedGrams: Number(geminiResult.protein_grams),
    };
  }

  return { item: trimmed, protein: 0, sourceType: "unknown", needsConfirmation: true, suggestedGrams: null };
}

// ============================================================
// SECTION 6: TELEGRAM MESSAGING
// ============================================================
function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`;
  const response = UrlFetchApp.fetch(url, {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: CONFIG.TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: "HTML",
    }),
    muteHttpExceptions: true,
  });
  Logger.log("sendTelegram: " + response.getResponseCode() + " | " + response.getContentText());
}

function sendTelegramWithButtons(text, buttons) {
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`;
  const response = UrlFetchApp.fetch(url, {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: CONFIG.TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons },
    }),
    muteHttpExceptions: true,
  });
  Logger.log("sendTelegramWithButtons: " + response.getResponseCode() + " | " + response.getContentText());
}

function answerCallbackQuery(callbackQueryId, text) {
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/answerCallbackQuery`;
  UrlFetchApp.fetch(url, {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify({ callback_query_id: callbackQueryId, text: text }),
    muteHttpExceptions: true,
  });
}

// ============================================================
// SECTION 7: SUMMARY HELPERS
// ============================================================
function statusEmoji(total, goal) {
  if (total >= goal) return "🟢";
  if (total >= 120) return "🟠";
  return "🔴";
}

function formatEntryList(entries) {
  if (entries.length === 0) return "  (none logged yet)";
  return entries.map(e => `  • ${e.parsedItem} — ${e.protein}g${e.sourceType === "estimated" ? " (est.)" : ""}`).join("\n");
}

function buildSummaryText(label, entries, total, goal, includeStreaks) {
  const remaining = Math.max(0, goal - total);
  const emoji = statusEmoji(total, goal);

  let msg = `${emoji} <b>${label}</b>\n\n`;
  msg += `<b>Total protein:</b> ${total}g / ${goal}g\n`;
  msg += `<b>Status:</b> ${total >= goal ? "Green ✅" : total >= 120 ? "Orange 🟠" : "Red 🔴"}\n`;
  if (remaining > 0) msg += `<b>Still needed for ${goal}g:</b> ${remaining}g\n`;
  else msg += `<b>Goal hit! 🎉</b>\n`;
  msg += `\n<b>Logged items:</b>\n${formatEntryList(entries)}`;

  if (includeStreaks) {
    const { streak120, streak150, avg7 } = getStreaksAndAverage();
    msg += `\n\n<b>Streaks &amp; Averages</b>`;
    msg += `\n🔥 120g streak: ${streak120} day${streak120 !== 1 ? "s" : ""}`;
    msg += `\n🏆 150g streak: ${streak150} day${streak150 !== 1 ? "s" : ""}`;
    msg += `\n📊 7-day avg: ${avg7}g`;
  }

  return msg;
}

// ============================================================
// SECTION 8: STREAKS & AVERAGES
// ============================================================
function updateDailySummarySheet(date, total, goal) {
  const sheet = getSheet("Daily Summary");
  const data = sheet.getDataRange().getValues();
  const status = total >= goal ? "green" : total >= 120 ? "orange" : "red";
  const hit120 = total >= 120 ? 1 : 0;
  const hit150 = total >= goal ? 1 : 0;

  for (let i = 1; i < data.length; i++) {
    const rowDate = normaliseSheetDate(data[i][0]);
    if (rowDate === date) {
      sheet.getRange(i + 1, 2, 1, 4).setValues([[total, status, hit120, hit150]]);
      SpreadsheetApp.flush();
      return;
    }
  }

  sheet.appendRow([date, total, status, hit120, hit150]);
  SpreadsheetApp.flush();
}

function getStreaksAndAverage() {
  const sheet = getSheet("Daily Summary");
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { streak120: 0, streak150: 0, avg7: 0 };

  const rows = data.slice(1).sort((a, b) => new Date(b[0]) - new Date(a[0]));

  let streak120 = 0, streak150 = 0;
  let counting120 = true, counting150 = true;

  for (const row of rows) {
    const hit120 = Number(row[3]) === 1;
    const hit150 = Number(row[4]) === 1;
    if (counting120 && hit120) streak120++; else counting120 = false;
    if (counting150 && hit150) streak150++; else counting150 = false;
    if (!counting120 && !counting150) break;
  }

  const last7 = rows.slice(0, 7).map(r => Number(r[1]) || 0);
  const avg7 = last7.length > 0 ? Math.round(last7.reduce((s, v) => s + v, 0) / last7.length) : 0;

  return { streak120, streak150, avg7 };
}

// ============================================================
// SECTION 9: PENDING STATE
// ============================================================
function setPending(data) {
  setSetting("pending_state", JSON.stringify(data));
}

function getPending() {
  const raw = getSetting("pending_state");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function clearPending() {
  setSetting("pending_state", "");
}

// ============================================================
// SECTION 10: FOOD REFERENCE HELPERS
// ============================================================
function addFoodReference(foodName, proteinGrams, notes) {
  const sheet = getSheet("Food Reference");
  const data = sheet.getDataRange().getValues();
  const cleanName = String(foodName || "").toLowerCase().trim();
  const grams = Number(proteinGrams);

  if (!cleanName || !grams || grams <= 0) return false;

  for (let i = 1; i < data.length; i++) {
    const existingName = String(data[i][0] || "").toLowerCase().trim();
    if (existingName === cleanName) {
      sheet.getRange(i + 1, 2).setValue(grams);
      if (notes !== undefined) sheet.getRange(i + 1, 3).setValue(notes || "");
      SpreadsheetApp.flush();
      return "updated";
    }
  }

  sheet.appendRow([cleanName, grams, notes || "added via Telegram"]);
  SpreadsheetApp.flush();
  return "added";
}

// ============================================================
// SECTION 11: COMMAND HANDLERS
// ============================================================
function handleToday() {
  const entries = getTodayEntries();
  sendTelegram(buildSummaryText("Today's Log", entries, getTodayTotal(), getGoal(), false));
}

function handleSummary() {
  const entries = getTodayEntries();
  sendTelegram(buildSummaryText("Summary", entries, getTodayTotal(), getGoal(), true));
}

function handleStreak() {
  const { streak120, streak150, avg7 } = getStreaksAndAverage();
  sendTelegram(
    `<b>Streak Stats</b>\n\n` +
    `🔥 120g streak: ${streak120} day${streak120 !== 1 ? "s" : ""}\n` +
    `🏆 150g streak: ${streak150} day${streak150 !== 1 ? "s" : ""}\n` +
    `📊 7-day avg: ${avg7}g`
  );
}

function handleAverage() {
  const { avg7 } = getStreaksAndAverage();
  sendTelegram(`📊 Your 7-day average protein intake: <b>${avg7}g</b>`);
}

function handleUndo() {
  const deleted = undoLastEntry();
  if (deleted) {
    sendTelegram(`↩️ Removed last entry: <b>${deleted[3]}</b> (${deleted[4]}g)`);
  } else {
    sendTelegram("Nothing to undo for today.");
  }
}

function handleSetGoal(text) {
  const match = text.match(/\/setgoal\s+(\d+)\s*g?$/i);
  if (match) {
    const newGoal = parseInt(match[1], 10);
    setSetting("daily_goal", newGoal);
    sendTelegram(`✅ Daily protein goal updated to <b>${newGoal}g</b>.`);
  } else {
    sendTelegram("Usage: /setgoal 160\nSend your target in grams.");
  }
}

function handleAddFood(text) {
  const match = text.match(/^\/addfood\s+(.+?)\s+(\d+(\.\d+)?)\s*g?$/i);
  if (!match) {
    sendTelegram("Usage: /addfood food name grams\n\nExample:\n/addfood fairlife milk 13");
    return;
  }
  const foodName = match[1].trim().toLowerCase();
  const grams = parseFloat(match[2]);
  const result = addFoodReference(foodName, grams, "added via Telegram");
  sendTelegram(
    result === "updated"
      ? `♻️ Updated food reference: <b>${foodName}</b> — ${grams}g`
      : `✅ Added to food reference: <b>${foodName}</b> — ${grams}g`
  );
}

function handleHelp() {
  sendTelegram(
    `<b>Protein Tracker Bot</b>\n\n` +
    `Just send any food message to log protein:\n` +
    `  "2 eggs"\n  "chicken breast 30g"\n  "45g"\n\n` +
    `<b>Commands</b>\n` +
    `/today — today's log\n` +
    `/summary — full summary with streaks\n` +
    `/streak — streak stats\n` +
    `/average — 7-day average\n` +
    `/undo — remove last entry\n` +
    `/setgoal 160 — change daily goal\n` +
    `/addfood name grams — add/update food reference\n` +
    `/help — this message`
  );
}

// ============================================================
// SECTION 12: MESSAGE PROCESSING
// ============================================================
function normaliseCommand(text) {
  return text.replace(/@\S+/, "").trim();
}

function processTelegramMessage(rawText) {
  const text = normaliseCommand(rawText);
  const lower = text.toLowerCase();

  const pending = getPending();

  if (pending && !pending.pendingType) {
    if (lower === "yes" || lower === "y" || lower === "ok") {
      logEntry(pending.rawInput, pending.item, pending.suggestedGrams, "estimated", pending.mealTag);
      clearPending();
      sendTelegram(`✅ Logged: <b>${pending.item}</b> — ${pending.suggestedGrams}g\n📊 Today's total: <b>${getTodayTotal()}g</b>`);
      return;
    }
    const numMatch = text.match(/^(\d+(\.\d+)?)\s*(g|grams?)?$/i);
    if (numMatch) {
      const grams = parseFloat(numMatch[1]);
      logEntry(pending.rawInput, pending.item, grams, "manual override", pending.mealTag);
      clearPending();
      sendTelegram(`✅ Logged: <b>${pending.item}</b> — ${grams}g\n📊 Today's total: <b>${getTodayTotal()}g</b>`);
      return;
    }
    if (lower === "no" || lower === "n" || lower === "cancel" || lower === "skip") {
      clearPending();
      sendTelegram("Entry skipped. Nothing logged.");
      return;
    }
    sendTelegram("Please reply <b>yes</b>, send a number of grams, or <b>no</b> to skip.");
    return;
  }

  if (pending && pending.pendingType === "unknown_food") {
    const numMatch = text.match(/^(\d+(\.\d+)?)\s*(g|grams?)?$/i);
    if (numMatch) {
      const grams = parseFloat(numMatch[1]);
      logEntry(pending.rawInput, pending.item, grams, "manual override", pending.mealTag);
      setPending({ item: pending.item, grams: grams, pendingType: "save_food_reference" });
      sendTelegramWithButtons(
        `✅ Logged: <b>${pending.item}</b> — ${grams}g\n📊 Today's total: <b>${getTodayTotal()}g</b>\n\nSave <b>${pending.item}</b> to your food list for next time?`,
        [[
          { text: "✅ Save to food list", callback_data: "save_food_reference" },
          { text: "❌ Just this once", callback_data: "skip_save_food_reference" },
        ]]
      );
      return;
    }
    if (lower === "no" || lower === "n" || lower === "cancel" || lower === "skip") {
      clearPending();
      sendTelegram("Entry skipped. Nothing logged.");
      return;
    }
    sendTelegram("Please send a number of grams, or <b>no</b> to skip.");
    return;
  }

  // User typed a new message instead of pressing the save/skip buttons.
  // Per your choice: silently clear old pending and process the new message.
  if (pending && pending.pendingType === "save_food_reference") {
    clearPending();
  }

  if (text.startsWith("/start")) {
    sendTelegram("👋 <b>Protein Tracker Bot</b>\n\nSend me what you ate — like '2 eggs' or '30g protein shake' — and I'll track your protein intake.\n\nSend /help to see all commands.");
    return;
  }
  if (text.startsWith("/help"))    { handleHelp(); return; }
  if (text.startsWith("/today"))   { handleToday(); return; }
  if (text.startsWith("/summary")) { handleSummary(); return; }
  if (text.startsWith("/streak"))  { handleStreak(); return; }
  if (text.startsWith("/average")) { handleAverage(); return; }
  if (text.startsWith("/undo"))    { handleUndo(); return; }
  if (text.startsWith("/setgoal")) { handleSetGoal(text); return; }
  if (text.startsWith("/addfood")) { handleAddFood(text); return; }

  const parsed = parseEntry(text);
  const mealTag = detectMealTag();

  if (!parsed.needsConfirmation) {
    logEntry(text, parsed.item, parsed.protein, parsed.sourceType, mealTag);
    sendTelegram(`✅ Logged: <b>${parsed.item}</b> — ${parsed.protein}g\n📊 Today's total: <b>${getTodayTotal()}g</b>`);
    return;
  }

  if (parsed.suggestedGrams !== null) {
    setPending({ rawInput: text, item: parsed.item, suggestedGrams: parsed.suggestedGrams, mealTag });
    sendTelegramWithButtons(
      `🤔 I estimate <b>${parsed.item}</b> has about <b>${parsed.suggestedGrams}g</b> protein.`,
      [[
        { text: `✅ Confirm ${parsed.suggestedGrams}g`, callback_data: "confirm_pending" },
        { text: "❌ Skip", callback_data: "skip_pending" },
      ]]
    );
    return;
  }

  setPending({ rawInput: text, item: parsed.item, suggestedGrams: null, mealTag, pendingType: "unknown_food" });
  sendTelegram(`🤔 I don't know "<b>${parsed.item}</b>" yet.\nHow many grams of protein should I log? Send a number, or <b>no</b> to skip.`);
}

// ============================================================
// SECTION 13: CALLBACK HANDLER
// ============================================================
function handleCallbackQuery(callbackQuery) {
  const chatId = String(callbackQuery.message.chat.id);
  if (chatId !== String(CONFIG.TELEGRAM_CHAT_ID)) return;

  const data = callbackQuery.data;
  const pending = getPending();

  if (!pending) {
    answerCallbackQuery(callbackQuery.id, "No pending entry found.");
    return;
  }

  if (data === "confirm_pending") {
    logEntry(pending.rawInput, pending.item, pending.suggestedGrams, "estimated", pending.mealTag);
    clearPending();
    answerCallbackQuery(callbackQuery.id, "Logged.");
    sendTelegram(`✅ Logged: <b>${pending.item}</b> — ${pending.suggestedGrams}g\n📊 Today's total: <b>${getTodayTotal()}g</b>`);
    return;
  }

  if (data === "skip_pending") {
    clearPending();
    answerCallbackQuery(callbackQuery.id, "Skipped.");
    sendTelegram("Entry skipped. Nothing logged.");
    return;
  }

  if (data === "save_food_reference") {
    const result = addFoodReference(pending.item, pending.grams, "added from unknown food flow");
    clearPending();
    answerCallbackQuery(callbackQuery.id, "Saved.");
    sendTelegram(
      result === "updated"
        ? `♻️ Updated food reference: <b>${pending.item}</b> — ${pending.grams}g`
        : `✅ Saved to food reference: <b>${pending.item}</b> — ${pending.grams}g`
    );
    return;
  }

  if (data === "skip_save_food_reference") {
    clearPending();
    answerCallbackQuery(callbackQuery.id, "Not saved.");
    sendTelegram("Not saved to food list. Logged for today only.");
    return;
  }

  answerCallbackQuery(callbackQuery.id, "Unknown action.");
}

// ============================================================
// SECTION 14: HYBRID POLLING
// Trigger every 1 minute.
// Each execution polls for ~25 seconds every 5 seconds.
// Faster UX than single-pass, lower overlap risk than 40 seconds.
// ============================================================
function pollTelegramUpdates() {
  const startTime = Date.now();
  const MAX_RUNTIME = 25000;   // 25 seconds
  const SLEEP_INTERVAL = 4000; // 4 seconds

  let offset = Number(getSetting("telegram_update_offset") || 0);

  while (Date.now() - startTime < MAX_RUNTIME) {
    const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/getUpdates?offset=${offset + 1}&limit=100`;

    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(response.getContentText());

    if (data.ok && data.result && data.result.length > 0) {
      for (const update of data.result) {
        setSetting("telegram_update_offset", update.update_id);
        offset = update.update_id;

        try {
          if (update.callback_query) {
            handleCallbackQuery(update.callback_query);
            continue;
          }

          if (update.message && update.message.text) {
            const chatId = String(update.message.chat.id);
            if (chatId !== String(CONFIG.TELEGRAM_CHAT_ID)) continue;

            processTelegramMessage(update.message.text.trim());
          }
        } catch (e) {
          Logger.log("Error processing update " + update.update_id + ": " + e.toString());
        }
      }
    }

    Utilities.sleep(SLEEP_INTERVAL);
  }
}

// Optional only. Not used for Telegram input anymore.
function doPost(e) {
  return ContentService.createTextOutput("ok");
}

function doGet() {
  return ContentService.createTextOutput("Protein bot polling endpoint is live.");
}

// ============================================================
// SECTION 15: SCHEDULED TRIGGERS
// ============================================================
function triggerBreakfast() {
  sendTelegram("🍳 <b>Breakfast check-in!</b>\nWhat did you have? Log your protein now.\n\nExamples: '2 eggs', 'greek yogurt 17g', 'whey shake 25g'");
}

function triggerLunch() {
  sendTelegram(`🥗 <b>Lunch check-in!</b>\nLog what you've eaten so far.\n\n📊 Today's total: <b>${getTodayTotal()}g</b>`);
}

function triggerDinner() {
  sendTelegram(`🍗 <b>Dinner check-in!</b>\nWhat are you having? Log your protein.\n\n📊 Today's total: <b>${getTodayTotal()}g</b>`);
}

function triggerMiddaySummary() {
  const entries = getTodayEntries();
  sendTelegram(buildSummaryText("4pm Check-in", entries, getTodayTotal(), getGoal(), true));
}

function triggerEndOfDay() {
  const entries = getTodayEntries();
  const total = getTodayTotal();
  const goal = getGoal();
  updateDailySummarySheet(getTodayString(), total, goal);
  sendTelegram(buildSummaryText("End of Day Summary", entries, total, goal, true));
}

function triggerMidnightReset() {
  Logger.log("Midnight reset ping for " + getTodayString());
}

// ============================================================
// SECTION 16: SETUP
// ============================================================
function setupSheets() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  function ensureSheet(name, headers) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    }
    return sheet;
  }

  ensureSheet("Logs", ["date", "timestamp", "raw_input", "parsed_item", "protein_grams", "source_type", "meal_tag"]);
  ensureSheet("Daily Summary", ["date", "total_protein", "status_colour", "hit_120", "hit_150"]);
  ensureSheet("Food Reference", ["food_name", "protein_grams_per_serving", "serving_notes"]);
  ensureSheet("Settings", ["key", "value"]);

  const foodSheet = ss.getSheetByName("Food Reference");
  if (foodSheet.getLastRow() <= 1) {
    for (const [food, grams] of Object.entries(FOOD_TABLE)) {
      foodSheet.appendRow([food, grams, "per typical serving"]);
    }
  }

  const settingsSheet = ss.getSheetByName("Settings");
  const existingKeys = settingsSheet.getDataRange().getValues().slice(1).map(r => r[0]);
  const defaults = { daily_goal: CONFIG.DAILY_GOAL, pending_state: "", telegram_update_offset: 0 };
  for (const [key, val] of Object.entries(defaults)) {
    if (!existingKeys.includes(key)) settingsSheet.appendRow([key, val]);
  }

  SpreadsheetApp.flush();
  Logger.log("Sheet setup complete.");
}

// ============================================================
// SECTION 17: MANUAL HELPERS
// ============================================================
function resetTelegramOffset() {
  setSetting("telegram_update_offset", 0);
  Logger.log("telegram_update_offset reset to 0");
}

function resetPendingState() {
  clearPending();
  Logger.log("pending_state cleared");
}

function clearTelegramWebhook() {
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/deleteWebhook?drop_pending_updates=true`;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  Logger.log(response.getResponseCode() + " | " + response.getContentText());
}
