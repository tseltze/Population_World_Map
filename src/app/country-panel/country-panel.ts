import { Component, computed, input, output, signal } from '@angular/core';
import { CountryInfo } from '../services/world-bank-api';

type SortKey = 'recent' | 'name' | 'population' | 'gdp';

@Component({
  selector: 'app-country-panel',
  standalone: true,
  imports: [],
  templateUrl: './country-panel.html',
  styleUrl: './country-panel.css',
})
export class CountryPanel {
  readonly countries = input<CountryInfo[]>([]);
  readonly isLoading = input(false);
  readonly error = input('');

  readonly remove = output<string>();
  readonly retry = output<void>();

  readonly sortKey = signal<SortKey>('recent');
  readonly sortDesc = signal(true);

  // Memoised: only recomputes when the inputs or sort signals change.
  readonly sortedCountries = computed<CountryInfo[]>(() => {
    const arr = [...this.countries()];
    const dir = this.sortDesc() ? -1 : 1;
    switch (this.sortKey()) {
      case 'name':
        return arr.sort((a, b) => a.name.localeCompare(b.name) * dir);
      case 'population':
        return arr.sort((a, b) => ((a.popValue ?? -Infinity) - (b.popValue ?? -Infinity)) * dir);
      case 'gdp':
        return arr.sort((a, b) => ((a.gdpValue ?? -Infinity) - (b.gdpValue ?? -Infinity)) * dir);
      default:
        return this.sortDesc() ? arr : arr.reverse();
    }
  });

  onSortKey(event: Event): void {
    this.sortKey.set((event.target as HTMLSelectElement).value as SortKey);
  }

  toggleSortDir(): void {
    this.sortDesc.update((desc) => !desc);
  }
}
