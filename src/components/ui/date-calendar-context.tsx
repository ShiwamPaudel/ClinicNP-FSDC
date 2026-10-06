"use client";

/**
 * date-calendar-context.tsx — which calendar every date box opens in.
 *
 * Set once for the shop in Settings → Company and handed down from the app
 * layout, so no page has to thread it through its forms. Anything rendered
 * outside the provider gets the Nepali calendar, which is what every date box
 * showed before the setting existed.
 */
import { createContext, useContext } from "react";
import { DEFAULT_DATE_CALENDAR, type DateCalendar } from "@/lib/calendar-view";

const DateCalendarContext = createContext<DateCalendar>(DEFAULT_DATE_CALENDAR);

export function DateCalendarProvider({
  calendar,
  children,
}: {
  calendar: DateCalendar;
  children: React.ReactNode;
}) {
  return (
    <DateCalendarContext.Provider value={calendar}>
      {children}
    </DateCalendarContext.Provider>
  );
}

export function useDateCalendar(): DateCalendar {
  return useContext(DateCalendarContext);
}
