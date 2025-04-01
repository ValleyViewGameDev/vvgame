// TK: Season manager logic// src/GameFeatures/Seasons/SeasonManager.js
import { useState, useEffect } from "react";
import OffSeasonModal from "./OffSeasonModal";

let timers = null;
let modalHandler = null;

export function initializeSeasonManager(localTimers) {
  timers = localTimers;
}

export function registerModalHandler(setModalVisible) {
  modalHandler = setModalVisible;
}

export function handleOffSeasonLogic() {
  if (timers?.seasons?.phase === "offSeason") {
    console.log("🌾 Entering OffSeason Mode...");
    if (modalHandler) modalHandler(true);
  }
}

export function handleSeasonTransition() {
  if (timers?.seasons?.phase === "onSeason") {
    console.log("✅ Exiting OffSeason Mode...");
    if (modalHandler) modalHandler(false);
  }
}