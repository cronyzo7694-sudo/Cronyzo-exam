import { Link } from "@tanstack/react-router";

/* ═══════════════════════════════════════════════════════════
   Static legal / support pages (Help, About, Terms, Privacy,
   Refund) — required for a marketplace that sells to real
   customers and takes real payments.
   ═══════════════════════════════════════════════════════════ */

const PAGES: Record<string, { title: string; body: string[] }> = {
  "/help": {
    title: "Help & Support",
    body: [
      "Cronyzo is one platform with four pillars: Learn (courses), Read (books), Shop (products) and Test (mock exams). Here is how to use each of them.",
      "1. Learning a course: Open Courses from the top navigation, pick a course and check the syllabus. Free courses enrol instantly; paid courses add to your basket and unlock the moment checkout completes. Every enrolled course appears under My Learning, where your lesson-by-lesson progress is tracked.",
      "2. Buying books: Browse the Books section. Each listing shows the author, publisher, ISBN, page count and a table of contents before you buy. E-books are delivered instantly; physical copies ship to your saved address.",
      "3. Shopping: Add products to the cart from the Shop or any product page. Delivery is free on orders above ₹999. You can save delivery addresses once and reuse them at checkout.",
      "4. Taking a test: Go to Exams, choose a paper and press Start. The test runs on a timer with a question palette — mark questions for review and submit when you are done. Your score, accuracy and question-wise review appear immediately.",
      "5. Selling: If you teach or sell, open Sell from the top navigation. Teacher and seller accounts can publish courses with modules and lessons, list books, add products and track earnings in the Seller Studio.",
      "6. Orders and refunds: Every purchase is listed under My Orders with its status, tracking and a cancellation option where eligible.",
      "For anything else, write to us at cronyzo7694@gmail.com. We answer within 24–48 working hours.",
    ],
  },
  "/about": {
    title: "About Cronyzo",
    body: [
      "Cronyzo is an Indian learning and commerce platform built around a simple frustration: students were buying courses from one place, books from another, study gear from a third, and then practising on a fourth.",
      "We brought all four together. Learners take courses taught by working engineers, designers and toppers; they buy the books those courses recommend and the gear they need, from verified storefronts; and they sit full mock exams to prove what they learnt.",
      "For creators, Cronyzo provides a course builder with modules and lessons, a product catalogue with live stock, a branded storefront and an earnings dashboard that shows the platform fee and the payout for every single sale.",
      "We keep the platform fee flat and published. What you see in the Seller Studio is exactly what you keep — no listing charges, no monthly rent, no hidden deductions.",
      "We are a technology startup based in India, building for the next hundred million students who want to learn properly rather than cheaply.",
    ],
  },
  "/terms": {
    title: "Terms & Conditions",
    body: [
      "By accessing or using Cronyzo (the \"Platform\"), you agree to these Terms & Conditions.",
      "1. Use of service: The Platform provides online courses, digital and physical books, consumer products and practice examinations for personal, non-commercial use. You may not resell, redistribute, scrape or reverse-engineer any content without our written consent.",
      "2. Accounts: You are responsible for safeguarding your login credentials and for all activity under your account. You must be at least 18 years old to open a seller or teacher account. Tell us immediately if you believe your account has been compromised.",
      "3. Course access: Purchasing a course grants you a personal, non-transferable, lifetime licence to access its lessons while the course remains published. Sharing your login or reselling access is a breach of these terms.",
      "4. Marketplace listings: Sellers are responsible for the accuracy of their listings, the legality of the goods they sell, their stock levels and the fulfilment of orders. Cronyzo is not a party to the sale contract between a seller and a buyer, though we step in to resolve disputes.",
      "5. Platform fee: Cronyzo charges the percentage shown in the Seller Studio on every completed sale. The fee, and the payout that follows it, are displayed before each sale is confirmed.",
      "6. Payments: Payments are processed by our payment partners. Prices include applicable taxes unless stated otherwise. We may cancel an order and issue a full refund where a listing is materially misdescribed, counterfeit or unavailable.",
      "7. Reviews and ratings: Reviews must describe a genuine interaction. We remove reviews that are fraudulent, abusive or written in breach of these terms.",
      "8. No guarantee: We work hard to keep the Platform accurate and available, but it is provided \"as is\" without warranties of any kind. We do not guarantee specific exam outcomes, marks or employment results.",
      "9. Intellectual property: Course content, book covers, product images and exam material remain the property of their respective owners. Cronyzo grants you a limited licence to view them for personal use.",
      "10. Suspension: We may suspend or terminate an account that breaches these terms, infringes intellectual property rights, or is used for fraudulent activity.",
      "11. Changes: We may update these Terms at any time. Continued use of the Platform constitutes acceptance of the revised Terms.",
      "12. Governing law: These Terms are governed by the laws of India, and the courts at Bengaluru, Karnataka have exclusive jurisdiction.",
    ],
  },
  "/privacy": {
    title: "Privacy Policy",
    body: [
      "Your privacy matters to us. This policy explains exactly what we collect, why we collect it and what we never do with it.",
      "1. Information we collect: Account details you provide (name, email, optional phone number), your purchases, course progress and exam attempts, plus the delivery address you save for orders. We also collect standard technical data such as IP address, device type and pages visited.",
      "2. How we use it: To provide the Platform (deliver your course access, ship your order, show your progress), to operate payments, to prevent fraud and abuse, and to send you service messages about your account and orders. We do not sell your personal data, ever.",
      "3. Cookies and local storage: We use a session token in your browser's local storage to keep you signed in, and a theme preference so the interface matches your choice. You can clear these at any time without losing anything on our servers.",
      "4. Sharing: We share only what is necessary — your delivery details with the seller fulfilling your order, and your payment details with our payment processor. We never sell or rent your data to third parties for marketing.",
      "5. Media: Product images and course thumbnails are served from our media CDN. Uploaded files are stored against your own listings only.",
      "6. Retention: Order records are retained for the period required by Indian accounting and tax law. Analytics data is aggregated and anonymised after 24 months.",
      "7. Your rights: You can request a copy of your data, correct it, or ask us to delete your account. Write to privacy@cronyzo.app and we will action it within 30 days.",
      "8. Security: We use hashed passwords, signed session tokens, rate limiting and restricted internal access. No method of transmission or storage is 100% secure, but we will notify you and any relevant authority if a breach affects your data.",
      "9. Children: Cronyzo is not directed at children under 13. If you believe a child has created an account, contact us and we will remove it.",
    ],
  },
  "/refund": {
    title: "Refund & Cancellation Policy",
    body: [
      "We want refunds to be straightforward, because a refund should never be harder than the purchase.",
      "1. Digital courses: Because a course's lessons are available the moment payment succeeds, course purchases are generally non-refundable. We will issue a full refund if the course is materially different from its description, if the lessons are broken or unavailable for more than 72 hours, or if you request a refund within 7 days and have watched less than 10% of the lessons.",
      "2. E-books: E-book purchases are non-refundable once the file has been downloaded, for the same reason. If the file is corrupted or the wrong book was delivered, we will replace it or refund it in full.",
      "3. Physical books and products: You may request a return within 7 days of delivery for any product in its original condition. We arrange a pickup from your address and refund to the original payment method within 5–7 working days of the item reaching us. Products that are damaged, used or missing components are not returnable.",
      "4. Cancellation before dispatch: You can cancel an order from My Orders at any time before it is marked Shipped. Payment is refunded in full to the source account within 5–7 working days.",
      "5. Orders paid cash on delivery: If you refuse delivery, the order is closed and no refund is processed, because the goods were never collected.",
      "6. Failed or double-charged payments: If a transaction fails after a debit, or you are charged twice, contact us with your bank reference number and we will reverse the duplicate or refund the failed debit within 5 working days.",
      "7. How to request: Email cronyzo7694@gmail.com with your name, email, order number and a short description. We respond within 7–10 working days.",
      "8. Disputes: We would much rather fix a problem than argue about a refund. Contact us first and we will almost always find a fair resolution.",
    ],
  },
};

export function LegalPage({ path }: { path: string }) {
  const page = PAGES[path] || { title: "Page", body: [] };
  const signedIn = Boolean(localStorage.getItem("access_token"));
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link
        to={signedIn ? "/dashboard" : "/"}
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        ← {signedIn ? "Back to Dashboard" : "Back to home"}
      </Link>
      <h1 className="mb-4 mt-3 text-2xl font-semibold tracking-tight">{page.title}</h1>
      <div className="space-y-3">
        {page.body.map((para, i) => (
          <p key={i} className="text-sm leading-relaxed text-muted-foreground">
            {para}
          </p>
        ))}
      </div>
      <div className="mt-8 border-t pt-6 text-xs text-muted-foreground/70">
        Questions or concerns? Reach us at{" "}
        <a href="mailto:cronyzo7694@gmail.com" className="text-primary underline">
          cronyzo7694@gmail.com
        </a>
      </div>
    </div>
  );
}
