import { ThemeService } from './theme';
import { AppStorage } from './app-storage';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark-theme');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark-theme');
  });

  it('init applies the persisted dark preference', () => {
    AppStorage.setDark(true);
    const theme = new ThemeService();

    theme.init();

    expect(theme.isDark).toBeTrue();
    expect(document.documentElement.classList.contains('dark-theme')).toBeTrue();
  });

  it('toggle flips state, applies the class and persists', () => {
    const theme = new ThemeService();

    theme.toggle();
    expect(theme.isDark).toBeTrue();
    expect(document.documentElement.classList.contains('dark-theme')).toBeTrue();
    expect(AppStorage.getDark()).toBeTrue();

    theme.toggle();
    expect(theme.isDark).toBeFalse();
    expect(document.documentElement.classList.contains('dark-theme')).toBeFalse();
    expect(AppStorage.getDark()).toBeFalse();
  });
});
