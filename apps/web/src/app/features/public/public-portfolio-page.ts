import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-public-portfolio-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="ff-hint">public-portfolio-page</p>`,
})
export class PublicPortfolioPage {}
