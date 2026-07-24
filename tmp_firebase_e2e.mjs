import fs from "node:fs";

const env = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const index = trimmed.indexOf("=");
  if (index < 0) continue;
  let value = trimmed.slice(index + 1).trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  env[trimmed.slice(0, index)] = value;
}

const email = `neurosync.test.${Date.now()}@example.com`;
const password = "Test12345";
const signup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${env.VITE_FIREBASE_API_KEY}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, returnSecureToken: true }),
});
const signupBody = await signup.json();
console.log("Firebase signup:", signup.status);
if (!signup.ok) {
  console.log(JSON.stringify(signupBody));
  process.exit(1);
}

const backend = await fetch("http://127.0.0.1:3000/api/auth/firebase", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ idToken: signupBody.idToken, displayName: "NeuroSync Test", role: "parent" }),
  signal: AbortSignal.timeout(10000),
});
console.log("Backend Firebase exchange:", backend.status);
console.log(JSON.stringify(await backend.json()));
