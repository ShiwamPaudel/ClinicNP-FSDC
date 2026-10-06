"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calendar,
} from "lucide-react";
import {
  canStep,
  formatInCalendar,
  maskTypedDate,
  monthGrid,
  numericInCalendar,
  parseBsValue,
  parseTypedDate,
  stepView,
  switchCalendar,
  todayBsText,
  viewContaining,
  type DateCalendar,
  type MonthView,
} from "@/lib/calendar-view";
import { useDateCalendar } from "@/components/ui/date-calendar-context";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]; // Sun..Sat

/** The popup's width, and the gap it keeps from the edge of the screen. */
const POPUP_WIDTH = 288;
const EDGE_GAP = 8;

export interface DatePickerBSProps {
  /** Selected date as denormalized BS text "YYYY-MM-DD", or empty. */
  value?: string;
  onChange: (bsText: string) => void;
  id?: string;
  placeholder?: string;
  /** Offer "Clear", for a date that may be left empty. Emits "". */
  clearable?: boolean;
  /**
   * Also let the date be typed, not only picked off the grid. Off by default:
   * on most screens a date is chosen, and a box that looks typeable invites
   * free text nobody validates. It is on where somebody is copying a date off
   * a piece of paper — an expiry off a medicine pack — because reaching for
   * 2027 on a month grid is eleven clicks and typing it is ten keys.
   */
  typable?: boolean;
}

/**
 * The date box. Takes and emits BS text ("2083-04-01") whichever calendar it
 * shows, so nothing behind it changes (D-137).
 *
 * It opens in the shop's calendar from Settings → Company and writes the
 * chosen date in that calendar too. The Nepali / English switch inside flips
 * the grid for this one pick, then the next open starts from the setting
 * again.
 */
export function DatePickerBS({
  value,
  onChange,
  id,
  placeholder = "Select date",
  clearable = false,
  typable = false,
}: DatePickerBSProps) {
  const shopCalendar = useDateCalendar();
  const selected = parseBsValue(value) ? value! : "";

  const [open, setOpen] = useState(false);
  /** How far left the popup moves so it stays on a narrow screen. */
  const [shift, setShift] = useState(0);
  /**
   * What is in the typed box while somebody is in it. The committed value
   * stays in `value` throughout: a half-typed "2083-0" parses to nothing and
   * simply does not commit, so backspacing through a date never destroys the
   * one already saved.
   */
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [view, setView] = useState<MonthView>(() =>
    viewContaining(shopCalendar, selected),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on a click anywhere else, or on Escape.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggleOpen() {
    if (!open) {
      // Every open starts from the shop's calendar, on the chosen date's month.
      setView(viewContaining(shopCalendar, selected));
      // A box near the right of a phone screen would push the popup off it.
      const rect = buttonRef.current?.getBoundingClientRect();
      const over = rect ? rect.left + POPUP_WIDTH - (window.innerWidth - EDGE_GAP) : 0;
      setShift(rect && over > 0 ? -Math.min(over, Math.max(0, rect.left - EDGE_GAP)) : 0);
    }
    setOpen((o) => !o);
  }

  function showCalendar(calendar: DateCalendar) {
    if (calendar !== view.calendar) setView(switchCalendar(view, selected));
  }

  function pick(bsText: string) {
    onChange(bsText);
    setOpen(false);
  }

  /** A typed date says which calendar it is in by its year ("2028-…" English,
   *  "2083-…" Nepali), so the pack and the Nepali bill both type in as
   *  printed. The shop's setting only decides how the result is shown. */
  function commitTyped(input: string) {
    // Dashes are put in as the digits arrive, so "20830609" needs no `-` or
    // `/` from the person typing it.
    const raw = maskTypedDate(input, text);
    setText(raw);
    if (raw.trim() === "") {
      if (clearable && selected) onChange("");
      return;
    }
    const bsText = parseTypedDate(raw);
    if (bsText) onChange(bsText);
  }

  const grid = monthGrid(view);
  const todayText = todayBsText();
  const label = selected ? formatInCalendar(selected, shopCalendar) : placeholder;

  return (
    <div ref={rootRef} className="relative">
      {typable ? (
        <div className="flex h-10 w-full items-center rounded-[8px] border border-line bg-cream-50 pl-3 pr-1 focus-within:border-sage-500 focus-within:ring-2 focus-within:ring-sage-500/30">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            // Formatted when it is being read, plain digits when it is being
            // edited: "6 Ashwin 2083" is the clearer label but nobody can type
            // into it.
            value={typing ? text : label}
            placeholder={typing ? "YYYY-MM-DD" : placeholder}
            onFocus={(e) => {
              setTyping(true);
              setText(numericInCalendar(selected, shopCalendar));
              // The whole date is selected, so a box that already holds one —
              // a new purchase row's four-years-ahead expiry — is typed over
              // rather than backspaced out ten characters at a time.
              const box = e.currentTarget;
              requestAnimationFrame(() => box.select());
            }}
            onChange={(e) => commitTyped(e.target.value)}
            onBlur={() => setTyping(false)}
            onKeyDown={(e) => {
              // This box lives inside forms whose Enter would otherwise save
              // the whole purchase.
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className={cn(
              "h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-sage-300",
              selected || typing ? "text-sage-950" : "text-sage-300",
            )}
          />
          <button
            ref={buttonRef}
            type="button"
            onClick={toggleOpen}
            aria-expanded={open}
            aria-label="Open calendar"
            title="Open calendar"
            className="rounded-[6px] p-2 text-sage-500 hover:bg-cream-200 hover:text-sage-900"
          >
            <Calendar className="h-4 w-4 shrink-0" />
          </button>
        </div>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          id={id}
          onClick={toggleOpen}
          aria-expanded={open}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-[8px] border border-line bg-cream-50 px-3 text-left text-[14px]",
            selected ? "text-sage-950" : "text-sage-300",
          )}
        >
          <span className="truncate">{label}</span>
          <Calendar className="h-4 w-4 shrink-0 text-sage-500" />
        </button>
      )}

      {open && (
        <div
          style={{ width: POPUP_WIDTH, left: shift }}
          className="absolute z-50 mt-1 rounded-[10px] border border-line bg-cream-50 p-3 shadow-[0_1px_2px_rgb(22_36_27_/_6%),0_4px_12px_rgb(22_36_27_/_5%)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Calendar"
              className="inline-flex rounded-[999px] border border-line bg-cream-100 p-0.5"
            >
              <CalendarChip
                active={view.calendar === "bs"}
                onClick={() => showCalendar("bs")}
              >
                <span lang="ne" className="deva">
                  नेपाली
                </span>
              </CalendarChip>
              <CalendarChip
                active={view.calendar === "ad"}
                onClick={() => showCalendar("ad")}
              >
                English
              </CalendarChip>
            </div>
            {clearable && selected && (
              <button
                type="button"
                onClick={() => pick("")}
                className="rounded-[8px] px-2 py-1 text-[12px] text-sage-500 hover:bg-cream-200 hover:text-sage-900"
              >
                Clear
              </button>
            )}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <div className="flex">
              <StepButton
                onClick={() => setView(stepView(view, -12))}
                disabled={!canStep(view, -12)}
                label="Previous year"
              >
                <ChevronsLeft className="h-4 w-4" />
              </StepButton>
              <StepButton
                onClick={() => setView(stepView(view, -1))}
                disabled={!canStep(view, -1)}
                label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </StepButton>
            </div>
            <div className="min-w-0 text-center" aria-live="polite">
              <div
                className={cn(
                  "text-[15px] font-semibold text-sage-900",
                  grid.titleScript === "np" && "deva",
                )}
              >
                {grid.title}
              </div>
              <div className="text-[11px] text-sage-500">{grid.subtitle}</div>
            </div>
            <div className="flex">
              <StepButton
                onClick={() => setView(stepView(view, 1))}
                disabled={!canStep(view, 1)}
                label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </StepButton>
              <StepButton
                onClick={() => setView(stepView(view, 12))}
                disabled={!canStep(view, 12)}
                label="Next year"
              >
                <ChevronsRight className="h-4 w-4" />
              </StepButton>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w, i) => (
              <div
                key={i}
                className={cn(
                  "py-1 text-[11px] font-semibold",
                  i === 6 ? "text-danger-600" : "text-sage-500",
                )}
              >
                {w}
              </div>
            ))}
            {Array.from({ length: grid.leadingBlanks }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {grid.days.map((d) => {
              const isSelected = !d.disabled && d.bsText === selected;
              const isToday = !d.disabled && d.bsText === todayText;
              return (
                <button
                  key={d.day}
                  type="button"
                  disabled={d.disabled}
                  onClick={() => pick(d.bsText)}
                  aria-label={d.label}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-[8px] text-[13px] tnum",
                    d.disabled
                      ? "cursor-not-allowed text-sage-300"
                      : isSelected
                        ? "bg-sage-700 text-cream-50"
                        : "hover:bg-cream-200",
                    !d.disabled && !isSelected && d.weekday === 6 && "text-danger-600",
                    !d.disabled && !isSelected && isToday && "ring-1 ring-sage-500",
                  )}
                >
                  {d.day}
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="mt-2 border-t border-line pt-2 text-[11px] text-sage-500">
              {formatInCalendar(selected, "bs")} = {formatInCalendar(selected, "ad")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CalendarChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-[999px] px-2.5 py-0.5 text-[12px] transition-colors",
        active
          ? "bg-sage-700 text-cream-50"
          : "text-sage-600 hover:text-sage-900",
      )}
    >
      {children}
    </button>
  );
}

function StepButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-[8px] p-1 hover:bg-cream-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
