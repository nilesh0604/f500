import { Routes } from '@angular/router';

export const ordersRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./order-list/order-list.component').then(
        m => m.OrderListComponent
      ),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./order-detail/order-detail.component').then(
        m => m.OrderDetailComponent
      ),
  },
];
