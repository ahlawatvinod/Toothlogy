/** Print, or save as PDF, with the browser's own print dialog. */

'use client';

import { Button } from '@/design-system';

export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      Print or save as PDF
    </Button>
  );
}
