/**
 * TOOTHLOGY DESIGN SYSTEM — public entry point
 *
 * Import primitives from `@/design-system`. Deep imports into
 * `components/*` are discouraged so the exported surface stays reviewable and
 * a component can be restructured without a repo-wide find-and-replace.
 */

export { cn, type ClassValue } from './lib/cn';

export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './components/button';
export { Field, Input, type FieldProps, type FieldControlProps, type InputProps } from './components/field';
export {
  Alert,
  Badge,
  Skeleton,
  Spinner,
  type AlertProps,
  type AlertTone,
  type BadgeProps,
  type BadgeTone,
  type SkeletonProps,
  type SpinnerProps,
} from './components/feedback';
export {
  EmptyState,
  ErrorState,
  LoadingState,
  type EmptyStateProps,
  type ErrorStateProps,
  type LoadingStateProps,
} from './components/state';
export {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Table,
  type CardProps,
  type TableProps,
} from './components/surfaces';
export { Icon, type IconName, type IconProps } from './components/icon';
export { Tabs, type TabItem, type TabsProps } from './components/tabs';
export { Dialog, type DialogProps } from './components/dialog';
export { ThemeToggle, THEME_STORAGE_KEY, type ThemePreference } from './components/theme-toggle';
export { THEME_SCRIPT } from './components/theme-script';
