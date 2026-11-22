import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-portfolio-preview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="ff-hint">portfolio-preview-page</p>`,
})
export class PortfolioPreviewPage {}
