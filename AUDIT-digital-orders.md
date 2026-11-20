# Cronyzo — logic audit: e-book delivery, payments, cancellation, reader

Date: 2026-11-20 · commit `0019d09` · live bundle `assets/index-BO1RzPax.js`

## 1. Rule jo ab har jagah lagu hai

| Cheez | Printed (paperback / hardcover) | E-book / PDF / course / test series |
|---|---|---|
| Address | zaroori | **kabhi nahi** |
| Delivery charge | seller ka set kiya (0 = free) | **0, line hi nahi dikhti** |
| Cash on delivery | allowed | **band** (server 400 `cod_not_allowed`) |
| Stock | ghatta hai | **unlimited**, ghatta nahi |
| Order ke baad | confirmed → packed → shipped → delivered | **turant complete**, seller ko kuch karna nahi |
| Cancel | ship hone tak | **kabhi bhi**, access turant hat jata hai |

Detection: `format` = `ebook / pdf / digital` → digital. Agar `format` set nahi hai
par PDF attach hai → digital. `paperback / hardcover` par PDF ho to **printed**
maana jayega (seller dono bech sakta hai), delivery tab bhi lagegi.

## 2. Jo bug mile aur theek kiye

| # | Bug | Asar | Fix |
|---|---|---|---|
| 1 | `getattr(book, "is_digital", False)` model par exist hi nahi karta | **har e-book order par ₹49 delivery + address mandatory** | `book_is_digital()` helper, format + pdf_url par |
| 2 | `has_physical` sirf products dekhta tha | book-only order par delivery/COD/address logic andha | `line_is_physical()` — product, book, course, exam sab cover |
| 3 | E-book par COD allowed tha | courier PDF kaise le jata? | server-side 400 + UI par COD chip chhup jati hai |
| 4 | Digital order `paid`/`confirmed` par atka rehta tha | seller desk "pack karo" maangta tha PDF ke liye | digital order seedha `delivered` |
| 5 | E-book ka stock ghatta tha | 0 hone par page "out of stock" | digital par stock untouched |
| 6 | Cancel ka koi button hi nahi tha | buyer phansa rehta tha | Cancel order button + confirm sheet |
| 7 | COD cancel par `payment_status = refunded` | jhootha refund | COD → `cancelled`, online → `refunded` |
| 8 | Cancel se course enrollment nahi hatta tha | paisa wapas, course chalu | enrollment delete + student_count fix |
| 9 | Checkout me har book physical maani jaati thi | digital cart par address maangta tha | frontend me bhi `isDigitalBook()` |
| 10 | Dummy mode me order ho jata tha | **koi bhi free book le jata** | `payments_off` 503 (admin chhod kar) |
| 11 | Admin ko har jagah "Admin access — sab kuch free" | shor | banners hata diye, access waisa hi |

## 3. Payments: ab exactly kya hota hai

* `GET /payments/config` → `{"configured": false, "mode": "dummy"}` (aaj).
* Non-admin ka koi bhi purchase → **503 `payments_off`**.
* Cart / book / exam / checkout button → *"Payment jald shuru hoga"* (disabled).
* Admin → sab free, bina kisi message ke, order bhi kar sakta hai (testing ke liye).
* Keys Render me daalte hi (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, webhook secret)
  `gateway_mode()` → `razorpay` aur wahi buttons khud chal padenge — **koi code change nahi**.

## 4. Reader v3 (archive.org jaisa)

* **Ek page** mode: page sirf *jaan-boojh* kar badalta hai — side ke ⬅➡, 70px ka saaf
  horizontal swipe, page number box, slider, arrow keys. Tap / haath lagana / scroll
  page nahi badalta.
* **Scroll** mode: poori book ek lambi patti, aankh se pehle pages load, 20 page door
  wale release (400-page book bhi phone par halki).
* Fit "Poora / Chauda", night dimmer, cream/night theme, fullscreen, page number +
  "~X min baaki", khatam ki jagah yaad.
* Protection waisi hi: server-rendered watermarked JPEG, koi PDF browser tak nahi,
  copy/print/save band, tab chhupate hi blur.

## 5. Ab bhi baaki (imaandaari se)

1. **Razorpay keys** — aapke haath me. Uske bina paisa nahi aayega.
2. **Asli refund API call** abhi nahi hai — cancel par sirf status/refund flag lagta hai;
   keys aane ke baad Razorpay refund endpoint jodna hoga.
3. **Order/cancel par notification** (email/WhatsApp/SMS) nahi jaata.
4. **Seller payout/ledger** page abhi nahi bana (commission, pending payout, statement).
5. **Invoice/GST PDF** download nahi hai.
6. Exam series cancel par attempt history rehti hai (access band, record safe) — ye jaan-boojh kar hai.
