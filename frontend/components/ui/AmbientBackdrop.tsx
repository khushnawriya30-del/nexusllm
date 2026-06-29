// Fixed, full-screen cosmic gradient behind every page so the whole app shares
// the 3D landing's atmosphere. Pure CSS, zero JS cost, pointer-events-none.
export function AmbientBackdrop() {
  return (
    <div
      aria-hidden
      className="nx-ambient pointer-events-none fixed inset-0"
      style={{ zIndex: 0 }}
    />
  );
}
