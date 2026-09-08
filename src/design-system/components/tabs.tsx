/**
 * TL-CMP-TABS-001 — Tabs
 *
 * Implements the WAI-ARIA tabs pattern properly, which means roving tabindex:
 * exactly one tab is in the document's tab order, and Arrow keys move between
 * tabs. Tab then moves *out* of the tab list to the panel.
 *
 * Styled buttons in a row are the common shortcut and they behave wrongly: a
 * keyboard user must press Tab once per tab to get past them, and with eight
 * tabs that is eight presses to reach the content. Screen readers also announce
 * no relationship between the tab and its panel.
 *
 * Manual activation is used — arrows move focus, Enter or Space selects. With
 * automatic activation, arrowing through tabs loads every panel in turn, which
 * for Toothlogy could mean firing several API requests just to reach the last
 * tab.
 */

'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

export interface TabsProps {
  readonly items: readonly TabItem[];
  readonly defaultTabId?: string;
  /** Accessible name for the tab list. */
  readonly label: string;
  readonly className?: string;
}

export function Tabs({ items, defaultTabId, label, className }: TabsProps) {
  const [activeId, setActiveId] = useState(defaultTabId ?? items[0]?.id ?? '');
  const [focusIndex, setFocusIndex] = useState(() => {
    const index = items.findIndex((i) => i.id === (defaultTabId ?? items[0]?.id));
    return index >= 0 ? index : 0;
  });
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = (index: number) => {
    const bounded = (index + items.length) % items.length; // wraps at both ends
    setFocusIndex(bounded);
    tabRefs.current[bounded]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        focusTab(index + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        focusTab(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusTab(0);
        break;
      case 'End':
        event.preventDefault();
        focusTab(items.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        setActiveId(items[index]!.id);
        break;
      default:
        break;
    }
  };

  return (
    <div className={cn('tl-tabs', className)}>
      <div className="tl-tabs__list" role="tablist" aria-label={label}>
        {items.map((item, index) => {
          const selected = item.id === activeId;
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`panel-${item.id}`}
              // Roving tabindex: only the focused tab is reachable by Tab.
              tabIndex={index === focusIndex ? 0 : -1}
              className={cn('tl-tabs__tab', selected && 'tl-tabs__tab--selected')}
              onClick={() => {
                setActiveId(item.id);
                setFocusIndex(index);
              }}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`panel-${item.id}`}
          aria-labelledby={`tab-${item.id}`}
          hidden={item.id !== activeId}
          // The panel is focusable so Tab from the tab list lands on content.
          tabIndex={0}
          className="tl-tabs__panel"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
