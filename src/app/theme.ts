import { Injectable } from '@angular/core';
import { AppStorage } from './app-storage';

/** Owns the dark-mode preference: applies it to <html> and persists it. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private dark = false;

  get isDark(): boolean {
    return this.dark;
  }

  /** Apply the persisted preference. Call once at startup. */
  init(): void {
    this.apply(AppStorage.getDark());
  }

  toggle(): void {
    this.apply(!this.dark);
  }

  private apply(dark: boolean): void {
    this.dark = dark;
    document.documentElement.classList.toggle('dark-theme', dark);
    AppStorage.setDark(dark);
  }
}
