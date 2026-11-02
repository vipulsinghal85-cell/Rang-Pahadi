/*
 * Rang Pahadi Studio website settings.
 *
 * SHEET_API_URL: paste the Google Apps Script "Web app" URL here
 * (README.md, step 3). It ends in /exec.
 * Until you do, the website shows a sample calendar and sends every
 * booking through WhatsApp instead.
 */
window.STUDIO_CONFIG = {
  SHEET_API_URL: "https://script.google.com/macros/s/AKfy.../exec",

  // Used only until the Google Sheet is connected (10-digit mobile number).
  WHATSAPP: ""
};
