import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-admin-audit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="ff-hint">admin-audit-page</p>`,
})
export class AdminAuditPage {}
