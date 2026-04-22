# Telegram Protein Tracker Bot

## Overview

In April 2026, I set a personal goal to hit **150g of protein daily**, but struggled with one key issue:

> **Inconsistent logging.**

Even with apps like MyFitnessPal, logging meals throughout the day felt tedious, and I often skipped entries.

To solve this, I built a **Telegram-based protein tracking bot** that allows me to log food quickly using simple, natural inputs.

---

## Problem

- Logging food consistently is difficult  
- Existing apps require multiple steps and manual input  
- Friction leads to missed entries and unreliable tracking  

---

## Solution

A lightweight Telegram bot that:

- Accepts **free-text inputs** (e.g. “2 eggs”, “30g whey”)  
- Parses protein values automatically  
- Stores structured data in Google Sheets  
- Provides **daily summaries, streaks, and averages**  
- Allows saving custom food references for future reuse  

The goal was to make logging:
> **fast, low-friction, and easy to stick to**

---

## Key Features

- **Free-text logging**  
  Log entries like:
  - `2 eggs`
  - `30g protein shake`
  - `custom meal`

- **Smart parsing logic**  
  - Detects quantities and food types  
  - Falls back to manual confirmation when uncertain  

- **Custom food reference system**  
  - Save new foods directly via Telegram  
  - Stored in Google Sheets for easy updates  

- **Daily summaries**
  - Total protein intake  
  - Remaining grams to goal  
  - Logged items  

- **Streak and average tracking**
  - 120g and 150g streaks  
  - 7-day rolling average  

- **Scheduled reminders**
  - Meal check-ins (breakfast, lunch, dinner)  
  - Midday and end-of-day summaries  

---

## Example Workflow

**Step 1: User logs an unknown food**
```
custom milkshake
```

**Step 2: Bot asks for protein amount**
```
🤔 I don't know "custom milkshake" yet.
How many grams of protein should I log? Send a number, or no to skip.
```

**Step 3: User replies with grams**
```
32
```

**Step 4: Bot logs the entry and asks whether to save it**
```
✅ Logged: custom milkshake — 32g
📊 Today's total: 87g

Save custom milkshake to your food list for next time?
[✅ Save to food list] [❌ Just this once]
```

**Step 5: User chooses an option**
- If saved, the food will be recognised automatically in future  
- If skipped, it is logged for that day only  

---

## Tech Stack

- **Google Apps Script** (backend logic)
- **Telegram Bot API** (user interface)
- **Google Sheets** (data storage)
- Optional: **Gemini API** (fallback estimation)

---

## Architecture (Simplified)

Telegram → Apps Script (polling) → Parser → Google Sheets → Telegram response

---

## Key Design Decisions

- **Polling over webhooks**  
  Chosen for reliability within Apps Script environment  

- **Google Sheets as database**  
  Allows easy inspection and manual updates  

- **State-based interaction flow**  
  Handles multi-step inputs (e.g. unknown food → confirm grams → save food)  

- **Strict parsing rules**  
  Prevents incorrect matches (e.g. “milk” inside “milkshake”)  

---

## Screenshots

<img width="842" height="892" alt="Screenshot 2026-04-22 at 2 37 30 PM" src="https://github.com/user-attachments/assets/bc3227c4-2373-49d7-836c-ab7122fbad92" />
<img width="840" height="891" alt="Screenshot 2026-04-22 at 2 38 28 PM" src="https://github.com/user-attachments/assets/3602430a-4124-4673-8f40-1b6119f8ed70" />


---

## Impact

- Reduced friction in daily protein logging  
- Enabled consistent tracking across multiple days  
- Simplified data collection into a conversational interface  

---

## Future Improvements

- Edit previous entries (`/editlast`)
- Weekly summaries
- Duplicate entry detection
- Improved parsing for mixed meals

---

## Why this project matters

This project demonstrates:

- Data collection from unstructured inputs  
- Data transformation into structured format  
- Lightweight analytics (summaries, streaks, averages)  
- Workflow automation  
- Designing user interaction flows  

---

## Author

Chandan Mansukhani
