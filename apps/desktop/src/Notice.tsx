/** Inline notices stay beside their cause and never accumulate background toasts.
 * Errors/security notices have no timeout. Repeated identical source state keeps
 * the same DOM node, avoiding repeated screen-reader announcements. */
export function Notice({
  message,
  severity = 'error',
}: {
  message: string;
  severity?: 'info' | 'success' | 'warning' | 'error' | 'critical';
}) {
  if (!message) return null;
  const urgent = severity === 'error' || severity === 'critical';
  return (
    <div
      className="product-notice"
      data-severity={severity}
      role={urgent ? 'alert' : 'status'}
      aria-atomic="true"
    >
      {message}
    </div>
  );
}
