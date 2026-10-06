/**
 * scripts/alert-keys.mjs — make the pair of keys that alerts to a phone need.
 *
 * Run once per install, put the two lines in .env.local (and in the hosting
 * settings for the live site), and never change them again: every phone that
 * has already turned alerts on is registered against the public half, and a
 * new pair makes all of them go quiet without any error anywhere.
 *
 * Run: node scripts/alert-keys.mjs
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("");
console.log("Add these to .env.local, then restart:");
console.log("");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:you@yourclinic.com');
console.log("");
console.log("Keep the private one to yourself. Changing either of them later");
console.log("silences every phone that already has alerts switched on.");
console.log("");
