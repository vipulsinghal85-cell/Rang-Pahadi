/**
 * Rang Pahadi Studio: Google Sheets backend for the studio website.
 *
 * What it does
 *   - GET  : sends the website the studio details and upcoming workshops
 *            (with how many seats are booked; never names or phone numbers).
 *   - POST : saves a new booking into the "Bookings" sheet, after checking
 *            that enough seats are left.
 *
 * Setup (full steps in README.md)
 *   1. Paste this file into Extensions > Apps Script of your Google Sheet.
 *   2. Run the "setup" function once and allow the permissions.
 *   3. Deploy > New deployment > Web app
 *        Execute as: Me    Who has access: Anyone
 *   4. Copy the web app URL into config.js on the website.
 */

const TAB = { W: 'Workshops', B: 'Bookings', S: 'Settings', O: 'Overview' };

const W_HEAD = ['ID', 'Title', 'Category', 'Date', 'Start time', 'Duration (min)', 'Seats', 'Price (₹)', 'Price label', 'Level', 'Description', 'Status'];
const B_HEAD = ['Booking ID', 'Created', 'Workshop ID', 'Workshop', 'Workshop date', 'Name', 'Phone', 'Seats', 'Amount (₹)', 'Note', 'Source', 'Paid', 'Status'];
const CATEGORIES = ['Traditional Indian art', 'Painting & drawing', 'Mixed media & texture', 'Pottery & crafts', 'Handicrafts', 'Kids'];

/* ------------------------------------------------------------------ web */

function doGet() {
  try {
    return json_(publicData_());
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err) });
  }
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }

  // Hidden form field that only spam bots fill in.
  if (d.website) return json_({ ok: true, id: 'RP-OK', amount: 0 });

  const wid = clean_(d.workshopId, 40);
  const name = clean_(d.name, 80);
  const phone = String(d.phone || '').replace(/[^\d+]/g, '').slice(0, 15);
  const note = clean_(d.note, 300);
  const seats = Math.floor(Number(d.seats));

  if (!wid || !name) return json_({ ok: false, error: 'missing', message: 'Please add your name.' });
  if (phone.replace(/\D/g, '').length < 10) return json_({ ok: false, error: 'phone', message: 'Please add a 10-digit mobile number.' });
  if (!(seats >= 1 && seats <= 10)) return json_({ ok: false, error: 'seats', message: 'Choose between 1 and 10 seats.' });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const data = publicData_();
    const w = data.workshops.find(x => x.id === wid);
    if (!w || w.status === 'cancelled') return json_({ ok: false, error: 'not_found', message: 'This workshop is no longer open for booking.' });
    const left = w.seats - w.booked;
    if (seats > left) return json_({ ok: false, error: 'full', left: Math.max(0, left), message: left > 0 ? `Only ${left} seat${left > 1 ? 's are' : ' is'} left.` : 'This workshop is fully booked.' });

    const id = 'RP-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
    const amount = seats * w.price;
    const sh = SpreadsheetApp.getActive().getSheetByName(TAB.B);
    sh.appendRow([id, new Date(), wid, w.title, w.date, name, "'" + phone, seats, amount, note, 'Website', false, 'Confirmed']);
    sh.getRange(sh.getLastRow(), 12).insertCheckboxes();

    notify_(data.settings, { id, w, name, phone, seats, amount, note });
    return json_({ ok: true, id, amount });
  } finally {
    lock.releaseLock();
  }
}

/* ----------------------------------------------------------------- data */

function publicData_() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone() || 'Asia/Kolkata';
  const settings = readSettings_(ss);
  const bookings = readTable_(ss.getSheetByName(TAB.B));
  const booked = {};
  bookings.forEach(b => {
    if (String(b['Status']).toLowerCase() === 'cancelled') return;
    const k = String(b['Workshop ID']).trim();
    booked[k] = (booked[k] || 0) + (Number(b['Seats']) || 0);
  });
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const workshops = readTable_(ss.getSheetByName(TAB.W))
    .filter(w => String(w['ID']).trim() && String(w['Title']).trim())
    .map(w => {
      const id = String(w['ID']).trim();
      return {
        id,
        title: String(w['Title']).trim(),
        category: String(w['Category'] || '').trim(),
        date: fmtDate_(w['Date'], tz),
        start: fmtTime_(w['Start time'], tz),
        durationMins: Number(w['Duration (min)']) || 0,
        seats: Number(w['Seats']) || 0,
        price: Number(w['Price (₹)']) || 0,
        unit: String(w['Price label'] || 'per person').trim(),
        level: String(w['Level'] || '').trim(),
        description: String(w['Description'] || '').trim(),
        status: String(w['Status'] || 'Open').trim().toLowerCase() === 'cancelled' ? 'cancelled' : 'open',
        booked: booked[id] || 0,
      };
    })
    .filter(w => w.date && w.date >= today)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  const pub = {};
  ['name', 'tagline', 'city', 'address', 'hours', 'whatsapp', 'upi', 'about', 'artistName', 'artistRole', 'artistBio', 'artistQuote']
    .forEach(k => { pub[k] = settings[k] || ''; });
  return { ok: true, settings: pub, workshops, updated: new Date().toISOString() };
}

function readTable_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const head = v[0].map(h => String(h).trim());
  return v.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

function readSettings_(ss) {
  const sh = ss.getSheetByName(TAB.S);
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(([k, v]) => {
    if (String(k).trim()) out[String(k).trim()] = String(v).trim();
  });
  return out;
}

function fmtDate_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); // 14/11/2026
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

function fmtTime_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'HH:mm');
  const s = String(v || '').trim().toUpperCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) return s;
  let h = Number(m[1]);
  if (m[3] === 'PM' && h < 12) h += 12;
  if (m[3] === 'AM' && h === 12) h = 0;
  return String(h).padStart(2, '0') + ':' + (m[2] || '00');
}

function clean_(s, max) { return String(s || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function notify_(settings, b) {
  const to = settings.notifyEmail;
  if (!to) return;
  try {
    MailApp.sendEmail(to, `New booking ${b.id}: ${b.w.title}`,
      `${b.name} (${b.phone}) booked ${b.seats} seat(s) for ${b.w.title} on ${b.w.date} at ${b.w.start}.\n` +
      `Amount: ₹${b.amount}\nNote: ${b.note || '-'}\n\nMark it paid in the Bookings sheet once the UPI payment arrives.`);
  } catch (err) { /* email is optional */ }
}

/* ------------------------------------------------- sheet helpers & setup */

/** Fills in a Workshop ID automatically when you type a new workshop title. */
function onEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== TAB.W || e.range.getRow() < 2) return;
  for (let r = e.range.getRow(); r <= e.range.getLastRow(); r++) {
    const idCell = sh.getRange(r, 1), title = sh.getRange(r, 2).getValue();
    if (!idCell.getValue() && String(title).trim()) idCell.setValue('w' + Date.now().toString(36) + (r % 10));
  }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Studio')
    .addItem('Set up sheets (first time only)', 'setup')
    .addToUi();
}

/** Run once. Creates the Workshops, Bookings, Settings and Overview sheets. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone('Asia/Kolkata');

  // Workshops
  const w = sheet_(ss, TAB.W, W_HEAD);
  if (w.getLastRow() < 2) {
    const rows = [
      ['w01', 'Aipan Art (Kumaoni folk)', 'Traditional Indian art', '2026-11-07', '11:00', 150, 12, 1200, 'per person', 'Beginner · Ages 14+', 'Learn the geru-and-rice-paste patterns of Kumaon and paint your own Aipan plate.', 'Open'],
      ['w02', 'Texture Art on Canvas', 'Mixed media & texture', '2026-11-08', '11:00', 180, 12, 1800, 'per person', 'Beginner', 'Build raised floral textures with modelling paste and palette knives on a 12×12 canvas.', 'Open'],
      ['w03', 'Acrylic Paint & Sip', 'Painting & drawing', '2026-11-08', '17:00', 150, 16, 1500, 'per person', 'No experience needed', 'A guided Mussoorie sunset painting with mocktails. Good for friends and date nights.', 'Open'],
      ['w04', "Kids' Art Club (4 Saturdays)", 'Kids', '2026-11-14', '10:00', 90, 15, 3000, 'per child / month', 'Ages 6–12', 'Drawing, colour, clay and craft every Saturday in November. Screen-free and messy.', 'Open'],
      ['w05', 'Mandala & Dot Art', 'Traditional Indian art', '2026-11-14', '15:00', 150, 15, 1100, 'per person', 'Beginner', 'Calming dot mandalas on a wooden coaster set and a 10-inch MDF board.', 'Open'],
      ['w06', 'Pottery: Hand-building', 'Pottery & crafts', '2026-11-15', '11:00', 180, 10, 2000, 'per person', 'Beginner · Ages 14+', 'Pinch and coil a bowl and a planter. Pieces are fired and ready to collect in 2 weeks.', 'Open'],
      ['w07', 'Block Printing on Tote', 'Handicrafts', '2026-11-21', '11:00', 150, 12, 1500, 'per person', 'All levels', 'Hand-block print a cotton tote with traditional wooden blocks and fabric colours.', 'Open'],
      ['w08', 'Mixed Media Doon Landscape', 'Mixed media & texture', '2026-11-22', '11:00', 180, 12, 1600, 'per person', 'Beginner', 'Collage, acrylic and texture combine into a layered Doon valley landscape.', 'Open'],
      ['w09', 'Madhubani on Canvas', 'Traditional Indian art', '2026-11-28', '11:00', 180, 12, 1400, 'per person', 'Beginner', 'Line work, borders and fish motifs of Mithila painting on an 8×10 canvas.', 'Open'],
      ['w10', 'Watercolour Basics', 'Painting & drawing', '2026-11-29', '11:00', 150, 12, 1200, 'per person', 'Beginner', "Washes, wet-on-wet and layering. You'll paint two small hill scenes.", 'Open'],
      ['w11', 'Adult Foundation Course (8 sessions)', 'Painting & drawing', '2026-12-05', '17:00', 120, 10, 7500, 'per person / course', 'Beginner', 'Saturdays and Sundays for 4 weeks: drawing, shading, colour theory, watercolour and acrylic.', 'Open'],
      ['w12', 'Macramé & Ringaal Craft', 'Handicrafts', '2026-12-06', '11:00', 180, 10, 1600, 'per person', 'All levels', 'Knot a wall hanging on a Ringaal bamboo rod, a craft from the Uttarakhand hills.', 'Open'],
    ];
    w.getRange(2, 1, rows.length, W_HEAD.length).setValues(rows);
  }
  w.getRange('D2:D').setNumberFormat('yyyy-mm-dd');
  w.getRange('E2:E').setNumberFormat('HH:mm');
  w.getRange('H2:H').setNumberFormat('₹#,##0');
  w.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CATEGORIES, true).build());
  w.getRange('L2:L').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Open', 'Cancelled'], true).build());
  w.setColumnWidth(2, 260); w.setColumnWidth(11, 380);

  // Bookings
  const b = sheet_(ss, TAB.B, B_HEAD);
  b.getRange('B2:B').setNumberFormat('dd mmm yyyy, hh:mm');
  b.getRange('I2:I').setNumberFormat('₹#,##0');
  b.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(w.getRange('A2:A'), true).build());
  b.getRange('K2:K').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Website', 'WhatsApp', 'Phone', 'Walk-in', 'Instagram', 'Party / group'], true).build());
  b.getRange('M2:M').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Confirmed', 'Cancelled'], true).build());
  b.getRange('L2:L500').insertCheckboxes();

  // Settings
  const s = sheet_(ss, TAB.S, ['Key', 'Value', 'What it is']);
  if (s.getLastRow() < 2) {
    const rows = [
      ['name', 'Rang Pahadi Studio', 'Studio name'],
      ['tagline', "Hands-on art workshops in the Doon valley: Aipan, Madhubani, texture art, pottery, handicrafts and kids' classes. All materials included.", 'Short line under the name'],
      ['city', 'Dehradun · Uttarakhand', 'Shown above the name'],
      ['address', '', 'Studio address'],
      ['hours', 'Tue–Sun, 10 AM–7 PM', 'Opening hours'],
      ['whatsapp', '', '10-digit WhatsApp number for bookings'],
      ['upi', '', 'UPI ID students pay to'],
      ['about', "Rang Pahadi Studio is a hands-on art studio in Dehradun, started by an artist who grew up with the colours of the hills. Many people say they \"can't draw\". The studio is here to prove them wrong, one afternoon at a time.\n\nWe teach the folk art of Uttarakhand and India, like Aipan, Madhubani and mandala, alongside texture art, mixed media, pottery and handicrafts. Every workshop is guided step by step, all materials are included, and you take home something you made yourself.\n\nCome alone, bring friends, or bring the kids. Our studio is a calm, messy and welcoming place to slow down and make something.", 'About us story (blank line between paragraphs)'],
      ['artistName', 'Akanksha Singhal', 'Artist name'],
      ['artistRole', 'Founder & lead artist', 'Artist role'],
      ['artistBio', 'Akanksha Singhal is a Dehradun-based artist working across painting, mixed media, texture art and traditional Indian folk forms. She started Rang Pahadi Studio to share the joy of making art with anyone who walks in, from first-timers to practising artists.', 'Artist bio'],
      ['artistQuote', 'Everyone can make art. Most people just need a table, good materials and an afternoon.', 'A line in the artist’s words'],
      ['notifyEmail', '', 'Optional: your email, to get an email for every website booking'],
    ];
    s.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  s.setColumnWidth(1, 120); s.setColumnWidth(2, 520); s.setColumnWidth(3, 320);
  s.getRange('B2:B').setWrap(true);

  // Overview (formulas only: fills itself from the other two sheets)
  const o = sheet_(ss, TAB.O, ['Date', 'Workshop', 'Seats', 'Booked', 'Left', 'Fill', 'Booked revenue', 'Paid']);
  o.getRange('A2').setFormula('=ARRAYFORMULA(IF(Workshops!A2:A="",,Workshops!D2:D))');
  o.getRange('B2').setFormula('=ARRAYFORMULA(IF(Workshops!A2:A="",,Workshops!B2:B))');
  o.getRange('C2').setFormula('=ARRAYFORMULA(IF(Workshops!A2:A="",,Workshops!G2:G))');
  o.getRange('D2').setFormula('=ARRAYFORMULA(IF(Workshops!A2:A="",,SUMIFS(Bookings!H:H,Bookings!C:C,Workshops!A2:A,Bookings!M:M,"<>Cancelled")))');
  o.getRange('E2').setFormula('=ARRAYFORMULA(IF(Workshops!A2:A="",,C2:C-D2:D))');
  o.getRange('F2').setFormula('=ARRAYFORMULA(IF(Workshops!A2:A="",,IFERROR(D2:D/C2:C,0)))');
  o.getRange('G2').setFormula('=ARRAYFORMULA(IF(Workshops!A2:A="",,D2:D*Workshops!H2:H))');
  o.getRange('H2').setFormula('=ARRAYFORMULA(IF(Workshops!A2:A="",,SUMIFS(Bookings!I:I,Bookings!C:C,Workshops!A2:A,Bookings!L:L,TRUE,Bookings!M:M,"<>Cancelled")))');
  o.getRange('A2:A').setNumberFormat('ddd d mmm');
  o.getRange('F2:F').setNumberFormat('0%');
  o.getRange('G2:H').setNumberFormat('₹#,##0');
  o.setColumnWidth(2, 260);

  const first = ss.getSheets()[0];
  if (first.getName() === 'Sheet1' && first.getLastRow() === 0) ss.deleteSheet(first);
  ss.setActiveSheet(w);
}

function sheet_(ss, name, head) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#f6e6df');
  sh.setFrozenRows(1);
  return sh;
}
