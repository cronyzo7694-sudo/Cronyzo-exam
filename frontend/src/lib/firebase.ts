/**
 * Real Google sign-in via Firebase (project: kineora-exam).
 *
 * Flow
 * ----
 *   popup  →  Firebase verifies with Google  →  ID token  →  POST /api/auth/google
 *                                                              └─ backend checks the
 *                                                                 token against Google's
 *                                                                 live signing certs
 *
 * The whole module is lazy: `firebase/app` and `firebase/auth` are only fetched
 * when the visitor actually clicks the button, so the initial bundle stays lean
 * and browsers without a Firebase config never download them at all.
 *
 * Configuration comes from Vite env (see `frontend/.env`):
 *   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
 *   VITE_FIREBASE_APP_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_SENDER_ID
 *
 * If the config is missing the caller falls back to the server's own mode
 * report (GIS / demo), so nothing here can break the page.
 */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

/** True when the build actually has a Firebase web config. */
export function firebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

export function firebaseProjectId(): string {
  return config.projectId || "";
}

type FirebaseAuthModule = typeof import("firebase/auth");
type FirebaseAppType = import("firebase/app").FirebaseApp;

let cached: { app: FirebaseAppType; auth: FirebaseAuthModule } | null = null;

/** Lazily initialise the Firebase app + auth module exactly once. */
async function getFirebase(): Promise<{ app: FirebaseAppType; auth: FirebaseAuthModule }> {
  if (cached) return cached;
  const [{ initializeApp, getApps, getApp }, auth] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
  ]);
  const app = getApps().length ? getApp() : initializeApp(config as any);
  // Persist across reloads so a refresh does not force a new popup
  try {
    await auth.setPersistence(auth.getAuth(app), auth.browserLocalPersistence);
  } catch {
    /* persistence is best-effort */
  }
  cached = { app, auth };
  return cached;
}

export type GoogleResult = {
  idToken: string;
  email?: string | null;
  name?: string | null;
  photo?: string | null;
};

/**
 * Open the Google account picker and return a Firebase ID token.
 *
 * Throws a friendly Error on cancel, blocked popup, or unauthorised domain —
 * the caller shows it inline instead of a generic failure.
 */
export async function signInWithGooglePopup(): Promise<GoogleResult> {
  const { app, auth } = await getFirebase();
  const instance = auth.getAuth(app);
  const provider = new auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const result = await auth.signInWithPopup(instance, provider);
    const user = result.user;
    const idToken = await user.getIdToken(true);
    return {
      idToken,
      email: user.email,
      name: user.displayName,
      photo: user.photoURL,
    };
  } catch (err: any) {
    const code = String(err?.code || "");
    if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) {
      throw new Error("Google sign-in cancelled");
    }
    if (code.includes("unauthorized-domain")) {
      throw new Error(
        "This domain is not authorised — add it in Firebase → Authentication → Settings → Authorized domains.",
      );
    }
    if (code.includes("operation-not-allowed")) {
      throw new Error(
        "The Google provider is disabled — enable it in Firebase → Authentication → Sign-in method.",
      );
    }
    if (code.includes("popup-blocked")) {
      throw new Error("The browser blocked the Google popup — allow popups and retry.");
    }
    throw new Error(err?.message || "Google sign-in failed");
  }
}
