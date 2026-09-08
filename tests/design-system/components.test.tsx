// @vitest-environment happy-dom

/**
 * TL-TEST-DESIGNSYSTEM-001 — Design system accessibility contracts
 *
 * These tests assert the *accessibility* contract of each primitive rather than
 * its appearance. Appearance is reviewed visually; the accessibility wiring is
 * invisible in a screenshot and silently breaks under refactoring, which is
 * exactly what makes it worth automating.
 *
 * Queries are deliberately role- and label-based (`getByRole`, `getByLabelText`)
 * rather than by class name. A test that finds a button by CSS class passes even
 * when the button has no accessible name; one that finds it by role and name
 * fails — which is the point.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '@/design-system/components/button';
import { Field, Input } from '@/design-system/components/field';
import { Alert, Badge, Skeleton, Spinner } from '@/design-system/components/feedback';
import { EmptyState, ErrorState, LoadingState } from '@/design-system/components/state';
import { Card, Table } from '@/design-system/components/surfaces';
import { Tabs } from '@/design-system/components/tabs';

afterEach(cleanup);

describe('Button', () => {
  it('exposes an accessible name', () => {
    render(<Button>Book appointment</Button>);
    expect(screen.getByRole('button', { name: 'Book appointment' })).toBeDefined();
  });

  it('keeps a busy button focusable and named', () => {
    // `disabled` would remove it from the tab order, throwing a keyboard user's
    // focus to the top of the document the instant they submit a form.
    render(<Button loading>Saving</Button>);
    const button = screen.getByRole('button', { name: /Saving/ });

    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('blocks activation while busy', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Submit
      </Button>,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('activates normally when not busy', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Submit</Button>);

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('defaults to type=button so it cannot submit a form by accident', () => {
    render(<Button>Cancel</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });
});

describe('Field', () => {
  it('associates the label with the control', () => {
    render(<Field label="Email address">{(props) => <Input {...props} type="email" />}</Field>);
    // Resolvable by label means the association actually exists.
    expect(screen.getByLabelText('Email address')).toBeDefined();
  });

  it('links the hint through aria-describedby', () => {
    render(
      <Field label="Phone" hint="Include your country code.">
        {(props) => <Input {...props} />}
      </Field>,
    );

    const input = screen.getByLabelText('Phone');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain('country code');
  });

  it('announces an error and marks the control invalid', () => {
    // The most common form accessibility failure: an error that is visible but
    // not associated, so a screen reader user never learns why submission failed.
    render(
      <Field label="Email address" error="Enter a valid email address.">
        {(props) => <Input {...props} />}
      </Field>,
    );

    const input = screen.getByLabelText('Email address');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Enter a valid email address.');
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);
  });

  it('describes by both hint and error when both are present', () => {
    render(
      <Field label="Password" hint="At least 10 characters." error="Too short.">
        {(props) => <Input {...props} />}
      </Field>,
    );

    const describedBy = screen.getByLabelText('Password').getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ')).toHaveLength(2);
  });

  it('marks a required field for both sighted and screen-reader users', () => {
    // The asterisk is aria-hidden and paired with visually hidden text, so the
    // requirement is not conveyed by a symbol alone.
    render(<Field label="Full name" required>{(props) => <Input {...props} />}</Field>);

    expect(screen.getByLabelText(/Full name/).hasAttribute('required')).toBe(true);
    expect(screen.getByText('(required)')).toBeDefined();
  });

  it('gives each field instance a unique id', () => {
    render(
      <>
        <Field label="First">{(props) => <Input {...props} />}</Field>
        <Field label="Second">{(props) => <Input {...props} />}</Field>
      </>,
    );

    expect(screen.getByLabelText('First').id).not.toBe(screen.getByLabelText('Second').id);
  });
});

describe('Alert', () => {
  it('conveys severity in text, not only colour', () => {
    // ~8% of men have a colour-vision deficiency; a red panel and a green panel
    // are otherwise the same panel.
    render(<Alert tone="danger">Payment failed.</Alert>);
    expect(screen.getByRole('alert').textContent).toContain('Error:');
  });

  it('interrupts for errors and waits its turn for information', () => {
    const { unmount } = render(<Alert tone="danger">Bad</Alert>);
    expect(screen.getByRole('alert').getAttribute('aria-live')).toBe('assertive');
    unmount();

    render(<Alert tone="info">Note</Alert>);
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });

  it('renders an optional title alongside the body', () => {
    render(
      <Alert tone="warning" title="Expiring soon">
        Renew within 14 days.
      </Alert>,
    );
    expect(screen.getByText('Expiring soon')).toBeDefined();
    expect(screen.getByText('Renew within 14 days.')).toBeDefined();
  });
});

describe('Badge', () => {
  it('always carries text', () => {
    render(<Badge tone="success">Verified</Badge>);
    expect(screen.getByText('Verified')).toBeDefined();
  });
});

describe('loading indicators', () => {
  it('gives the spinner an accessible label', () => {
    render(<Spinner />);
    expect(within(screen.getByRole('status')).getByText('Loading')).toBeDefined();
  });

  it('accepts a custom spinner label', () => {
    render(<Spinner label="Searching dentists" />);
    expect(screen.getByText('Searching dentists')).toBeDefined();
  });

  it('hides skeletons from assistive technology', () => {
    // A screen reader announcing eight grey rectangles is noise; the
    // surrounding LoadingState announces "loading" once instead.
    const { container } = render(<Skeleton />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('state components', () => {
  it('offers a next step in an empty state', () => {
    // An empty panel with no action is where users abandon a product.
    render(
      <EmptyState
        title="No dentists match these filters"
        description="Try widening the distance."
        action={<Button>Clear filters</Button>}
      />,
    );

    expect(screen.getByText('No dentists match these filters')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDefined();
  });

  it('announces the loading state politely', () => {
    render(<LoadingState />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows a correlation reference on an error state', () => {
    // Turns "it broke" into an exact log line.
    render(<ErrorState requestId="req_01JF3QK8" />);
    expect(screen.getByRole('alert').textContent).toContain('req_01JF3QK8');
  });

  it('uses sensible error defaults', () => {
    render(<ErrorState />);
    expect(screen.getByText('Something went wrong')).toBeDefined();
  });
});

describe('Card', () => {
  it('becomes a named region when labelled', () => {
    // Named regions give screen-reader users landmarks to navigate by.
    render(
      <Card label="Build status">
        <p>Contents</p>
      </Card>,
    );
    expect(screen.getByRole('region', { name: 'Build status' })).toBeDefined();
  });
});

describe('Table', () => {
  it('always has a caption', () => {
    render(
      <Table caption="Clinic roster">
        <tbody>
          <tr>
            <td>Row</td>
          </tr>
        </tbody>
      </Table>,
    );
    expect(screen.getByRole('table', { name: /Clinic roster/ })).toBeDefined();
  });

  it('keeps a hidden caption in the accessibility tree', () => {
    render(
      <Table caption="Hidden but present" visuallyHiddenCaption>
        <tbody>
          <tr>
            <td>Row</td>
          </tr>
        </tbody>
      </Table>,
    );
    expect(screen.getByText('Hidden but present')).toBeDefined();
  });

  it('makes the scroll container focusable', () => {
    // A scroll area reachable only by mouse hides its off-screen columns from
    // keyboard users entirely.
    render(
      <Table caption="Wide table">
        <tbody>
          <tr>
            <td>Row</td>
          </tr>
        </tbody>
      </Table>,
    );

    const region = screen.getByRole('region', { name: 'Wide table' });
    expect(region.getAttribute('tabindex')).toBe('0');
  });
});

describe('Tabs', () => {
  const items = [
    { id: 'one', label: 'One', content: <p>First panel</p> },
    { id: 'two', label: 'Two', content: <p>Second panel</p> },
    { id: 'three', label: 'Three', content: <p>Third panel</p> },
  ];

  it('implements the ARIA tabs relationships', () => {
    render(<Tabs label="Sections" items={items} />);

    const tablist = screen.getByRole('tablist', { name: 'Sections' });
    expect(within(tablist).getAllByRole('tab')).toHaveLength(3);

    const first = screen.getByRole('tab', { name: 'One' });
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(first.getAttribute('aria-controls')).toBeTruthy();
  });

  it('uses roving tabindex so Tab does not walk every tab', () => {
    // With eight tabs, plain buttons cost eight Tab presses to reach content.
    render(<Tabs label="Sections" items={items} />);

    const tabs = screen.getAllByRole('tab');
    const focusable = tabs.filter((t) => t.getAttribute('tabindex') === '0');
    expect(focusable).toHaveLength(1);
  });

  it('moves focus with arrow keys without switching panels', () => {
    // Manual activation: arrowing through tabs must not load every panel,
    // which for Toothlogy could mean firing several API requests.
    render(<Tabs label="Sections" items={items} />);

    const first = screen.getByRole('tab', { name: 'One' });
    fireEvent.keyDown(first, { key: 'ArrowRight' });

    expect(screen.getByRole('tab', { name: 'Two' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'One' }).getAttribute('aria-selected')).toBe('true');
  });

  it('selects with Enter and Space', () => {
    render(<Tabs label="Sections" items={items} />);

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Two' }), { key: 'Enter' });
    expect(screen.getByRole('tab', { name: 'Two' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Three' }), { key: ' ' });
    expect(screen.getByRole('tab', { name: 'Three' }).getAttribute('aria-selected')).toBe('true');
  });

  it('wraps arrow navigation and supports Home and End', () => {
    render(<Tabs label="Sections" items={items} />);

    fireEvent.keyDown(screen.getByRole('tab', { name: 'One' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Three' }).getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Three' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'One' }).getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'One' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Three' }).getAttribute('tabindex')).toBe('0');
  });

  it('selects a tab on click', () => {
    render(<Tabs label="Sections" items={items} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Two' }));
    expect(screen.getByRole('tab', { name: 'Two' }).getAttribute('aria-selected')).toBe('true');
  });

  it('shows only the selected panel', () => {
    render(<Tabs label="Sections" items={items} />);

    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    const visible = panels.filter((p) => !p.hasAttribute('hidden'));
    expect(visible).toHaveLength(1);
    expect(visible[0]!.textContent).toContain('First panel');
  });
});
