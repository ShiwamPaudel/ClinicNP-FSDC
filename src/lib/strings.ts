/**
 * strings.ts — all user-visible strings for POS and common actions.
 * Enables the English/Nepali label toggle later. Never hardcode repeated labels in JSX.
 * ABSOLUTE RULE: plain language only. No backend vocabulary (Rules.md §1).
 */

import { DEFAULT_APP_NAME } from "@/lib/app-name";

export const strings = {
  // brand — derived from the enabled modules (D-025). Screens that know the
  // module flags should call appNameFor(); this default covers the rest.
  appName: DEFAULT_APP_NAME,

  // common actions
  save: "Save",
  cancel: "Cancel",
  add: "Add",
  edit: "Edit",
  delete: "Delete",
  search: "Search",
  print: "Print",
  back: "Back",
  close: "Close",
  confirm: "Confirm",

  // auth
  login: "Log in",
  logout: "Log out",
  username: "Username",
  password: "Password",
  pin: "PIN",
  switchUser: "Switch user",
  wrongLogin: "Wrong username or password. Please try again.",
  wrongPin: "That PIN didn't match. Try again.",

  // status / connectivity (plain language only)
  saved: "Saved",
  billSaved: "Bill saved",
  online: "Online",
  offline: "Working offline",
  offlineWaiting: (n: number) =>
    `Working offline — ${n} ${n === 1 ? "bill" : "bills"} waiting to send`,
  couldNotSave: "Couldn't save — check your connection and try again",
  somethingWentWrong: "Something went wrong. Please try again.",
  nothingHereYet: "Nothing here yet",

  // company / settings
  companyDetails: "Company details",
  pharmacyName: "Pharmacy name",
  address: "Address",
  phone: "Phone",
  panNumber: "PAN number",
  ddaNumber: "DDA registration number",
  vatRegistered: "VAT registered",
  invoiceFooter: "Invoice footer message",
  expiryAlertWindow: "Near-expiry alert window",
  roundGrandTotal: "Round grand total to nearest rupee",
  minRateIsCost: "Warn when a rate is below what you paid",

  // users
  users: "Users",
  addUser: "Add user",
  fullName: "Full name",
  role: "Role",
  roleAdmin: "Admin (Owner)",
  roleStaff: "Staff (Counter)",
  roleAccountant: "Accountant (read-only)",
  roleDoctor: "Doctor (own consultations only)",
  canEditRate: "Can edit rate on bill",
  active: "Active",

  // empty states
  emptyStock: "No items yet. Add your first medicine to start tracking stock.",
  emptyUsers: "No users yet. Add your first user to get started.",

  // clinic counter (Phase 3)
  service: "Service",
  services: "Services",
  medicine: "Medicine",
  doctor: "Doctor",
  chooseDoctor: "Choose a doctor",
  noDoctor: "No doctor",
  laboratory: "Laboratory",
  whichLaboratory: "Which laboratory?",
  attachPatient: "Attach patient",
  changePatient: "Change",
  noPatientOnBill: "No patient on this bill",
  patientNeeded: "This bill has a service on it — say who it is for",
  registerSomeoneNew: "Register someone new",
  whoIsThisFor: "Who is this bill for?",
  searchPatientHint: "Name, phone or patient number",
  nobodyByThatName: "Nobody by that name yet.",
  chargeFullRate: "Charge the full rate",
  putItBack: "Put it back",
  followupOverridden: "Follow-up rule overridden — charged in full.",
  sampleForTesting: "SAMPLE FOR TESTING",
  testsRequested: "Tests requested",
  sampleCollectedBy: "Sample collected by",
  notABill: "This slip is not a bill.",

  // booked consultations
  consultations: "Consultations",
  bookConsultation: "Book a consultation",
  bookedConsultations: "Booked consultations",
  whenIsIt: "When is it?",
  atWhatTime: "At what time?",
  howLong: "How long is it expected to take?",
  reasonGiven: "Reason given",
  nobodyBookedToday: "Nobody is booked in today.",
  consultationBooked: "Consultation booked",
  consultationMoved: "Consultation moved",
  consultationCancelled: "Consultation cancelled",
  whyCancelled: "Why is it being cancelled?",

  // alerts on a phone
  alertsOnThisPhone: "Alerts on this phone",
  turnAlertsOn: "Turn alerts on",
  turnAlertsOff: "Turn alerts off",
  sendTestAlert: "Send a test alert",
  alertsOn: "Alerts are on for this phone",
  alertsOff: "This phone is not being alerted",
  alertsBlocked:
    "This phone has been told not to show alerts from here. Allow them in the browser settings, then try again.",
  alertsUnsupported: "This phone cannot show alerts from here.",
  testAlertSent: "Test alert sent. It should appear in a moment.",

  // dues: sold now, paid for later
  dues: "Dues",
  owed: "Owed",
  leftOnDues: "Left on dues",
  receivePayment: "Receive payment",
  nothingOwed: "Nobody owes anything. Every bill is paid up.",
  noPaymentsYet: "No dues have been paid back yet.",
} as const;

/** Nepali labels for the core POS actions (toggleable later). */
export const npLabels = {
  newBill: "नयाँ बिल",
  save: "सुरक्षित",
  billSaved: "बिल बन्यो",
  // the clinic counter's core words
  service: "सेवा",
  medicine: "औषधि",
  doctor: "डाक्टर",
  patient: "बिरामी",
  laboratory: "प्रयोगशाला",
  followUp: "फलोअप",
  consultation: "परामर्श",
  attachPatient: "बिरामी थप्नुहोस्",
} as const;
