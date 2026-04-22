# protein-habit-tracker

# Telegram Protein Tracker Bot

## Overview

I set a personal goal to hit **150g of protein daily**, but struggled with one key issue:

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

1. User sends:

2. Bot asks for protein amount

3. User replies:
