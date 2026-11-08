// Line drawings for each genre, drawn for Las Cruces Live. 48x48, stroke only, colored by CSS.
export const INSTRUMENTS = {
  // Banjo
  americana: `<circle cx="17" cy="31" r="11"/><circle cx="17" cy="31" r="2.5"/><path d="M25 23 L38 10 M27.5 25.5 L40.5 12.5 M38 10 L41 5 L45 8 L40.5 12.5"/>`,
  // Harmonica
  blues: `<rect x="5" y="16" width="38" height="16" rx="3"/><path d="M5 22 H43 M11 26 V29 M17 26 V29 M23 26 V29 M29 26 V29 M35 26 V29"/>`,
  // Cowboy boot
  country: `<path d="M15 5 H30 V24 C30 27 33 29 38 30 C42 31 44 33 44 37 V40 H11 V31 C11 28 13 26 15 25 Z"/><path d="M11 40 V44 H18 V40 M19 11 Q22.5 15 26 11"/>`,
  // Saxophone
  jazz: `<path d="M34 4 L29 9 V31 C29 38 24 42 19 42 C14 42 11 38 11 33 V27"/><path d="M6 27 H16 M34 4 L38 3"/><circle cx="29" cy="15" r="1.6" fill="currentColor"/><circle cx="29" cy="21" r="1.6" fill="currentColor"/><circle cx="29" cy="27" r="1.6" fill="currentColor"/>`,
  // Guitar amp
  rock: `<rect x="7" y="9" width="34" height="32" rx="3"/><path d="M7 19 H41"/><circle cx="13" cy="14" r="1.5" fill="currentColor"/><circle cx="19" cy="14" r="1.5" fill="currentColor"/><circle cx="25" cy="14" r="1.5" fill="currentColor"/><circle cx="24" cy="30" r="7.5"/><circle cx="24" cy="30" r="2.5"/>`,
  // Acoustic guitar
  folk: `<path d="M24 20 C19 20 17 23 18 26 C18.6 28 14 29.5 14 34 C14 39.5 18.5 43 24 43 C29.5 43 34 39.5 34 34 C34 29.5 29.4 28 30 26 C31 23 29 20 24 20 Z"/><circle cx="24" cy="31" r="3.2"/><path d="M24 20 V9 M21 38 H27"/><rect x="21.5" y="3" width="5" height="6" rx="1"/>`,
  // Microphone on a stand
  'singer-songwriter': `<rect x="18" y="4" width="12" height="17" rx="6"/><path d="M18 11 H30 M18 15 H30"/><path d="M13 17 V19 A11 11 0 0 0 35 19 V17"/><path d="M24 30 V42 M16 43 H32"/>`,
  // Vinyl record
  'soul-rnb': `<circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="6"/><circle cx="24" cy="24" r="1.5" fill="currentColor"/><path d="M11 18 A14 14 0 0 1 18 11 M37 30 A14 14 0 0 1 30 37"/>`,
  // Disco ball
  'funk-disco': `<path d="M24 4 V12"/><circle cx="24" cy="27" r="14"/><path d="M10 27 H38 M13 20 H35 M13 34 H35"/><ellipse cx="24" cy="27" rx="6" ry="14"/><path d="M40 6 V12 M37 9 H43"/>`,
  // Headphones
  pop: `<path d="M8 30 V26 A16 16 0 0 1 40 26 V30"/><rect x="5" y="28" width="9" height="14" rx="3"/><rect x="34" y="28" width="9" height="14" rx="3"/>`,
  // Maracas
  latin: `<ellipse cx="16" cy="15" rx="8" ry="10" transform="rotate(-25 16 15)"/><path d="M20 24 L25 42"/><ellipse cx="33" cy="15" rx="8" ry="10" transform="rotate(25 33 15)"/><path d="M29 24 L24 42"/><path d="M12 13 L15 11 M35 11 L37 14"/>`,
  // Accordion
  'tejano-norteno': `<rect x="4" y="11" width="9" height="26" rx="2"/><rect x="35" y="11" width="9" height="26" rx="2"/><path d="M13 11 L18.5 15 L24 11 L29.5 15 L35 11 M13 37 L18.5 33 L24 37 L29.5 33 L35 37 M18.5 15 V33 M24 11 V37 M29.5 15 V33"/><circle cx="39.5" cy="18" r="1.3" fill="currentColor"/><circle cx="39.5" cy="24" r="1.3" fill="currentColor"/><circle cx="39.5" cy="30" r="1.3" fill="currentColor"/>`,
  // Cassette tape
  alternative: `<rect x="5" y="11" width="38" height="26" rx="3"/><rect x="13" y="16" width="22" height="9" rx="2"/><circle cx="18.5" cy="20.5" r="2"/><circle cx="29.5" cy="20.5" r="2"/><path d="M13 37 L16 31 H32 L35 37"/>`,
  // Lightning bolt
  'metal-punk': `<path d="M27 4 L11 27 H22 L19 44 L37 19 H26 Z"/>`,
  // Upright bass
  rockabilly: `<path d="M24 4 V18 M24 18 C18 18 15 22 16 26 C17 29 13 31 13 35 C13 40 18 44 24 44 C30 44 35 40 35 35 C35 31 31 29 32 26 C33 22 30 18 24 18 Z"/><path d="M19 31 Q18 33 19 35 M29 31 Q30 33 29 35 M21 40 H27 M22 4 H26"/>`,
  // Jukebox
  'oldies-variety': `<path d="M9 43 V21 A15 15 0 0 1 39 21 V43 Z"/><path d="M15 26 A9 9 0 0 1 33 26 V30 H15 Z"/><path d="M15 36 H33 M15 40 H33"/>`,
  // Turntable
  'hip-hop-dj': `<rect x="4" y="9" width="40" height="30" rx="3"/><circle cx="20" cy="24" r="10"/><circle cx="20" cy="24" r="2"/><path d="M37 13 V27 L31 33"/><circle cx="37" cy="13" r="1.6" fill="currentColor"/>`,
};

// Eighth notes, for anything without a genre.
export const DEFAULT_INSTRUMENT = `<path d="M17 36 V10 L37 6 V32"/><circle cx="12" cy="36" r="5"/><circle cx="32" cy="32" r="5"/>`;

export const instrumentFor = (genres = []) => INSTRUMENTS[genres[0]] || DEFAULT_INSTRUMENT;

export function instrumentSvg(inner, { size = 48, stroke = 2.4, color = 'currentColor' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
