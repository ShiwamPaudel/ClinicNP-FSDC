import { Header } from "@/components/app/header";

/** Standard back-office page frame: header bar + padded, max-width content. */
export function PageShell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <Header title={title} />
      <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
        {actions && <div className="mb-4 flex justify-end gap-2">{actions}</div>}
        {children}
      </main>
    </>
  );
}
