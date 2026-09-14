import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Brand {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at?: string;
}

@Component({
  selector: 'app-brands',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './brands.component.html',
})
export class BrandsComponent implements OnInit {
  private http = inject(HttpClient);
  private baseUrl = environment.medusaBackendUrl;

  brands = signal<Brand[]>([]);
  isLoading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);

  // Form creation state
  newBrandName = signal<string>('');
  isCreating = signal<boolean>(false);
  successMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.fetchBrands();
  }

  fetchBrands(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.http
      .get<{ brands: Brand[] }>(`${this.baseUrl}/brand`, {
        withCredentials: true,
      })
      .subscribe({
        next: (res) => {
          this.brands.set(res.brands || []);
          this.isLoading.set(false);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(
            err?.error?.message || 'Impossible de récupérer les marques.'
          );
        },
      });
  }

  createBrand(): void {
    const name = this.newBrandName().trim();
    if (!name) return;

    this.isCreating.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.http
      .post<{ brand: Brand }>(
        `${this.baseUrl}/brand`,
        { name },
        { withCredentials: true }
      )
      .subscribe({
        next: (res) => {
          this.isCreating.set(false);
          this.newBrandName.set('');
          this.successMessage.set(`Marque "${res.brand?.name || name}" créée avec succès !`);
          this.fetchBrands();
        },
        error: (err) => {
          this.isCreating.set(false);
          this.errorMessage.set(
            err?.error?.message || 'Erreur lors de la création de la marque.'
          );
        },
      });
  }
}
