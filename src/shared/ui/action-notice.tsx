export function ActionNotice({
  message,
  href,
  action,
}: {
  message: string;
  href: string;
  action: string;
}) {
  return (
    <div
      role="alert"
      className="border-line bg-surface mt-7 rounded-lg border p-5"
    >
      <p>{message}</p>
      <a
        href={href}
        className="text-primary mt-2 inline-block rounded-sm font-semibold underline underline-offset-4"
      >
        {action}
      </a>
    </div>
  );
}
