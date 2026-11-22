import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-admin-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="ff-hint">admin-users-page</p>`,
})
export class AdminUsersPage {}
