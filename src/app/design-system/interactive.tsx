/**
 * Client-side portion of the design system reference.
 *
 * Split out because Tabs, Dialog and the form field need state, and the rest of
 * the reference page is a server component. Keeping the boundary narrow means
 * only this fragment ships as client JavaScript rather than the whole page.
 */

'use client';

import { useState } from 'react';
import { Button, Dialog, Field, Input, Tabs } from '@/design-system';

export function DesignSystemInteractive() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState('');

  // Deliberately shows a *live* invalid state so the reference demonstrates the
  // error styling, the aria-invalid wiring and the announced error together.
  const emailError =
    email.length > 0 && !email.includes('@') ? 'Enter a valid email address.' : undefined;

  return (
    <div style={{ display: 'grid', gap: 'var(--tl-space-5)' }}>
      <div style={{ display: 'grid', gap: 'var(--tl-space-4)', maxWidth: '26rem' }}>
        <Field label="Full name" hint="As it appears on your dental registration.">
          {(props) => <Input {...props} placeholder="Dr. A. Sharma" />}
        </Field>

        <Field label="Email address" required error={emailError}>
          {(props) => (
            <Input
              {...props}
              type="email"
              value={email}
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
      </div>

      <Tabs
        label="Component examples"
        items={[
          {
            id: 'overview',
            label: 'Overview',
            content: (
              <p style={{ color: 'var(--tl-color-text-muted)', margin: 0 }}>
                Tabs implement the ARIA tabs pattern with roving focus. Use the arrow keys to move
                between tabs, then Enter or Space to select.
              </p>
            ),
          },
          {
            id: 'accessibility',
            label: 'Accessibility',
            content: (
              <p style={{ color: 'var(--tl-color-text-muted)', margin: 0 }}>
                Selection is signalled by colour and an underline, so it survives a colour-vision
                deficiency. Each panel is focusable, so Tab from the tab list reaches the content.
              </p>
            ),
          },
          {
            id: 'rtl',
            label: 'RTL',
            content: (
              <p style={{ color: 'var(--tl-color-text-muted)', margin: 0 }}>
                All spacing uses logical properties, so setting dir=&quot;rtl&quot; on the document
                mirrors the layout without a separate stylesheet.
              </p>
            ),
          },
        ]}
      />

      <div>
        <Button variant="secondary" onClick={() => setDialogOpen(true)}>
          Open dialog
        </Button>

        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Native dialog"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setDialogOpen(false)}>
                Confirm
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, color: 'var(--tl-color-text-muted)' }}>
            Built on the native &lt;dialog&gt; element, so focus trapping, Escape to close and
            inert background content come from the browser rather than from our own code. Press
            Escape or click outside to dismiss.
          </p>
        </Dialog>
      </div>
    </div>
  );
}
