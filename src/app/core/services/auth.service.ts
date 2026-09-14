import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError, of, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminUser, LoginPayload, AuthResponse } from '../models/auth.models';

const TOKEN_STORAGE_KEY = 'tm_admin_token';
const USER_STORAGE_KEY = 'tm_admin_user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  private readonly baseUrl = environment.medusaBackendUrl;

  // Reactive State with Angular Signals
  readonly currentUser = signal<AdminUser | null>(this.getStoredUser());
  readonly isAuthenticated = computed(() => !!this.currentUser());
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    if (this.isBrowser()) {
      this.initAuth();
    }
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  getToken(): string | null {
    if (!this.isBrowser()) return null;
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  private setToken(token: string): void {
    if (this.isBrowser()) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  }

  private removeToken(): void {
    if (this.isBrowser()) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  }

  private getStoredUser(): AdminUser | null {
    if (!this.isBrowser()) return null;
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AdminUser;
    } catch {
      return null;
    }
  }

  private setStoredUser(user: AdminUser | null): void {
    if (!this.isBrowser()) return;
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  }

  /**
   * Initializes session validation against Medusa backend.
   * Leverages both HttpOnly cookies (withCredentials: true) and Bearer token if present.
   */
  initAuth(): void {
    const token = this.getToken();
    // If we have either a token or stored session, check validity with /admin/users/me
    if (token || this.currentUser()) {
      this.fetchCurrentUser().subscribe({
        next: (user) => {
          this.currentUser.set(user);
          this.setStoredUser(user);
        },
        error: (err) => {
          // Only invalidate session if Medusa explicitly returns 401 Unauthorized
          if (err?.status === 401) {
            this.clearSession();
            this.router.navigate(['/login']);
          }
        },
      });
    }
  }

  /**
   * Authenticate admin user with Medusa v2.
   * Calls /auth/user/emailpass with credentials, then initiates session and fetches profile.
   */
  login(payload: LoginPayload): Observable<AdminUser> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    return this.http
      .post<AuthResponse>(
        `${this.baseUrl}/auth/user/emailpass`,
        payload,
        { withCredentials: true }
      )
      .pipe(
        switchMap((res) => {
          if (res?.token) {
            this.setToken(res.token);
            // Optionally notify backend session endpoint with credentials
            return this.http
              .post<{ user?: any }>(
                `${this.baseUrl}/auth/session`,
                {},
                { withCredentials: true }
              )
              .pipe(
                catchError(() => of({ user: null })),
                switchMap(() => this.fetchCurrentUser())
              );
          }
          return this.fetchCurrentUser();
        }),
        tap({
          next: (user) => {
            this.currentUser.set(user);
            this.setStoredUser(user);
            this.isLoading.set(false);
          },
          error: (err) => {
            this.isLoading.set(false);
            const msg =
              err?.error?.message ||
              err?.error?.error ||
              'Identifiants invalides ou erreur de connexion.';
            this.errorMessage.set(msg);
          },
        })
      );
  }

  /**
   * Retrieve current authenticated admin profile from Medusa
   */
  fetchCurrentUser(): Observable<AdminUser> {
    return this.http
      .get<{ user: AdminUser }>(`${this.baseUrl}/admin/users/me`, {
        withCredentials: true,
      })
      .pipe(
        tap((res) => {
          if (res?.user) {
            this.currentUser.set(res.user);
            this.setStoredUser(res.user);
          }
        }),
        switchMap((res) => of(res.user)),
        catchError((err) => {
          return throwError(() => err);
        })
      );
  }

  /**
   * Clear session and log out
   */
  logout(): void {
    this.clearSession();
    this.router.navigate(['/login']);

    // Graceful Medusa session destroy (HttpOnly cookie clearing)
    this.http
      .delete(`${this.baseUrl}/auth/session`, { withCredentials: true })
      .pipe(catchError(() => of(null)))
      .subscribe();
  }

  private clearSession(): void {
    this.removeToken();
    this.currentUser.set(null);
    this.errorMessage.set(null);
  }
}
