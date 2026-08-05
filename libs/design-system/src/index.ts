/**
 * @opus/design-system — tokens, chrome and primitives.
 * Layer 3: knows nothing about definitions, data or the renderer.
 *
 * Stylesheets ship alongside, and are imported by an app's global `styles.scss`:
 *
 *   styles/tokens.scss      the token vocabulary and the platform's original palette
 *   styles/coda-theme.scss  the CODA palette — a second value set for the same tokens
 *   styles/chrome.scss      structural classes for application chrome (topbar, rail, workbench)
 */

export { StateShellComponent } from './state-shell.component';
export { BadgeComponent } from './badge.component';
export { IconComponent, iconNames, type OpusIconName } from './icon.component';
export { NavRailComponent, type NavItem, type NavSection } from './nav-rail.component';
export { ListPanelComponent, type ListPanelItem } from './list-panel.component';
export { ThemeService, type ThemeMode } from './theme.service';
