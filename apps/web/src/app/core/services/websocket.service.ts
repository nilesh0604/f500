import { Injectable, OnDestroy, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface OrderStatusEvent {
  orderId: string;
  status: string;
  previousStatus: string;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class WebSocketService implements OnDestroy {
  private readonly authService = inject(AuthService);
  private socket: Socket | null = null;
  private readonly orderStatusSubject = new Subject<OrderStatusEvent>();

  readonly orderStatus$ = this.orderStatusSubject.asObservable();

  connect(): void {
    if (this.socket?.connected) return;

    this.socket = io(environment.wsUrl, {
      auth: { token: this.authService.getAccessToken() },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('order:status_changed', (event: OrderStatusEvent) => {
      this.orderStatusSubject.next(event);
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
