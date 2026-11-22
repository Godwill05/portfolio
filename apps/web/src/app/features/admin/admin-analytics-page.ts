import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-admin-analytics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="ff-hint">admin-analytics-page</p>`,
})
export class AdminAnalyticsPage {}
