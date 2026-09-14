import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface AdminProduct {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  status: string;
  thumbnail?: string | null;
  variants?: any[];
  collection?: { title: string } | null;
  created_at: string;
  brand?: { id: string; name: string } | null;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
}

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './products.component.html',
})
export class ProductsComponent implements OnInit {
  private http = inject(HttpClient);
  private baseUrl = environment.medusaBackendUrl;

  products = signal<AdminProduct[]>([]);
  brands = signal<Brand[]>([]);
  isLoading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  // Search & Filter
  searchQuery = signal<string>('');
  statusFilter = signal<'all' | 'published' | 'draft'>('all');

  // Modal State
  isModalOpen = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);

  // Form Fields
  newProduct = signal<{
    title: string;
    subtitle: string;
    description: string;
    price: number | null;
    status: 'published' | 'draft';
    thumbnail: string;
    brandId: string;
    variantTitle: string;
  }>({
    title: '',
    subtitle: '',
    description: '',
    price: null,
    status: 'published',
    thumbnail: '',
    brandId: '',
    variantTitle: 'Standard',
  });

  // Filtered products list
  filteredProducts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.statusFilter();

    return this.products().filter((p) => {
      const matchSearch =
        !query ||
        p.title?.toLowerCase().includes(query) ||
        p.subtitle?.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.id?.toLowerCase().includes(query);

      const matchStatus = filter === 'all' || p.status === filter;

      return matchSearch && matchStatus;
    });
  });

  ngOnInit(): void {
    this.fetchData();
  }

  fetchData(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    forkJoin({
      productsRes: this.http
        .get<{ products: AdminProduct[]; count: number }>(
          `${this.baseUrl}/admin/products?limit=100`,
          { withCredentials: true }
        )
        .pipe(catchError(() => of({ products: [], count: 0 }))),
      brandsRes: this.http
        .get<{ brands: Brand[] }>(`${this.baseUrl}/brand`, {
          withCredentials: true,
        })
        .pipe(catchError(() => of({ brands: [] }))),
    }).subscribe({
      next: ({ productsRes, brandsRes }) => {
        this.products.set(productsRes.products || []);
        this.brands.set(brandsRes.brands || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(
          err?.error?.message || 'Erreur lors du chargement des produits.'
        );
      },
    });
  }

  openCreateModal(): void {
    this.newProduct.set({
      title: '',
      subtitle: '',
      description: '',
      price: null,
      status: 'published',
      thumbnail: '',
      brandId: this.brands().length > 0 ? this.brands()[0].id : '',
      variantTitle: 'Standard',
    });
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.isModalOpen.set(true);
  }

  closeCreateModal(): void {
    if (this.isSubmitting()) return;
    this.isModalOpen.set(false);
  }

  createProduct(): void {
    const form = this.newProduct();
    const title = form.title.trim();

    if (!title) {
      this.errorMessage.set('Le titre du produit est obligatoire.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    // Prepare Medusa v2 product creation payload
    const optionTitle = 'Default Option';
    const variantValue = form.variantTitle.trim() || 'Standard';

    const prices = form.price !== null && form.price > 0
      ? [{ amount: Number(form.price), currency_code: 'eur' }]
      : [];

    const payload: any = {
      title,
      status: form.status,
      options: [{ title: optionTitle, values: [variantValue] }],
      variants: [
        {
          title: variantValue,
          options: { [optionTitle]: variantValue },
          prices,
        },
      ],
    };

    if (form.subtitle?.trim()) payload.subtitle = form.subtitle.trim();
    if (form.description?.trim()) payload.description = form.description.trim();
    if (form.thumbnail?.trim()) payload.thumbnail = form.thumbnail.trim();

    this.http
      .post<{ product: AdminProduct }>(
        `${this.baseUrl}/admin/products`,
        payload,
        { withCredentials: true }
      )
      .subscribe({
        next: (res) => {
          const created = res.product;
          
          // Link Brand if selected
          if (form.brandId && created?.id) {
            this.http
              .post(
                `${this.baseUrl}/admin/products/${created.id}/brand`,
                { brandId: form.brandId },
                { withCredentials: true }
              )
              .pipe(catchError(() => of(null)))
              .subscribe(() => {
                this.finishCreation(title);
              });
          } else {
            this.finishCreation(title);
          }
        },
        error: (err) => {
          this.isSubmitting.set(false);
          const msg =
            err?.error?.message ||
            err?.error?.error ||
            'Erreur lors de la création du produit dans Medusa.';
          this.errorMessage.set(msg);
        },
      });
  }

  private finishCreation(title: string): void {
    this.isSubmitting.set(false);
    this.isModalOpen.set(false);
    this.successMessage.set(`Produit "${title}" créé avec succès !`);
    this.fetchData();
  }

  updateFormField(key: string, value: any): void {
    this.newProduct.update((prev) => ({ ...prev, [key]: value }));
  }
}
