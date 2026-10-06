/**
 * vendor.ts — who made the software, and who to ring when it misbehaves.
 *
 * This is deliberately the only place in the product that says any of it. Once
 * somebody is logged in, every screen belongs to the clinic: their name on the
 * bill, their letterhead, their stock. A maker's badge in the corner of a
 * counter screen is the maker talking over the shopkeeper all day.
 *
 * The sign-in screen is the exception — nobody is working yet, and it is the
 * screen a new member of staff stares at while somebody explains what this
 * thing is — so the name and the support numbers live there and nowhere else.
 */

/** The company that builds and supports this software. */
export const VENDOR_NAME = "Infobytes Nepal Pvt. Ltd.";

/**
 * Support numbers, shown on the sign-in screen so they are reachable by
 * somebody who cannot get in — which is exactly when they are needed and
 * exactly when a number stored inside the software is no use.
 */
export const SUPPORT_PHONES = ["+977 984 3468715", "+977 9863 777171"] as const;
