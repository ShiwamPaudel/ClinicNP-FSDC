/**
 * The sign-in screen fills the window rather than floating a card in the
 * middle of it, so this layout gets out of the way and lets the page own the
 * viewport.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="min-h-screen bg-cream-100">{children}</main>;
}
