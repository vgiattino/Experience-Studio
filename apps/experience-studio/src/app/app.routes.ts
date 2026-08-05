/**
 * Routes.
 *
 * `/x/:experienceId/:pageId` is the runtime, and its shape is deliberate: the URL names the
 * *experience* and the *page* rather than a feature. There is no route per dashboard, because there
 * is no code per dashboard — every experience in the store is reachable through the same three
 * segments, which is the whole claim of a metadata-driven runtime.
 *
 * Everything is lazily loaded. The Create screen pulls in the generation pipeline and the runtime
 * pulls in the renderer and the component chunks; a user who only views experiences never downloads
 * the generator.
 */

import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'create',
    title: 'Create an experience — Opus Experience Studio',
    loadComponent: () => import('./create/create-experience.component').then((m) => m.CreateExperienceComponent),
  },
  {
    path: 'experiences',
    title: 'Experiences — Opus Experience Studio',
    loadComponent: () => import('./library/library.component').then((m) => m.LibraryComponent),
  },
  {
    path: 'x/:experienceId',
    loadComponent: () => import('./runtime/experience-page.component').then((m) => m.ExperiencePageComponent),
  },
  {
    path: 'x/:experienceId/:pageId',
    loadComponent: () => import('./runtime/experience-page.component').then((m) => m.ExperiencePageComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'create' },
  { path: '**', redirectTo: 'create' },
];
