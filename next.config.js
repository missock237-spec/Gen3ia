// next.config.js — DOUBLON DÉPRÉCIÉ — voir next.config.ts (source de vérité).
// Ce fichier est conservé uniquement pour éviter les chargements ambigus pendant
// la transition Docker/Vercel. Next.js charge next.config.ts en priorité :
// toute la configuration réelle vit donc dans next.config.ts.
//
// Chantier 1 (fix build) : ne plus entretenir deux configs divergentes.
// TODO(build): supprimer ce fichier une fois Docker/Vercel validés sur le .ts.
//
// Si un outil charge ce fichier en fallback, on re-exporte un module vide mais
// on NE duplique PAS la configuration (risque de divergence déjà constaté).
module.exports = {};
