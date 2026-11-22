import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-opportunities-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="ff-hint">opportunities-page</p>`,
})
export class OpportunitiesPage {}
