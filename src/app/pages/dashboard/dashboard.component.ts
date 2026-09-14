import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface ActivityBar {
  time: string;
  count: number;
  heights: number[];
  active?: boolean;
}

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
  customer?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

export interface AdminProduct {
  id: string;
  title: string;
  status: string;
  thumbnail?: string | null;
  created_at: string;
  variants?: any[];
}

export interface AdminCustomer {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  created_at: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  authService = inject(AuthService);
  private http = inject(HttpClient);

  readonly medusaUrl = environment.medusaBackendUrl;
  testStatus = signal<string | null>(null);
  isTesting = signal<boolean>(false);
  isLoading = signal<boolean>(true);
  lastSyncTime = signal<string>('');

  // Time filter state
  selectedPeriod = signal<'7D' | '30D' | '1Y'>('30D');

  // Raw fetched data from Medusa
  rawOrders = signal<AdminOrder[]>([]);
  rawProducts = signal<AdminProduct[]>([]);
  rawCustomers = signal<AdminCustomer[]>([]);
  rawBrands = signal<Brand[]>([]);

  // Equalizer frequencies for Card 1 (responsive animated equalizer)
  equalizerDots = [
    { color: 'bg-rose-500', dots: [1, 2, 4, 3, 2] },
    { color: 'bg-sky-500', dots: [2, 3, 5, 4, 3] },
    { color: 'bg-emerald-500', dots: [1, 3, 4, 2, 1] },
    { color: 'bg-purple-500', dots: [2, 4, 6, 5, 3] }
  ];

  // Filtered orders according to selectedPeriod
  filteredOrders = computed(() => {
    const orders = this.rawOrders();
    const period = this.selectedPeriod();
    const now = new Date();

    let daysToSubtract = 30;
    if (period === '7D') daysToSubtract = 7;
    if (period === '1Y') daysToSubtract = 365;

    const cutoffDate = new Date(now.getTime() - daysToSubtract * 24 * 60 * 60 * 1000);

    return orders.filter(o => {
      if (!o.created_at) return true;
      return new Date(o.created_at) >= cutoffDate;
    });
  });

  // Total Revenue formatted
  totalRevenue = computed(() => {
    const orders = this.filteredOrders();
    const sum = orders.reduce((acc, curr) => acc + (curr.total || 0), 0);
    const currency = orders[0]?.currency_code?.toUpperCase() || 'EUR';
    const symbol = currency === 'EUR' ? '€' : '$';

    if (sum === 0) return `0.00 ${symbol}`;
    if (sum >= 1000000) return `${symbol}${(sum / 1000000).toFixed(1)}M`;
    if (sum >= 1000) return `${symbol}${(sum / 1000).toFixed(1)}K`;
    return `${sum.toFixed(2)} ${symbol}`;
  });

  // Total Customers / Leads count
  qualifiedLeads = computed(() => {
    return this.rawCustomers().length;
  });

  // Total Products / Catalog Items
  catalogCount = computed(() => {
    return this.rawProducts().length;
  });

  // AI Conversations / Catalog count
  conversationsCount = computed(() => {
    const orders = this.filteredOrders().length;
    const products = this.rawProducts().length;
    const count = (orders * 3) + products;
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  });

  // Pipeline metrics
  pipelineLeads = computed(() => {
    return this.filteredOrders().length;
  });

  pipelineQualified = computed(() => {
    return this.filteredOrders().filter(o => o.status === 'completed' || o.payment_status === 'captured').length;
  });

  pipelineValue = computed(() => {
    const pendingOrders = this.filteredOrders().filter(o => o.status !== 'canceled');
    const sum = pendingOrders.reduce((acc, curr) => acc + (curr.total || 0), 0);
    const symbol = pendingOrders[0]?.currency_code?.toUpperCase() === 'USD' ? '$' : '€';
    if (sum === 0) return `0.00 ${symbol}`;
    if (sum >= 1000) {
      return `${symbol}${(sum / 1000).toFixed(1)}K`;
    }
    return `${sum.toFixed(0)} ${symbol}`;
  });

  activeDeals = computed(() => {
    return this.filteredOrders().filter(o => o.status === 'pending' || o.fulfillment_status !== 'shipped').length;
  });

  closingRate = computed(() => {
    const orders = this.filteredOrders();
    if (orders.length === 0) return 0;
    const completed = orders.filter(o => o.status === 'completed' || o.payment_status === 'captured').length;
    return Math.round((completed / orders.length) * 100);
  });

  aiEfficiency = computed(() => {
    const products = this.rawProducts();
    if (products.length === 0) return 100;
    const published = products.filter(p => p.status === 'published').length;
    return Math.round((published / products.length) * 100);
  });

  dealsAtRisk = computed(() => {
    const drafts = this.rawProducts().filter(p => p.status === 'draft').length;
    const pending = this.rawOrders().filter(o => o.status === 'requires_action').length;
    return drafts + pending;
  });

  highIntentRate = computed(() => {
    const custCount = this.rawCustomers().length;
    const orderCount = this.rawOrders().length;
    if (custCount === 0) return orderCount > 0 ? '+100%' : '+0%';
    const pct = Math.min(Math.round((orderCount / custCount) * 100), 100);
    return `+${pct}%`;
  });

  salesActivityTotal = computed(() => {
    return this.filteredOrders().length;
  });

  // Recent 5 orders for activity view
  recentOrders = computed(() => {
    return this.rawOrders().slice(0, 5);
  });

  // Activity bars for Card 6 (Sales Activity histogram)
  activityBars = computed<ActivityBar[]>(() => {
    const orders = this.filteredOrders();
    const slots = [
      { time: '09:00', startHour: 8, endHour: 10 },
      { time: '11:00', startHour: 10, endHour: 12 },
      { time: '13:00', startHour: 12, endHour: 14 },
      { time: '15:00', startHour: 14, endHour: 16 },
      { time: '17:00', startHour: 16, endHour: 18 },
      { time: '19:00', startHour: 18, endHour: 24 },
    ];

    if (orders.length === 0) {
      return slots.map(slot => ({
        time: slot.time,
        count: 0,
        heights: [8, 12, 10, 14, 10, 16],
        active: false
      }));
    }

    const counts = slots.map(slot => {
      return orders.filter(o => {
        if (!o.created_at) return false;
        const h = new Date(o.created_at).getHours();
        return h >= slot.startHour && h < slot.endHour;
      }).length;
    });

    const maxCount = Math.max(...counts, 1);
    const maxIndex = counts.indexOf(Math.max(...counts));

    return slots.map((slot, index) => {
      const c = counts[index];
      const intensity = c > 0 ? Math.min(Math.round((c / maxCount) * 100), 100) : 8;
      return {
        time: slot.time,
        count: c,
        heights: [
          Math.max(8, Math.round(intensity * 0.35)),
          Math.max(12, Math.round(intensity * 0.65)),
          Math.max(10, Math.round(intensity * 0.45)),
          Math.max(16, Math.round(intensity * 0.9)),
          Math.max(12, Math.round(intensity * 0.55)),
          Math.max(16, intensity)
        ],
        active: index === maxIndex && c > 0
      };
    });
  });

  // Dynamic Chart points & labels for the tall Purple Card
  chartLabels = computed(() => {
    const period = this.selectedPeriod();
    if (period === '7D') return ['J-6', 'J-4', 'J-3', 'J-2', 'Hier', 'Auj'];
    if (period === '30D') return ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'En cours'];
    return ['Jan', 'Mar', 'Juin', 'Sept', 'Déc'];
  });

  ngOnInit(): void {
    this.fetchDashboardData();
  }

  setPeriod(period: '7D' | '30D' | '1Y') {
    this.selectedPeriod.set(period);
  }

  getInitials(nameOrEmail?: string): string {
    if (!nameOrEmail) return 'CL';
    const parts = nameOrEmail.trim().split(/[\s@._-]+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return nameOrEmail.slice(0, 2).toUpperCase();
  }

  fetchDashboardData(): void {
    this.isLoading.set(true);

    forkJoin({
      ordersRes: this.http.get<{ orders: AdminOrder[]; count: number }>(
        `${this.medusaUrl}/admin/orders?limit=50`,
        { withCredentials: true }
      ).pipe(catchError(() => of({ orders: [], count: 0 }))),

      productsRes: this.http.get<{ products: AdminProduct[]; count: number }>(
        `${this.medusaUrl}/admin/products?limit=50`,
        { withCredentials: true }
      ).pipe(catchError(() => of({ products: [], count: 0 }))),

      customersRes: this.http.get<{ customers: AdminCustomer[]; count: number }>(
        `${this.medusaUrl}/admin/customers?limit=50`,
        { withCredentials: true }
      ).pipe(catchError(() => of({ customers: [], count: 0 }))),

      brandsRes: this.http.get<{ brands: Brand[] }>(
        `${this.medusaUrl}/brand`,
        { withCredentials: true }
      ).pipe(catchError(() => of({ brands: [] })))
    }).subscribe({
      next: ({ ordersRes, productsRes, customersRes, brandsRes }) => {
        this.rawOrders.set(ordersRes.orders || []);
        this.rawProducts.set(productsRes.products || []);
        this.rawCustomers.set(customersRes.customers || []);
        this.rawBrands.set(brandsRes.brands || []);
        this.lastSyncTime.set(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }

  testConnection(): void {
    this.isTesting.set(true);
    this.testStatus.set(null);

    this.http
      .get<{ user: any }>(`${this.medusaUrl}/admin/users/me`, {
        withCredentials: true,
      })
      .subscribe({
        next: (res) => {
          this.isTesting.set(false);
          this.testStatus.set(
            `Connecté en tant que ${res.user?.email || 'admin'}.`
          );
          this.fetchDashboardData();
        },
        error: (err) => {
          this.isTesting.set(false);
          this.testStatus.set(
            `Status (${err.status}) : ${err?.error?.message || 'Serveur Medusa en attente de connexion'}`
          );
        },
      });
  }
}
