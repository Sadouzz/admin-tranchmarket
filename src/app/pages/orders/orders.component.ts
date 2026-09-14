import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface AdminOrder {
  id: string;
  display_id?: number;
  email?: string;
  status: string;
  payment_status?: string;
  fulfillment_status?: string;
  total?: number;
  currency_code?: string;
  created_at: string;
}

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './orders.component.html',
})
export class OrdersComponent implements OnInit {
  private http = inject(HttpClient);
  private baseUrl = environment.medusaBackendUrl;

  orders = signal<AdminOrder[]>([]);
  isLoading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.fetchOrders();
  }

  fetchOrders(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.http
      .get<{ orders: AdminOrder[]; count: number }>(
        `${this.baseUrl}/admin/orders`,
        { withCredentials: true }
      )
      .subscribe({
        next: (res) => {
          this.orders.set(res.orders || []);
          this.isLoading.set(false);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(
            err?.error?.message || 'Impossible de récupérer les commandes Medusa.'
          );
        },
      });
  }
}
