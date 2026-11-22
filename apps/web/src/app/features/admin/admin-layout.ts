import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-admin-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="ff-hint">admin-layout</p>`,
})
export class AdminLayout {}
