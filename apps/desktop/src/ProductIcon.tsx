// Original 24-unit line glyphs: consistent optical size and no font/emoji dependency.
const paths: Record<string, string> = {
  Core: 'M12 2 22 12 12 22 2 12Z M12 7 17 12 12 17 7 12Z',
  Assistant: 'M3 12h2l2-7 3 14 3-14 3 14 2-7h3',
  Missions: 'M4 20 20 4 M9 4h11v11 M4 10v10h10',
  Devices: 'M3 4h18v13H3Z M8 21h8 M12 17v4',
  Remote: 'M3 5h7v6H3Z M14 13h7v6h-7Z M7 14v4h4 M13 6h4v4',
  Memory: 'M5 4h14v16H5Z M9 8h6 M9 12h6 M9 16h3',
  Automations:
    'M6 7a8 8 0 0 1 14 5 M18 17a8 8 0 0 1-14-5 M6 3v4h4 M18 21v-4h-4',
  Calls: 'M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4c-8 4-21-9-16-16Z',
  Security: 'M12 2 21 6v6c0 5-9 10-9 10S3 17 3 12V6Z M8 12l3 3 5-6',
  Owner: 'M9 4h6l2 3-2 4H9L7 7Z M4 21v-4l5-3h6l5 3v4',
  Approvals: 'M6 3h12v18H6Z M9 11l2 2 4-5 M9 17h6',
  Diagnostics: 'M3 18V6 M3 18h18 M6 14l4-5 4 3 6-8',
  Settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
};
export function ProductIcon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.Core} />
    </svg>
  );
}
