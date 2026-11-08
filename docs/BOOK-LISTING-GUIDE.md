# Cronyzo — Book list karne ka poora tareeka (A se Z)

Ye guide sirf **books** ke liye hai: aap photo kaise daaloge, file kahan rakhoge,
buyer ko kya dikhega, paisa kaise aayega aur file kaise milegi — step by step.
Baaki (product / course) bhi bilkul isi tareeke se chalta hai.

---

## 0. Ek nazar me poori chain

```
AAP (seller)                         BUYER
────────────                         ─────
1. Shopkeeper application → approved  …
2. /sell/books/new khulta hai
3. Cover photo upload (ya link)   →   /books par cover dikhta hai
4. PDF Google Drive par, link paste →  book page par details + price
5. Price + MRP + stock daala       →   "Buy" dabaya → order paid
6. Publish                         →   download link milta hai (402 se pehle)
                                   →   file Drive se seedha download
```

Poora data aapke paas hi rehta hai: file **aapke Drive** me, photo **Cronyzo ke
database** me (auto-resize ho ke), paisa **Razorpay** me (keys daalne ke baad).

---

## 1. Pehle: listing ka haq (ek hi baar)

Book/product/course **sirf wahi banda list kar sakta hai jiska shopkeeper
application approve hua ho.** Admin (aap) ko iski zaroorat nahi — aap seedha
list kar sakte ho.

- Application: `/sell` → form bharo
- Approve: admin panel → **Seller Applications** (`/admin/sellers`)

Bina approval koi bhi `/sell/books/new` par form submit karega to server
`403 seller_application_required` dega — front end bhi pehle hi gate dikha deta
hai. Ye jaan-boojh ke server par lagaya gaya hai, UI par nahi.

---

## 2. Book form kahan hai

| Kahan se | Kya |
|---|---|
| Header me apne naam/avatar par click → **Seller studio** | seller dashboard |
| Sidebar → **Sell → List a Book** | `/sell/books/new` |
| Seedha URL | `https://<site>/sell/books/new` |
| Books page ke neeche "List your books" button | wahi page |

---

## 3. Cover photo — 2 tareeke (dono form me hain)

Book form me **"Book cover photo"** naam ka block hai. Uske upar do chhote tabs:

```
[ Upload photo ]  [ Paste a link ]
```

### (a) Upload photo — phone se / PC se
1. **Choose from device** dabao (phone par gallery/camera khul jaayega)
2. Photo chuno → turant upload hota hai → **preview dikh jaata hai**
3. Neeche hari line: **"Photo attached — buyers will see this"**

Server us photo ko apne aap:
- 1600 px se bada hai to chhota karta hai,
- JPEG me convert karta hai (~100–200 KB),
- database me daal deta hai (Cloudinary key ki zaroorat nahi),
- aur `https://cronyzo-api.onrender.com/api/images/<id>` par serve karta hai
  (1 saal cache, isliye page fast).

8 MB tak ki koi bhi JPG/PNG/WEBP chalegi. Galat file daali to saaf error aata hai.

### (b) Paste a link
Drive / Imgur / Cloudinary ka image link paste karo — preview turant dikhega.
`Remove photo` se hata bhi sakte ho.

**Buyer ko cover kahan dikhta hai:**
- `/books` library grid ka card (3:4 portrait — isliye portrait photo best)
- Book detail page ka bada cover
- Orders page aur seller studio ke "My Books" me

Portrait (3:4) photo sabse accha lagta hai. Square/landscape bhi chalega —
card me crop ho jaata hai.

---

## 4. Book ki PDF file — upload ya link (dono optional-priority)

Book form ke "Digital edition" section me:

```
[ Paste a link ✔ ]   [ Upload a PDF ]
```

### (a) Paste a link (recommended — database halka rehta hai)
1. Google Drive par PDF daalo
2. PDF par right-click → **Share → Anyone with the link → Viewer**
3. Link copy karo: `https://drive.google.com/file/d/<ID>/view?usp=sharing`
4. Cronyzo me paste karo

Cronyzo us link ko khud badal deta hai:
`…/file/d/<ID>/view` → `…/uc?export=download&id=<ID>`
matlab buyer ko Drive ka page nahi, **seedha download** milta hai.
Dropbox (`dl=0` → `raw=1`) bhi handle hota hai.
Sirf `https://` chalta hai — `javascript:` / `data:` / `ftp:` reject.

**Free sample link** (optional): koi bhi dekh sake aisa sample PDF link.
Ye sabse zyada book bikwata hai.

### (b) Upload a PDF
Agar file apne paas rakhna chahte ho to `Upload a PDF` tab chuno aur PDF daalo.
(Isse storage use hota hai — isliye default link hai.)

⚠️ Drive ki **daily download quota** hoti hai. Ek book bahut zyada bikne lage
aur "quota exceeded" aaye, to PDF ko Cloudinary/R2 par shift kar dena — mujhe
bolo, main download-proxy bana dunga jo file apne naam se serve kare.

---

## 5. Price, stock aur publish

| Field | Kya daalna hai |
|---|---|
| Price (₹) | buyer jo pay karega |
| MRP (₹) | kata hua price (discount % khud dikhta hai) |
| Stock | digital ke liye 0 bhi theek |
| Free to download | tick kiya to ₹0, sabke liye free ("Free e-books" me) |
| Description / Highlights | buyer kya padhega |

**List book** dabao → book live → seedha book page khul jaata hai.

---

## 6. Buyer ko kya dikhega, kya milega

1. `/books` par card: **cover photo**, title, author, format, rating, ₹ price
2. Card par click → detail page: bada cover, description, highlights, sample
3. **Buy** → cart → checkout → order paid
4. Paid hone ke baad **Download** button:
   - Free book / owner / admin → turant link
   - Paid buyer → order ke against link
   - **Bina payment** maange → server `402 payment_required` — file kabhi leak nahi hoti

Public API me paid PDF ka URL kabhi nahi jaata — sirf `has_pdf: true` dikhta hai.

---

## 7. Apna account (naam / email / password / photo)

Pehle ye kahin dikhta hi nahi tha. Ab:

- **Phone:** bottom bar → **You** tab
- **PC:** header me apna naam/avatar → **My account**
- Seedha URL: `/account`

Wahan milta hai:
- Profile photo (upload/paste) — header aur review me dikhta hai
- **Full name** — badal sakte ho
- **Email** — dikhta hai (badalna ho to support ko likho; security reason)
- **Phone**
- **Change password** — current password maangta hai, phir naya set
- Sign-in method, role, member since, account ID
- Shortcuts: dashboard, orders, my learning, seller studio, settings
- **Sign out**

---

## 8. Sabse aam galtiyan

| Problem | Wajah / hal |
|---|---|
| "Shopkeeper approval required" | `/sell` se application bhejo, admin approve kare |
| Cover dikh raha par book nahi | submit ke waqt koi required field khali thi — form upar scroll karo |
| Drive link khulta nahi | Drive share "Anyone with the link" nahi hai |
| Photo upload fail | 8 MB se badi file — chhoti photo lo (server khud resize karta hai) |
| Book buy karne par bhi download nahi | order `paid` hona chahiye; free book me tick hona chahiye |

---

## 9. Ready-made screenshots

`docs/screens/` me:

- `live-account-desktop.png` — My Account (PC)
- `live-account-mobile.png` — My Account (phone, "You" tab)
- `live-account-menu.png` — header ka account menu (naam + email)
- `live-book-form-cover.png` — book form + cover picker (preview ke saath)
- `live-cover-picker-mobile.png` — wahi cheez phone par
- `live-book-cover-grid.png` — buyer ko `/books` par cover dikh raha hai
