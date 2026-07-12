/* ---------------------------------------------------------------------- */
/* config.js — API endpoint discovery                                      */
/* Loaded first. Exposes API_BASE_CANDIDATES on the global scope so the     */
/* api layer can try each base in order (same-origin first when served by   */
/* Flask, dev ports as fallback).                                           */
/* ---------------------------------------------------------------------- */

const API_BASE_CANDIDATES = [
  window.TRANSITOPS_API_BASE,
  `${window.location.origin}/api`,
  "http://127.0.0.1:8000/api",
  "http://localhost:8000/api",
]
  .filter(Boolean)
  .map((value) => value.replace(/\/+$/, ""));
