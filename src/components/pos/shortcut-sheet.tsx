"use client";

import { Dialog } from "@/components/ui/dialog";

/**
 * Every key the counter answers to, in the order a bill is made. Each one is
 * wired in pos-screen, search-box, bill-table or payment-pane; a key listed
 * here that does nothing is a bug, which is how F2 was found (C-031).
 */
const SECTIONS: { title: string; keys: [string, string][] }[] = [
  {
    title: "The bill",
    keys: [
      ["F2", "Start a new bill (asks first if this one has anything on it)"],
      ["F4", "Attach a patient — or P when not typing in a box"],
      ["F7", "Hold this bill"],
      ["F8", "Held bills: ↑ ↓ and Enter, or the number"],
      ["F9", "Save & print"],
    ],
  },
  {
    title: "Adding",
    keys: [
      ["Type + Enter", "Search and add a medicine or service"],
      ["↑ / ↓", "Move through search results"],
      ["F3", "Narrow the search to medicines or services"],
      ["Esc", "Clear the search, or go back to it from anywhere"],
    ],
  },
  {
    title: "On a medicine line",
    keys: [
      ["Tab", "Quantity → rate → discount"],
      ["U", "Switch unit (Box / Strip / Tablet)"],
      ["B", "Choose a different batch"],
      ["Del", "Remove the line"],
      ["Enter", "Back to the search for the next one"],
    ],
  },
  {
    title: "Payment",
    keys: [
      ["Enter (empty search)", "Go to payment"],
      ["Alt+1 / Alt+2 / Alt+3", "Cash / QR / Dues"],
      ["Enter (in Tendered)", "Save & print"],
    ],
  },
  {
    title: "Anywhere in the app",
    keys: [
      ["F2", "Open New bill"],
      ["F1 or ?", "Show this help (on the counter)"],
    ],
  },
];

export function ShortcutSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" className="max-w-lg">
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-sage-500">
              {section.title}
            </h3>
            <div className="flex flex-col gap-1.5">
              {section.keys.map(([key, desc]) => (
                <div key={key + desc} className="flex items-center justify-between gap-4">
                  <span className="text-[14px] text-sage-700">{desc}</span>
                  <kbd className="shrink-0 rounded-[6px] border border-line bg-cream-100 px-2 py-0.5 text-[12px] font-semibold text-sage-950">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
