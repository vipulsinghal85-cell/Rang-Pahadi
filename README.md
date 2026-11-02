# Rang Pahadi Studio website

A standalone website for the studio. It needs no Claude account and costs nothing to run.

- **Website** (`index.html`, `style.css`, `app.js`, `config.js`): hosted free on GitHub Pages.
- **Database**: a Google Sheet you own. `Code.gs` connects the website to it.

Students see the workshop calendar, book a seat and get your UPI ID to pay. Every booking lands in your Google Sheet. You manage everything from the Sheet.

The website works straight away with a **sample calendar**. Bookings go through WhatsApp until you connect the Sheet in step 3.

---

## Step 1: Put the website online (GitHub Pages, about 10 minutes)

1. Sign up at [github.com](https://github.com) (free).
2. Click **+** (top right) → **New repository**.
   - Name: `rang-pahadi-studio`
   - Choose **Public**, then click **Create repository**.
3. On the next page, click **uploading an existing file**.
4. Drag in these four files: `index.html`, `style.css`, `app.js`, `config.js`. Click **Commit changes**.
5. Go to **Settings** → **Pages**.
   - Source: **Deploy from a branch**
   - Branch: **main**, folder **/ (root)**, then click **Save**.
6. After 1–2 minutes your site is live at:
   `https://YOUR-GITHUB-NAME.github.io/rang-pahadi-studio/`

## Step 2: Create the Google Sheet (about 5 minutes)

1. Go to [sheets.new](https://sheets.new) and name the sheet **Rang Pahadi Studio**.
2. Click **Extensions** → **Apps Script**.
3. Delete the code that's there. Paste in everything from `Code.gs`, then click **Save** (the disk icon).
4. In the function list at the top, choose **setup** and click **Run**.
5. Google asks for permission. Click **Review permissions**, choose your account, then **Advanced** → **Go to project (unsafe)** → **Allow**. This warning is normal for your own scripts.
6. Go back to the Sheet. You now have four tabs: **Workshops**, **Bookings**, **Settings** and **Overview**.
7. Open **Settings** and fill in your WhatsApp number, UPI ID and address. You can also add your email next to `notifyEmail` to get an email for every booking.

## Step 3: Connect the website to the Sheet (about 5 minutes)

1. In Apps Script, click **Deploy** → **New deployment**.
2. Click the gear icon → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
3. Click **Deploy** and copy the **Web app URL**. It ends in `/exec`.
4. On GitHub, open `config.js` → click the pencil icon. Paste the URL between the quotes:
   ```js
   SHEET_API_URL: "https://script.google.com/macros/s/AKfy.../exec",
   ```
5. Click **Commit changes**. After about a minute, refresh your website. The sample banner disappears and your real calendar shows.

---

## Running the studio day to day

| To do this | Do this in the Google Sheet |
| --- | --- |
| Add a workshop | **Workshops**: add a row. Type the title and the ID fills in by itself. Dates as `2026-11-14`, times as `11:00`. |
| Cancel a workshop | **Workshops**: set Status to **Cancelled**. |
| See who booked | **Bookings**: one row per booking, with name, phone, seats and amount. |
| Mark a payment | **Bookings**: tick **Paid**. |
| Add a WhatsApp or walk-in booking | **Bookings**: add a row, pick the Workshop ID, enter seats, set Status to **Confirmed**. The website's seat count updates. |
| Cancel a booking | **Bookings**: set Status to **Cancelled**. The seats open up again. |
| See how full each workshop is | **Overview**: seats booked, seats left, fill %, booked revenue and payments. |
| Change the studio name, story, artist bio or UPI | **Settings** tab. |

Changes in the Sheet show on the website within a minute or two.

## Good to know

- **Privacy:** the website only receives workshop details and seat counts. Names and phone numbers stay in your Sheet.
- **Full workshops:** the Sheet blocks a booking if there aren't enough seats left.
- **If you change `Code.gs` later:** go to **Deploy** → **Manage deployments** → pencil icon → Version: **New version** → **Deploy**. The URL stays the same.
- **Your own domain** (like `rangpahadi.in`): buy it from any registrar, then add it under GitHub **Settings** → **Pages** → **Custom domain**.
- **Free limits:** Google Apps Script easily handles a studio's traffic, which is thousands of visits a day.
